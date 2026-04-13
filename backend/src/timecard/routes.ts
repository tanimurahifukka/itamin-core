import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { buildDetailCsv, buildSummaryCsv } from './csv';
import type { DetailRecord, SummaryRecord } from './csv';
import { aggregateSummary, computeWorkMinutes } from './aggregate';
import type { RawRecord } from './aggregate';
import { currentJstYearMonth, dayBoundsJST, formatDateJST, isValidJstDate, isValidJstYearMonth, monthBoundsJST, todayJST } from './datetime';

const router = Router();

function getSingleString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

function parseIntegerQueryParam(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }
  return Number.parseInt(value, 10);
}

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

// 権限レベル文字列をロール配列へ展開する共通ヘルパー
// plugins/punch.ts settingsSchema.edit_permission / delete_permission に対応
function permissionLevelToRoles(level: string | undefined): string[] {
  switch (level) {
    case 'owner_manager':
      return ['owner', 'manager'];
    case 'owner_manager_leader':
      return ['owner', 'manager', 'leader'];
    case 'owner':
    default:
      return ['owner'];
  }
}

// 店舗ごとのタイムカード編集・削除権限を読む
async function getPunchPermissionRoles(storeId: string, key: 'edit_permission' | 'delete_permission'): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('store_plugins')
    .select('config')
    .eq('store_id', storeId)
    .eq('plugin_name', 'punch')
    .maybeSingle();

  const cfg = (data?.config as Record<string, unknown>) || {};
  return permissionLevelToRoles(cfg[key] as string | undefined);
}

async function requireRecordEditor(storeId: string, userId: string, res: Response) {
  const staff = await getStoreStaff(storeId, userId);
  const allowed = await getPunchPermissionRoles(storeId, 'edit_permission');
  if (!staff || !allowed.includes(staff.role)) {
    res.status(403).json({ error: 'タイムカードを編集する権限がありません' });
    return null;
  }
  return staff;
}

async function requireRecordDeleter(storeId: string, userId: string, res: Response) {
  const staff = await getStoreStaff(storeId, userId);
  const allowed = await getPunchPermissionRoles(storeId, 'delete_permission');
  if (!staff || !allowed.includes(staff.role)) {
    res.status(403).json({ error: 'タイムカードを削除する権限がありません' });
    return null;
  }
  return staff;
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
      ? formatDateJST(open.clock_in) !== todayJST()
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
    const storeId = getSingleString(req.params.storeId);
    if (!storeId) {
      res.status(400).json({ error: 'storeId パラメータが不正です' });
      return;
    }

    const rawDateQuery = req.query.date;
    const dateQuery = getSingleString(rawDateQuery);
    if (rawDateQuery !== undefined && dateQuery === undefined) {
      res.status(400).json({ error: 'date パラメータは YYYY-MM-DD 形式で指定してください' });
      return;
    }

    const dateStr = dateQuery;
    const date = dateStr || todayJST();
    if (!isValidJstDate(date)) {
      res.status(400).json({ error: 'date パラメータは YYYY-MM-DD 形式で指定してください' });
      return;
    }

    const { startIso, endIsoExclusive } = dayBoundsJST(date);
    const { data, error } = await supabaseAdmin
      .from('time_records')
      .select('*, staff:store_staff(id, hourly_wage, transport_fee, user:profiles(name, picture))')
      .eq('store_id', storeId)
      .gte('clock_in', startIso)
      .lt('clock_in', endIsoExclusive)
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
    const storeId = getSingleString(req.params.storeId);
    if (!storeId) {
      res.status(400).json({ error: 'storeId パラメータが不正です' });
      return;
    }

    const currentMonth = currentJstYearMonth();
    const yearQuery = parseIntegerQueryParam(req.query.year);
    const monthQuery = parseIntegerQueryParam(req.query.month);
    if (yearQuery === null || monthQuery === null) {
      res.status(400).json({ error: 'year/month パラメータは数値で指定してください' });
      return;
    }

    const year = yearQuery ?? currentMonth.year;
    const month = monthQuery ?? currentMonth.month;
    if (!isValidJstYearMonth(year, month)) {
      res.status(400).json({ error: 'month パラメータは 1〜12 の範囲で指定してください' });
      return;
    }
    // 権限チェック（スタッフであること）
    const staff = await getStoreStaff(storeId, req.user!.id);
    if (!staff) {
      res.status(403).json({ error: 'この店舗のスタッフではありません' });
      return;
    }

    const { startIso, endIsoExclusive } = monthBoundsJST(year, month);

    // 全スタッフの勤怠レコードを取得（スタッフ名・時給付き）
    const { data, error } = await supabaseAdmin
      .from('time_records')
      .select('*, staff:store_staff(id, hourly_wage, transport_fee, user:profiles(name))')
      .eq('store_id', storeId)
      .gte('clock_in', startIso)
      .lt('clock_in', endIsoExclusive)
      .order('clock_in');

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // スタッフごとに集計（aggregateSummary を使用して /export との重複解消）
    // 交通費計算に必要な transportFee は aggregateSummary の対象外のため別途保持する
    const transportFeeMap = new Map<string, number>();
    const rawRecords: RawRecord[] = (data || []).map((r: any) => {
      const sid: string = r.staff_id;
      if (!transportFeeMap.has(sid)) {
        transportFeeMap.set(sid, r.staff?.transport_fee || 0);
      }
      return {
        staff_id: sid,
        clock_in: r.clock_in,
        clock_out: r.clock_out,
        break_minutes: r.break_minutes,
        hourly_wage: r.staff?.hourly_wage || 0,
        staff_name: r.staff?.user?.name || '—',
      };
    });

    const aggregated = aggregateSummary(rawRecords);

    const summary = aggregated.map(s => {
      const totalWorkHours = Math.round(s.laborMinutes / 60 * 100) / 100;
      const transportFee = transportFeeMap.get(s.staffId) || 0;
      const totalTransportFee = s.workDays * transportFee;
      const estimatedSalary = s.wageTotal;
      return {
        staffId: s.staffId,
        staffName: s.staffName,
        hourlyWage: transportFeeMap.has(s.staffId)
          ? rawRecords.find(r => r.staff_id === s.staffId)?.hourly_wage || 0
          : 0,
        transportFee,
        workDays: s.workDays,
        totalWorkMinutes: s.laborMinutes,
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

    const editor = await requireRecordEditor(storeId, req.user!.id, res);
    if (!editor) return;

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

// 勤怠レコード削除 (削除権限は punch.delete_permission で制御)
router.delete('/:storeId/records/:recordId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const recordId = req.params.recordId as string;

    const deleter = await requireRecordDeleter(storeId, req.user!.id, res);
    if (!deleter) return;

    const { data: target } = await supabaseAdmin
      .from('time_records')
      .select('id')
      .eq('id', recordId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!target) {
      res.status(404).json({ error: '勤怠レコードが見つかりません' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('time_records')
      .delete()
      .eq('id', recordId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[timecard DELETE /:storeId/records/:recordId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// オーナー/マネージャーによる勤怠レコード新規作成
router.post('/:storeId/records', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const { staffId, clockIn, clockOut, breakMinutes } = req.body as {
      staffId?: string;
      clockIn?: string;
      clockOut?: string | null;
      breakMinutes?: number;
    };

    const editor = await requireRecordEditor(storeId, req.user!.id, res);
    if (!editor) return;

    if (!staffId || !clockIn) {
      res.status(400).json({ error: 'スタッフと出勤時刻は必須です' });
      return;
    }

    // 対象スタッフが同一店舗か確認
    const { data: targetStaff } = await supabaseAdmin
      .from('store_staff')
      .select('id')
      .eq('id', staffId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!targetStaff) {
      res.status(404).json({ error: '対象スタッフが見つかりません' });
      return;
    }

    if (clockOut && new Date(clockOut) <= new Date(clockIn)) {
      res.status(400).json({ error: '退勤時刻は出勤時刻より後にしてください' });
      return;
    }

    const insertPayload: {
      store_id: string;
      staff_id: string;
      clock_in: string;
      clock_out: string | null;
      break_minutes: number;
    } = {
      store_id: storeId,
      staff_id: staffId,
      clock_in: clockIn,
      clock_out: clockOut ?? null,
      break_minutes: typeof breakMinutes === 'number' ? breakMinutes : 0,
    };

    const { data: record, error } = await supabaseAdmin
      .from('time_records')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: '既に出勤中のレコードがあります（同時存在検知）' });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({
      record: {
        id: record.id,
        clockIn: record.clock_in,
        clockOut: record.clock_out,
        breakMinutes: record.break_minutes,
      },
    });
  } catch (e: any) {
    console.error('[timecard POST /:storeId/records] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// 勤怠データ CSV エクスポート
// GET /:storeId/export?year=YYYY&month=MM&mode=detail|summary
// 権限: attendance プラグインの config.export_permission (role 配列)。未設定時は ['owner','manager']
router.get('/:storeId/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = getSingleString(req.params.storeId);
    if (!storeId) {
      res.status(400).json({ error: 'storeId パラメータが不正です' });
      return;
    }

    const currentMonth = currentJstYearMonth();
    const yearQuery = parseIntegerQueryParam(req.query.year);
    const monthQuery = parseIntegerQueryParam(req.query.month);
    if (yearQuery === null || monthQuery === null) {
      res.status(400).json({ error: 'year/month パラメータは数値で指定してください' });
      return;
    }

    const year = yearQuery ?? currentMonth.year;
    const month = monthQuery ?? currentMonth.month;
    if (!isValidJstYearMonth(year, month)) {
      res.status(400).json({ error: 'month パラメータは 1〜12 の範囲で指定してください' });
      return;
    }
    const modeParam = getSingleString(req.query.mode);

    // Medium 11: 不正な mode 値は 400 Bad Request
    if (modeParam !== 'detail' && modeParam !== 'summary') {
      res.status(400).json({ error: 'mode パラメータは "detail" または "summary" を指定してください' });
      return;
    }
    const mode = modeParam as 'detail' | 'summary';

    // 認証ユーザーの店舗スタッフ情報取得
    const staff = await getStoreStaff(storeId, req.user!.id);
    if (!staff) {
      res.status(403).json({ error: 'この店舗のスタッフではありません' });
      return;
    }

    // attendance プラグイン config から export_permission を取得
    const { data: pluginData } = await supabaseAdmin
      .from('store_plugins')
      .select('config')
      .eq('store_id', storeId)
      .eq('plugin_name', 'attendance')
      .maybeSingle();

    const cfg = (pluginData?.config as Record<string, unknown>) || {};

    // Critical 2: fail-closed ロジック
    // - export_permission が undefined (未設定) → デフォルト ['owner','manager']
    // - export_permission が存在するが配列でない → 空配列扱いで全拒否
    // - export_permission が配列 → そのまま使用(空配列なら全拒否)
    let exportPermission: string[];
    if (cfg.export_permission === undefined) {
      exportPermission = ['owner', 'manager'];
    } else if (Array.isArray(cfg.export_permission)) {
      exportPermission = cfg.export_permission as string[];
    } else {
      // 明示的に設定されているが配列でない → fail-closed (全拒否)
      exportPermission = [];
    }

    if (!exportPermission.includes(staff.role)) {
      res.status(403).json({ error: 'CSV エクスポートの権限がありません' });
      return;
    }

    // 店舗名を取得してファイル名に使用（Medium 9）
    const { data: storeData } = await supabaseAdmin
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .maybeSingle();
    const storeName = (storeData as { name?: string } | null)?.name || storeId;

    // 対象月のレコードを取得
    const { startIso, endIsoExclusive } = monthBoundsJST(year, month);

    const { data, error } = await supabaseAdmin
      .from('time_records')
      .select('*, staff:store_staff(id, hourly_wage, user:profiles(name))')
      .eq('store_id', storeId)
      .gte('clock_in', startIso)
      .lt('clock_in', endIsoExclusive)
      .order('clock_in');

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Medium 9: RFC 5987 形式のファイル名
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const asciiFilename = `attendance_${monthStr}_${mode}.csv`;
    const encodedStoreName = encodeURIComponent(storeName);
    const utf8Filename = `attendance_${encodedStoreName}_${monthStr}_${mode}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`,
    );

    if (mode === 'detail') {
      // High 5: clock_out != null のレコードのみ集計
      const records: DetailRecord[] = (data || [])
        .filter((r: any) => r.clock_out != null)
        .map((r: any) => {
          const clockInDate = new Date(r.clock_in);
          const clockOutDate = new Date(r.clock_out);
          const breakMins = r.break_minutes || 0;
          const workMinutes = computeWorkMinutes(r.clock_in, r.clock_out, breakMins);
          const hourlyWage: number = r.staff?.hourly_wage || 0;
          const estimatedSalary = Math.round(workMinutes / 60 * hourlyWage);
          const dateStr = formatDateJST(r.clock_in);
          const clockInStr = clockInDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' });
          const clockOutStr = clockOutDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' });
          return {
            date: dateStr,
            staffName: r.staff?.user?.name || '—',
            clockIn: clockInStr,
            clockOut: clockOutStr,
            breakMinutes: breakMins,
            workMinutes,
            estimatedSalary,
          };
        });
      // High 6: Buffer.from で堅牢化
      res.send(Buffer.from(buildDetailCsv(records), 'utf8'));
    } else {
      // summary モード: aggregateSummary で集計（High 5, High 7）
      // aggregateSummary は clock_out != null のレコードのみ集計し、detail と一致する
      const rawRecords: RawRecord[] = (data || []).map((r: any) => ({
        staff_id: r.staff_id,
        clock_in: r.clock_in,
        clock_out: r.clock_out,
        break_minutes: r.break_minutes,
        hourly_wage: r.staff?.hourly_wage || 0,
        staff_name: r.staff?.user?.name || '—',
      }));

      const aggregated = aggregateSummary(rawRecords);

      const summaryRecords: SummaryRecord[] = aggregated.map(s => ({
        staffName: s.staffName,
        workDays: s.workDays,
        totalWorkHours: Math.round(s.laborMinutes / 60 * 100) / 100,
        totalBreakMinutes: s.breakMinutes,
        estimatedSalary: s.wageTotal,
      }));

      // High 6: Buffer.from で堅牢化
      res.send(Buffer.from(buildSummaryCsv(summaryRecords), 'utf8'));
    }
  } catch (e: any) {
    console.error('[timecard GET /:storeId/export] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const timecardRouter = router;
