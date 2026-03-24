import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { createSupabaseClient, supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { isManagedRole, isShiftRequestEnabled, requireManagedStore, requireStoreMembership, staffBelongsToStore } from '../auth/authorization';

const router = Router();

// ============================================================
// 週間シフト取得
// ============================================================
router.get('/:storeId/weekly', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) {
    return;
  }
  const dateStr = req.query.date as string;
  const baseDate = dateStr ? new Date(dateStr) : new Date();

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
    status: s.status || 'draft',
  }));

  res.json({ startDate, endDate, shifts });
});

// ============================================================
// シフト追加・更新
// ============================================================
router.post('/:storeId', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const { staffId, date, startTime, endTime, breakMinutes = 0, note, status = 'draft' } = req.body;
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) {
    return;
  }

  if (!staffId || !date || !startTime || !endTime) {
    res.status(400).json({ error: 'staffId, date, startTime, endTime は必須です' });
    return;
  }

  if (startTime >= endTime) {
    res.status(400).json({ error: '終了時刻は開始時刻より後に設定してください' });
    return;
  }

  if (!(await staffBelongsToStore(storeId, staffId))) {
    res.status(400).json({ error: '指定された staffId はこの店舗に所属していません' });
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
      status,
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

// ============================================================
// シフト一括確定（週単位）
// ============================================================
router.post('/:storeId/publish', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const { startDate, endDate } = req.body;
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) {
    return;
  }

  if (!startDate || !endDate) {
    res.status(400).json({ error: 'startDate, endDate は必須です' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('shifts')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .eq('status', 'draft')
    .gte('date', startDate)
    .lte('date', endDate)
    .select();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ published: (data || []).length });
});

// ============================================================
// シフト削除
// ============================================================
router.delete('/:storeId/:shiftId', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const shiftId = String(req.params.shiftId);
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) {
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
});

// ============================================================
// シフト希望 CRUD
// ============================================================

// 週間の希望取得
router.get('/:storeId/requests', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) {
    return;
  }
  const dateStr = req.query.date as string;
  const baseDate = dateStr ? new Date(dateStr) : new Date();

  const day = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startDate = monday.toISOString().split('T')[0];
  const endDate = sunday.toISOString().split('T')[0];

  const supabase = createSupabaseClient(req.accessToken!);

  const { data, error } = await supabase
    .from('shift_requests')
    .select('*, staff:store_staff(id, user:profiles(name))')
    .eq('store_id', storeId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

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

  res.json({ startDate, endDate, requests });
});

// 希望登録・更新
router.post('/:storeId/requests', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const { staffId, date, requestType = 'available', startTime, endTime, note } = req.body;
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) {
    return;
  }

  if (!staffId || !date) {
    res.status(400).json({ error: 'staffId, date は必須です' });
    return;
  }

  if (!(await staffBelongsToStore(storeId, staffId))) {
    res.status(400).json({ error: '指定された staffId はこの店舗に所属していません' });
    return;
  }

  if (!isManagedRole(membership.role)) {
    if (!(await isShiftRequestEnabled(storeId))) {
      res.status(403).json({ error: 'シフト希望の提出は無効化されています' });
      return;
    }
    if (staffId !== membership.id) {
      res.status(403).json({ error: '自分のシフト希望のみ登録できます' });
      return;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('shift_requests')
    .upsert({
      store_id: storeId,
      staff_id: staffId,
      date,
      request_type: requestType,
      start_time: startTime || null,
      end_time: endTime || null,
      note,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_id,staff_id,date' })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ request: data });
});

// 希望削除
router.delete('/:storeId/requests/:requestId', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const requestId = String(req.params.requestId);
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) {
    return;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('shift_requests')
    .select('store_id, staff_id')
    .eq('id', requestId)
    .maybeSingle();

  if (existingError || !existing || existing.store_id !== storeId) {
    res.status(404).json({ error: 'シフト希望が見つかりません' });
    return;
  }

  if (!isManagedRole(membership.role) && existing.staff_id !== membership.id) {
    res.status(403).json({ error: '自分のシフト希望のみ削除できます' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('shift_requests')
    .delete()
    .eq('id', requestId)
    .eq('store_id', storeId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// ============================================================
// シフトテンプレート CRUD
// ============================================================

// テンプレート一覧
router.get('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) {
    return;
  }
  const supabase = createSupabaseClient(req.accessToken!);

  const { data, error } = await supabase
    .from('shift_templates')
    .select('*')
    .eq('store_id', storeId)
    .order('name');

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const templates = (data || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    startTime: t.start_time,
    endTime: t.end_time,
    breakMinutes: t.break_minutes,
    color: t.color,
  }));

  res.json({ templates });
});

// テンプレート作成
router.post('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const { name, startTime, endTime, breakMinutes = 0, color } = req.body;
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) {
    return;
  }

  if (!name || !startTime || !endTime) {
    res.status(400).json({ error: 'name, startTime, endTime は必須です' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('shift_templates')
    .upsert({
      store_id: storeId,
      name,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      color,
    }, { onConflict: 'store_id,name' })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ template: data });
});

// テンプレート削除
router.delete('/:storeId/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const templateId = String(req.params.templateId);
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) {
    return;
  }

  const { error } = await supabaseAdmin
    .from('shift_templates')
    .delete()
    .eq('id', templateId)
    .eq('store_id', storeId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// ============================================================
// プラグインエクスポート
// ============================================================
export const shiftRequestPlugin: Plugin = {
  name: 'shift_request',
  version: '0.2.0',
  description: 'シフト希望の提出',
  label: 'シフト希望',
  icon: '📋',
  defaultRoles: ['full_time', 'part_time'],
  initialize: (_app: Express) => {
    // ルーティングは shiftPlugin 内で共有
  },
};

export const shiftPlugin: Plugin = {
  name: 'shift',
  version: '0.2.0',
  description: 'シフト管理・テンプレート機能',
  label: 'シフト管理',
  icon: '📅',
  defaultRoles: ['owner', 'manager'],
  settingsSchema: [
    {
      key: 'default_start_time',
      label: 'デフォルト開始時間',
      type: 'text',
      default: '09:00',
      description: 'シフト作成時の初期値',
    },
    {
      key: 'default_end_time',
      label: 'デフォルト終了時間',
      type: 'text',
      default: '17:00',
      description: 'シフト作成時の初期値',
    },
    {
      key: 'allow_staff_request',
      label: 'スタッフのシフト希望提出',
      type: 'boolean',
      default: true,
      description: 'スタッフが希望シフトを提出できるようにする',
    },
  ],
  initialize: (app: Express) => {
    app.use('/api/shift', router);
  },
};
