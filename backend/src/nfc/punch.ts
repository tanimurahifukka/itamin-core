/**
 * NFC punch routes (public, PIN-authenticated)
 *
 * 物理店舗入口に貼った NFC タグから開かれる公開エンドポイント。
 * スタッフは Supabase セッションを持たず、認証は store 内ユニークな
 * per-staff PIN (staff_cleaning_pins を流用) で行う。
 *
 * 書き込み先は既存の attendance_records / attendance_breaks /
 * attendance_events テーブル (LINE 打刻と同じ経路、source='nfc')。
 */
import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import {
  calcBusinessDate, nextSessionNo,
  checkIdempotency, writeEvent, getPolicy,
  formatAttendanceSession as formatSession,
} from '../services/attendance/helpers';
import { checkAndLogRateLimit, getClientIp } from '../services/reservation/rate_limit';

export const nfcPunchRouter = Router();

// ─────────────────────────────────────────────────────────────
// 共通認証: storeId + pin から user を解決する
// ─────────────────────────────────────────────────────────────
async function requirePinUser(req: Request, res: Response): Promise<{
  userId: string;
  storeId: string;
  staffId: string;
  userName: string | null;
} | null> {
  const storeId = (req.body?.storeId || req.query?.storeId) as string | undefined;
  const pin = (req.body?.pin || req.query?.pin) as string | undefined;

  if (!storeId || typeof storeId !== 'string') {
    res.status(400).json({ error: 'storeId は必須です' });
    return null;
  }
  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'PIN は4桁の数字で入力してください' });
    return null;
  }

  // PIN は 4 桁 = 1 万通りしかないので、IP + store_id で厳しくレート制限する。
  // 15分窓で 15 回まで (正常利用は連打しない前提)。超過したら 429。
  const ip = getClientIp(req);
  const ipRate = await checkAndLogRateLimit(ip, storeId, {
    action: 'nfc.pin.ip',
    windowSec: 15 * 60,
    max: 15,
  });
  if (!ipRate.allowed) {
    res.setHeader('Retry-After', String(ipRate.retryAfterSec || 900));
    res.status(429).json({ error: '試行回数が多すぎます。しばらくしてから再度お試しください。' });
    return null;
  }
  // store 単位でも制限 (同一店舗で何万回も試行されるのを防ぐ)
  const storeRate = await checkAndLogRateLimit(`store:${storeId}`, storeId, {
    action: 'nfc.pin.store',
    windowSec: 15 * 60,
    max: 100,
  });
  if (!storeRate.allowed) {
    res.setHeader('Retry-After', String(storeRate.retryAfterSec || 900));
    res.status(429).json({ error: '試行回数が多すぎます。しばらくしてから再度お試しください。' });
    return null;
  }

  const { data: pinRow, error: pinErr } = await supabaseAdmin
    .from('staff_cleaning_pins')
    .select('membership_id, store_id')
    .eq('store_id', storeId)
    .eq('pin', pin)
    .maybeSingle();

  if (pinErr || !pinRow) {
    res.status(401).json({ error: 'PIN が正しくありません' });
    return null;
  }

  const pinData = pinRow as { membership_id: string; store_id: string };
  const membershipId = pinData.membership_id;

  const { data: staff } = await supabaseAdmin
    .from('store_staff')
    .select('id, user_id, store_id, user:profiles(name)')
    .eq('id', membershipId)
    .maybeSingle();

  const staffRow = staff as { id: string; user_id: string; store_id: string; user: { name: string }[] | null } | null;

  if (!staffRow || staffRow.store_id !== storeId) {
    res.status(401).json({ error: 'スタッフ情報の解決に失敗しました' });
    return null;
  }

  return {
    userId: staffRow.user_id,
    storeId,
    staffId: staffRow.id,
    userName: staffRow.user?.[0]?.name ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// POST /api/nfc/punch/resolve
// body: { storeId, pin }
// PIN 認証 → 店舗名・スタッフ名・当日状態を返す。
// クライアントは戻り値を見てアクションボタン (出勤/休憩/退勤) を出し分ける。
// ─────────────────────────────────────────────────────────────
nfcPunchRouter.post('/resolve', async (req: Request, res: Response) => {
  try {
    const auth = await requirePinUser(req, res);
    if (!auth) return;

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id, name')
      .eq('id', auth.storeId)
      .maybeSingle();

    const policy = await getPolicy(supabaseAdmin, auth.storeId);
    const businessDate = calcBusinessDate(new Date(), policy.timezone, policy.business_day_cutoff_hour);

    const { data: activeSession } = await supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', auth.storeId)
      .eq('user_id', auth.userId)
      .in('status', ['working', 'on_break'])
      .maybeSingle();

    const { data: completedToday } = await supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', auth.storeId)
      .eq('user_id', auth.userId)
      .eq('business_date', businessDate)
      .eq('status', 'completed')
      .order('clock_in_at');

    const storeRow = store as { id: string; name: string } | null;
    const activeRow = activeSession as { status: 'working' | 'on_break' } | null;

    let currentStatus: 'not_clocked_in' | 'working' | 'on_break' | 'completed' = 'not_clocked_in';
    if (activeRow) currentStatus = activeRow.status;
    else if (completedToday && completedToday.length > 0) currentStatus = 'completed';

    res.json({
      store: { id: storeRow?.id, name: storeRow?.name || '' },
      staff: { staffId: auth.staffId, userName: auth.userName },
      businessDate,
      currentStatus,
      activeSession: activeSession ? formatSession(activeSession) : null,
      completedSessions: (completedToday || []).map(formatSession),
    });
  } catch (e: any) {
    console.error('[nfc punch /resolve] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/nfc/punch/clock-in
// body: { storeId, pin, idempotencyKey }
// ─────────────────────────────────────────────────────────────
nfcPunchRouter.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const auth = await requirePinUser(req, res);
    if (!auth) return;
    const { idempotencyKey } = req.body ?? {};

    const idem = await checkIdempotency(supabaseAdmin, auth.storeId, auth.userId, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '出勤済み（重複リクエスト）' }); return; }

    const { data: open } = await supabaseAdmin
      .from('attendance_records')
      .select('id')
      .eq('store_id', auth.storeId)
      .eq('user_id', auth.userId)
      .in('status', ['working', 'on_break'])
      .maybeSingle();
    if (open) { res.status(409).json({ error: '既に勤務中です', code: 'ALREADY_WORKING' }); return; }

    const policy = await getPolicy(supabaseAdmin, auth.storeId);
    const now = new Date();
    const businessDate = calcBusinessDate(now, policy.timezone, policy.business_day_cutoff_hour);
    const sessionNo = await nextSessionNo(supabaseAdmin, auth.storeId, auth.userId, businessDate);

    const { data: record, error } = await supabaseAdmin
      .from('attendance_records')
      .insert({
        store_id: auth.storeId, user_id: auth.userId,
        business_date: businessDate, session_no: sessionNo,
        status: 'working', clock_in_at: now.toISOString(),
        source: 'nfc', clock_in_method: 'nfc_pin',
        created_by: auth.userId, updated_by: auth.userId,
      })
      .select().single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    const recordRow = record as { id: string; clock_in_at: string };

    await writeEvent(supabaseAdmin, {
      storeId: auth.storeId, userId: auth.userId, recordId: recordRow.id,
      eventType: 'clock_in', source: 'nfc', idempotencyKey,
      payload: { staffName: auth.userName },
    });

    res.status(201).json({
      recordId: recordRow.id,
      status: 'working',
      effectiveAt: recordRow.clock_in_at,
      businessDate,
      staffName: auth.userName,
      message: '出勤しました',
    });
  } catch (e: any) {
    console.error('[nfc punch /clock-in] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/nfc/punch/break-start
// ─────────────────────────────────────────────────────────────
nfcPunchRouter.post('/break-start', async (req: Request, res: Response) => {
  try {
    const auth = await requirePinUser(req, res);
    if (!auth) return;
    const { idempotencyKey } = req.body ?? {};

    const idem = await checkIdempotency(supabaseAdmin, auth.storeId, auth.userId, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '休憩開始済み' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id')
      .eq('store_id', auth.storeId).eq('user_id', auth.userId).eq('status', 'working').maybeSingle();
    if (!session) { res.status(409).json({ error: '勤務中のセッションがありません', code: 'NO_OPEN_SESSION' }); return; }

    const sessionRow = session as { id: string };

    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks').select('id')
      .eq('attendance_record_id', sessionRow.id).is('ended_at', null).maybeSingle();
    if (openBreak) { res.status(409).json({ error: '既に休憩中です', code: 'ALREADY_ON_BREAK' }); return; }

    const now = new Date();
    await supabaseAdmin.from('attendance_breaks').insert({
      attendance_record_id: sessionRow.id, started_at: now.toISOString(),
    });
    const { error: updateErr } = await supabaseAdmin.from('attendance_records').update({
      status: 'on_break', updated_by: auth.userId, updated_at: now.toISOString(),
    }).eq('id', sessionRow.id);
    if (updateErr) console.error('[nfc punch /break-start] update error:', updateErr);
    await writeEvent(supabaseAdmin, {
      storeId: auth.storeId, userId: auth.userId, recordId: sessionRow.id,
      eventType: 'break_start', source: 'nfc', idempotencyKey,
      payload: { staffName: auth.userName },
    });

    res.json({
      recordId: sessionRow.id,
      status: 'on_break',
      effectiveAt: now.toISOString(),
      staffName: auth.userName,
      message: '休憩を開始しました',
    });
  } catch (e: any) {
    console.error('[nfc punch /break-start] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/nfc/punch/break-end
// ─────────────────────────────────────────────────────────────
nfcPunchRouter.post('/break-end', async (req: Request, res: Response) => {
  try {
    const auth = await requirePinUser(req, res);
    if (!auth) return;
    const { idempotencyKey } = req.body ?? {};

    const idem = await checkIdempotency(supabaseAdmin, auth.storeId, auth.userId, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '休憩終了済み' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id')
      .eq('store_id', auth.storeId).eq('user_id', auth.userId).eq('status', 'on_break').maybeSingle();
    if (!session) { res.status(409).json({ error: '休憩中のセッションがありません', code: 'NO_OPEN_BREAK' }); return; }

    const sessionRow = session as { id: string };

    const now = new Date();
    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks').select('id')
      .eq('attendance_record_id', sessionRow.id).is('ended_at', null).maybeSingle();
    if (openBreak) {
      const breakRow = openBreak as { id: string };
      const { error: breakUpdateErr } = await supabaseAdmin.from('attendance_breaks').update({ ended_at: now.toISOString() }).eq('id', breakRow.id);
      if (breakUpdateErr) console.error('[nfc punch /break-end] break update error:', breakUpdateErr);
    }

    const { error: updateErr } = await supabaseAdmin.from('attendance_records').update({
      status: 'working', updated_by: auth.userId, updated_at: now.toISOString(),
    }).eq('id', sessionRow.id);
    if (updateErr) console.error('[nfc punch /break-end] record update error:', updateErr);
    await writeEvent(supabaseAdmin, {
      storeId: auth.storeId, userId: auth.userId, recordId: sessionRow.id,
      eventType: 'break_end', source: 'nfc', idempotencyKey,
      payload: { staffName: auth.userName },
    });

    res.json({
      recordId: sessionRow.id,
      status: 'working',
      effectiveAt: now.toISOString(),
      staffName: auth.userName,
      message: '休憩を終了しました',
    });
  } catch (e: any) {
    console.error('[nfc punch /break-end] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/nfc/punch/clock-out
// ─────────────────────────────────────────────────────────────
nfcPunchRouter.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const auth = await requirePinUser(req, res);
    if (!auth) return;
    const { idempotencyKey } = req.body ?? {};

    const idem = await checkIdempotency(supabaseAdmin, auth.storeId, auth.userId, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '退勤済み' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id, status')
      .eq('store_id', auth.storeId).eq('user_id', auth.userId)
      .in('status', ['working', 'on_break']).maybeSingle();
    if (!session) { res.status(409).json({ error: '勤務中のセッションがありません', code: 'NO_OPEN_SESSION' }); return; }

    const sessionRow = session as { id: string; status: string };

    const policy = await getPolicy(supabaseAdmin, auth.storeId);
    const now = new Date();

    if (sessionRow.status === 'on_break') {
      if (!policy.auto_close_break_before_clock_out) {
        res.status(409).json({ error: '休憩中は退勤できません', code: 'CLOCK_OUT_DURING_BREAK_NOT_ALLOWED' });
        return;
      }
      const { data: openBreak } = await supabaseAdmin
        .from('attendance_breaks').select('id')
        .eq('attendance_record_id', sessionRow.id).is('ended_at', null).maybeSingle();
      if (openBreak) {
        const breakRow = openBreak as { id: string };
        const { error: breakUpdateErr } = await supabaseAdmin.from('attendance_breaks').update({ ended_at: now.toISOString() }).eq('id', breakRow.id);
        if (breakUpdateErr) console.error('[nfc punch /clock-out] break update error:', breakUpdateErr);
      }
    }

    const { error: updateErr } = await supabaseAdmin.from('attendance_records').update({
      status: 'completed', clock_out_at: now.toISOString(), clock_out_method: 'nfc_pin',
      updated_by: auth.userId, updated_at: now.toISOString(),
    }).eq('id', sessionRow.id);
    if (updateErr) console.error('[nfc punch /clock-out] record update error:', updateErr);

    await writeEvent(supabaseAdmin, {
      storeId: auth.storeId, userId: auth.userId, recordId: sessionRow.id,
      eventType: 'clock_out', source: 'nfc', idempotencyKey,
      payload: { staffName: auth.userName },
    });

    res.json({
      recordId: sessionRow.id,
      status: 'completed',
      effectiveAt: now.toISOString(),
      staffName: auth.userName,
      message: '退勤しました',
    });
  } catch (e: any) {
    console.error('[nfc punch /clock-out] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});
