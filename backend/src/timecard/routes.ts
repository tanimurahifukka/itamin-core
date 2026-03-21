import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createSupabaseClient } from '../config/supabase';

const router = Router();

// 自分のスタッフIDを取得するヘルパー
async function getStaffId(supabase: any, storeId: string, userId: string) {
  const { data } = await supabase
    .from('store_staff')
    .select('id')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .single();
  return data?.id;
}

// 出勤打刻
router.post('/:storeId/clock-in', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const supabase = createSupabaseClient(req.accessToken!);

  const staffId = await getStaffId(supabase, storeId, req.user!.id);
  if (!staffId) {
    res.status(403).json({ error: 'この店舗のスタッフではありません' });
    return;
  }

  // 既に出勤中かチェック
  const { data: open } = await supabase
    .from('time_records')
    .select('id')
    .eq('store_id', storeId)
    .eq('staff_id', staffId)
    .is('clock_out', null)
    .maybeSingle();

  if (open) {
    res.status(409).json({ error: '既に出勤中です' });
    return;
  }

  const { data: record, error } = await supabase
    .from('time_records')
    .insert({ store_id: storeId, staff_id: staffId })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ record });
});

// 退勤打刻
router.post('/:storeId/clock-out', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const { breakMinutes } = req.body;
  const supabase = createSupabaseClient(req.accessToken!);

  const staffId = await getStaffId(supabase, storeId, req.user!.id);
  if (!staffId) {
    res.status(403).json({ error: 'この店舗のスタッフではありません' });
    return;
  }

  const { data: open } = await supabase
    .from('time_records')
    .select('id')
    .eq('store_id', storeId)
    .eq('staff_id', staffId)
    .is('clock_out', null)
    .maybeSingle();

  if (!open) {
    res.status(404).json({ error: '出勤記録がありません' });
    return;
  }

  const update: any = { clock_out: new Date().toISOString() };
  if (breakMinutes !== undefined) update.break_minutes = breakMinutes;

  const { data: record, error } = await supabase
    .from('time_records')
    .update(update)
    .eq('id', open.id)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ record });
});

// 自分の打刻状態
router.get('/:storeId/status', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const supabase = createSupabaseClient(req.accessToken!);

  const staffId = await getStaffId(supabase, storeId, req.user!.id);
  if (!staffId) {
    res.status(403).json({ error: 'この店舗のスタッフではありません' });
    return;
  }

  const { data: open } = await supabase
    .from('time_records')
    .select('*')
    .eq('store_id', storeId)
    .eq('staff_id', staffId)
    .is('clock_out', null)
    .maybeSingle();

  res.json({
    isClockedIn: !!open,
    currentRecord: open || null,
    staffId,
  });
});

// 日別タイムカード一覧
router.get('/:storeId/daily', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const dateStr = req.query.date as string;
  const date = dateStr || new Date().toISOString().split('T')[0];
  const supabase = createSupabaseClient(req.accessToken!);

  const { data, error } = await supabase
    .from('time_records')
    .select('*, staff:store_staff(id, user:profiles(name, picture))')
    .eq('store_id', storeId)
    .gte('clock_in', `${date}T00:00:00`)
    .lte('clock_in', `${date}T23:59:59`)
    .order('clock_in');

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const records = (data || []).map((r: any) => ({
    id: r.id,
    storeId: r.store_id,
    staffId: r.staff_id,
    clockIn: r.clock_in,
    clockOut: r.clock_out,
    breakMinutes: r.break_minutes,
    staffName: r.staff?.user?.name,
    staffPicture: r.staff?.user?.picture,
  }));

  res.json({ date, records });
});

// 月別タイムカード
router.get('/:storeId/monthly', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId as string;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const supabase = createSupabaseClient(req.accessToken!);

  const staffId = await getStaffId(supabase, storeId, req.user!.id);
  if (!staffId) {
    res.status(403).json({ error: 'この店舗のスタッフではありません' });
    return;
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('time_records')
    .select('*')
    .eq('staff_id', staffId)
    .gte('clock_in', startDate)
    .lt('clock_in', endDate)
    .order('clock_in');

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  let totalMinutes = 0;
  for (const r of data || []) {
    if (r.clock_out) {
      const diff = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 60000;
      totalMinutes += diff - (r.break_minutes || 0);
    }
  }

  res.json({
    year,
    month,
    records: data,
    totalWorkMinutes: Math.round(totalMinutes),
    totalWorkHours: Math.round(totalMinutes / 60 * 100) / 100,
  });
});

export const timecardRouter = router;
