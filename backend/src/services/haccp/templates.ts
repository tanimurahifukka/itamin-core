/**
 * HACCP テンプレート系ルータ
 *
 * - システムテンプレート (マスタ)
 * - 店舗テンプレート CRUD
 * - テンプレート項目 CRUD
 * - 割当 (checklist_assignments)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { supabaseAdmin } from '../../config/supabase';
import { requireStoreMembership, requireManagedStore } from '../../auth/authorization';
import {
  VALID_ITEM_TYPES,
  VALID_TRACKING_MODES,
  isValidTiming,
  isValidScope,
  isValidLayer,
} from './helpers';

export const templatesRouter = Router();

// ── プロビジョニング ───────────────────────────────────────────────────────────

/**
 * Provision system templates for a store.
 *
 * Copies all active system templates matching `category` (= business_type) into
 * the store's `checklist_templates` / `checklist_template_items`.  Already-imported
 * templates (identified by `system_template_id`) are skipped, so calling this
 * function multiple times is idempotent.
 *
 * @param storeId  Target store UUID
 * @param category Business type to filter system templates (e.g. 'cafe')
 * @param userId   Optional user UUID for `created_by` / `updated_by`. Pass undefined for kiosk-triggered calls.
 * @returns Number of newly created templates
 */
export async function provisionSystemTemplates(
  storeId: string,
  category: string,
  userId?: string,
): Promise<number> {
  // 1. Fetch all active system templates for the given category
  const { data: systemTemplates, error: sysErr } = await supabaseAdmin
    .from('checklist_system_templates')
    .select('*')
    .eq('business_type', category)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (sysErr) {
    throw new Error(`Failed to fetch system templates: ${sysErr.message}`);
  }
  if (!systemTemplates || systemTemplates.length === 0) {
    return 0;
  }

  // 2. Fetch system template items in one batch
  const sysTemplateIds = systemTemplates.map((t: any) => t.id);
  const { data: systemItems, error: siErr } = await supabaseAdmin
    .from('checklist_system_template_items')
    .select('*')
    .in('system_template_id', sysTemplateIds)
    .order('sort_order', { ascending: true });

  if (siErr) {
    throw new Error(`Failed to fetch system template items: ${siErr.message}`);
  }

  const itemsBySystemTemplate = ((systemItems || []) as any[]).reduce(
    (acc: Record<string, any[]>, item: any) => {
      if (!acc[item.system_template_id]) acc[item.system_template_id] = [];
      acc[item.system_template_id].push(item);
      return acc;
    },
    {},
  );

  // 3. Fetch already-provisioned system_template_ids for this store
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('checklist_templates')
    .select('system_template_id')
    .eq('store_id', storeId)
    .in('system_template_id', sysTemplateIds);

  if (exErr) {
    throw new Error(`Failed to fetch existing templates: ${exErr.message}`);
  }

  const alreadyProvisioned = new Set(
    ((existing || []) as any[])
      .map((t: any) => t.system_template_id)
      .filter(Boolean),
  );

  // 4. Insert missing templates and their items
  let created = 0;
  for (const sys of systemTemplates as any[]) {
    if (alreadyProvisioned.has(sys.id)) continue;

    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from('checklist_templates')
      .insert({
        store_id: storeId,
        system_template_id: sys.id,
        name: sys.name,
        timing: sys.timing,
        scope: sys.scope,
        layer: sys.layer,
        description: sys.description,
        version: 1,
        created_by: userId ?? null,
        updated_by: userId ?? null,
      })
      .select('*')
      .single();

    if (tplErr || !tpl) {
      throw new Error(`Failed to create template for system_template_id ${sys.id}: ${tplErr?.message}`);
    }

    const tplId = (tpl as any).id;
    const sysItems: any[] = itemsBySystemTemplate[sys.id] || [];
    if (sysItems.length > 0) {
      const itemsToInsert = sysItems.map((si: any) => ({
        store_id: storeId,
        template_id: tplId,
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
        // Rollback: remove orphaned template row to keep idempotency intact
        await supabaseAdmin.from('checklist_templates').delete().eq('id', tplId);
        throw new Error(`Failed to insert items for template ${tplId}: ${itemErr.message}`);
      }
    }

    created++;
  }

  return created;
}

// ── システムテンプレート ──────────────────────────────────────────────────────

// GET /api/haccp/system-templates?business_type=cafe
templatesRouter.get('/system-templates', requireAuth, async (req: Request, res: Response) => {
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
    console.error('[haccp GET /system-templates] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── 店舗テンプレート ──────────────────────────────────────────────────────────

// GET /api/haccp/:storeId/templates?scope=&timing=&layer=
templatesRouter.get('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
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
    if (req.query.layer && isValidLayer(String(req.query.layer))) {
      query = query.eq('layer', String(req.query.layer));
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ templates: data || [] });
  } catch (e: any) {
    console.error('[haccp GET /:storeId/templates] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// POST /api/haccp/:storeId/templates/provision-all
// Provisions all system templates for the store (owner/manager only).
// Idempotent: already-imported templates are skipped.
templatesRouter.post('/:storeId/templates/provision-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    // TODO: read business_type from stores table instead of hardcoding 'cafe'
    // when multi-industry support is added
    const provisioned = await provisionSystemTemplates(storeId, 'cafe', req.user!.id);
    res.json({ ok: true, provisioned });
  } catch (e: any) {
    console.error('[haccp POST /:storeId/templates/provision-all] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// POST /api/haccp/:storeId/templates/from-system
templatesRouter.post('/:storeId/templates/from-system', requireAuth, async (req: Request, res: Response) => {
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

    const { data: createdItems } = await supabaseAdmin
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', tpl.id)
      .order('sort_order', { ascending: true });

    res.status(201).json({ template: { ...tpl, items: createdItems || [] } });
  } catch (e: any) {
    console.error('[haccp POST /:storeId/templates/from-system] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// POST /api/haccp/:storeId/templates
templatesRouter.post('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const timing = String(req.body?.timing ?? '');
    const scope = String(req.body?.scope ?? 'personal');
    const layer = String(req.body?.layer ?? 'base');

    if (!name) { res.status(400).json({ error: 'name は必須です' }); return; }
    if (!isValidTiming(timing)) { res.status(400).json({ error: 'timing が不正です' }); return; }
    if (!isValidScope(scope)) { res.status(400).json({ error: 'scope は store または personal を指定してください' }); return; }
    if (!isValidLayer(layer)) { res.status(400).json({ error: 'layer は base または shift を指定してください' }); return; }

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
    console.error('[haccp POST /:storeId/templates] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// GET /api/haccp/:storeId/templates/:templateId
templatesRouter.get('/:storeId/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
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
    if (!tpl) { res.status(404).json({ error: 'テンプレートが見つかりません' }); return; }

    const { data: items } = await supabaseAdmin
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true });

    res.json({ template: { ...tpl, items: items || [] } });
  } catch (e: any) {
    console.error('[haccp GET /:storeId/templates/:templateId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// PUT /api/haccp/:storeId/templates/:templateId
templatesRouter.put('/:storeId/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
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
      if (!isValidLayer(String(req.body.layer))) { res.status(400).json({ error: 'layer が不正です' }); return; }
      updates.layer = req.body.layer;
    }
    if (req.body?.description !== undefined) updates.description = req.body.description;
    if (req.body?.is_active !== undefined) updates.is_active = Boolean(req.body.is_active);

    const { data: cur, error: curErr } = await supabaseAdmin
      .from('checklist_templates')
      .select('version')
      .eq('id', templateId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (curErr || !cur) { res.status(404).json({ error: 'テンプレートが見つかりません' }); return; }

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
    if (!data) { res.status(404).json({ error: 'テンプレートが見つかりません' }); return; }

    res.json({ template: data });
  } catch (e: any) {
    console.error('[haccp PUT /:storeId/templates/:templateId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// DELETE /api/haccp/:storeId/templates/:templateId
templatesRouter.delete('/:storeId/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
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
    console.error('[haccp DELETE /:storeId/templates/:templateId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── テンプレート項目 ──────────────────────────────────────────────────────────

// POST /api/haccp/:storeId/templates/:templateId/items
templatesRouter.post('/:storeId/templates/:templateId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const templateId = String(req.params.templateId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    const itemKey = typeof req.body?.item_key === 'string' ? req.body.item_key.trim() : '';
    const itemType = String(req.body?.item_type ?? 'checkbox');

    if (!label) { res.status(400).json({ error: 'label は必須です' }); return; }
    if (!VALID_ITEM_TYPES.includes(itemType as any)) { res.status(400).json({ error: 'item_type が不正です' }); return; }

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
        switchbot_device_id: req.body?.switchbot_device_id ?? null,
      })
      .select('*')
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    await supabaseAdmin
      .from('checklist_templates')
      .update({ version: (tpl.version ?? 1) + 1, updated_at: new Date().toISOString() })
      .eq('id', templateId);

    res.status(201).json({ item });
  } catch (e: any) {
    console.error('[haccp POST /:storeId/templates/:templateId/items] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// PUT /api/haccp/:storeId/template-items/:itemId
templatesRouter.put('/:storeId/template-items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId = String(req.params.itemId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const fields = ['label', 'item_key', 'item_type', 'required', 'min_value', 'max_value',
      'unit', 'options', 'is_ccp', 'tracking_mode', 'frequency_per_day',
      'frequency_interval_minutes', 'deviation_action', 'sort_order', 'switchbot_device_id'];

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
    if (!data) { res.status(404).json({ error: '項目が見つかりません' }); return; }

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
    console.error('[haccp PUT /:storeId/template-items/:itemId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// DELETE /api/haccp/:storeId/template-items/:itemId
templatesRouter.delete('/:storeId/template-items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId = String(req.params.itemId);
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
    console.error('[haccp DELETE /:storeId/template-items/:itemId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── 割当 ──────────────────────────────────────────────────────────────────────

// GET /api/haccp/:storeId/assignments
templatesRouter.get('/:storeId/assignments', requireAuth, async (req: Request, res: Response) => {
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
    console.error('[haccp GET /:storeId/assignments] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// PUT /api/haccp/:storeId/assignments
templatesRouter.put('/:storeId/assignments', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const mappings = req.body?.mappings;
    if (!Array.isArray(mappings)) {
      res.status(400).json({ error: 'mappings は配列で指定してください' });
      return;
    }

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
    console.error('[haccp PUT /:storeId/assignments] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});
