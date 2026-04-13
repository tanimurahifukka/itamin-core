import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { requireKiosk } from '../middleware/kiosk';
import { requireManagedStore } from '../auth/authorization';
import { checkAndLogRateLimit, getClientIp } from '../services/reservation/rate_limit';
import {
  listKioskActiveTemplates,
  listKioskSubmissionsForDate,
  createSubmission,
} from '../services/haccp';
import { provisionSystemTemplates } from '../services/haccp/templates';
import {
  fetchStoreMeters,
  fetchDeviceStatus,
  listStoreReadingsForDate,
} from '../services/switchbot/routes';
import {
  createCapacityReservation,
  getRemainingCapacity,
} from '../services/reservation/capacity';
import {
  coerceEventFormSchema,
  parseEventFormSchema,
  toEventFormSchemaPersistenceError,
} from '../services/reservation/event_form_schema';

const router = Router();

// ============================================================
// PIN設定（オーナー/マネージャーのみ、通常Auth）
// ============================================================
router.put('/:storeId/pin', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!/^\d{4,8}$/.test(pin)) {
      res.status(400).json({ error: 'PINは4〜8桁の数字で設定してください' });
      return;
    }

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('settings')
      .eq('id', storeId)
      .single();

    const settings = { ...(store?.settings || {}), kiosk_pin: pin };
    const { error } = await supabaseAdmin
      .from('stores')
      .update({ settings })
      .eq('id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true, message: 'キオスクPINを設定しました' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// キオスクログイン（storeId + PIN → JWT発行）
// ============================================================
router.post('/:storeId/login', async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

    if (!pin) {
      res.status(400).json({ error: 'PINを入力してください' });
      return;
    }

    // キオスク PIN は店舗共通なので、総当たりを防ぐため IP + store の二重制限を掛ける。
    const ip = getClientIp(req);
    const ipRate = await checkAndLogRateLimit(ip, storeId, {
      action: 'kiosk.login.ip',
      windowSec: 15 * 60,
      max: 10,
    });
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec || 900));
      res.status(429).json({ error: '試行回数が多すぎます。しばらくしてから再度お試しください。' });
      return;
    }
    const storeRate = await checkAndLogRateLimit(`store:${storeId}`, storeId, {
      action: 'kiosk.login.store',
      windowSec: 15 * 60,
      max: 50,
    });
    if (!storeRate.allowed) {
      res.setHeader('Retry-After', String(storeRate.retryAfterSec || 900));
      res.status(429).json({ error: '試行回数が多すぎます。しばらくしてから再度お試しください。' });
      return;
    }

    const { data: store, error } = await supabaseAdmin
      .from('stores')
      .select('id, name, settings')
      .eq('id', storeId)
      .maybeSingle();

    if (error || !store) {
      res.status(404).json({ error: '事業所が見つかりません' });
      return;
    }

    const kioskPin = store.settings?.kiosk_pin;
    if (!kioskPin) {
      res.status(403).json({ error: 'キオスクPINが設定されていません。管理者に設定を依頼してください。' });
      return;
    }

    const pinBuf = Buffer.from(String(pin));
    const expectedBuf = Buffer.from(String(kioskPin));
    if (pinBuf.length !== expectedBuf.length || !timingSafeEqual(pinBuf, expectedBuf)) {
      res.status(401).json({ error: 'PINが正しくありません' });
      return;
    }

    const token = jwt.sign(
      { storeId, mode: 'kiosk' } as { storeId: string; mode: 'kiosk' },
      config.kioskJwtSecret,
      { expiresIn: '24h' }
    );

    res.json({ token, storeName: store.name, storeId });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// スタッフ一覧（キオスク認証）
// ============================================================
router.get('/:storeId/staff', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const kioskStoreId = req.kioskStoreId!;
    if (storeId !== kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('store_staff')
      .select('id, role, user:profiles(id, name)')
      .eq('store_id', storeId)
      .neq('role', 'owner')
      .order('id');

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // 本日出勤中かチェック
    const today = new Date().toISOString().split('T')[0];
    const { data: openRecords } = await supabaseAdmin
      .from('time_records')
      .select('staff_id, id, clock_in')
      .eq('store_id', storeId)
      .gte('clock_in', `${today}T00:00:00`)
      .is('clock_out', null);

    const openMap = new Map((openRecords || []).map((r: any) => [r.staff_id, r]));

    const staff = (data || []).map((s: any) => ({
      id: s.id,
      name: s.user?.name || '',
      role: s.role,
      clockedIn: openMap.has(s.id),
      openRecordId: openMap.get(s.id)?.id || null,
      clockInTime: openMap.get(s.id)?.clock_in || null,
    }));

    res.json({ staff });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// シフト一覧（キオスク認証）
//   単日: ?date=YYYY-MM-DD
//   範囲: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ============================================================
router.get('/:storeId/shifts', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const kioskStoreId = req.kioskStoreId!;
    if (storeId !== kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const isRange = typeof req.query.startDate === 'string' && typeof req.query.endDate === 'string';

    if (isRange) {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const { data, error } = await supabaseAdmin
        .from('shifts')
        .select('id, start_time, end_time, staff_id, date, break_minutes, staff:store_staff(id, user:profiles(name))')
        .eq('store_id', storeId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date')
        .order('start_time');

      if (error) { res.status(500).json({ error: error.message }); return; }

      const shifts = (data || []).map((s: any) => ({
        id: s.id,
        staffId: s.staff_id,
        date: s.date,
        startTime: s.start_time,
        endTime: s.end_time,
        breakMinutes: s.break_minutes || 0,
        staffName: s.staff?.user?.name || '',
      }));

      res.json({ shifts, startDate, endDate });
    } else {
      const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date : today;

      const { data, error } = await supabaseAdmin
        .from('shifts')
        .select('id, start_time, end_time, staff_id, date, break_minutes, staff:store_staff(id, user:profiles(name))')
        .eq('store_id', storeId)
        .eq('date', date)
        .order('start_time');

      if (error) { res.status(500).json({ error: error.message }); return; }

      const shifts = (data || []).map((s: any) => ({
        id: s.id,
        staffId: s.staff_id,
        date: s.date,
        startTime: s.start_time,
        endTime: s.end_time,
        breakMinutes: s.break_minutes || 0,
        staffName: s.staff?.user?.name || '',
      }));

      res.json({ shifts, date });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// シフト希望一覧（キオスク認証）?startDate=&endDate=
// ============================================================
router.get('/:storeId/shift-requests', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const kioskStoreId = req.kioskStoreId!;
    if (storeId !== kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' });
      return;
    }

    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : new Date().toISOString().split('T')[0];
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : startDate;

    const { data, error } = await supabaseAdmin
      .from('shift_requests')
      .select('id, staff_id, date, request_type, start_time, end_time, note, staff:store_staff(id, user:profiles(name))')
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date');

    if (error) { res.status(500).json({ error: error.message }); return; }

    const requests = (data || []).map((r: any) => ({
      id: r.id,
      staffId: r.staff_id,
      staffName: r.staff?.user?.name || '',
      date: r.date,
      requestType: r.request_type,
      startTime: r.start_time,
      endTime: r.end_time,
      note: r.note,
    }));

    res.json({ requests, startDate, endDate });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});


// ============================================================
// シフト作成（キオスク認証）
// ============================================================
router.post('/:storeId/shifts', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const kioskStoreId = req.kioskStoreId!;
    if (storeId !== kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' });
      return;
    }

    const { staffId, date, startTime, endTime, breakMinutes = 0 } = req.body || {};

    if (!staffId || !date || !startTime || !endTime) {
      res.status(400).json({ error: 'staffId, date, startTime, endTime は必須です' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: '日付は YYYY-MM-DD 形式で指定してください' });
      return;
    }

    if (startTime >= endTime) {
      res.status(400).json({ error: '終了時刻は開始時刻より後にしてください' });
      return;
    }

    const { data: staffCheck } = await supabaseAdmin
      .from('store_staff')
      .select('id')
      .eq('id', staffId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!staffCheck) {
      res.status(400).json({ error: 'このスタッフはこの店舗に所属していません' });
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
        status: 'draft',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id,staff_id,date' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ ok: true, shift: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// シフト削除（キオスク認証）
// ============================================================
router.delete('/:storeId/shifts/:shiftId', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const shiftId = req.params.shiftId as string;
    const kioskStoreId = req.kioskStoreId!;
    if (storeId !== kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('shifts')
      .delete()
      .eq('id', shiftId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 打刻（キオスク認証）
// ============================================================
router.post('/:storeId/punch', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const kioskStoreId = req.kioskStoreId!;
    if (storeId !== kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' });
      return;
    }

    const staffId = typeof req.body?.staffId === 'string' ? req.body.staffId.trim() : '';
    const action = req.body?.action; // 'clock-in' | 'clock-out'

    if (!staffId) {
      res.status(400).json({ error: 'staffIdは必須です' });
      return;
    }
    if (action !== 'clock-in' && action !== 'clock-out') {
      res.status(400).json({ error: 'actionはclock-inまたはclock-outを指定してください' });
      return;
    }

    // スタッフがこの店舗に所属しているか確認
    const { data: staff } = await supabaseAdmin
      .from('store_staff')
      .select('id, role')
      .eq('id', staffId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!staff) {
      res.status(403).json({ error: 'このスタッフはこの店舗に所属していません' });
      return;
    }
    if (staff.role === 'owner') {
      res.status(403).json({ error: 'オーナーは打刻できません' });
      return;
    }

    if (action === 'clock-in') {
      // 既に出勤中かチェック（アプリレベルのガード）
      const { data: open } = await supabaseAdmin
        .from('time_records')
        .select('id, clock_in')
        .eq('store_id', storeId)
        .eq('staff_id', staffId)
        .is('clock_out', null)
        .maybeSingle();

      if (open) {
        res.status(409).json({ error: '既に出勤中です', clockInTime: open.clock_in });
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

      res.status(201).json({ ok: true, action: 'clock-in', clockIn: record.clock_in });
    } else {
      // 退勤
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

      const { data: record, error } = await supabaseAdmin
        .from('time_records')
        .update({ clock_out: new Date().toISOString() })
        .eq('id', open.id)
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ ok: true, action: 'clock-out', clockOut: record.clock_out });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 有効プラグイン一覧（キオスク認証）
// ============================================================
router.get('/:storeId/enabled-plugins', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' });
      return;
    }
    const { data } = await supabaseAdmin
      .from('store_plugins')
      .select('plugin_name, enabled')
      .eq('store_id', storeId)
      .eq('enabled', true);

    res.json({ plugins: (data || []).map((p: any) => p.plugin_name) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// HACCP: アクティブテンプレート取得（キオスク認証）
// ============================================================
router.get('/:storeId/haccp/templates', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }
    const timing = typeof req.query.timing === 'string' ? req.query.timing : null;
    let templates = await listKioskActiveTemplates(storeId, timing);

    // Fallback: if no templates found, auto-provision from system templates
    if (templates.length === 0) {
      try {
        const count = await provisionSystemTemplates(storeId, 'cafe');
        if (count > 0) {
          console.log(`[kiosk] Auto-provisioned ${count} HACCP templates for store ${storeId}`);
          templates = await listKioskActiveTemplates(storeId, timing);
        }
      } catch (provErr: any) {
        console.warn(`[kiosk] HACCP template auto-provision warning for store ${storeId}:`, provErr.message);
      }
    }

    res.json({ templates });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// HACCP: チェックリスト提出（キオスク認証）
// ============================================================
router.post('/:storeId/haccp/submissions', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { template_id, membership_id, timing, items } = req.body ?? {};

    if (!template_id || !membership_id || !timing || !Array.isArray(items)) {
      res.status(400).json({ error: 'template_id, membership_id, timing, items は必須です' }); return;
    }

    try {
      // kiosk には認証ユーザーがいないので、membership_id (store_staff.id) から
      // user_id (auth.users.id) ���引いて submitted_by に使う。
      const { data: staffRow, error: staffErr } = await supabaseAdmin
        .from('store_staff')
        .select('user_id')
        .eq('id', membership_id)
        .eq('store_id', storeId)
        .single();

      if (staffErr || !staffRow) {
        res.status(400).json({ error: 'スタッフが見つかりません' }); return;
      }

      const submission = await createSubmission({
        storeId,
        userId: staffRow.user_id,
        scope: 'store',
        timing,
        templateId: template_id,
        membershipId: membership_id,
        items,
      });
      res.status(201).json({ ok: true, submissionId: submission.id });
    } catch (err: any) {
      const msg = err?.message || '提出に失敗しました';
      if (msg.includes('見つかりません')) res.status(404).json({ error: msg });
      else if (msg.includes('必須')) res.status(400).json({ error: msg });
      else res.status(500).json({ error: msg });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// HACCP: 提出履歴（キオスク認証）?date=YYYY-MM-DD
// ============================================================
router.get('/:storeId/haccp/submissions', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().split('T')[0];
    const submissions = await listKioskSubmissionsForDate(storeId, date);
    res.json({ submissions, date });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// HACCP: 月次提出サマリ（キオスク認証）?year=YYYY&month=MM
// ============================================================
router.get('/:storeId/haccp/submissions/monthly', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const now = new Date();
    const year = typeof req.query.year === 'string' ? parseInt(req.query.year, 10) : now.getFullYear();
    const month = typeof req.query.month === 'string' ? parseInt(req.query.month, 10) : now.getMonth() + 1;

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      res.status(400).json({ error: '無効なyearまたはmonthパラメータです' }); return;
    }

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`;

    const { data, error } = await supabaseAdmin
      .from('checklist_submissions')
      .select('id, timing, submitted_at, all_passed, has_deviation')
      .eq('store_id', storeId)
      .eq('scope', 'store')
      .gte('submitted_at', monthStart)
      .lte('submitted_at', monthEnd)
      .order('submitted_at', { ascending: true });

    if (error) throw new Error(error.message);

    // 日付ごと・タイミングごとに集計
    interface TimingInfo {
      submitted: boolean;
      all_passed?: boolean;
      count?: number;
    }
    const days: Record<string, Record<string, TimingInfo>> = {};

    for (const row of (data || []) as any[]) {
      const dateKey = (row.submitted_at as string).split('T')[0];
      if (!days[dateKey]) days[dateKey] = {};

      const timing = row.timing as string;
      const allPassed = row.all_passed === true && row.has_deviation !== true;

      if (!days[dateKey][timing]) {
        days[dateKey][timing] = { submitted: true, all_passed: allPassed, count: 1 };
      } else {
        const existing = days[dateKey][timing];
        existing.count = (existing.count || 1) + 1;
        existing.all_passed = existing.all_passed && allPassed;
      }
    }

    res.json({ days, year, month });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// SwitchBot: デバイス一覧（キオスク認証）
// ============================================================
router.get('/:storeId/switchbot', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }
    const devices = await fetchStoreMeters(storeId);
    res.json({ devices });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// SwitchBot: 日次温湿度ログ（キオスク認証）?date=YYYY-MM-DD
// NOTE: must be defined BEFORE /:storeId/switchbot/:deviceId
// ============================================================
router.get('/:storeId/switchbot/readings', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const dateParam = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).split(' ')[0];

    const devices = await listStoreReadingsForDate(storeId, dateParam);
    res.json({ devices, date: dateParam });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal Server Error';
    res.status(500).json({ error: msg });
  }
});

// ============================================================
// SwitchBot: デバイスステータス取得（キオスク認証）
// ============================================================
router.get('/:storeId/switchbot/:deviceId', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const deviceId = req.params.deviceId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const status = await fetchDeviceStatus(storeId, deviceId);
    if (!status) {
      res.status(400).json({ error: 'SwitchBot APIトークンが設定されていません' }); return;
    }
    if ('error' in status) {
      res.status(502).json({ error: `SwitchBot API error: ${status.error}` }); return;
    }
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 予約一覧（キオスク認証）— 当日＋未来の予約を返す
// ============================================================
router.get('/:storeId/reservations', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    // date パラメータ（省略時は今日）
    const dateParam = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().split('T')[0];
    const dayStart = `${dateParam}T00:00:00`;
    const dayEnd = `${dateParam}T23:59:59`;

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_type, status, starts_at, ends_at, party_size, customer_name, customer_phone, notes, confirmation_code, metadata, resource_ref')
      .eq('store_id', storeId)
      .gte('starts_at', dayStart)
      .lte('starts_at', dayEnd)
      .not('status', 'eq', 'cancelled')
      .order('starts_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message }); return;
    }

    res.json({ reservations: data || [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 予約月次サマリ（キオスク認証）— カレンダー表示用
// ============================================================
router.get('/:storeId/reservations/monthly', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const yearParam = typeof req.query.year === 'string' ? parseInt(req.query.year, 10) : NaN;
    const monthParam = typeof req.query.month === 'string' ? parseInt(req.query.month, 10) : NaN;

    if (isNaN(yearParam) || isNaN(monthParam) || monthParam < 1 || monthParam > 12) {
      res.status(400).json({ error: 'year と month は必須です（整数）' }); return;
    }

    const monthStart = `${yearParam}-${String(monthParam).padStart(2, '0')}-01T00:00:00`;
    const lastDay = new Date(yearParam, monthParam, 0).getDate();
    const monthEnd = `${yearParam}-${String(monthParam).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`;

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('id, starts_at, reservation_type, customer_name, resource_ref')
      .eq('store_id', storeId)
      .gte('starts_at', monthStart)
      .lte('starts_at', monthEnd)
      .not('status', 'eq', 'cancelled');

    if (error) { res.status(500).json({ error: error.message }); return; }

    const { data: eventData, error: eventError } = await supabaseAdmin
      .from('reservation_events')
      .select('id, title, starts_at')
      .eq('store_id', storeId)
      .gte('starts_at', monthStart)
      .lte('starts_at', monthEnd)
      .in('status', ['published', 'draft']);

    if (eventError) { res.status(500).json({ error: eventError.message }); return; }

    const days: Record<string, { count: number; types: string[]; items: { id: string; name: string; type: string; time: string; isEvent: boolean }[] }> = {};
    for (const row of (data || []) as any[]) {
      const dateKey = (row.starts_at as string).split('T')[0];
      if (!days[dateKey]) {
        days[dateKey] = { count: 0, types: [], items: [] };
      }
      days[dateKey].count += 1;
      const rtype = row.reservation_type as string;
      if (rtype && !days[dateKey].types.includes(rtype)) {
        days[dateKey].types.push(rtype);
      }
      const timeStr = new Date(row.starts_at as string).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
      days[dateKey].items.push({
        id: row.id as string,
        name: row.customer_name as string,
        type: rtype || 'table',
        time: timeStr,
        isEvent: false,
      });
    }

    const events: { id: string; title: string; date: string; time: string }[] = [];
    for (const ev of (eventData || []) as any[]) {
      const dateKey = (ev.starts_at as string).split('T')[0];
      const timeStr = new Date(ev.starts_at as string).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
      events.push({ id: ev.id as string, title: ev.title as string, date: dateKey, time: timeStr });

      if (!days[dateKey]) {
        days[dateKey] = { count: 0, types: [], items: [] };
      }
      if (!days[dateKey].types.includes('event')) {
        days[dateKey].types.push('event');
      }
      days[dateKey].items.push({
        id: ev.id as string,
        name: ev.title as string,
        type: 'event',
        time: timeStr,
        isEvent: true,
      });
    }

    res.json({ days, events });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// イベント一覧（キオスク認証）
// ============================================================
router.get('/:storeId/events', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_events')
      .select('*')
      .eq('store_id', storeId)
      .order('starts_at', { ascending: false });

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({
      events: (data || []).map((event: Record<string, unknown>) => ({
        ...event,
        form_schema: coerceEventFormSchema(event.form_schema),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// イベント作成（キオスク認証）
// ============================================================
router.post('/:storeId/events', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { title, description, starts_at, ends_at, capacity, price, status, form_schema } = req.body || {};

    if (!title || !starts_at || !ends_at || capacity == null) {
      res.status(400).json({ error: 'title, starts_at, ends_at, capacity は必須です' }); return;
    }

    const parsedSchema = parseEventFormSchema(form_schema);
    if (parsedSchema.error) {
      res.status(400).json({ error: parsedSchema.error }); return;
    }
    const schema = parsedSchema.schema;

    const { data, error } = await supabaseAdmin
      .from('reservation_events')
      .insert({
        store_id: storeId,
        title,
        description: description ?? null,
        starts_at,
        ends_at,
        capacity,
        price: price ?? null,
        status: status ?? 'published',
        sort_order: 0,
        form_schema: schema,
      })
      .select()
      .single();

    if (error) {
      const persistenceMessage = toEventFormSchemaPersistenceError(error);
      res.status(persistenceMessage ? 503 : 500).json({ error: persistenceMessage || error.message }); return;
    }

    res.status(201).json({ event: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// イベント更新（キオスク認証）
// ============================================================
router.patch('/:storeId/events/:eventId', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const eventId = req.params.eventId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { title, description, starts_at, ends_at, capacity, price, status, form_schema } = req.body || {};
    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (starts_at !== undefined) updates.starts_at = starts_at;
    if (ends_at !== undefined) updates.ends_at = ends_at;
    if (capacity !== undefined) updates.capacity = capacity;
    if (price !== undefined) updates.price = price;
    if (status !== undefined) updates.status = status;
    if (form_schema !== undefined) {
      const parsedSchema = parseEventFormSchema(form_schema);
      if (parsedSchema.error) {
        res.status(400).json({ error: parsedSchema.error }); return;
      }
      updates.form_schema = parsedSchema.schema;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: '更新するフィールドを指定してください' }); return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_events')
      .update(updates)
      .eq('id', eventId)
      .eq('store_id', storeId)
      .select()
      .single();

    if (error) {
      console.error('[kiosk] event update error:', error.message, 'updates:', JSON.stringify(updates));
      const persistenceMessage = toEventFormSchemaPersistenceError(error);
      res.status(persistenceMessage ? 503 : 500).json({ error: persistenceMessage || error.message }); return;
    }
    if (!data) { res.status(404).json({ error: 'イベントが見つかりません' }); return; }

    res.json({ event: data });
  } catch (e: any) {
    console.error('[kiosk] event update exception:', e.message, 'body:', JSON.stringify(req.body));
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// イベント削除（キオスク認証）
// ============================================================
router.delete('/:storeId/events/:eventId', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const eventId = req.params.eventId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { error } = await supabaseAdmin
      .from('reservation_events')
      .delete()
      .eq('id', eventId)
      .eq('store_id', storeId);

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 公開中イベント一覧＋残席（キオスク認証）
// ============================================================
router.get('/:storeId/events/available', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { data, error } = await supabaseAdmin
      .from('reservation_events')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'published')
      .gte('ends_at', new Date().toISOString())
      .order('starts_at', { ascending: true });

    if (error) { res.status(500).json({ error: error.message }); return; }

    const events = await Promise.all(
      (data || []).map(async (ev: any) => {
        const remaining = await getRemainingCapacity({
          storeId,
          resourceRef: ev.id,
          capacity: ev.capacity,
          startsAt: new Date(ev.starts_at),
          endsAt: new Date(ev.ends_at),
        });
        return {
          id: ev.id,
          title: ev.title,
          description: ev.description,
          starts_at: ev.starts_at,
          ends_at: ev.ends_at,
          capacity: ev.capacity,
          remaining,
          price: ev.price,
          image_url: ev.image_url,
          form_schema: coerceEventFormSchema(ev.form_schema),
        };
      }),
    );

    res.json({ events });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// イベント予約登録（キオスク認証）
// ============================================================
router.post('/:storeId/events/:eventId/book', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const eventId = req.params.eventId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { responses } = req.body || {};
    if (!responses || typeof responses !== 'object') {
      res.status(400).json({ error: 'responses は必須です' }); return;
    }

    // Fetch the event
    const { data: event } = await supabaseAdmin
      .from('reservation_events')
      .select('*')
      .eq('id', eventId)
      .eq('store_id', storeId)
      .eq('status', 'published')
      .maybeSingle();
    if (!event) {
      res.status(404).json({ error: 'イベントが見つかりません' }); return;
    }

    if (new Date(event.starts_at) < new Date()) {
      res.status(400).json({ error: '過去のイベントは予約できません' }); return;
    }

    // Validate required fields from form_schema
    const schema = coerceEventFormSchema(event.form_schema);
    for (const field of schema) {
      if (field.required) {
        const val = responses[field.key];
        if (val === undefined || val === null || val === '') {
          res.status(400).json({ error: `「${field.label}」は必須です` }); return;
        }
      }
    }

    // Derive customer_name from first text field, fallback to "ゲスト"
    const firstTextField = schema.find((f: any) => f.type === 'text');
    const customerName = firstTextField ? String(responses[firstTextField.key] || 'ゲスト') : 'ゲスト';

    // Derive party_size from first number field, fallback to 1
    const firstNumberField = schema.find((f: any) => f.type === 'number');
    const partySize = firstNumberField ? Math.max(1, Number(responses[firstNumberField.key]) || 1) : 1;

    const reservation = await createCapacityReservation({
      storeId,
      type: 'event',
      source: 'walkin',
      resourceRef: event.id,
      capacity: event.capacity,
      startsAt: new Date(event.starts_at),
      endsAt: new Date(event.ends_at),
      partySize,
      customerName,
      metadata: { event_id: event.id, event_title: event.title, form_responses: responses },
    });

    res.status(201).json({
      reservation: {
        id: reservation.id,
        confirmation_code: reservation.confirmation_code,
        starts_at: reservation.starts_at,
        ends_at: reservation.ends_at,
        party_size: reservation.party_size,
      },
    });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ============================================================
// 予約ステータス更新（キオスク認証）
// ============================================================
router.post('/:storeId/reservations/:reservationId/status', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const reservationId = req.params.reservationId as string;
    if (storeId !== req.kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { status } = req.body || {};
    const allowedStatuses = ['confirmed', 'seated', 'completed', 'no_show', 'cancelled'];
    if (!status || !allowedStatuses.includes(status)) {
      res.status(400).json({ error: `status は ${allowedStatuses.join(', ')} のいずれかを指定してください` }); return;
    }

    const updates: Record<string, any> = { status };
    if (status === 'cancelled') {
      updates.cancelled_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from('reservations')
      .update(updates)
      .eq('id', reservationId)
      .eq('store_id', storeId);

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const kioskRouter = router;
