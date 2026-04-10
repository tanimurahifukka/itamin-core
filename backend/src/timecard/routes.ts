import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

// 自分の所属情報を取得
async function getStoreStaff(storeId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('store_staff')
    .select('id, role')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .single();
  return data;
}

async function requirePunchStaff(storeId: string, userId: string, res: Response) {
  const staff = await getStoreStaff(storeId, userId);
  if (!staff) {
    res.status(403).json({ error: 'この店舗のスタッフではありません' });
    return null;
  }

  if (staff.role === 'owner') {
    res.status(403).json({ error: 'オーナーは打刻できません' });
    return null;
  }

  return staff;
}

// 出勤打刻
router.post('/:storeId/clock-in', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const staff = await requirePunchStaff(storeId, req.user!.id, res);
    if (!staff) {
      return;
    }
    const staffId = staff.id;

    // 既に出勤中かチェック
    const { data: open } = await supabaseAdmin
      .from('time_records')
      .select('id')
      .eq('store_id', storeId)
      .eq('staff_id', staffId)
      .is('clock_out', null)
      .maybeSingle();

    if (open) {
      // 未退勤レコードの詳細を返す（フロントで修正フローに使う）
      const { data: staleRecord } = await supabaseAdmin
        .from('time_records')
        .select('id, clock_in, break_minutes')
        .eq('id', open.id)
        .single();
      res.status(409).json({
        error: '既に出勤中です',
        staleRecord: staleRecord ? {
          id: staleRecord.id,
          clockIn: staleRecord.clock_in,
          breakMinutes: staleRecord.break_minutes,
        } : null,
      });
      return;
    }

    const { data: record, error } = await supabaseAdmin
      .from('time_records')
      .insert({ store_id: storeId, staff_id: staffId })
      .select()
      .single();

    if (error) {
      // DB レベルの partial unique index 違反（並行リクエストによる race condition）
      if (error.code === '23505') {
        res.status(409).json({ error: '既に出勤中です（同時打刻検知）' });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ record: {
      id: record.id,
      clockIn: record.clock_in,
      clockOut: record.clock_out,
      breakMinutes: record.break_minutes,
    }});
  } catch (e: any) {
    console.error('[timecard POST /:storeId/clock-in] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 退勤打刻
router.post('/:storeId/clock-out', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const breakMinutes = req.body?.breakMinutes;
    const staff = await requirePunchStaff(storeId, req.user!.id, res);
    if (!staff) {
      return;
    }
    const staffId = staff.id;

    const { data: open } = await supabaseAdmin
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

    const { data: record, error } = await supabaseAdmin
      .from('time_records')
      .update(update)
      .eq('id', open.id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ record: {
      id: record.id,
      clockIn: record.clock_in,
      clockOut: record.clock_out,
      breakMinutes: record.break_minutes,
    }});
  } catch (e: any) {
    console.error('[timecard POST /:storeId/clock-out] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 自分の打刻状態
router.get('/:storeId/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const staff = await requirePunchStaff(storeId, req.user!.id, res);
    if (!staff) {
      return;
    }
    const staffId = staff.id;

    const { data: open } = await supabaseAdmin
      .from('time_records')
      .select('*')
      .eq('store_id', storeId)
      .eq('staff_id', staffId)
      .is('clock_out', null)
      .maybeSingle();

    // 出勤日が今日でなければ「退勤押し忘れ」と判定
    const isStale = open
      ? new Date(open.clock_in).toDateString() !== new Date().toDateString()
      : false;

    res.json({
      isClockedIn: !!open,
      isStale,
      currentRecord: open ? {
        id: open.id,
        clockIn: open.clock_in,
        clockOut: open.clock_out,
        breakMinutes: open.break_minutes,
      } : null,
      staffId,
    });
  } catch (e: any) {
    console.error('[timecard GET /:storeId/status] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 日別タイムカード一覧
router.get('/:storeId/daily', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const dateStr = req.query.date as string;
    const date = dateStr || new Date().toISOString().split('T')[0];
    const { data, error } = await supabaseAdmin
      .from('time_records')
      .select('*, staff:store_staff(id, hourly_wage, transport_fee, user:profiles(name, picture))')
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
      hourlyWage: r.staff?.hourly_wage || 0,
      transportFee: r.staff?.transport_fee || 0,
    }));

    res.json({ date, records });
  } catch (e: any) {
    console.error('[timecard GET /:storeId/daily] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 月別タイムカード（全スタッフ集計 + 給与概算）
router.get('/:storeId/monthly', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    // 権限チェック（スタッフであること）
    const staff = await getStoreStaff(storeId, req.user!.id);
    if (!staff) {
      res.status(403).json({ error: 'この店舗のスタッフではありません' });
      return;
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    // 全スタッフの勤怠レコードを取得（スタッフ名・時給付き）
    const { data, error } = await supabaseAdmin
      .from('time_records')
      .select('*, staff:store_staff(id, hourly_wage, transport_fee, user:profiles(name))')
      .eq('store_id', storeId)
      .gte('clock_in', startDate)
      .lt('clock_in', endDate)
      .order('clock_in');

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // スタッフごとに集計
    const staffMap = new Map<string, {
      staffId: string;
      staffName: string;
      hourlyWage: number;
      transportFee: number;
      totalMinutes: number;
      workDays: Set<string>;
    }>();

    for (const r of data || []) {
      const sid = r.staff_id;
      if (!staffMap.has(sid)) {
        staffMap.set(sid, {
          staffId: sid,
          staffName: r.staff?.user?.name || '—',
          hourlyWage: r.staff?.hourly_wage || 0,
          transportFee: r.staff?.transport_fee || 0,
          totalMinutes: 0,
          workDays: new Set(),
        });
      }
      const entry = staffMap.get(sid)!;
      if (r.clock_out) {
        const diff = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 60000;
        entry.totalMinutes += diff - (r.break_minutes || 0);
      }
      // 出勤日をカウント（日付ベース）
      const day = new Date(r.clock_in).toISOString().split('T')[0];
      entry.workDays.add(day);
    }

    const summary = Array.from(staffMap.values()).map(s => {
      const totalWorkHours = Math.round(s.totalMinutes / 60 * 100) / 100;
      const totalTransportFee = s.workDays.size * s.transportFee;
      const estimatedSalary = Math.round(totalWorkHours * s.hourlyWage);
      return {
        staffId: s.staffId,
        staffName: s.staffName,
        hourlyWage: s.hourlyWage,
        transportFee: s.transportFee,
        workDays: s.workDays.size,
        totalWorkMinutes: Math.round(s.totalMinutes),
        totalWorkHours,
        estimatedSalary,
        totalTransportFee,
        totalCost: estimatedSalary + totalTransportFee,
      };
    });

    res.json({
      year,
      month,
      records: data,
      summary,
    });
  } catch (e: any) {
    console.error('[timecard GET /:storeId/monthly] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 未退勤レコードを修正して新規出勤
router.post('/:storeId/correct-and-clockin', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const { staleRecordId, clockOut, breakMinutes } = req.body;

    if (!staleRecordId || !clockOut) {
      res.status(400).json({ error: '修正する退勤時刻が必要です' });
      return;
    }

    const staff = await requirePunchStaff(storeId, req.user!.id, res);
    if (!staff) return;
    const staffId = staff.id;

    // 未退勤レコードが自分のものか確認
    const { data: stale } = await supabaseAdmin
      .from('time_records')
      .select('id, staff_id, clock_in')
      .eq('id', staleRecordId)
      .eq('store_id', storeId)
      .eq('staff_id', staffId)
      .is('clock_out', null)
      .maybeSingle();

    if (!stale) {
      res.status(404).json({ error: '修正対象の未退勤レコードが見つかりません' });
      return;
    }

    // 退勤時刻のバリデーション: 出勤時刻より後であること
    if (new Date(clockOut) <= new Date(stale.clock_in)) {
      res.status(400).json({ error: '退勤時刻は出勤時刻より後にしてください' });
      return;
    }

    // 未退勤レコードをクローズ
    const update: any = { clock_out: clockOut };
    if (breakMinutes !== undefined) update.break_minutes = breakMinutes;

    const { error: updateErr } = await supabaseAdmin
      .from('time_records')
      .update(update)
      .eq('id', staleRecordId);

    if (updateErr) {
      res.status(500).json({ error: updateErr.message });
      return;
    }

    // 新規出勤レコードを作成
    const { data: record, error: insertErr } = await supabaseAdmin
      .from('time_records')
      .insert({ store_id: storeId, staff_id: staffId })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        res.status(409).json({ error: '既に出勤中です（同時打刻検知）' });
        return;
      }
      res.status(500).json({ error: insertErr.message });
      return;
    }

    res.status(201).json({ record: {
      id: record.id,
      clockIn: record.clock_in,
      clockOut: record.clock_out,
      breakMinutes: record.break_minutes,
    }});
  } catch (e: any) {
    console.error('[timecard POST /:storeId/correct-and-clockin] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// オーナー/マネージャーによる勤怠レコード修正
router.put('/:storeId/records/:recordId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const recordId = req.params.recordId as string;
    const { clockIn, clockOut, breakMinutes } = req.body;

    // オーナーまたはマネージャーのみ
    const staff = await getStoreStaff(storeId, req.user!.id);
    if (!staff || !['owner', 'manager'].includes(staff.role)) {
      res.status(403).json({ error: 'オーナーまたはマネージャーのみ修正できます' });
      return;
    }

    // 対象レコードが同じ店舗のものか確認
    const { data: target } = await supabaseAdmin
      .from('time_records')
      .select('id, clock_in')
      .eq('id', recordId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!target) {
      res.status(404).json({ error: '勤怠レコードが見つかりません' });
      return;
    }

    const update: any = {};
    if (clockIn !== undefined) update.clock_in = clockIn;
    if (clockOut !== undefined) update.clock_out = clockOut;
    if (breakMinutes !== undefined) update.break_minutes = breakMinutes;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: '更新する項目がありません' });
      return;
    }

    // バリデーション: 退勤 > 出勤
    const finalClockIn = clockIn || target.clock_in;
    const finalClockOut = clockOut;
    if (finalClockOut && new Date(finalClockOut) <= new Date(finalClockIn)) {
      res.status(400).json({ error: '退勤時刻は出勤時刻より後にしてください' });
      return;
    }

    const { data: record, error } = await supabaseAdmin
      .from('time_records')
      .update(update)
      .eq('id', recordId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ record: {
      id: record.id,
      clockIn: record.clock_in,
      clockOut: record.clock_out,
      breakMinutes: record.break_minutes,
    }});
  } catch (e: any) {
    console.error('[timecard PUT /:storeId/records/:recordId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const timecardRouter = router;
