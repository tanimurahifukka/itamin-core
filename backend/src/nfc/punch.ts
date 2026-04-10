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
  calcBusinessDate, nextSessionNo, calcBreakMinutes,
  checkIdempotency, writeEvent, getPolicy,
} from '../services/attendance/helpers';

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

  const membershipId = (pinRow as any).membership_id as string;

  const { data: staff } = await supabaseAdmin
    .from('store_staff')
    .select('id, user_id, store_id, user:profiles(name)')
    .eq('id', membershipId)
    .maybeSingle();

  if (!staff || (staff as any).store_id !== storeId) {
    res.status(401).json({ error: 'スタッフ情報の解決に失敗しました' });
    return null;
  }

  return {
    userId: (staff as any).user_id,
    storeId,
    staffId: (staff as any).id,
    userName: (staff as any).user?.name ?? null,
  };
}

function formatSession(s: any) {
  const breaks = s.breaks || [];
  return {
    id: s.id,
    businessDate: s.business_date,
    sessionNo: s.session_no,
    status: s.status,
    clockInAt: s.clock_in_at,
    clockOutAt: s.clock_out_at,
    breaks: breaks.map((b: any) => ({ id: b.id, startedAt: b.started_at, endedAt: b.ended_at })),
    breakMinutes: calcBreakMinutes(breaks),
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

    let currentStatus: 'not_clocked_in' | 'working' | 'on_break' | 'completed' = 'not_clocked_in';
    if (activeSession) currentStatus = (activeSession as any).status;
    else if (completedToday && completedToday.length > 0) currentStatus = 'completed';

    res.json({
      store: { id: (store as any)?.id, name: (store as any)?.name || '' },
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

    const idem = await checkIdempotency(supabaseAdmin, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '出勤済み（重複リクエスト）' }); return; }

    const { data: open } = await supabaseAdmin
      .from('attendance_records')
      .select('id')
      .eq('user_id', auth.userId)
      .in('status', ['working', 'on_break'])
      .maybeSingle();
    if (open) { res.status(409).json({ error: '既に勤務中です', code: 'ALREADY_WORKING' }); return; }

    const policy = await getPolicy(supabaseAdmin, auth.storeId);
    const now = new Date();
    const businessDate = calcBusinessDate(now, policy.timezone, policy.business_day_cutoff_hour);
    const sessionNo = await nextSessionNo(supabaseAdmin, auth.userId, businessDate);

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

    await writeEvent(supabaseAdmin, {
      storeId: auth.storeId, userId: auth.userId, recordId: (record as any).id,
      eventType: 'clock_in', source: 'nfc', idempotencyKey,
      payload: { staffName: auth.userName },
    });

    res.status(201).json({
      recordId: (record as any).id,
      status: 'working',
      effectiveAt: (record as any).clock_in_at,
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

    const idem = await checkIdempotency(supabaseAdmin, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '休憩開始済み' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id')
      .eq('store_id', auth.storeId).eq('user_id', auth.userId).eq('status', 'working').maybeSingle();
    if (!session) { res.status(409).json({ error: '勤務中のセッションがありません', code: 'NO_OPEN_SESSION' }); return; }

    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks').select('id')
      .eq('attendance_record_id', (session as any).id).is('ended_at', null).maybeSingle();
    if (openBreak) { res.status(409).json({ error: '既に休憩中です', code: 'ALREADY_ON_BREAK' }); return; }

    const now = new Date();
    await supabaseAdmin.from('attendance_breaks').insert({
      attendance_record_id: (session as any).id, started_at: now.toISOString(),
    });
    await supabaseAdmin.from('attendance_records').update({
      status: 'on_break', updated_by: auth.userId, updated_at: now.toISOString(),
    }).eq('id', (session as any).id);
    await writeEvent(supabaseAdmin, {
      storeId: auth.storeId, userId: auth.userId, recordId: (session as any).id,
      eventType: 'break_start', source: 'nfc', idempotencyKey,
      payload: { staffName: auth.userName },
    });

    res.json({
      recordId: (session as any).id,
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

    const idem = await checkIdempotency(supabaseAdmin, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '休憩終了済み' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id')
      .eq('store_id', auth.storeId).eq('user_id', auth.userId).eq('status', 'on_break').maybeSingle();
    if (!session) { res.status(409).json({ error: '休憩中のセッションがありません', code: 'NO_OPEN_BREAK' }); return; }

    const now = new Date();
    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks').select('id')
      .eq('attendance_record_id', (session as any).id).is('ended_at', null).maybeSingle();
    if (openBreak) {
      await supabaseAdmin.from('attendance_breaks').update({ ended_at: now.toISOString() }).eq('id', (openBreak as any).id);
    }

    await supabaseAdmin.from('attendance_records').update({
      status: 'working', updated_by: auth.userId, updated_at: now.toISOString(),
    }).eq('id', (session as any).id);
    await writeEvent(supabaseAdmin, {
      storeId: auth.storeId, userId: auth.userId, recordId: (session as any).id,
      eventType: 'break_end', source: 'nfc', idempotencyKey,
      payload: { staffName: auth.userName },
    });

    res.json({
      recordId: (session as any).id,
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

    const idem = await checkIdempotency(supabaseAdmin, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '退勤済み' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id, status')
      .eq('store_id', auth.storeId).eq('user_id', auth.userId)
      .in('status', ['working', 'on_break']).maybeSingle();
    if (!session) { res.status(409).json({ error: '勤務中のセッションがありません', code: 'NO_OPEN_SESSION' }); return; }

    const policy = await getPolicy(supabaseAdmin, auth.storeId);
    const now = new Date();

    if ((session as any).status === 'on_break') {
      if (!policy.auto_close_break_before_clock_out) {
        res.status(409).json({ error: '休憩中は退勤できません', code: 'CLOCK_OUT_DURING_BREAK_NOT_ALLOWED' });
        return;
      }
      const { data: openBreak } = await supabaseAdmin
        .from('attendance_breaks').select('id')
        .eq('attendance_record_id', (session as any).id).is('ended_at', null).maybeSingle();
      if (openBreak) {
        await supabaseAdmin.from('attendance_breaks').update({ ended_at: now.toISOString() }).eq('id', (openBreak as any).id);
      }
    }

    await supabaseAdmin.from('attendance_records').update({
      status: 'completed', clock_out_at: now.toISOString(), clock_out_method: 'nfc_pin',
      updated_by: auth.userId, updated_at: now.toISOString(),
    }).eq('id', (session as any).id);

    await writeEvent(supabaseAdmin, {
      storeId: auth.storeId, userId: auth.userId, recordId: (session as any).id,
      eventType: 'clock_out', source: 'nfc', idempotencyKey,
      payload: { staffName: auth.userName },
    });

    res.json({
      recordId: (session as any).id,
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
