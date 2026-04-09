/**
 * check プラグイン v2 — HACCP 準拠チェックリスト管理
 *
 * timing TEXT + CHECK: clock_in / clock_out / store_opening / store_closing / store_daily / ad_hoc
 * scope : store / personal
 * audit_level (store_plugins.config): simple / shift / item / approval
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireStoreMembership, requireManagedStore } from '../auth/authorization';

const router = Router();

const VALID_TIMINGS = ['clock_in', 'clock_out', 'store_opening', 'store_closing', 'store_daily', 'ad_hoc'] as const;
const VALID_SCOPES  = ['store', 'personal'] as const;
const VALID_LAYERS  = ['base', 'shift'] as const;
const VALID_ITEM_TYPES    = ['checkbox', 'numeric', 'text', 'photo', 'select'] as const;
const VALID_TRACKING_MODES = ['submission_only', 'measurement_only', 'both'] as const;
const VALID_AUDIT_LEVELS  = ['simple', 'shift', 'item', 'approval'] as const;
const VALID_SEVERITIES    = ['info', 'warning', 'ccp'] as const;

type CheckTiming = typeof VALID_TIMINGS[number];
type CheckScope  = typeof VALID_SCOPES[number];

function isValidTiming(v: string): v is CheckTiming {
  return VALID_TIMINGS.includes(v as CheckTiming);
}
function isValidScope(v: string): v is CheckScope {
  return VALID_SCOPES.includes(v as CheckScope);
}

// ── ヘルパー ─────────────────────────────────────────────────────────────────

function calcPassed(
  item: { item_type: string; min_value: number | null; max_value: number | null },
  values: { bool_value?: boolean | null; numeric_value?: number | null; text_value?: string | null; select_value?: string | null; file_path?: string | null },
): boolean | null {
  switch (item.item_type) {
    case 'checkbox':
      return values.bool_value === true;
    case 'numeric': {
      const v = values.numeric_value;
      if (v == null) return null;
      if (item.min_value != null && v < item.min_value) return false;
      if (item.max_value != null && v > item.max_value) return false;
      return true;
    }
    case 'text':
      return (values.text_value ?? '').trim().length > 0;
    case 'select':
      return (values.select_value ?? '').length > 0;
    case 'photo':
      return (values.file_path ?? '').length > 0;
    default:
      return null;
  }
}

async function getAuditLevel(storeId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('store_plugins')
    .select('config')
    .eq('store_id', storeId)
    .eq('plugin_name', 'check')
    .maybeSingle();
  return data?.config?.audit_level ?? 'simple';
}

// ── システムテンプレート ──────────────────────────────────────────────────────

// GET /api/check/system-templates?business_type=cafe
router.get('/system-templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const businessType = String(req.query.business_type || 'cafe');

    const { data: templates, error: tplErr } = await supabaseAdmin
      .from('checklist_system_templates')
      .select('*')
      .eq('business_type', businessType)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (tplErr) {
      res.status(500).json({ error: tplErr.message });
      return;
    }

    if (!templates || templates.length === 0) {
      res.json({ system_templates: [] });
      return;
    }

    const tplIds = templates.map((t: any) => t.id);
    const { data: items, error: itemErr } = await supabaseAdmin
      .from('checklist_system_template_items')
      .select('*')
      .in('system_template_id', tplIds)
      .order('sort_order', { ascending: true });

    if (itemErr) {
      res.status(500).json({ error: itemErr.message });
      return;
    }

    const itemsByTemplate = (items || []).reduce((acc: any, item: any) => {
      if (!acc[item.system_template_id]) acc[item.system_template_id] = [];
      acc[item.system_template_id].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    const result = templates.map((t: any) => ({
      ...t,
      items: itemsByTemplate[t.id] || [],
    }));

    res.json({ system_templates: result });
  } catch (e: any) {
    console.error('[check GET /system-templates] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── 店舗テンプレート ──────────────────────────────────────────────────────────

// GET /api/check/:storeId/templates?scope=&timing=&layer=
router.get('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    let query = supabaseAdmin
      .from('checklist_templates')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (req.query.scope && isValidScope(String(req.query.scope))) {
      query = query.eq('scope', String(req.query.scope));
    }
    if (req.query.timing && isValidTiming(String(req.query.timing))) {
      query = query.eq('timing', String(req.query.timing));
    }
    if (req.query.layer && VALID_LAYERS.includes(String(req.query.layer) as any)) {
      query = query.eq('layer', String(req.query.layer));
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ templates: data || [] });
  } catch (e: any) {
    console.error('[check GET /:storeId/templates] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// POST /api/check/:storeId/templates/from-system — システムテンプレートからコピー
router.post('/:storeId/templates/from-system', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const systemTemplateId = String(req.body?.system_template_id || '');
    if (!systemTemplateId) {
      res.status(400).json({ error: 'system_template_id は必須です' });
      return;
    }

    const { data: sys, error: sysErr } = await supabaseAdmin
      .from('checklist_system_templates')
      .select('*')
      .eq('id', systemTemplateId)
      .maybeSingle();

    if (sysErr || !sys) {
      res.status(404).json({ error: 'システムテンプレートが見つかりません' });
      return;
    }

    const { data: sysItems, error: siErr } = await supabaseAdmin
      .from('checklist_system_template_items')
      .select('*')
      .eq('system_template_id', systemTemplateId)
      .order('sort_order', { ascending: true });

    if (siErr) {
      res.status(500).json({ error: siErr.message });
      return;
    }

    // テンプレート作成
    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from('checklist_templates')
      .insert({
        store_id: storeId,
        system_template_id: systemTemplateId,
        name: sys.name,
        timing: sys.timing,
        scope: sys.scope,
        layer: sys.layer,
        description: sys.description,
        version: 1,
        created_by: req.user!.id,
        updated_by: req.user!.id,
      })
      .select('*')
      .single();

    if (tplErr || !tpl) {
      res.status(500).json({ error: tplErr?.message || 'テンプレート作成に失敗しました' });
      return;
    }

    // 項目コピー
    if (sysItems && sysItems.length > 0) {
      const itemsToInsert = sysItems.map((si: any) => ({
        store_id: storeId,
        template_id: tpl.id,
        item_key: si.item_key,
        label: si.label,
        item_type: si.item_type,
        required: si.required,
        min_value: si.min_value,
        max_value: si.max_value,
        unit: si.unit,
        options: si.options,
        is_ccp: si.is_ccp,
        tracking_mode: si.tracking_mode,
        frequency_per_day: si.frequency_per_day,
        frequency_interval_minutes: si.frequency_interval_minutes,
        deviation_action: si.deviation_action,
        sort_order: si.sort_order,
      }));

      const { error: itemErr } = await supabaseAdmin
        .from('checklist_template_items')
        .insert(itemsToInsert);

      if (itemErr) {
        res.status(500).json({ error: itemErr.message });
        return;
      }
    }

    // 項目付きで返す
    const { data: createdItems } = await supabaseAdmin
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', tpl.id)
      .order('sort_order', { ascending: true });

    res.status(201).json({ template: { ...tpl, items: createdItems || [] } });
  } catch (e: any) {
    console.error('[check POST /:storeId/templates/from-system] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// POST /api/check/:storeId/templates — カスタムテンプレート作成
router.post('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const name    = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const timing  = String(req.body?.timing ?? '');
    const scope   = String(req.body?.scope ?? 'personal');
    const layer   = String(req.body?.layer ?? 'base');

    if (!name) { res.status(400).json({ error: 'name は必須です' }); return; }
    if (!isValidTiming(timing)) { res.status(400).json({ error: 'timing が不正です' }); return; }
    if (!isValidScope(scope))   { res.status(400).json({ error: 'scope は store または personal を指定してください' }); return; }
    if (!VALID_LAYERS.includes(layer as any)) { res.status(400).json({ error: 'layer は base または shift を指定してください' }); return; }

    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .insert({
        store_id: storeId,
        name,
        timing,
        scope,
        layer,
        description: req.body?.description ?? null,
        sort_order: Number.isInteger(req.body?.sort_order) ? req.body.sort_order : 0,
        created_by: req.user!.id,
        updated_by: req.user!.id,
      })
      .select('*')
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.status(201).json({ template: { ...data, items: [] } });
  } catch (e: any) {
    console.error('[check POST /:storeId/templates] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// GET /api/check/:storeId/templates/:templateId
router.get('/:storeId/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId    = String(req.params.storeId);
    const templateId = String(req.params.templateId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data: tpl, error } = await supabaseAdmin
      .from('checklist_templates')
      .select('*')
      .eq('id', templateId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (error) { res.status(500).json({ error: error.message }); return; }
    if (!tpl)  { res.status(404).json({ error: 'テンプレートが見つかりません' }); return; }

    const { data: items } = await supabaseAdmin
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true });

    res.json({ template: { ...tpl, items: items || [] } });
  } catch (e: any) {
    console.error('[check GET /:storeId/templates/:templateId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// PUT /api/check/:storeId/templates/:templateId
router.put('/:storeId/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId    = String(req.params.storeId);
    const templateId = String(req.params.templateId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: req.user!.id };

    if (req.body?.name !== undefined) {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) { res.status(400).json({ error: 'name は空でない文字列で指定してください' }); return; }
      updates.name = name;
    }
    if (req.body?.timing !== undefined) {
      if (!isValidTiming(String(req.body.timing))) { res.status(400).json({ error: 'timing が不正です' }); return; }
      updates.timing = req.body.timing;
    }
    if (req.body?.scope !== undefined) {
      if (!isValidScope(String(req.body.scope))) { res.status(400).json({ error: 'scope が不正です' }); return; }
      updates.scope = req.body.scope;
    }
    if (req.body?.layer !== undefined) {
      if (!VALID_LAYERS.includes(String(req.body.layer) as any)) { res.status(400).json({ error: 'layer が不正です' }); return; }
      updates.layer = req.body.layer;
    }
    if (req.body?.description !== undefined) updates.description = req.body.description;
    if (req.body?.is_active !== undefined)   updates.is_active   = Boolean(req.body.is_active);

    // version インクリメント（名前・タイミング変更時）
    const { data: cur, error: curErr } = await supabaseAdmin
      .from('checklist_templates')
      .select('version')
      .eq('id', templateId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (curErr || !cur) { res.status(404).json({ error: 'テンプレートが見つかりません' }); return; }

    // 名前や timing の変更はバージョンを上げる
    if (updates.name || updates.timing || updates.scope) {
      updates.version = (cur.version ?? 1) + 1;
    } else {
      delete updates.version;
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .update(updates)
      .eq('id', templateId)
      .eq('store_id', storeId)
      .select('*')
      .maybeSingle();

    if (error) { res.status(500).json({ error: error.message }); return; }
    if (!data)  { res.status(404).json({ error: 'テンプレートが見つかりません' }); return; }

    res.json({ template: data });
  } catch (e: any) {
    console.error('[check PUT /:storeId/templates/:templateId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// DELETE /api/check/:storeId/templates/:templateId — 論理削除
router.delete('/:storeId/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId    = String(req.params.storeId);
    const templateId = String(req.params.templateId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('checklist_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', templateId)
      .eq('store_id', storeId);

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[check DELETE /:storeId/templates/:templateId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── テンプレート項目 ──────────────────────────────────────────────────────────

// POST /api/check/:storeId/templates/:templateId/items
router.post('/:storeId/templates/:templateId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId    = String(req.params.storeId);
    const templateId = String(req.params.templateId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const label    = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    const itemKey  = typeof req.body?.item_key === 'string' ? req.body.item_key.trim() : '';
    const itemType = String(req.body?.item_type ?? 'checkbox');

    if (!label)   { res.status(400).json({ error: 'label は必須です' }); return; }
    if (!VALID_ITEM_TYPES.includes(itemType as any)) { res.status(400).json({ error: 'item_type が不正です' }); return; }

    // テンプレートの所有確認
    const { data: tpl } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, version')
      .eq('id', templateId)
      .eq('store_id', storeId)
      .maybeSingle();
    if (!tpl) { res.status(404).json({ error: 'テンプレートが見つかりません' }); return; }

    const { data: item, error } = await supabaseAdmin
      .from('checklist_template_items')
      .insert({
        store_id: storeId,
        template_id: templateId,
        item_key: itemKey || `item_${Date.now()}`,
        label,
        item_type: itemType,
        required: req.body?.required !== false,
        min_value: req.body?.min_value ?? null,
        max_value: req.body?.max_value ?? null,
        unit: req.body?.unit ?? null,
        options: req.body?.options ?? {},
        is_ccp: Boolean(req.body?.is_ccp),
        tracking_mode: VALID_TRACKING_MODES.includes(req.body?.tracking_mode) ? req.body.tracking_mode : 'submission_only',
        frequency_per_day: req.body?.frequency_per_day ?? null,
        frequency_interval_minutes: req.body?.frequency_interval_minutes ?? null,
        deviation_action: req.body?.deviation_action ?? null,
        sort_order: Number.isInteger(req.body?.sort_order) ? req.body.sort_order : 0,
      })
      .select('*')
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    // 項目変更時はバージョンをインクリメント
    await supabaseAdmin
      .from('checklist_templates')
      .update({ version: (tpl.version ?? 1) + 1, updated_at: new Date().toISOString() })
      .eq('id', templateId);

    res.status(201).json({ item });
  } catch (e: any) {
    console.error('[check POST /:storeId/templates/:templateId/items] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// PUT /api/check/:storeId/template-items/:itemId
router.put('/:storeId/template-items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId  = String(req.params.itemId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const fields = ['label', 'item_key', 'item_type', 'required', 'min_value', 'max_value',
      'unit', 'options', 'is_ccp', 'tracking_mode', 'frequency_per_day',
      'frequency_interval_minutes', 'deviation_action', 'sort_order'];

    for (const f of fields) {
      if (req.body?.[f] !== undefined) updates[f] = req.body[f];
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_template_items')
      .update(updates)
      .eq('id', itemId)
      .eq('store_id', storeId)
      .select('*')
      .maybeSingle();

    if (error) { res.status(500).json({ error: error.message }); return; }
    if (!data)  { res.status(404).json({ error: '項目が見つかりません' }); return; }

    // テンプレートのバージョンをインクリメント
    const { data: tpl } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, version')
      .eq('id', data.template_id)
      .maybeSingle();
    if (tpl) {
      await supabaseAdmin
        .from('checklist_templates')
        .update({ version: (tpl.version ?? 1) + 1, updated_at: new Date().toISOString() })
        .eq('id', tpl.id);
    }

    res.json({ item: data });
  } catch (e: any) {
    console.error('[check PUT /:storeId/template-items/:itemId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// DELETE /api/check/:storeId/template-items/:itemId
router.delete('/:storeId/template-items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId  = String(req.params.itemId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { data: item } = await supabaseAdmin
      .from('checklist_template_items')
      .select('template_id')
      .eq('id', itemId)
      .eq('store_id', storeId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from('checklist_template_items')
      .delete()
      .eq('id', itemId)
      .eq('store_id', storeId);

    if (error) { res.status(500).json({ error: error.message }); return; }

    if (item?.template_id) {
      const { data: tpl } = await supabaseAdmin
        .from('checklist_templates')
        .select('version')
        .eq('id', item.template_id)
        .maybeSingle();
      if (tpl) {
        await supabaseAdmin
          .from('checklist_templates')
          .update({ version: (tpl.version ?? 1) + 1, updated_at: new Date().toISOString() })
          .eq('id', item.template_id);
      }
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[check DELETE /:storeId/template-items/:itemId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── 割当（Assignments）────────────────────────────────────────────────────────

// GET /api/check/:storeId/assignments
router.get('/:storeId/assignments', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('checklist_assignments')
      .select('*')
      .eq('store_id', storeId)
      .order('timing', { ascending: true });

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ assignments: data || [] });
  } catch (e: any) {
    console.error('[check GET /:storeId/assignments] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// PUT /api/check/:storeId/assignments — 全置換
router.put('/:storeId/assignments', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const mappings = req.body?.mappings;
    if (!Array.isArray(mappings)) {
      res.status(400).json({ error: 'mappings は配列で指定してください' });
      return;
    }

    // バリデーション
    for (const m of mappings) {
      if (!isValidTiming(String(m?.timing ?? ''))) {
        res.status(400).json({ error: `timing が不正です: ${m?.timing}` });
        return;
      }
      if (!isValidScope(String(m?.scope ?? ''))) {
        res.status(400).json({ error: `scope が不正です: ${m?.scope}` });
        return;
      }
      if (!m?.template_id) {
        res.status(400).json({ error: 'template_id は必須です' });
        return;
      }
    }

    const { error: delErr } = await supabaseAdmin
      .from('checklist_assignments')
      .delete()
      .eq('store_id', storeId);

    if (delErr) { res.status(500).json({ error: delErr.message }); return; }

    if (mappings.length === 0) {
      res.json({ assignments: [] });
      return;
    }

    const toInsert = mappings.map((m: any) => ({
      store_id: storeId,
      timing: m.timing,
      scope: m.scope,
      shift_type: m.shift_type ?? null,
      template_id: m.template_id,
    }));

    const { data, error } = await supabaseAdmin
      .from('checklist_assignments')
      .insert(toInsert)
      .select('*');

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ assignments: data || [] });
  } catch (e: any) {
    console.error('[check PUT /:storeId/assignments] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── 実行時アクティブチェックリスト ───────────────────────────────────────────

// GET /api/check/:storeId/active?scope=personal&timing=clock_in&shift_type=morning
router.get('/:storeId/active', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId   = String(req.params.storeId);
    const timing    = String(req.query.timing ?? 'clock_in');
    const scope     = String(req.query.scope ?? 'personal');
    const shiftType = req.query.shift_type ? String(req.query.shift_type) : null;

    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    if (!isValidTiming(timing)) { res.status(400).json({ error: 'timing が不正です' }); return; }
    if (!isValidScope(scope))   { res.status(400).json({ error: 'scope が不正です' }); return; }

    // 割当を取得
    let assignQuery = supabaseAdmin
      .from('checklist_assignments')
      .select('template_id')
      .eq('store_id', storeId)
      .eq('timing', timing)
      .eq('scope', scope);

    if (shiftType) {
      assignQuery = assignQuery.or(`shift_type.is.null,shift_type.eq.${shiftType}`);
    } else {
      assignQuery = assignQuery.is('shift_type', null);
    }

    const { data: assignments, error: assignErr } = await assignQuery;
    if (assignErr) { res.status(500).json({ error: assignErr.message }); return; }

    let templateIds: string[] = (assignments || []).map((a: any) => a.template_id);

    // 割当が無い場合はフォールバック: is_active な base テンプレートを返す
    if (templateIds.length === 0) {
      const { data: fallbackTemplates, error: fbErr } = await supabaseAdmin
        .from('checklist_templates')
        .select('id')
        .eq('store_id', storeId)
        .eq('timing', timing)
        .eq('scope', scope)
        .eq('layer', 'base')
        .eq('is_active', true);

      if (fbErr) { res.status(500).json({ error: fbErr.message }); return; }
      templateIds = (fallbackTemplates || []).map((t: any) => t.id);
    }

    if (templateIds.length === 0) {
      res.json({ templates: [], merged_items: [] });
      return;
    }

    // テンプレート取得
    const { data: templates, error: tplErr } = await supabaseAdmin
      .from('checklist_templates')
      .select('*')
      .in('id', templateIds)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (tplErr) { res.status(500).json({ error: tplErr.message }); return; }

    // 項目取得
    const { data: items, error: itemErr } = await supabaseAdmin
      .from('checklist_template_items')
      .select('*')
      .in('template_id', templateIds)
      .order('sort_order', { ascending: true });

    if (itemErr) { res.status(500).json({ error: itemErr.message }); return; }

    const itemsByTemplate = (items || []).reduce((acc: any, item: any) => {
      if (!acc[item.template_id]) acc[item.template_id] = [];
      acc[item.template_id].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    const enrichedTemplates = (templates || []).map((t: any) => ({
      ...t,
      items: itemsByTemplate[t.id] || [],
    }));

    // base → shift の順にマージ
    const sorted = [...enrichedTemplates].sort((a, b) => {
      const layerOrder = { base: 0, shift: 1 };
      return (layerOrder[a.layer as 'base' | 'shift'] ?? 0) - (layerOrder[b.layer as 'base' | 'shift'] ?? 0);
    });

    const mergedItems = sorted.flatMap((t: any) =>
      (t.items || []).map((item: any) => ({
        ...item,
        template_id: t.id,
        template_name: t.name,
        template_layer: t.layer,
      }))
    );

    res.json({ templates: enrichedTemplates, merged_items: mergedItems });
  } catch (e: any) {
    console.error('[check GET /:storeId/active] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── チェックリスト提出 ────────────────────────────────────────────────────────

// POST /api/check/:storeId/submissions
router.post('/:storeId/submissions', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const {
      scope, timing, template_id, membership_id, session_id, shift_slot_id,
      responsible_membership_id, items,
    } = req.body ?? {};

    if (!isValidTiming(String(timing ?? ''))) {
      res.status(400).json({ error: 'timing が不正です' });
      return;
    }
    if (!isValidScope(String(scope ?? ''))) {
      res.status(400).json({ error: 'scope が不正です' });
      return;
    }
    if (!template_id) {
      res.status(400).json({ error: 'template_id は必須です' });
      return;
    }
    if (!membership_id) {
      res.status(400).json({ error: 'membership_id は必須です' });
      return;
    }
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'items は配列で指定してください' });
      return;
    }

    const auditLevel = await getAuditLevel(storeId);

    // audit_level 検証
    if (auditLevel === 'shift' && !responsible_membership_id) {
      res.status(400).json({ error: 'audit_level=shift では responsible_membership_id が必須です' });
      return;
    }
    if (auditLevel === 'item' || auditLevel === 'approval') {
      const allHaveCheckedBy = items.every((item: any) => item.checked_by);
      if (!allHaveCheckedBy) {
        res.status(400).json({ error: 'audit_level=item 以上では各項目に checked_by が必須です' });
        return;
      }
    }

    // テンプレート取得（バージョン + スナップショット用）
    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from('checklist_templates')
      .select('*')
      .eq('id', template_id)
      .eq('store_id', storeId)
      .maybeSingle();

    if (tplErr || !tpl) {
      res.status(404).json({ error: 'テンプレートが見つかりません' });
      return;
    }

    const { data: tplItems } = await supabaseAdmin
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', template_id)
      .order('sort_order', { ascending: true });

    const itemMap = new Map((tplItems || []).map((i: any) => [i.id, i]));

    // 各 item の passed 計算 + 逸脱フラグ
    const processedItems: any[] = [];
    let allPassed = true;
    let hasDeviation = false;

    for (const item of items) {
      const tplItem = itemMap.get(item.template_item_id);
      const passed = tplItem ? calcPassed(tplItem, item) : null;

      if (passed === false && tplItem?.required) {
        allPassed = false;
        if (tplItem?.is_ccp) hasDeviation = true;
        else if (passed === false) hasDeviation = true;
      }

      processedItems.push({
        item_key: item.item_key ?? tplItem?.item_key ?? 'unknown',
        template_item_id: item.template_item_id ?? null,
        bool_value: item.bool_value ?? null,
        numeric_value: item.numeric_value ?? null,
        text_value: item.text_value ?? null,
        select_value: item.select_value ?? null,
        file_path: item.file_path ?? null,
        checked_by: item.checked_by ?? null,
        checked_at: item.checked_at ?? null,
        passed,
        tplItem,
      });
    }

    // approval レベルの場合、提出時点では all_passed = false (承認後に true になる)
    const finalAllPassed = auditLevel === 'approval' ? false : allPassed;

    // スナップショット作成
    const snapshot = {
      template: { id: tpl.id, name: tpl.name, version: tpl.version, timing: tpl.timing, scope: tpl.scope },
      items: (tplItems || []).map((i: any) => ({
        id: i.id, item_key: i.item_key, label: i.label, item_type: i.item_type,
        required: i.required, min_value: i.min_value, max_value: i.max_value,
        unit: i.unit, is_ccp: i.is_ccp,
      })),
    };

    // submission 挿入
    const { data: submission, error: subErr } = await supabaseAdmin
      .from('checklist_submissions')
      .insert({
        store_id: storeId,
        membership_id,
        session_id: session_id ?? null,
        shift_slot_id: shift_slot_id ?? null,
        timing,
        scope,
        template_id,
        template_version: tpl.version,
        all_passed: finalAllPassed,
        has_deviation: hasDeviation,
        responsible_membership_id: responsible_membership_id ?? null,
        submitted_at: new Date().toISOString(),
        submitted_by: req.user!.id,
        snapshot,
      })
      .select('*')
      .single();

    if (subErr || !submission) {
      res.status(500).json({ error: subErr?.message || '提出に失敗しました' });
      return;
    }

    // submission_items 挿入 + measurement 同時挿入
    const deviationsToInsert: any[] = [];

    for (const pi of processedItems) {
      let measurementId: string | null = null;

      if (pi.tplItem && (pi.tplItem.tracking_mode === 'both' || pi.tplItem.tracking_mode === 'measurement_only')) {
        const { data: meas, error: measErr } = await supabaseAdmin
          .from('checklist_measurements')
          .insert({
            store_id: storeId,
            template_item_id: pi.template_item_id ?? null,
            item_key: pi.item_key,
            bool_value: pi.bool_value,
            numeric_value: pi.numeric_value,
            text_value: pi.text_value,
            passed: pi.passed,
            measured_at: new Date().toISOString(),
            source: 'manual',
            context: { submission_id: submission.id },
          })
          .select('id')
          .single();

        if (!measErr && meas) measurementId = meas.id;
      }

      await supabaseAdmin.from('checklist_submission_items').insert({
        store_id: storeId,
        submission_id: submission.id,
        template_item_id: pi.template_item_id ?? null,
        item_key: pi.item_key,
        bool_value: pi.bool_value,
        numeric_value: pi.numeric_value,
        text_value: pi.text_value,
        select_value: pi.select_value,
        file_path: pi.file_path,
        passed: pi.passed,
        measurement_id: measurementId,
        checked_by: pi.checked_by ?? null,
        checked_at: pi.checked_at ?? null,
      });

      // 逸脱登録
      if (pi.passed === false && pi.tplItem) {
        const severity = pi.tplItem.is_ccp ? 'ccp' : 'warning';
        const detectedValue = pi.numeric_value != null ? String(pi.numeric_value)
          : pi.bool_value != null ? String(pi.bool_value)
          : (pi.text_value ?? '');
        deviationsToInsert.push({
          store_id: storeId,
          submission_id: submission.id,
          template_item_id: pi.template_item_id ?? null,
          item_key: pi.item_key,
          severity,
          status: 'open',
          detected_value: detectedValue,
          description: pi.tplItem.deviation_action ?? null,
          measurement_id: measurementId,
        });
      }
    }

    if (deviationsToInsert.length > 0) {
      await supabaseAdmin.from('checklist_deviations').insert(deviationsToInsert);
    }

    res.status(201).json({ submission });
  } catch (e: any) {
    console.error('[check POST /:storeId/submissions] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// GET /api/check/:storeId/submissions?from=&to=&scope=&membership_id=
router.get('/:storeId/submissions', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    let query = supabaseAdmin
      .from('checklist_submissions')
      .select('*')
      .eq('store_id', storeId)
      .order('submitted_at', { ascending: false });

    if (req.query.from) query = query.gte('submitted_at', `${req.query.from}T00:00:00`);
    if (req.query.to)   query = query.lte('submitted_at', `${req.query.to}T23:59:59`);
    if (req.query.scope && isValidScope(String(req.query.scope))) {
      query = query.eq('scope', String(req.query.scope));
    }
    if (req.query.membership_id) query = query.eq('membership_id', String(req.query.membership_id));
    if (req.query.timing && isValidTiming(String(req.query.timing))) {
      query = query.eq('timing', String(req.query.timing));
    }

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ submissions: data || [] });
  } catch (e: any) {
    console.error('[check GET /:storeId/submissions] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── 測定層（時系列）─────────────────────────────────────────────────────────

// GET /api/check/:storeId/measurements/daily-summary?date=&item_key=
router.get('/:storeId/measurements/daily-summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const date    = String(req.query.date ?? new Date().toISOString().slice(0, 10));
    const itemKey = req.query.item_key ? String(req.query.item_key) : null;

    let query = supabaseAdmin
      .from('checklist_measurements')
      .select('numeric_value, passed, item_key')
      .eq('store_id', storeId)
      .gte('measured_at', `${date}T00:00:00`)
      .lte('measured_at', `${date}T23:59:59`);

    if (itemKey) query = query.eq('item_key', itemKey);

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }

    const rows = data || [];
    const numericRows = rows.filter((r: any) => r.numeric_value != null);
    const numericValues = numericRows.map((r: any) => Number(r.numeric_value));

    const summary = {
      date,
      item_key: itemKey,
      count: rows.length,
      numeric_count: numericRows.length,
      min: numericValues.length ? Math.min(...numericValues) : null,
      max: numericValues.length ? Math.max(...numericValues) : null,
      avg: numericValues.length ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length : null,
      deviation_count: rows.filter((r: any) => r.passed === false).length,
    };

    res.json({ summary });
  } catch (e: any) {
    console.error('[check GET /:storeId/measurements/daily-summary] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// GET /api/check/:storeId/measurements?item_key=&from=&to=
router.get('/:storeId/measurements', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    let query = supabaseAdmin
      .from('checklist_measurements')
      .select('*')
      .eq('store_id', storeId)
      .order('measured_at', { ascending: false });

    if (req.query.item_key) query = query.eq('item_key', String(req.query.item_key));
    if (req.query.from)     query = query.gte('measured_at', `${req.query.from}T00:00:00`);
    if (req.query.to)       query = query.lte('measured_at', `${req.query.to}T23:59:59`);

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ measurements: data || [] });
  } catch (e: any) {
    console.error('[check GET /:storeId/measurements] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// POST /api/check/:storeId/measurements — 単発測定記録
router.post('/:storeId/measurements', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { item_key, numeric_value, bool_value, text_value, measured_at, source, context, template_item_id } = req.body ?? {};

    if (!item_key) {
      res.status(400).json({ error: 'item_key は必須です' });
      return;
    }

    // passed の自動判定（template_item の min/max から）
    let passed: boolean | null = null;
    if (template_item_id) {
      const { data: tplItem } = await supabaseAdmin
        .from('checklist_template_items')
        .select('item_type, min_value, max_value')
        .eq('id', template_item_id)
        .maybeSingle();
      if (tplItem) {
        passed = calcPassed(tplItem, { bool_value, numeric_value, text_value });
      }
    } else if (numeric_value != null) {
      // item_key から判定は省略（min/max が不明）
      passed = null;
    } else if (bool_value != null) {
      passed = bool_value === true;
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_measurements')
      .insert({
        store_id: storeId,
        template_item_id: template_item_id ?? null,
        item_key,
        numeric_value: numeric_value ?? null,
        bool_value: bool_value ?? null,
        text_value: text_value ?? null,
        passed,
        measured_at: measured_at ?? new Date().toISOString(),
        source: source && ['manual','sensor','import'].includes(source) ? source : 'manual',
        context: context ?? {},
      })
      .select('*')
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.status(201).json({ measurement: data });
  } catch (e: any) {
    console.error('[check POST /:storeId/measurements] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── 逸脱 ─────────────────────────────────────────────────────────────────────

// GET /api/check/:storeId/deviations?status=open
router.get('/:storeId/deviations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    let query = supabaseAdmin
      .from('checklist_deviations')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (req.query.status) query = query.eq('status', String(req.query.status));
    if (req.query.severity) query = query.eq('severity', String(req.query.severity));

    const { data, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ deviations: data || [] });
  } catch (e: any) {
    console.error('[check GET /:storeId/deviations] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// POST /api/check/:storeId/deviations — 手動逸脱報告
router.post('/:storeId/deviations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { item_key, severity, description, detected_value, submission_id, template_item_id } = req.body ?? {};

    if (!item_key) {
      res.status(400).json({ error: 'item_key は必須です' });
      return;
    }
    const sev = String(severity ?? 'warning');
    if (!VALID_SEVERITIES.includes(sev as any)) {
      res.status(400).json({ error: 'severity は info / warning / ccp を指定してください' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_deviations')
      .insert({
        store_id: storeId,
        submission_id: submission_id ?? null,
        template_item_id: template_item_id ?? null,
        item_key,
        severity: sev,
        status: 'open',
        detected_value: detected_value ?? null,
        description: description ?? null,
      })
      .select('*')
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.status(201).json({ deviation: data });
  } catch (e: any) {
    console.error('[check POST /:storeId/deviations] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// PUT /api/check/:storeId/deviations/:deviationId — 是正措置・承認・クローズ
router.put('/:storeId/deviations/:deviationId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId     = String(req.params.storeId);
    const deviationId = String(req.params.deviationId);
    const membership  = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (req.body?.corrective_action !== undefined) {
      updates.corrective_action = req.body.corrective_action;
      updates.corrected_by      = req.user!.id;
      updates.corrected_at      = new Date().toISOString();
      if (req.body?.status !== 'approved' && req.body?.status !== 'closed') {
        updates.status = 'corrected';
      }
    }
    if (req.body?.status !== undefined) {
      updates.status = req.body.status;
      if (req.body.status === 'approved') {
        updates.approved_by  = req.user!.id;
        updates.approved_at  = new Date().toISOString();
      }
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_deviations')
      .update(updates)
      .eq('id', deviationId)
      .eq('store_id', storeId)
      .select('*')
      .maybeSingle();

    if (error) { res.status(500).json({ error: error.message }); return; }
    if (!data)  { res.status(404).json({ error: '逸脱記録が見つかりません' }); return; }

    res.json({ deviation: data });
  } catch (e: any) {
    console.error('[check PUT /:storeId/deviations/:deviationId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── プラグイン登録 ────────────────────────────────────────────────────────────

export const checkPlugin: Plugin = {
  name: 'check',
  version: '2.0.0',
  description: 'HACCP 準拠チェックリスト・測定・逸脱管理（v2）',
  label: 'チェックリスト',
  icon: '✅',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/check', router);
  },
};
