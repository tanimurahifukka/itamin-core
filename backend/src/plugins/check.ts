import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireStoreMembership, requireManagedStore } from '../auth/authorization';

const router = Router();
const VALID_TIMINGS = ['clock_in', 'clock_out'] as const;
const VALID_LAYERS = ['base', 'shift'] as const;

type ChecklistTiming = typeof VALID_TIMINGS[number];
type ChecklistLayer = typeof VALID_LAYERS[number];

interface ChecklistTemplateItem {
  label: string;
  category?: string;
}

function isValidTiming(value: string): value is ChecklistTiming {
  return VALID_TIMINGS.includes(value as ChecklistTiming);
}

function isValidLayer(value: string): value is ChecklistLayer {
  return VALID_LAYERS.includes(value as ChecklistLayer);
}

function isValidTemplateItem(item: unknown): item is ChecklistTemplateItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as Record<string, unknown>;
  return typeof candidate.label === 'string'
    && candidate.label.trim().length > 0
    && (candidate.category === undefined || typeof candidate.category === 'string');
}

function normalizeTemplate(template: any) {
  return {
    id: template.id,
    store_id: template.store_id,
    name: template.name,
    layer: template.layer,
    timing: template.timing,
    items: Array.isArray(template.items) ? template.items : [],
    sort_order: template.sort_order ?? 0,
    created_at: template.created_at,
  };
}

function mergeChecklistItems(templates: any[]) {
  return templates.flatMap((template) => (
    Array.isArray(template.items)
      ? template.items.map((item: any) => ({
        ...item,
        template_id: template.id,
        template_name: template.name,
        layer: template.layer,
        timing: template.timing,
        sort_order: template.sort_order ?? 0,
      }))
      : []
  ));
}

// チェックリスト取得（store_id + timing）
router.get('/checklists/:storeId/:timing', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const timing = String(req.params.timing);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    if (!isValidTiming(timing)) {
      res.status(400).json({ error: 'timing は clock_in または clock_out を指定してください' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('checklists')
      .select('*')
      .eq('store_id', storeId)
      .eq('timing', timing)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // チェックリストが未登録の場合は空のリストを返す
    const checklist = data || {
      id: null,
      store_id: storeId,
      timing,
      items: [],
    };

    res.json({ checklist });
  } catch (e: any) {
    console.error('[check GET /checklists/:storeId/:timing] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// チェックリスト更新（upsert）— manager以上のみ
router.put('/checklists/:storeId/:timing', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const timing = String(req.params.timing);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const items = req.body?.items;

    if (!isValidTiming(timing)) {
      res.status(400).json({ error: 'timing は clock_in または clock_out を指定してください' });
      return;
    }

    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'items は配列で指定してください' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('checklists')
      .upsert({
        store_id: storeId,
        timing,
        items,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'store_id,timing' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ checklist: data });
  } catch (e: any) {
    console.error('[check PUT /checklists/:storeId/:timing] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// テンプレート一覧
router.get('/templates/:storeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .select('*')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ templates: (data || []).map(normalizeTemplate) });
  } catch (e: any) {
    console.error('[check GET /templates/:storeId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// テンプレート作成
router.post('/templates/:storeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const layer = String(req.body?.layer ?? '');
    const timing = String(req.body?.timing ?? '');
    const sortOrder = Number.isInteger(req.body?.sort_order) ? req.body.sort_order : 0;
    const items = req.body?.items;

    if (!name) {
      res.status(400).json({ error: 'name は必須です' });
      return;
    }

    if (!isValidLayer(layer)) {
      res.status(400).json({ error: 'layer は base または shift を指定してください' });
      return;
    }

    if (!isValidTiming(timing)) {
      res.status(400).json({ error: 'timing は clock_in または clock_out を指定してください' });
      return;
    }

    if (!Array.isArray(items) || !items.every(isValidTemplateItem)) {
      res.status(400).json({ error: 'items は { label: string, category?: string } の配列で指定してください' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .insert({
        store_id: storeId,
        name,
        layer,
        timing,
        items,
        sort_order: sortOrder,
      })
      .select('*')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ template: normalizeTemplate(data) });
  } catch (e: any) {
    console.error('[check POST /templates/:storeId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// テンプレート更新
router.put('/templates/:storeId/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const templateId = String(req.params.templateId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const updates: Record<string, unknown> = {};

    if (req.body?.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
        res.status(400).json({ error: 'name は空でない文字列で指定してください' });
        return;
      }
      updates.name = req.body.name.trim();
    }

    if (req.body?.layer !== undefined) {
      if (!isValidLayer(String(req.body.layer))) {
        res.status(400).json({ error: 'layer は base または shift を指定してください' });
        return;
      }
      updates.layer = req.body.layer;
    }

    if (req.body?.timing !== undefined) {
      if (!isValidTiming(String(req.body.timing))) {
        res.status(400).json({ error: 'timing は clock_in または clock_out を指定してください' });
        return;
      }
      updates.timing = req.body.timing;
    }

    if (req.body?.sort_order !== undefined) {
      if (!Number.isInteger(req.body.sort_order)) {
        res.status(400).json({ error: 'sort_order は整数で指定してください' });
        return;
      }
      updates.sort_order = req.body.sort_order;
    }

    if (req.body?.items !== undefined) {
      if (!Array.isArray(req.body.items) || !req.body.items.every(isValidTemplateItem)) {
        res.status(400).json({ error: 'items は { label: string, category?: string } の配列で指定してください' });
        return;
      }
      updates.items = req.body.items;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: '更新対象の項目がありません' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .update(updates)
      .eq('id', templateId)
      .eq('store_id', storeId)
      .select('*')
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ error: 'template が見つかりません' });
      return;
    }

    res.json({ template: normalizeTemplate(data) });
  } catch (e: any) {
    console.error('[check PUT /templates/:storeId/:templateId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// テンプレート削除
router.delete('/templates/:storeId/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const templateId = String(req.params.templateId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('checklist_templates')
      .delete()
      .eq('id', templateId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[check DELETE /templates/:storeId/:templateId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// シフト用結合チェックリスト取得
router.get('/templates/:storeId/for-shift/:shiftType/:timing', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const shiftType = String(req.params.shiftType);
    const timing = String(req.params.timing);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    if (!isValidTiming(timing)) {
      res.status(400).json({ error: 'timing は clock_in または clock_out を指定してください' });
      return;
    }

    // シフト紐付けを確認
    // シフト紐付けを確認（joinなし）
    const { data: shiftMaps, error: mapError } = await supabaseAdmin
      .from('shift_checklist_map')
      .select('id, shift_type, template_id')
      .eq('store_id', storeId)
      .eq('shift_type', shiftType);

    if (mapError) {
      console.error('[check for-shift] map error:', mapError);
      res.status(500).json({ error: mapError.message });
      return;
    }

    const hasShiftMapping = (shiftMaps || []).length > 0;

    let allTemplates: any[];

    if (hasShiftMapping) {
      // シフト紐付けあり: base + 紐付けされたshiftテンプレート
      const shiftTemplateIds = (shiftMaps || []).map((m: any) => m.template_id);

      const { data: allData, error: allError } = await supabaseAdmin
        .from('checklist_templates')
        .select('*')
        .eq('store_id', storeId)
        .eq('timing', timing)
        .or(`layer.eq.base,id.in.(${shiftTemplateIds.join(',')})`)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (allError) {
        res.status(500).json({ error: allError.message });
        return;
      }
      allTemplates = allData || [];
    } else {
      // シフト紐付けなし: baseテンプレートのみ
      const { data: baseOnly, error: baseOnlyError } = await supabaseAdmin
        .from('checklist_templates')
        .select('*')
        .eq('store_id', storeId)
        .eq('layer', 'base')
        .eq('timing', timing)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (baseOnlyError) {
        res.status(500).json({ error: baseOnlyError.message });
        return;
      }
      allTemplates = baseOnly || [];
    }

    const templates = allTemplates
      .sort((a, b) => {
        const sortDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (sortDiff !== 0) {
          return sortDiff;
        }
        return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
      })
      .map(normalizeTemplate);

    res.json({
      store_id: storeId,
      shift_type: shiftType,
      timing,
      templates,
      items: mergeChecklistItems(templates),
    });
  } catch (e: any) {
    console.error('[check GET /templates/:storeId/for-shift/:shiftType/:timing] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// シフト×テンプレート紐付け一覧
router.get('/shift-map/:storeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data: mapData, error: mapError } = await supabaseAdmin
      .from('shift_checklist_map')
      .select('id, store_id, shift_type, template_id')
      .eq('store_id', storeId)
      .order('shift_type', { ascending: true });

    if (mapError) {
      console.error('[check GET /shift-map] error:', mapError);
      res.status(500).json({ error: mapError.message });
      return;
    }

    // テンプレート情報を別クエリで取得
    const templateIds = [...new Set((mapData || []).map((m: any) => m.template_id))];
    let templateMap = new Map<string, any>();
    if (templateIds.length > 0) {
      const { data: tplData } = await supabaseAdmin
        .from('checklist_templates')
        .select('*')
        .in('id', templateIds);
      (tplData || []).forEach((t: any) => templateMap.set(t.id, normalizeTemplate(t)));
    }

    const maps = (mapData || []).map((entry: any) => ({
      id: entry.id,
      store_id: entry.store_id,
      shift_type: entry.shift_type,
      template_id: entry.template_id,
      template: templateMap.get(entry.template_id) || null,
    }));

    res.json({ mappings: maps });
  } catch (e: any) {
    console.error('[check GET /shift-map/:storeId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// シフト×テンプレート紐付け更新（全置換）
router.put('/shift-map/:storeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const mappings = req.body?.mappings;
    if (!Array.isArray(mappings)) {
      res.status(400).json({ error: 'mappings は配列で指定してください' });
      return;
    }

    const normalizedMappings = mappings.map((mapping: any) => ({
      shift_type: typeof mapping?.shift_type === 'string' ? mapping.shift_type.trim() : '',
      template_id: typeof mapping?.template_id === 'string' ? mapping.template_id.trim() : '',
    }));

    const hasInvalid = normalizedMappings.some((mapping) => !mapping.shift_type || !mapping.template_id);
    if (hasInvalid) {
      res.status(400).json({ error: 'mappings は { shift_type: string, template_id: string } の配列で指定してください' });
      return;
    }

    const templateIds = Array.from(new Set(normalizedMappings.map((mapping) => mapping.template_id)));
    if (templateIds.length > 0) {
      const { data: templates, error: templateError } = await supabaseAdmin
        .from('checklist_templates')
        .select('id')
        .eq('store_id', storeId)
        .in('id', templateIds);

      if (templateError) {
        res.status(500).json({ error: templateError.message });
        return;
      }

      const foundIds = new Set((templates || []).map((template: any) => template.id));
      const missingId = templateIds.find((id) => !foundIds.has(id));
      if (missingId) {
        res.status(400).json({ error: `template_id が不正です: ${missingId}` });
        return;
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('shift_checklist_map')
      .delete()
      .eq('store_id', storeId);

    if (deleteError) {
      res.status(500).json({ error: deleteError.message });
      return;
    }

    if (normalizedMappings.length === 0) {
      res.json({ mappings: [] });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('shift_checklist_map')
      .insert(normalizedMappings.map((mapping) => ({
        store_id: storeId,
        shift_type: mapping.shift_type,
        template_id: mapping.template_id,
      })))
      .select('id, store_id, shift_type, template_id');

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // テンプレート情報を別クエリで取得
    const tplIds = [...new Set((data || []).map((m: any) => m.template_id))];
    let tplMap = new Map<string, any>();
    if (tplIds.length > 0) {
      const { data: tplData } = await supabaseAdmin
        .from('checklist_templates')
        .select('*')
        .in('id', tplIds);
      (tplData || []).forEach((t: any) => tplMap.set(t.id, normalizeTemplate(t)));
    }

    const result = (data || []).map((entry: any) => ({
      id: entry.id,
      store_id: entry.store_id,
      shift_type: entry.shift_type,
      template_id: entry.template_id,
      template: tplMap.get(entry.template_id) || null,
    }));

    res.json({ mappings: result });
  } catch (e: any) {
    console.error('[check PUT /shift-map/:storeId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// チェック記録保存
router.post('/records', requireAuth, async (req: Request, res: Response) => {
  try {
    const store_id = req.body?.store_id;
    const staff_id = req.body?.staff_id;
    const timing = req.body?.timing;
    const results = req.body?.results;

    if (!store_id || !staff_id || !timing || !Array.isArray(results)) {
      res.status(400).json({ error: 'store_id, staff_id, timing, results は必須です' });
      return;
    }

    const membership = await requireStoreMembership(req, res, store_id);
    if (!membership) return;

    const all_checked = results.every((r: any) => r.checked);

    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('check_records')
      .insert({
        store_id,
        staff_id,
        user_id: userId,
        timing,
        results,
        all_checked,
        checked_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ record: data });
  } catch (e: any) {
    console.error('[check POST /records] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// チェック記録取得（日付フィルター対応）
router.get('/records/:storeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { start_date, end_date, staff_id } = req.query;

    let query = supabaseAdmin
      .from('check_records')
      .select('*')
      .eq('store_id', storeId)
      .order('checked_at', { ascending: false });

    if (start_date) {
      query = query.gte('checked_at', `${start_date}T00:00:00`);
    }
    if (end_date) {
      query = query.lte('checked_at', `${end_date}T23:59:59`);
    }
    if (staff_id) {
      query = query.eq('staff_id', staff_id as string);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ records: data || [] });
  } catch (e: any) {
    console.error('[check GET /records/:storeId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const checkPlugin: Plugin = {
  name: 'check',
  version: '0.1.0',
  description: 'HACCP準拠チェックリスト・記録管理',
  label: 'チェックリスト',
  icon: '✅',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/check', router);
  },
};
