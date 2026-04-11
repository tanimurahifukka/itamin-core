/**
 * LINE打刻API
 * LINE userId で認証し、Supabase Auth なしで打刻操作を行う。
 * リッチメニュー → LIFF → LINE Login → この API で打刻。
 */
import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import {
  calcBusinessDate, nextSessionNo, calcBreakMinutes,
  checkIdempotency, writeEvent, getPolicy,
} from '../attendance/helpers';

const router = Router();

/**
 * LINE userId からITAMINユーザーを解決するミドルウェア
 */
async function requireLineUser(req: Request, res: Response): Promise<{
  userId: string;
  lineUserId: string;
  storeId: string;
  staffId: string;
} | null> {
  const lineUserId = req.body?.lineUserId || req.query?.lineUserId;
  const storeId = req.body?.storeId || req.query?.storeId;

  if (!lineUserId || !storeId) {
    res.status(400).json({ error: 'lineUserId and storeId are required' });
    return null;
  }

  // LINE連携テーブルからユーザーを解決
  const { data: link } = await supabaseAdmin
    .from('line_user_links')
    .select('user_id')
    .eq('line_user_id', lineUserId)
    .eq('status', 'active')
    .maybeSingle();

  if (!link) {
    res.status(403).json({ error: 'LINE_NOT_LINKED', message: 'LINE連携されていません' });
    return null;
  }

  // ストアメンバーシップ確認
  const { data: staff } = await supabaseAdmin
    .from('store_staff')
    .select('id')
    .eq('store_id', storeId)
    .eq('user_id', link.user_id)
    .maybeSingle();

  if (!staff) {
    res.status(403).json({ error: 'この店舗のスタッフではありません' });
    return null;
  }

  // last_login_at 更新
  await supabaseAdmin.from('line_user_links')
    .update({ last_login_at: new Date().toISOString() })
    .eq('line_user_id', lineUserId);

  return { userId: link.user_id, lineUserId, storeId, staffId: staff.id };
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
    breaks: breaks.map((b: any) => ({
      id: b.id, startedAt: b.started_at, endedAt: b.ended_at,
    })),
    breakMinutes: calcBreakMinutes(breaks),
  };
}

// ================================================================
// 当日状態取得
// ================================================================
router.post('/today', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

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

    const { data: events } = await supabaseAdmin
      .from('attendance_events')
      .select('event_type, event_at')
      .eq('store_id', auth.storeId)
      .eq('user_id', auth.userId)
      .gte('event_at', `${businessDate}T00:00:00`)
      .order('event_at', { ascending: false })
      .limit(10);

    let currentStatus = 'not_clocked_in';
    if (activeSession) currentStatus = activeSession.status;
    else if (completedToday && completedToday.length > 0) currentStatus = 'completed';

    res.json({
      businessDate,
      currentStatus,
      activeSession: activeSession ? formatSession(activeSession) : null,
      completedSessions: (completedToday || []).map(formatSession),
      recentEvents: events || [],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// 出勤
// ================================================================
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;
    const { idempotencyKey } = req.body;

    const idem = await checkIdempotency(supabaseAdmin, idempotencyKey);
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
    const sessionNo = await nextSessionNo(supabaseAdmin, auth.userId, businessDate);

    const { data: record, error } = await supabaseAdmin
      .from('attendance_records')
      .insert({
        store_id: auth.storeId, user_id: auth.userId,
        business_date: businessDate, session_no: sessionNo,
        status: 'working', clock_in_at: now.toISOString(),
        source: 'line', clock_in_method: 'line',
        created_by: auth.userId, updated_by: auth.userId,
      })
      .select().single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    await writeEvent(supabaseAdmin, {
      storeId: auth.storeId, userId: auth.userId, recordId: record.id,
      eventType: 'clock_in', source: 'line', idempotencyKey,
    });

    res.status(201).json({ recordId: record.id, status: 'working', effectiveAt: record.clock_in_at, businessDate, message: '出勤しました' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// 休憩開始
// ================================================================
router.post('/break-start', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;
    const { idempotencyKey } = req.body;

    const idem = await checkIdempotency(supabaseAdmin, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '休憩開始済み' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id')
      .eq('store_id', auth.storeId).eq('user_id', auth.userId).eq('status', 'working').maybeSingle();
    if (!session) { res.status(409).json({ error: '勤務中のセッションがありません', code: 'NO_OPEN_SESSION' }); return; }

    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks').select('id')
      .eq('attendance_record_id', session.id).is('ended_at', null).maybeSingle();
    if (openBreak) { res.status(409).json({ error: '既に休憩中です', code: 'ALREADY_ON_BREAK' }); return; }

    const now = new Date();
    await supabaseAdmin.from('attendance_breaks').insert({ attendance_record_id: session.id, started_at: now.toISOString() });
    await supabaseAdmin.from('attendance_records').update({ status: 'on_break', updated_by: auth.userId, updated_at: now.toISOString() }).eq('id', session.id);
    await writeEvent(supabaseAdmin, { storeId: auth.storeId, userId: auth.userId, recordId: session.id, eventType: 'break_start', source: 'line', idempotencyKey });

    res.json({ recordId: session.id, status: 'on_break', effectiveAt: now.toISOString(), message: '休憩を開始しました' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// 休憩終了
// ================================================================
router.post('/break-end', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;
    const { idempotencyKey } = req.body;

    const idem = await checkIdempotency(supabaseAdmin, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '休憩終了済み' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id')
      .eq('store_id', auth.storeId).eq('user_id', auth.userId).eq('status', 'on_break').maybeSingle();
    if (!session) { res.status(409).json({ error: '休憩中のセッションがありません', code: 'NO_OPEN_BREAK' }); return; }

    const now = new Date();
    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks').select('id').eq('attendance_record_id', session.id).is('ended_at', null).maybeSingle();
    if (openBreak) { await supabaseAdmin.from('attendance_breaks').update({ ended_at: now.toISOString() }).eq('id', openBreak.id); }

    await supabaseAdmin.from('attendance_records').update({ status: 'working', updated_by: auth.userId, updated_at: now.toISOString() }).eq('id', session.id);
    await writeEvent(supabaseAdmin, { storeId: auth.storeId, userId: auth.userId, recordId: session.id, eventType: 'break_end', source: 'line', idempotencyKey });

    res.json({ recordId: session.id, status: 'working', effectiveAt: now.toISOString(), message: '休憩を終了しました' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// 退勤
// ================================================================
router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;
    const { idempotencyKey } = req.body;

    const idem = await checkIdempotency(supabaseAdmin, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '退勤済み' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records').select('id, status')
      .eq('store_id', auth.storeId).eq('user_id', auth.userId)
      .in('status', ['working', 'on_break']).maybeSingle();
    if (!session) { res.status(409).json({ error: '勤務中のセッションがありません', code: 'NO_OPEN_SESSION' }); return; }

    const policy = await getPolicy(supabaseAdmin, auth.storeId);
    const now = new Date();

    if (session.status === 'on_break') {
      if (!policy.auto_close_break_before_clock_out) {
        res.status(409).json({ error: '休憩中は退勤できません', code: 'CLOCK_OUT_DURING_BREAK_NOT_ALLOWED' }); return;
      }
      const { data: openBreak } = await supabaseAdmin
        .from('attendance_breaks').select('id').eq('attendance_record_id', session.id).is('ended_at', null).maybeSingle();
      if (openBreak) { await supabaseAdmin.from('attendance_breaks').update({ ended_at: now.toISOString() }).eq('id', openBreak.id); }
    }

    await supabaseAdmin.from('attendance_records').update({
      status: 'completed', clock_out_at: now.toISOString(), clock_out_method: 'line',
      updated_by: auth.userId, updated_at: now.toISOString(),
    }).eq('id', session.id);

    await writeEvent(supabaseAdmin, { storeId: auth.storeId, userId: auth.userId, recordId: session.id, eventType: 'clock_out', source: 'line', idempotencyKey });

    res.json({ recordId: session.id, status: 'completed', effectiveAt: now.toISOString(), message: '退勤しました' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export const linePunchRouter = router;
