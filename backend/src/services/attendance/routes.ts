/**
 * 勤怠ドメインAPI（スタッフ向け + 管理者向け）
 */
import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { supabaseAdmin } from '../../config/supabase';
import { requireStoreMembership, requireManagedStore } from '../../auth/authorization';
import {
  calcBusinessDate, nextSessionNo, calcBreakMinutes,
  checkIdempotency, writeEvent, getPolicy,
  formatAttendanceSession as formatSession,
} from './helpers';

const router = Router();

// ================================================================
// スタッフ向け: 当日状態取得
// ================================================================
router.get('/me/today', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const userId = req.user!.id;
    const policy = await getPolicy(supabaseAdmin, storeId);
    const now = new Date();
    const businessDate = calcBusinessDate(now, policy.timezone, policy.business_day_cutoff_hour);

    // open session を取得
    const { data: openSession } = await supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .eq('status', 'working')
      .maybeSingle();

    // on_break session
    const { data: breakSession } = await supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .eq('status', 'on_break')
      .maybeSingle();

    const activeSession = openSession || breakSession;

    // 当日完了済みセッション
    const { data: completedToday } = await supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .eq('business_date', businessDate)
      .eq('status', 'completed')
      .order('clock_in_at', { ascending: true });

    // 直近イベント（当日）
    const { data: events } = await supabaseAdmin
      .from('attendance_events')
      .select('event_type, event_at')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .gte('event_at', `${businessDate}T00:00:00`)
      .order('event_at', { ascending: false })
      .limit(10);

    // 今日の予定シフト
    const { data: todayShifts } = await supabaseAdmin
      .from('shifts')
      .select('start_time, end_time, break_minutes')
      .eq('store_id', storeId)
      .eq('staff_id', membership.id)
      .eq('date', businessDate)
      .eq('status', 'published')
      .limit(1)
      .maybeSingle();

    // 現在状態を判定
    let currentStatus = 'not_clocked_in';
    if (activeSession) {
      currentStatus = activeSession.status; // 'working' or 'on_break'
    } else if (completedToday && completedToday.length > 0) {
      currentStatus = 'completed';
    }

    res.json({
      businessDate,
      currentStatus,
      activeSession: activeSession ? formatSession(activeSession) : null,
      completedSessions: (completedToday || []).map(formatSession),
      recentEvents: events || [],
      todayShift: todayShifts,
      policy: {
        timezone: policy.timezone,
        autoCloseBreak: policy.auto_close_break_before_clock_out,
      },
    });
  } catch (e: unknown) {
    console.error('[attendance GET /me/today]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// スタッフ向け: 出勤
// ================================================================
router.post('/clock-in', requireAuth, async (req: Request, res: Response) => {
  try {
    const { storeId, source, idempotencyKey } = req.body;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;
    const userId = req.user!.id;

    // 冪等チェック
    const idem = await checkIdempotency(supabaseAdmin, storeId, userId, idempotencyKey);
    if (idem.duplicate) {
      const { data: existing } = await supabaseAdmin
        .from('attendance_records').select('*').eq('id', idem.existingRecordId).single();
      res.json({ record: existing ? formatSession({ ...existing, breaks: [] }) : null, message: '出勤済み（重複リクエスト）' });
      return;
    }

    // open session チェック (store_id スコープ必須: テナント越境防止)
    const { data: open } = await supabaseAdmin
      .from('attendance_records')
      .select('id')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .in('status', ['working', 'on_break'])
      .maybeSingle();
    if (open) {
      res.status(409).json({ error: '既に勤務中です', code: 'ALREADY_WORKING' });
      return;
    }

    const policy = await getPolicy(supabaseAdmin, storeId);
    const now = new Date();
    const businessDate = calcBusinessDate(now, policy.timezone, policy.business_day_cutoff_hour);
    const sessionNo = await nextSessionNo(supabaseAdmin, storeId, userId, businessDate);

    const { data: record, error } = await supabaseAdmin
      .from('attendance_records')
      .insert({
        store_id: storeId,
        user_id: userId,
        business_date: businessDate,
        session_no: sessionNo,
        status: 'working',
        clock_in_at: now.toISOString(),
        source: source || 'web',
        clock_in_method: source || 'web',
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }

    await writeEvent(supabaseAdmin, {
      storeId, userId, recordId: record.id,
      eventType: 'clock_in', source, idempotencyKey,
    });

    res.status(201).json({
      recordId: record.id,
      status: record.status,
      effectiveAt: record.clock_in_at,
      businessDate: record.business_date,
      message: '出勤しました',
    });
  } catch (e: unknown) {
    console.error('[attendance POST /clock-in]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// スタッフ向け: 休憩開始
// ================================================================
router.post('/break-start', requireAuth, async (req: Request, res: Response) => {
  try {
    const { storeId, reason, idempotencyKey } = req.body;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;
    const userId = req.user!.id;

    const idem = await checkIdempotency(supabaseAdmin, storeId, userId, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '休憩開始済み（重複リクエスト）' }); return; }

    // working セッション取得
    const { data: session } = await supabaseAdmin
      .from('attendance_records')
      .select('id')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .eq('status', 'working')
      .maybeSingle();

    if (!session) {
      res.status(409).json({ error: '勤務中のセッションがありません', code: 'NO_OPEN_SESSION' });
      return;
    }

    // open break チェック
    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks')
      .select('id')
      .eq('attendance_record_id', session.id)
      .is('ended_at', null)
      .maybeSingle();
    if (openBreak) {
      res.status(409).json({ error: '既に休憩中です', code: 'ALREADY_ON_BREAK' });
      return;
    }

    const now = new Date();
    await supabaseAdmin.from('attendance_breaks').insert({
      attendance_record_id: session.id,
      started_at: now.toISOString(),
      reason: reason || null,
    });

    await supabaseAdmin.from('attendance_records')
      .update({ status: 'on_break', updated_by: userId, updated_at: now.toISOString() })
      .eq('id', session.id);

    await writeEvent(supabaseAdmin, {
      storeId, userId, recordId: session.id,
      eventType: 'break_start', idempotencyKey,
    });

    res.json({
      recordId: session.id, status: 'on_break',
      effectiveAt: now.toISOString(), message: '休憩を開始しました',
    });
  } catch (e: unknown) {
    console.error('[attendance POST /break-start]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// スタッフ向け: 休憩終了
// ================================================================
router.post('/break-end', requireAuth, async (req: Request, res: Response) => {
  try {
    const { storeId, idempotencyKey } = req.body;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;
    const userId = req.user!.id;

    const idem = await checkIdempotency(supabaseAdmin, storeId, userId, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '休憩終了済み（重複リクエスト）' }); return; }

    const { data: session } = await supabaseAdmin
      .from('attendance_records')
      .select('id')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .eq('status', 'on_break')
      .maybeSingle();

    if (!session) {
      res.status(409).json({ error: '休憩中のセッションがありません', code: 'NO_OPEN_BREAK' });
      return;
    }

    const now = new Date();
    const { data: openBreak } = await supabaseAdmin
      .from('attendance_breaks')
      .select('id')
      .eq('attendance_record_id', session.id)
      .is('ended_at', null)
      .maybeSingle();

    if (openBreak) {
      await supabaseAdmin.from('attendance_breaks')
        .update({ ended_at: now.toISOString() })
        .eq('id', openBreak.id);
    }

    await supabaseAdmin.from('attendance_records')
      .update({ status: 'working', updated_by: userId, updated_at: now.toISOString() })
      .eq('id', session.id);

    await writeEvent(supabaseAdmin, {
      storeId, userId, recordId: session.id,
      eventType: 'break_end', idempotencyKey,
    });

    res.json({
      recordId: session.id, status: 'working',
      effectiveAt: now.toISOString(), message: '休憩を終了しました',
    });
  } catch (e: unknown) {
    console.error('[attendance POST /break-end]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// スタッフ向け: 退勤
// ================================================================
router.post('/clock-out', requireAuth, async (req: Request, res: Response) => {
  try {
    const { storeId, idempotencyKey } = req.body;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;
    const userId = req.user!.id;

    const idem = await checkIdempotency(supabaseAdmin, storeId, userId, idempotencyKey);
    if (idem.duplicate) { res.json({ message: '退勤済み（重複リクエスト）' }); return; }

    // working or on_break セッション
    const { data: session } = await supabaseAdmin
      .from('attendance_records')
      .select('id, status')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .in('status', ['working', 'on_break'])
      .maybeSingle();

    if (!session) {
      res.status(409).json({ error: '勤務中のセッションがありません', code: 'NO_OPEN_SESSION' });
      return;
    }

    const policy = await getPolicy(supabaseAdmin, storeId);
    const now = new Date();

    // 休憩中の退勤チェック
    if (session.status === 'on_break') {
      if (!policy.auto_close_break_before_clock_out) {
        res.status(409).json({ error: '休憩中は退勤できません。先に休憩を終了してください。', code: 'CLOCK_OUT_DURING_BREAK_NOT_ALLOWED' });
        return;
      }
      // 自動休憩終了
      const { data: openBreak } = await supabaseAdmin
        .from('attendance_breaks')
        .select('id')
        .eq('attendance_record_id', session.id)
        .is('ended_at', null)
        .maybeSingle();
      if (openBreak) {
        await supabaseAdmin.from('attendance_breaks')
          .update({ ended_at: now.toISOString() })
          .eq('id', openBreak.id);
      }
    }

    await supabaseAdmin.from('attendance_records')
      .update({
        status: 'completed',
        clock_out_at: now.toISOString(),
        clock_out_method: req.body.source || 'web',
        updated_by: userId,
        updated_at: now.toISOString(),
      })
      .eq('id', session.id);

    await writeEvent(supabaseAdmin, {
      storeId, userId, recordId: session.id,
      eventType: 'clock_out', idempotencyKey,
    });

    res.json({
      recordId: session.id, status: 'completed',
      effectiveAt: now.toISOString(), message: '退勤しました',
    });
  } catch (e: unknown) {
    console.error('[attendance POST /clock-out]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// スタッフ向け: 履歴取得
// ================================================================
router.get('/me/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    const month = req.query.month as string; // YYYY-MM
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;
    const userId = req.user!.id;

    let query = supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', storeId)
      .eq('user_id', userId)
      .order('business_date', { ascending: false })
      .order('session_no', { ascending: true });

    if (month) {
      const [y, m] = month.split('-');
      const start = `${y}-${m}-01`;
      const endMonth = parseInt(m) === 12 ? 1 : parseInt(m) + 1;
      const endYear = parseInt(m) === 12 ? parseInt(y) + 1 : parseInt(y);
      const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
      query = query.gte('business_date', start).lt('business_date', end);
    } else {
      query = query.limit(60);
    }

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }

    // 修正申請のステータスも取得
    const recordIds = (data || []).map((r: any) => r.id);
    const { data: corrections } = recordIds.length > 0
      ? await supabaseAdmin
          .from('attendance_correction_requests')
          .select('attendance_record_id, status')
          .in('attendance_record_id', recordIds)
      : { data: [] };

    const correctionMap = new Map<string, string>();
    for (const c of corrections || []) {
      if (c.status === 'pending') correctionMap.set(c.attendance_record_id, 'pending');
    }

    const records = (data || []).map((r: any) => ({
      ...formatSession(r),
      correctionStatus: correctionMap.get(r.id) || null,
    }));

    res.json({ records });
  } catch (e: unknown) {
    console.error('[attendance GET /me/history]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// スタッフ向け: 修正申請
// ================================================================
router.post('/corrections', requireAuth, async (req: Request, res: Response) => {
  try {
    const { storeId, attendanceRecordId, requestedBusinessDate, requestType, beforeSnapshot, afterSnapshot, reason } = req.body;
    if (!storeId || !reason) { res.status(400).json({ error: 'storeId and reason are required' }); return; }

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;
    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('attendance_correction_requests')
      .insert({
        store_id: storeId,
        user_id: userId,
        attendance_record_id: attendanceRecordId || null,
        requested_business_date: requestedBusinessDate,
        request_type: requestType,
        before_snapshot: beforeSnapshot || {},
        after_snapshot: afterSnapshot || {},
        reason,
      })
      .select()
      .single();

    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }

    await writeEvent(supabaseAdmin, {
      storeId, userId, recordId: attendanceRecordId,
      eventType: 'correction_requested',
      payload: { correctionId: data.id, requestType },
    });

    res.status(201).json({ correction: data, message: '修正申請を送信しました' });
  } catch (e: unknown) {
    console.error('[attendance POST /corrections]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// スタッフ向け: 自分の修正申請一覧
// ================================================================
router.get('/corrections/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('attendance_correction_requests')
      .select('*')
      .eq('store_id', storeId)
      .eq('user_id', req.user!.id)
      .order('requested_at', { ascending: false });

    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }
    res.json({ corrections: data || [] });
  } catch (e: unknown) {
    console.error('[attendance GET /corrections/me]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 管理者向け: 当日一覧
// ================================================================
router.get('/admin/today', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    const statusFilter = req.query.status as string;
    const q = req.query.q as string;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    const policy = await getPolicy(supabaseAdmin, storeId);
    const businessDate = calcBusinessDate(new Date(), policy.timezone, policy.business_day_cutoff_hour);

    // 全スタッフ取得
    const { data: allStaff } = await supabaseAdmin
      .from('store_staff')
      .select('id, user_id, role, user:profiles(name, picture)')
      .eq('store_id', storeId);

    // 当日レコード
    let recQuery = supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', storeId)
      .eq('business_date', businessDate)
      .order('clock_in_at');

    if (statusFilter) recQuery = recQuery.eq('status', statusFilter);
    const { data: records } = await recQuery;

    // open session（business_date を問わない）
    const { data: openSessions } = await supabaseAdmin
      .from('attendance_records')
      .select('*')
      .eq('store_id', storeId)
      .in('status', ['working', 'on_break']);

    const openByUser = new Map<string, any>();
    for (const s of openSessions || []) {
      openByUser.set(s.user_id, s);
    }

    const recordByUser = new Map<string, any[]>();
    for (const r of records || []) {
      const arr = recordByUser.get(r.user_id) || [];
      arr.push(r);
      recordByUser.set(r.user_id, arr);
    }

    // 今日のシフトも取得
    const { data: todayShifts } = await supabaseAdmin
      .from('shifts')
      .select('staff_id, start_time, end_time')
      .eq('store_id', storeId)
      .eq('date', businessDate)
      .eq('status', 'published');

    const shiftByStaffId = new Map<string, any>();
    for (const s of todayShifts || []) {
      shiftByStaffId.set(s.staff_id, s);
    }

    // 当日のチェック記録（出勤/退勤チェックリスト実施状況）
    const { data: checkRecords } = await supabaseAdmin
      .from('check_records')
      .select('staff_id, timing, all_checked, checked_at')
      .eq('store_id', storeId)
      .gte('checked_at', `${businessDate}T00:00:00`)
      .lte('checked_at', `${businessDate}T23:59:59`);

    // staff_id → { clock_in: bool, clock_out: bool }
    const checkByStaffId = new Map<string, { clockIn: boolean; clockOut: boolean }>();
    for (const cr of checkRecords || []) {
      const entry = checkByStaffId.get(cr.staff_id) || { clockIn: false, clockOut: false };
      if (cr.timing === 'clock_in' && cr.all_checked) entry.clockIn = true;
      if (cr.timing === 'clock_out' && cr.all_checked) entry.clockOut = true;
      checkByStaffId.set(cr.staff_id, entry);
    }

    let staffList = (allStaff || []).map((s: any) => {
      const userRecords = recordByUser.get(s.user_id) || [];
      const openSession = openByUser.get(s.user_id);
      const shift = shiftByStaffId.get(s.id);
      const checkStatus = checkByStaffId.get(s.id) || { clockIn: false, clockOut: false };

      let currentStatus = 'not_clocked_in';
      if (openSession) {
        currentStatus = openSession.status;
      } else if (userRecords.some((r: any) => r.status === 'completed')) {
        currentStatus = 'completed';
      }

      const latestRecord = userRecords[userRecords.length - 1];
      const breakMinutes = latestRecord ? calcBreakMinutes(latestRecord.breaks || []) : 0;

      return {
        userId: s.user_id,
        staffId: s.id,
        staffName: s.user?.name || '—',
        staffPicture: s.user?.picture,
        role: s.role,
        currentStatus,
        clockInAt: latestRecord?.clock_in_at || null,
        clockOutAt: latestRecord?.clock_out_at || null,
        breakMinutes,
        shift: shift ? { startTime: shift.start_time, endTime: shift.end_time } : null,
        sessions: userRecords.map((r: any) => formatSession(r)),
        checklist: checkStatus,
      };
    });

    // 名前検索
    if (q) {
      const lower = q.toLowerCase();
      staffList = staffList.filter((s: any) => s.staffName.toLowerCase().includes(lower));
    }

    // ステータスフィルタ
    if (statusFilter) {
      staffList = staffList.filter((s: any) => s.currentStatus === statusFilter);
    }

    res.json({ businessDate, staff: staffList });
  } catch (e: unknown) {
    console.error('[attendance GET /admin/today]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 管理者向け: 月次一覧
// ================================================================
router.get('/admin/monthly', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    const month = req.query.month as string; // YYYY-MM
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [y, m] = targetMonth.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const endM = m === 12 ? 1 : m + 1;
    const endY = m === 12 ? y + 1 : y;
    const end = `${endY}-${String(endM).padStart(2, '0')}-01`;

    const { data: records } = await supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', storeId)
      .gte('business_date', start)
      .lt('business_date', end)
      .order('business_date');

    const { data: allStaff } = await supabaseAdmin
      .from('store_staff')
      .select('id, user_id, role, hourly_wage, user:profiles(name)')
      .eq('store_id', storeId);

    // 修正申請数
    const { data: corrections } = await supabaseAdmin
      .from('attendance_correction_requests')
      .select('user_id, status')
      .eq('store_id', storeId)
      .gte('requested_business_date', start)
      .lt('requested_business_date', end);

    const staffMap = new Map<string, any>();
    for (const s of allStaff || []) {
      staffMap.set(s.user_id, {
        userId: s.user_id,
        staffId: s.id,
        staffName: (s as { user?: { name?: string } | null }).user?.name || '—',
        role: s.role,
        hourlyWage: s.hourly_wage || 0,
        totalMinutes: 0,
        totalBreakMinutes: 0,
        workDays: new Set<string>(),
        lateCount: 0,
        correctionCount: 0,
      });
    }

    for (const r of records || []) {
      const entry = staffMap.get(r.user_id);
      if (!entry) continue;
      if (r.clock_out_at) {
        const diff = (new Date(r.clock_out_at).getTime() - new Date(r.clock_in_at).getTime()) / 60000;
        const brk = calcBreakMinutes(r.breaks || []);
        entry.totalMinutes += diff - brk;
        entry.totalBreakMinutes += brk;
      }
      entry.workDays.add(r.business_date);
    }

    for (const c of corrections || []) {
      const entry = staffMap.get(c.user_id);
      if (entry && c.status === 'pending') entry.correctionCount++;
    }

    const summary = Array.from(staffMap.values()).map(s => ({
      userId: s.userId,
      staffId: s.staffId,
      staffName: s.staffName,
      role: s.role,
      workDays: s.workDays.size,
      totalWorkMinutes: Math.round(s.totalMinutes),
      totalWorkHours: Math.round(s.totalMinutes / 60 * 100) / 100,
      totalBreakMinutes: Math.round(s.totalBreakMinutes),
      correctionCount: s.correctionCount,
      estimatedSalary: Math.round((s.totalMinutes / 60) * s.hourlyWage),
    }));

    res.json({ month: targetMonth, summary });
  } catch (e: unknown) {
    console.error('[attendance GET /admin/monthly]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 管理者向け: スタッフ月次詳細
// ================================================================
router.get('/admin/staff/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    const targetUserId = req.params.userId;
    const month = req.query.month as string;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [y, m] = targetMonth.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const endM = m === 12 ? 1 : m + 1;
    const endY = m === 12 ? y + 1 : y;
    const end = `${endY}-${String(endM).padStart(2, '0')}-01`;

    const { data: records } = await supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', storeId)
      .eq('user_id', targetUserId)
      .gte('business_date', start)
      .lt('business_date', end)
      .order('business_date')
      .order('session_no');

    const { data: staffInfo } = await supabaseAdmin
      .from('store_staff')
      .select('id, role, hourly_wage, user:profiles(name, picture)')
      .eq('store_id', storeId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    const { data: corrections } = await supabaseAdmin
      .from('attendance_correction_requests')
      .select('*')
      .eq('store_id', storeId)
      .eq('user_id', targetUserId)
      .gte('requested_business_date', start)
      .lt('requested_business_date', end)
      .order('requested_at', { ascending: false });

    res.json({
      month: targetMonth,
      staff: staffInfo ? {
        userId: targetUserId,
        staffId: staffInfo.id,
        name: (staffInfo as { user?: { name?: string; picture?: string } | null }).user?.name,
        picture: (staffInfo as { user?: { name?: string; picture?: string } | null }).user?.picture,
        role: staffInfo.role,
        hourlyWage: staffInfo.hourly_wage,
      } : null,
      records: (records || []).map((r: any) => formatSession(r)),
      corrections: corrections || [],
    });
  } catch (e: unknown) {
    console.error('[attendance GET /admin/staff/:userId]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 管理者向け: 手動修正
// ================================================================
router.patch('/admin/records/:recordId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.body.storeId as string;
    const recordId = req.params.recordId as string;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    // 対象レコードが同じ店舗のものか確認
    const { data: target } = await supabaseAdmin
      .from('attendance_records')
      .select('*')
      .eq('id', recordId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!target) {
      res.status(404).json({ error: '勤怠レコードが見つかりません' });
      return;
    }

    const beforeSnapshot = {
      clockInAt: target.clock_in_at,
      clockOutAt: target.clock_out_at,
      status: target.status,
      note: target.note,
    };

    const update: any = { updated_by: req.user!.id, updated_at: new Date().toISOString() };
    if (req.body.clockInAt !== undefined) update.clock_in_at = req.body.clockInAt;
    if (req.body.clockOutAt !== undefined) update.clock_out_at = req.body.clockOutAt;
    if (req.body.status !== undefined) update.status = req.body.status;
    if (req.body.note !== undefined) update.note = req.body.note;

    const { data: updated, error } = await supabaseAdmin
      .from('attendance_records')
      .update(update)
      .eq('id', recordId)
      .select()
      .single();

    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }

    await writeEvent(supabaseAdmin, {
      storeId, userId: target.user_id, recordId,
      eventType: 'admin_edit',
      payload: { before: beforeSnapshot, after: update },
      createdBy: req.user!.id,
    });

    res.json({ record: formatSession({ ...updated, breaks: [] }), message: '勤怠レコードを更新しました' });
  } catch (e: unknown) {
    console.error('[attendance PATCH /admin/records/:recordId]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 管理者向け: 勤怠レコード削除 (owner のみ)
// ================================================================
router.delete('/admin/records/:recordId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    const recordId = req.params.recordId as string;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    // Only owner role is allowed to delete records
    if (mgmt.role !== 'owner') {
      res.status(403).json({ error: 'オーナーのみが勤怠レコードを削除できます' });
      return;
    }

    // Verify the target record belongs to this store
    const { data: target } = await supabaseAdmin
      .from('attendance_records')
      .select('*')
      .eq('id', recordId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!target) {
      res.status(404).json({ error: '勤怠レコードが見つかりません' });
      return;
    }

    // Delete related attendance_breaks first (foreign key constraint)
    const { error: breaksError } = await supabaseAdmin
      .from('attendance_breaks')
      .delete()
      .eq('attendance_record_id', recordId);
    if (breaksError) { res.status(500).json({ error: breaksError.message }); return; }

    // Delete related attendance_events (foreign key constraint)
    const { error: eventsError } = await supabaseAdmin
      .from('attendance_events')
      .delete()
      .eq('attendance_record_id', recordId);
    if (eventsError) { res.status(500).json({ error: eventsError.message }); return; }

    // Delete related attendance_correction_requests (foreign key constraint)
    const { error: correctionsError } = await supabaseAdmin
      .from('attendance_correction_requests')
      .delete()
      .eq('attendance_record_id', recordId);
    if (correctionsError) { res.status(500).json({ error: correctionsError.message }); return; }

    // Physically delete the attendance record
    const { error: deleteError } = await supabaseAdmin
      .from('attendance_records')
      .delete()
      .eq('id', recordId);
    if (deleteError) { res.status(500).json({ error: deleteError.message }); return; }

    // Write audit log with the full snapshot of the deleted record
    await writeEvent(supabaseAdmin, {
      storeId, userId: target.user_id, recordId,
      eventType: 'admin_delete',
      payload: { deleted: target },
      createdBy: req.user!.id,
    });

    res.json({ ok: true, message: '勤怠レコードを削除しました' });
  } catch (e: unknown) {
    console.error('[attendance DELETE /admin/records/:recordId]', e);
    const message = 'Internal Server Error';
    res.status(500).json({ error: message });
  }
});

// ================================================================
// 管理者向け: 修正申請一覧
// ================================================================
router.get('/admin/corrections', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    const { data, error } = await supabaseAdmin
      .from('attendance_correction_requests')
      .select('*, user:profiles!attendance_correction_requests_user_id_fkey(name)')
      .eq('store_id', storeId)
      .order('requested_at', { ascending: false });

    if (error) {
      // profiles join が失敗する場合は join なしで取得
      const { data: fallback } = await supabaseAdmin
        .from('attendance_correction_requests')
        .select('*')
        .eq('store_id', storeId)
        .order('requested_at', { ascending: false });
      res.json({ corrections: fallback || [] });
      return;
    }
    res.json({ corrections: data || [] });
  } catch (e: unknown) {
    console.error('[attendance GET /admin/corrections]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 管理者向け: 修正申請承認
// ================================================================
router.post('/admin/corrections/:id/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.body.storeId;
    const correctionId = req.params.id;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    const { data: correction } = await supabaseAdmin
      .from('attendance_correction_requests')
      .select('*')
      .eq('id', correctionId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!correction || correction.status !== 'pending') {
      res.status(404).json({ error: '承認対象の申請が見つかりません' });
      return;
    }

    const now = new Date().toISOString();
    await supabaseAdmin.from('attendance_correction_requests')
      .update({
        status: 'approved',
        reviewed_by: req.user!.id,
        reviewed_at: now,
        review_comment: req.body.comment || null,
        updated_at: now,
      })
      .eq('id', correctionId);

    // after_snapshot の内容を勤怠レコードに反映
    if (correction.attendance_record_id && correction.after_snapshot) {
      const snap = correction.after_snapshot;
      const update: any = { updated_by: req.user!.id, updated_at: now };
      if (snap.clockInAt) update.clock_in_at = snap.clockInAt;
      if (snap.clockOutAt) update.clock_out_at = snap.clockOutAt;
      if (snap.status) update.status = snap.status;
      if (snap.note !== undefined) update.note = snap.note;

      await supabaseAdmin.from('attendance_records')
        .update(update)
        .eq('id', correction.attendance_record_id);
    }

    await writeEvent(supabaseAdmin, {
      storeId, userId: correction.user_id, recordId: correction.attendance_record_id,
      eventType: 'correction_approved',
      payload: { correctionId },
      createdBy: req.user!.id,
    });

    res.json({ message: '申請を承認しました' });
  } catch (e: unknown) {
    console.error('[attendance POST /admin/corrections/:id/approve]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 管理者向け: 修正申請却下
// ================================================================
router.post('/admin/corrections/:id/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.body.storeId;
    const correctionId = req.params.id;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    const { data: correction } = await supabaseAdmin
      .from('attendance_correction_requests')
      .select('*')
      .eq('id', correctionId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!correction || correction.status !== 'pending') {
      res.status(404).json({ error: '却下対象の申請が見つかりません' });
      return;
    }

    const now = new Date().toISOString();
    await supabaseAdmin.from('attendance_correction_requests')
      .update({
        status: 'rejected',
        reviewed_by: req.user!.id,
        reviewed_at: now,
        review_comment: req.body.comment || null,
        updated_at: now,
      })
      .eq('id', correctionId);

    await writeEvent(supabaseAdmin, {
      storeId, userId: correction.user_id, recordId: correction.attendance_record_id,
      eventType: 'correction_rejected',
      payload: { correctionId },
      createdBy: req.user!.id,
    });

    res.json({ message: '申請を却下しました' });
  } catch (e: unknown) {
    console.error('[attendance POST /admin/corrections/:id/reject]', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 管理者向け: 勤怠ポリシー取得
// ================================================================
router.get('/admin/policy', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    const policy = await getPolicy(supabaseAdmin, storeId);
    res.json({ policy });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 管理者向け: 勤怠ポリシー更新
// ================================================================
router.put('/admin/policy', requireAuth, async (req: Request, res: Response) => {
  try {
    const { storeId, ...policyData } = req.body;
    if (!storeId) { res.status(400).json({ error: 'storeId is required' }); return; }

    const mgmt = await requireManagedStore(req, res, storeId);
    if (!mgmt) return;

    const update: any = { updated_at: new Date().toISOString() };
    if (policyData.timezone !== undefined) update.timezone = policyData.timezone;
    if (policyData.businessDayCutoffHour !== undefined) update.business_day_cutoff_hour = policyData.businessDayCutoffHour;
    if (policyData.roundingUnitMinutes !== undefined) update.rounding_unit_minutes = policyData.roundingUnitMinutes;
    if (policyData.roundingMode !== undefined) update.rounding_mode = policyData.roundingMode;
    if (policyData.autoCloseBreakBeforeClockOut !== undefined) update.auto_close_break_before_clock_out = policyData.autoCloseBreakBeforeClockOut;
    if (policyData.requireManagerApproval !== undefined) update.require_manager_approval = policyData.requireManagerApproval;

    // upsert
    const { data: existing } = await supabaseAdmin
      .from('attendance_policies')
      .select('id')
      .eq('store_id', storeId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from('attendance_policies').update(update).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('attendance_policies').insert({ store_id: storeId, ...update });
    }

    const policy = await getPolicy(supabaseAdmin, storeId);
    res.json({ policy, message: 'ポリシーを更新しました' });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const attendanceApiRouter = router;
