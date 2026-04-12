import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
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

    if (pin !== kioskPin) {
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
    let _debug: any = undefined;

    // Fallback: if no templates found, auto-provision from system templates
    if (templates.length === 0) {
      // Diagnose: count system templates and existing store templates
      const { data: sysTpls } = await supabaseAdmin
        .from('checklist_system_templates')
        .select('id, name, timing, scope')
        .eq('business_type', 'cafe')
        .eq('is_active', true);
      const { data: storeTpls } = await supabaseAdmin
        .from('checklist_templates')
        .select('id, name, timing, scope, is_active, system_template_id')
        .eq('store_id', storeId);

      _debug = {
        systemTemplatesCount: sysTpls?.length ?? 0,
        storeTemplatesCount: storeTpls?.length ?? 0,
        storeTemplates: (storeTpls || []).map((t: any) => ({
          name: t.name, timing: t.timing, scope: t.scope, is_active: t.is_active,
        })),
        queriedTiming: timing,
      };

      try {
        const count = await provisionSystemTemplates(storeId, 'cafe');
        _debug.provisionedCount = count;
        if (count > 0) {
          console.log(`[kiosk] Auto-provisioned ${count} HACCP templates for store ${storeId}`);
          templates = await listKioskActiveTemplates(storeId, timing);
        }
      } catch (provErr: any) {
        _debug.provisionError = provErr.message;
        console.warn(`[kiosk] HACCP template auto-provision warning for store ${storeId}:`, provErr.message);
      }
    }

    res.json({ templates, _debug });
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
      // kiosk は認証ユーザーが存在しないので submitted_by には membership_id を入れる。
      // createSubmission 側は measurement/deviation 連携を含む本丸を 1 関数で完結させる。
      const submission = await createSubmission({
        storeId,
        userId: membership_id,
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

export const kioskRouter = router;
