/**
 * LINEスタッフ向けAPI
 * LINE userId + storeId で認証し、Supabase Auth なしでスタッフ機能を提供する。
 * リッチメニューから直接アクセスする想定。
 */
import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { listActiveChecklist, createSubmission } from '../haccp';
import { isValidTiming } from '../haccp/helpers';

const router = Router();

/** shifts table row selected for LINE staff shift view */
interface ShiftRow {
  id: string;
  staff_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  status: string | null;
  note: string | null;
}

/** shift_requests table row */
interface ShiftRequestRow {
  id: string;
  staff_id: string;
  date: string;
  request_type: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
}

/** attendance_breaks table row (nested via *, used in history) */
interface AttendanceBreakRow {
  started_at: string | null;
  ended_at: string | null;
}

/** attendance_records table row (selected via *, with breaks relation) */
interface AttendanceRecordRow {
  id: string;
  business_date: string;
  status: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  breaks: AttendanceBreakRow[];
}

/** Mapped attendance history entry (camelCase, after transformation) */
interface AttendanceHistoryEntry {
  id: string;
  businessDate: string;
  status: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  breakMinutes: number;
}

/** notices table row */
interface NoticeRow {
  id: string;
  title: string | null;
  body: string | null;
  pinned: boolean;
  author_name: string | null;
  created_at: string;
}

/** notice_reads table row */
interface NoticeReadRow {
  notice_id: string;
  read_at: string;
}

// ================================================================
// LINE userId → ITAMIN ユーザー解決（punch.ts と同パターン）
// ================================================================
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

  await supabaseAdmin.from('line_user_links')
    .update({ last_login_at: new Date().toISOString() })
    .eq('line_user_id', lineUserId);

  return { userId: link.user_id, lineUserId, storeId, staffId: staff.id };
}

// ================================================================
// 1. シフト確認
// ================================================================
router.post('/shifts', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sundayNextWeek = new Date(monday);
    sundayNextWeek.setDate(monday.getDate() + 13);

    const startDate = monday.toISOString().split('T')[0];
    const endDate = sundayNextWeek.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('shifts')
      .select('id, staff_id, date, start_time, end_time, break_minutes, status, note')
      .eq('store_id', auth.storeId)
      .eq('staff_id', auth.staffId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('start_time');

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const shifts = (data || []).map((s: ShiftRow) => ({
      id: s.id,
      date: s.date,
      startTime: s.start_time,
      endTime: s.end_time,
      breakMinutes: s.break_minutes,
      status: s.status || 'draft',
      note: s.note,
    }));

    res.json({ startDate, endDate, shifts });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// シフトテンプレート取得
// ================================================================
router.post('/shift-templates', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const { data, error } = await supabaseAdmin
      .from('shift_templates')
      .select('id, name, start_time, end_time, break_minutes, color')
      .eq('store_id', auth.storeId)
      .order('name');

    if (error) { res.status(500).json({ error: 'Internal Server Error' }); return; }
    res.json({ templates: data || [] });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 2. シフト希望 取得
// ================================================================
router.post('/shift-requests', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sundayNextWeek = new Date(monday);
    sundayNextWeek.setDate(monday.getDate() + 13);

    const startDate = monday.toISOString().split('T')[0];
    const endDate = sundayNextWeek.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('shift_requests')
      .select('id, staff_id, date, request_type, start_time, end_time, note')
      .eq('store_id', auth.storeId)
      .eq('staff_id', auth.staffId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date');

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const requests = (data || []).map((r: ShiftRequestRow) => ({
      id: r.id,
      date: r.date,
      requestType: r.request_type,
      startTime: r.start_time,
      endTime: r.end_time,
      note: r.note,
    }));

    res.json({ startDate, endDate, requests });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 2. シフト希望 保存
// ================================================================
router.post('/shift-requests/save', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const { date, requestType, startTime, endTime, note } = req.body;

    if (!date || !requestType) {
      res.status(400).json({ error: 'date, requestType は必須です' });
      return;
    }

    if (!['available', 'unavailable', 'preferred'].includes(requestType)) {
      res.status(400).json({ error: 'requestType は available / unavailable / preferred のいずれかです' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('shift_requests')
      .upsert({
        store_id: auth.storeId,
        staff_id: auth.staffId,
        date,
        request_type: requestType,
        start_time: startTime || null,
        end_time: endTime || null,
        note: note || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id,staff_id,date' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json({ request: data, message: '希望を保存しました' });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 3. 勤怠履歴
// ================================================================
router.post('/history', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const year = Number(req.body.year) || new Date().getFullYear();
    const month = Number(req.body.month) || new Date().getMonth() + 1;

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const { data, error } = await supabaseAdmin
      .from('attendance_records')
      .select('*, breaks:attendance_breaks(*)')
      .eq('store_id', auth.storeId)
      .eq('user_id', auth.userId)
      .gte('business_date', startDate)
      .lt('business_date', endDate)
      .order('business_date', { ascending: false })
      .order('clock_in_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const records: AttendanceHistoryEntry[] = (data || []).map((r: AttendanceRecordRow) => {
      const breaks = r.breaks || [];
      const breakMinutes = breaks.reduce((sum: number, b: AttendanceBreakRow) => {
        if (!b.started_at || !b.ended_at) return sum;
        return sum + Math.round((new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 60000);
      }, 0);

      return {
        id: r.id,
        businessDate: r.business_date,
        status: r.status,
        clockInAt: r.clock_in_at,
        clockOutAt: r.clock_out_at,
        breakMinutes,
      };
    });

    // サマリー
    const completed = records.filter((r: AttendanceHistoryEntry) => r.status === 'completed');
    const totalMinutes = completed.reduce((sum: number, r: AttendanceHistoryEntry) => {
      if (!r.clockInAt || !r.clockOutAt) return sum;
      const worked = Math.round((new Date(r.clockOutAt).getTime() - new Date(r.clockInAt).getTime()) / 60000);
      return sum + worked - (r.breakMinutes || 0);
    }, 0);

    res.json({
      year, month, records,
      summary: {
        totalDays: completed.length,
        totalHours: Math.round(totalMinutes / 60 * 10) / 10,
        totalMinutes,
      },
    });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 4. チェックリスト 取得 (HACCP v2)
//
// LINE 側は単に `timing` を指定して「その時にスタッフがやるチェック項目一覧」を欲しがる。
// v2 ではこれは personal scope の active checklist に相当するので listActiveChecklist を使う。
// レスポンス形状は v1 時代から少し拡張されているが、label/templateId は据え置きで後方互換。
// ================================================================
router.post('/checklist', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const timing = req.body.timing || 'clock_in';
    if (!isValidTiming(timing)) {
      res.status(400).json({ error: 'timing が不正です' });
      return;
    }

    const active = await listActiveChecklist(auth.storeId, timing, 'personal', null);

    const items = active.merged_items.map((mi: any) => ({
      template_item_id: mi.id,
      item_key: mi.item_key,
      label: mi.label,
      category: mi.template_name,
      templateId: mi.template_id,
      item_type: mi.item_type,
      required: mi.required,
      min_value: mi.min_value,
      max_value: mi.max_value,
      unit: mi.unit,
      is_ccp: mi.is_ccp,
    }));

    // 今日の自分の submission があれば最新を返す
    const today = new Date().toISOString().split('T')[0];
    const { data: todaySubs } = await supabaseAdmin
      .from('checklist_submissions')
      .select('id, all_passed, submitted_at, snapshot')
      .eq('store_id', auth.storeId)
      .eq('membership_id', auth.staffId)
      .eq('scope', 'personal')
      .eq('timing', timing)
      .gte('submitted_at', `${today}T00:00:00`)
      .lte('submitted_at', `${today}T23:59:59`)
      .order('submitted_at', { ascending: false })
      .limit(1);

    const latest = todaySubs && todaySubs.length > 0 ? todaySubs[0] : null;

    res.json({
      timing,
      items,
      latestRecord: latest ? {
        id: latest.id,
        allChecked: latest.all_passed,
        checkedAt: latest.submitted_at,
      } : null,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 4. チェックリスト 提出 (HACCP v2)
//
// LINE bot からは `{ timing, results: [{ template_item_id, checked?, numeric_value?, text_value? }] }`
// で POST される想定。v1 の results は `{ label, checked }` だったが、v2 では
// template_item_id を起点に判定/逸脱記録までやるので、bot 側で id を送ってもらう。
// ================================================================
router.post('/checklist/submit', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const { timing, template_id, results } = req.body;

    if (!timing || !Array.isArray(results)) {
      res.status(400).json({ error: 'timing, results は必須です' });
      return;
    }
    if (!isValidTiming(timing)) {
      res.status(400).json({ error: 'timing が不正です' });
      return;
    }

    // template_id が指定されなければ、personal scope active の最初の template を使う
    let resolvedTemplateId: string | null = template_id ?? null;
    if (!resolvedTemplateId) {
      const active = await listActiveChecklist(auth.storeId, timing, 'personal', null);
      resolvedTemplateId = active.templates[0]?.id ?? null;
    }
    if (!resolvedTemplateId) {
      res.status(404).json({ error: 'アクティブなテンプレートがありません' });
      return;
    }

    try {
      const submission = await createSubmission({
        storeId: auth.storeId,
        userId: auth.userId,
        scope: 'personal',
        timing,
        templateId: resolvedTemplateId,
        membershipId: auth.staffId,
        items: results.map((r: any) => ({
          template_item_id: r.template_item_id ?? null,
          item_key: r.item_key,
          bool_value: typeof r.checked === 'boolean' ? r.checked : (r.bool_value ?? null),
          numeric_value: r.numeric_value ?? null,
          text_value: r.text_value ?? null,
          select_value: r.select_value ?? null,
        })),
      });

      res.status(201).json({
        record: {
          id: submission.id,
          allChecked: submission.all_passed,
          checkedAt: submission.submitted_at,
        },
        message: 'チェックリストを提出しました',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '提出に失敗しました';
      if (msg.includes('見つかりません')) res.status(404).json({ error: msg });
      else if (msg.includes('必須')) res.status(400).json({ error: msg });
      else res.status(500).json({ error: '提出に失敗しました' });
    }
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 5. 連絡ノート 一覧
// ================================================================
router.post('/notices', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const { data, error } = await supabaseAdmin
      .from('notices')
      .select('*')
      .eq('store_id', auth.storeId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // 既読情報
    const noticeIds = (data || []).map((n: NoticeRow) => n.id);
    const { data: reads } = noticeIds.length > 0
      ? await supabaseAdmin
          .from('notice_reads')
          .select('notice_id, read_at')
          .eq('user_id', auth.userId)
          .in('notice_id', noticeIds)
      : { data: [] };

    const readMap = new Map((reads || []).map((r: NoticeReadRow) => [r.notice_id, r.read_at]));

    const notices = (data || []).map((n: NoticeRow) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      pinned: n.pinned,
      authorName: n.author_name,
      createdAt: n.created_at,
      isRead: readMap.has(n.id),
      readAt: readMap.get(n.id) || null,
    }));

    res.json({ notices });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 5. 連絡ノート 既読
// ================================================================
router.post('/notices/read', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const { noticeId } = req.body;
    if (!noticeId) {
      res.status(400).json({ error: 'noticeId は必須です' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('notice_reads')
      .upsert({
        notice_id: noticeId,
        user_id: auth.userId,
        read_at: new Date().toISOString(),
      }, { onConflict: 'notice_id,user_id' });

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 6. 日報 取得
// ================================================================
router.post('/daily-report', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const date = req.body.date || new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('daily_reports')
      .select('*')
      .eq('store_id', auth.storeId)
      .eq('date', date)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({
      report: data ? {
        id: data.id,
        date: data.date,
        sales: data.sales,
        customerCount: data.customer_count,
        weather: data.weather,
        memo: data.memo,
      } : null,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ================================================================
// 6. 日報 保存
// ================================================================
router.post('/daily-report/save', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const { date, sales, customerCount, weather, memo } = req.body;

    if (!date) {
      res.status(400).json({ error: '日付は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('daily_reports')
      .upsert({
        store_id: auth.storeId,
        date,
        sales: sales ?? 0,
        customer_count: customerCount ?? 0,
        weather: weather || '',
        memo: memo || '',
        created_by: auth.userId,
      }, { onConflict: 'store_id,date' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json({
      report: {
        id: data.id,
        date: data.date,
        sales: data.sales,
        customerCount: data.customer_count,
        weather: data.weather,
        memo: data.memo,
      },
      message: '日報を保存しました',
    });
  } catch (e: unknown) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const lineStaffRouter = router;
