import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import { requireManagedStore } from '../auth/authorization';

const router = Router();

// ============================================================
// ユーティリティ
// ============================================================
function toItemKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 30) + '_' + Date.now().toString(36);
}

// ============================================================
// GET /:storeId/templates - テンプレート一覧（アイテム含む）
// ============================================================
router.get('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { data: templates, error } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, store_id, name, timing, scope, version, is_active, description, sort_order, created_at, updated_at')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true });

    if (error) { res.status(500).json({ error: error.message }); return; }

    const ids = (templates || []).map((t: any) => t.id);
    const { data: items } = ids.length > 0
      ? await supabaseAdmin
          .from('checklist_template_items')
          .select('id, template_id, item_key, label, item_type, required, min_value, max_value, unit, options, sort_order')
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
// POST /:storeId/templates - テンプレート作成
// ============================================================
router.post('/:storeId/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { name, timing, description } = req.body ?? {};

    if (!name || !timing) {
      res.status(400).json({ error: 'name と timing は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .insert({
        store_id: storeId,
        name,
        timing,
        scope: 'store',
        description: description ?? null,
        is_active: true,
        version: 1,
      })
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.status(201).json({ ok: true, template: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// PUT /:storeId/templates/:id - テンプレート更新
// ============================================================
router.put('/:storeId/templates/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const templateId = req.params.id as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { name, timing, description, is_active, sort_order } = req.body ?? {};

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (timing !== undefined) updates.timing = timing;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data, error } = await supabaseAdmin
      .from('checklist_templates')
      .update(updates)
      .eq('id', templateId)
      .eq('store_id', storeId)
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ ok: true, template: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// DELETE /:storeId/templates/:id - テンプレート削除（CASCADE）
// ============================================================
router.delete('/:storeId/templates/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const templateId = req.params.id as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('checklist_templates')
      .delete()
      .eq('id', templateId)
      .eq('store_id', storeId);

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// POST /:storeId/templates/:id/items - アイテム追加
// ============================================================
router.post('/:storeId/templates/:id/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const templateId = req.params.id as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { label, item_type, required, min_value, max_value, unit, options, sort_order } = req.body ?? {};

    if (!label || !item_type) {
      res.status(400).json({ error: 'label と item_type は必須です' });
      return;
    }

    // テンプレートがこのstoreに属しているか確認
    const { data: tpl } = await supabaseAdmin
      .from('checklist_templates')
      .select('id')
      .eq('id', templateId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!tpl) {
      res.status(404).json({ error: 'テンプレートが見つかりません' });
      return;
    }

    const item_key = toItemKey(label);

    const { data, error } = await supabaseAdmin
      .from('checklist_template_items')
      .insert({
        store_id: storeId,
        template_id: templateId,
        item_key,
        label,
        item_type,
        required: required ?? false,
        min_value: min_value ?? null,
        max_value: max_value ?? null,
        unit: unit ?? null,
        options: options ?? null,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.status(201).json({ ok: true, item: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// PUT /:storeId/templates/:id/items/:itemId - アイテム更新
// ============================================================
router.put('/:storeId/templates/:id/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const templateId = req.params.id as string;
    const itemId = req.params.itemId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { label, item_type, required, min_value, max_value, unit, options, sort_order } = req.body ?? {};

    const updates: Record<string, any> = {};
    if (label !== undefined) updates.label = label;
    if (item_type !== undefined) updates.item_type = item_type;
    if (required !== undefined) updates.required = required;
    if (min_value !== undefined) updates.min_value = min_value;
    if (max_value !== undefined) updates.max_value = max_value;
    if (unit !== undefined) updates.unit = unit;
    if (options !== undefined) updates.options = options;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: '更新するフィールドを指定してください' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('checklist_template_items')
      .update(updates)
      .eq('id', itemId)
      .eq('template_id', templateId)
      .eq('store_id', storeId)
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ ok: true, item: data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// DELETE /:storeId/templates/:id/items/:itemId - アイテム削除
// ============================================================
router.delete('/:storeId/templates/:id/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const templateId = req.params.id as string;
    const itemId = req.params.itemId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('checklist_template_items')
      .delete()
      .eq('id', itemId)
      .eq('template_id', templateId)
      .eq('store_id', storeId);

    if (error) { res.status(500).json({ error: error.message }); return; }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// GET /:storeId/system-templates - システムテンプレート一覧（アイテム含む）
// ============================================================
router.get('/:storeId/system-templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { data: templates, error } = await supabaseAdmin
      .from('checklist_system_templates')
      .select('id, business_type, name, timing, scope, description, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) { res.status(500).json({ error: error.message }); return; }

    const ids = (templates || []).map((t: any) => t.id);
    const { data: items } = ids.length > 0
      ? await supabaseAdmin
          .from('checklist_system_template_items')
          .select('id, system_template_id, item_key, label, item_type, required, min_value, max_value, unit, options, sort_order')
          .in('system_template_id', ids)
          .order('sort_order', { ascending: true })
      : { data: [] };

    const itemsByTemplate = ((items || []) as any[]).reduce((acc: any, item: any) => {
      if (!acc[item.system_template_id]) acc[item.system_template_id] = [];
      acc[item.system_template_id].push(item);
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
// POST /:storeId/import/:systemTemplateId - システムテンプレートをstoreにコピー
// ============================================================
router.post('/:storeId/import/:systemTemplateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = req.params.storeId as string;
    const systemTemplateId = req.params.systemTemplateId as string;
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    // システムテンプレート取得
    const { data: sysTpl, error: sysTplErr } = await supabaseAdmin
      .from('checklist_system_templates')
      .select('id, name, timing, scope, description')
      .eq('id', systemTemplateId)
      .maybeSingle();

    if (sysTplErr) { res.status(500).json({ error: sysTplErr.message }); return; }
    if (!sysTpl) { res.status(404).json({ error: 'システムテンプレートが見つかりません' }); return; }

    // checklist_templatesにコピー
    const { data: newTpl, error: insertErr } = await supabaseAdmin
      .from('checklist_templates')
      .insert({
        store_id: storeId,
        name: sysTpl.name,
        timing: sysTpl.timing,
        scope: 'store',
        description: sysTpl.description ?? null,
        is_active: true,
        version: 1,
      })
      .select()
      .single();

    if (insertErr) { res.status(500).json({ error: insertErr.message }); return; }

    // システムテンプレートのアイテムを取得
    const { data: sysItems, error: sysItemsErr } = await supabaseAdmin
      .from('checklist_system_template_items')
      .select('item_key, label, item_type, required, min_value, max_value, unit, options, sort_order')
      .eq('system_template_id', systemTemplateId)
      .order('sort_order', { ascending: true });

    if (sysItemsErr) { res.status(500).json({ error: sysItemsErr.message }); return; }

    // アイテムをchecklist_template_itemsにコピー
    if ((sysItems || []).length > 0) {
      const rows = (sysItems || []).map((item: any) => ({
        store_id: storeId,
        template_id: newTpl.id,
        item_key: item.item_key,
        label: item.label,
        item_type: item.item_type,
        required: item.required,
        min_value: item.min_value ?? null,
        max_value: item.max_value ?? null,
        unit: item.unit ?? null,
        options: item.options ?? null,
        sort_order: item.sort_order,
      }));

      const { error: itemsErr } = await supabaseAdmin
        .from('checklist_template_items')
        .insert(rows);

      if (itemsErr) { res.status(500).json({ error: itemsErr.message }); return; }
    }

    // 作成したテンプレートをアイテム込みで返す
    const { data: resultItems } = await supabaseAdmin
      .from('checklist_template_items')
      .select('id, item_key, label, item_type, required, min_value, max_value, unit, options, sort_order')
      .eq('template_id', newTpl.id)
      .order('sort_order', { ascending: true });

    res.status(201).json({ ok: true, template: { ...newTpl, items: resultItems || [] } });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const haccpAdminRouter = router;
