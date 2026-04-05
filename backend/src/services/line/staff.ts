/**
 * LINEスタッフ向けAPI
 * LINE userId + storeId で認証し、Supabase Auth なしでスタッフ機能を提供する。
 * リッチメニューから直接アクセスする想定。
 */
import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';

const router = Router();

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
      res.status(500).json({ error: error.message });
      return;
    }

    const shifts = (data || []).map((s: any) => ({
      id: s.id,
      date: s.date,
      startTime: s.start_time,
      endTime: s.end_time,
      breakMinutes: s.break_minutes,
      status: s.status || 'draft',
      note: s.note,
    }));

    res.json({ startDate, endDate, shifts });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
      res.status(500).json({ error: error.message });
      return;
    }

    const requests = (data || []).map((r: any) => ({
      id: r.id,
      date: r.date,
      requestType: r.request_type,
      startTime: r.start_time,
      endTime: r.end_time,
      note: r.note,
    }));

    res.json({ startDate, endDate, requests });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ request: data, message: '希望を保存しました' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
      res.status(500).json({ error: error.message });
      return;
    }

    const records = (data || []).map((r: any) => {
      const breaks = r.breaks || [];
      const breakMinutes = breaks.reduce((sum: number, b: any) => {
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
    const completed = records.filter((r: any) => r.status === 'completed');
    const totalMinutes = completed.reduce((sum: number, r: any) => {
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// 4. チェックリスト 取得
// ================================================================
router.post('/checklist', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const timing = req.body.timing || 'clock_in';
    if (!['clock_in', 'clock_out'].includes(timing)) {
      res.status(400).json({ error: 'timing は clock_in / clock_out のいずれかです' });
      return;
    }

    // base レイヤーのテンプレートを取得
    const { data: templates, error: tplError } = await supabaseAdmin
      .from('checklist_templates')
      .select('*')
      .eq('store_id', auth.storeId)
      .eq('layer', 'base')
      .eq('timing', timing)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (tplError) {
      res.status(500).json({ error: tplError.message });
      return;
    }

    // 旧 checklists テーブルもフォールバック
    const { data: legacyChecklist } = await supabaseAdmin
      .from('checklists')
      .select('*')
      .eq('store_id', auth.storeId)
      .eq('timing', timing)
      .maybeSingle();

    const items: any[] = [];

    // テンプレートからアイテムを展開
    (templates || []).forEach((tpl: any) => {
      if (Array.isArray(tpl.items)) {
        tpl.items.forEach((item: any) => {
          items.push({
            label: item.label,
            category: item.category || tpl.name,
            templateId: tpl.id,
          });
        });
      }
    });

    // テンプレートがなければ旧チェックリストを使う
    if (items.length === 0 && legacyChecklist && Array.isArray(legacyChecklist.items)) {
      legacyChecklist.items.forEach((item: any) => {
        items.push({
          label: typeof item === 'string' ? item : item.label,
          category: item.category || '',
        });
      });
    }

    // 今日の記録を取得
    const today = new Date().toISOString().split('T')[0];
    const { data: todayRecords } = await supabaseAdmin
      .from('check_records')
      .select('*')
      .eq('store_id', auth.storeId)
      .eq('staff_id', auth.staffId)
      .eq('timing', timing)
      .gte('checked_at', `${today}T00:00:00`)
      .lte('checked_at', `${today}T23:59:59`)
      .order('checked_at', { ascending: false })
      .limit(1);

    const latestRecord = todayRecords && todayRecords.length > 0 ? todayRecords[0] : null;

    res.json({
      timing,
      items,
      latestRecord: latestRecord ? {
        id: latestRecord.id,
        results: latestRecord.results,
        allChecked: latestRecord.all_checked,
        checkedAt: latestRecord.checked_at,
      } : null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// 4. チェックリスト 提出
// ================================================================
router.post('/checklist/submit', async (req: Request, res: Response) => {
  try {
    const auth = await requireLineUser(req, res);
    if (!auth) return;

    const { timing, results } = req.body;

    if (!timing || !Array.isArray(results)) {
      res.status(400).json({ error: 'timing, results は必須です' });
      return;
    }

    const allChecked = results.every((r: any) => r.checked);

    const { data, error } = await supabaseAdmin
      .from('check_records')
      .insert({
        store_id: auth.storeId,
        staff_id: auth.staffId,
        user_id: auth.userId,
        timing,
        results,
        all_checked: allChecked,
        checked_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ record: data, message: 'チェックリストを提出しました' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
      res.status(500).json({ error: error.message });
      return;
    }

    // 既読情報
    const noticeIds = (data || []).map((n: any) => n.id);
    const { data: reads } = noticeIds.length > 0
      ? await supabaseAdmin
          .from('notice_reads')
          .select('notice_id, read_at')
          .eq('user_id', auth.userId)
          .in('notice_id', noticeIds)
      : { data: [] };

    const readMap = new Map((reads || []).map((r: any) => [r.notice_id, r.read_at]));

    const notices = (data || []).map((n: any) => ({
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
      res.status(500).json({ error: error.message });
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
      res.status(500).json({ error: error.message });
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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export const lineStaffRouter = router;
