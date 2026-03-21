import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createSupabaseClient, supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';

const router = Router();

// 週間シフト取得
router.get('/:storeId/weekly', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId;
  const dateStr = req.query.date as string;
  const baseDate = dateStr ? new Date(dateStr) : new Date();

  // 週の月曜日を計算
  const day = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startDate = monday.toISOString().split('T')[0];
  const endDate = sunday.toISOString().split('T')[0];

  const supabase = createSupabaseClient(req.accessToken!);

  const { data, error } = await supabase
    .from('shifts')
    .select('*, staff:store_staff(id, user:profiles(name))')
    .eq('store_id', storeId)
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
    staffId: s.staff_id,
    staffName: s.staff?.user?.name || '',
    date: s.date,
    startTime: s.start_time,
    endTime: s.end_time,
    breakMinutes: s.break_minutes,
    note: s.note,
  }));

  res.json({ startDate, endDate, shifts });
});

// シフト追加・更新
router.post('/:storeId', requireAuth, async (req: Request, res: Response) => {
  const storeId = req.params.storeId;
  const { staffId, date, startTime, endTime, breakMinutes = 0, note } = req.body;

  if (!staffId || !date || !startTime || !endTime) {
    res.status(400).json({ error: 'staffId, date, startTime, endTime は必須です' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('shifts')
    .upsert({
      store_id: storeId,
      staff_id: staffId,
      date,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      note,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_id,staff_id,date' })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ shift: data });
});

// シフト削除
router.delete('/:storeId/:shiftId', requireAuth, async (req: Request, res: Response) => {
  const { shiftId } = req.params;

  const { error } = await supabaseAdmin
    .from('shifts')
    .delete()
    .eq('id', shiftId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

export const shiftPlugin: Plugin = {
  name: 'shift',
  version: '0.1.0',
  description: 'シフト調整プラグイン',
  initialize: (app: Express) => {
    app.use('/api/shift', router);
  },
};
