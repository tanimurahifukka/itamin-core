import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { requireKiosk } from '../middleware/kiosk';
import { requireManagedStore } from '../auth/authorization';

const SWITCHBOT_BASE = 'https://api.switch-bot.com/v1.1';

function makeSwitchBotHeaders(token: string, secret: string) {
  const t = Date.now();
  const nonce = crypto.randomUUID();
  const sign = crypto.createHmac('sha256', secret).update(token + t + nonce).digest('base64');
  return { Authorization: token, t: String(t), nonce, sign, 'Content-Type': 'application/json' };
}

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
    const kioskStoreId = (req as any).kioskStoreId as string;
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
    const kioskStoreId = (req as any).kioskStoreId as string;
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
    const kioskStoreId = (req as any).kioskStoreId as string;
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
    const kioskStoreId = (req as any).kioskStoreId as string;
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
    const kioskStoreId = (req as any).kioskStoreId as string;
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
    const kioskStoreId = (req as any).kioskStoreId as string;
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
      // 既に出勤中かチェック
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
    if (storeId !== (req as any).kioskStoreId) {
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
    if (storeId !== (req as any).kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const timing = typeof req.query.timing === 'string' ? req.query.timing : null;

    let query = supabaseAdmin
      .from('checklist_templates')
      .select('id, name, timing, scope, description')
      .eq('store_id', storeId)
      .eq('scope', 'store')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (timing) query = query.eq('timing', timing);

    const { data: templates, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }

    // 各テンプレートのアイテムを取得
    const ids = (templates || []).map((t: any) => t.id);
    const { data: items } = ids.length > 0
      ? await supabaseAdmin
          .from('checklist_template_items')
          .select('id, template_id, label, item_type, required, min_value, max_value, unit, sort_order, options')
          .in('template_id', ids)
          .order('sort_order', { ascending: true })
      : { data: [] };

    const itemsByTemplate = ((items || []) as any[]).reduce((acc: any, item: any) => {
      if (!acc[item.template_id]) acc[item.template_id] = [];
      acc[item.template_id].push(item);
      return acc;
    }, {});

    const result = (templates || []).map((t: any) => ({
      ...t,
      items: itemsByTemplate[t.id] || [],
    }));

    res.json({ templates: result });
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
    if (storeId !== (req as any).kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { template_id, membership_id, timing, items } = req.body ?? {};

    if (!template_id || !membership_id || !timing || !Array.isArray(items)) {
      res.status(400).json({ error: 'template_id, membership_id, timing, items は必須です' }); return;
    }

    // テンプレート確認
    const { data: tpl } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, name, version')
      .eq('id', template_id)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!tpl) { res.status(404).json({ error: 'テンプレートが見つかりません' }); return; }

    // サブミッション挿入
    const { data: submission, error: subErr } = await supabaseAdmin
      .from('checklist_submissions')
      .insert({
        store_id: storeId,
        template_id,
        template_version: tpl.version ?? 1,
        scope: 'store',
        timing,
        membership_id,
        submitted_at: new Date().toISOString(),
        submitted_by: membership_id,
      })
      .select('id')
      .single();

    if (subErr) { res.status(500).json({ error: subErr.message }); return; }

    // アイテム挿入
    const rows = items.map((item: any) => ({
      submission_id: submission.id,
      template_item_id: item.template_item_id,
      bool_value: item.bool_value ?? null,
      numeric_value: item.numeric_value ?? null,
      text_value: item.text_value ?? null,
      select_value: item.select_value ?? null,
      checked_by: membership_id,
    }));

    if (rows.length > 0) {
      const { error: itemErr } = await supabaseAdmin
        .from('checklist_submission_items')
        .insert(rows);
      if (itemErr) { res.status(500).json({ error: itemErr.message }); return; }
    }

    res.status(201).json({ ok: true, submissionId: submission.id });
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
    if (storeId !== (req as any).kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('checklist_submissions')
      .select('id, template_id, timing, submitted_at, member:store_staff(user:profiles(name))')
      .eq('store_id', storeId)
      .eq('scope', 'store')
      .gte('submitted_at', `${date}T00:00:00`)
      .lte('submitted_at', `${date}T23:59:59`)
      .order('submitted_at', { ascending: false });

    if (error) { res.status(500).json({ error: error.message }); return; }

    // テンプレート名を一括取得
    const tplIds = [...new Set((data || []).map((s: any) => s.template_id))];
    const { data: tpls } = tplIds.length > 0
      ? await supabaseAdmin.from('checklist_templates').select('id, name').in('id', tplIds)
      : { data: [] };
    const tplMap = new Map(((tpls || []) as any[]).map((t: any) => [t.id, t.name]));

    const submissions = (data || []).map((s: any) => ({
      id: s.id,
      templateId: s.template_id,
      templateName: tplMap.get(s.template_id) || '不明',
      timing: s.timing,
      submittedAt: s.submitted_at,
      submittedBy: s.member?.user?.name || '–',
    }));

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
    if (storeId !== (req as any).kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }
    const { data } = await supabaseAdmin
      .from('store_plugins')
      .select('config')
      .eq('store_id', storeId)
      .eq('plugin_name', 'switchbot')
      .maybeSingle();
    const token = data?.config?.token;
    const secret = data?.config?.secret;
    if (!token || !secret) { res.json({ devices: [] }); return; }

    const r = await fetch(`${SWITCHBOT_BASE}/devices`, {
      headers: makeSwitchBotHeaders(token, secret),
    });
    const json: any = await r.json();
    if (!r.ok || json.statusCode !== 100) { res.json({ devices: [] }); return; }

    const meters = (json.body?.deviceList || []).filter((d: any) =>
      /meter/i.test(d.deviceType || '')
    );
    res.json({ devices: meters });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// SwitchBot: デバイスステータス取得（キオスク認証）
// ============================================================
router.get('/:storeId/switchbot/:deviceId', requireKiosk, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const deviceId = req.params.deviceId as string;
    if (storeId !== (req as any).kioskStoreId) {
      res.status(403).json({ error: 'アクセス権限がありません' }); return;
    }

    const { data } = await supabaseAdmin
      .from('store_plugins')
      .select('config')
      .eq('store_id', storeId)
      .eq('plugin_name', 'switchbot')
      .maybeSingle();

    const token = data?.config?.token;
    const secret = data?.config?.secret;
    if (!token || !secret) {
      res.status(400).json({ error: 'SwitchBot APIトークンが設定されていません' }); return;
    }

    const r = await fetch(`${SWITCHBOT_BASE}/devices/${deviceId}/status`, {
      headers: makeSwitchBotHeaders(token, secret),
    });
    const json: any = await r.json();
    if (!r.ok || json.statusCode !== 100) {
      res.status(502).json({ error: `SwitchBot API error: ${json.message || r.status}` }); return;
    }

    const body = json.body || {};
    res.json({ temperature: body.temperature ?? null, humidity: body.humidity ?? null, battery: body.battery ?? null });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const kioskRouter = router;
