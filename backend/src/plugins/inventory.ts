import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore, requireStoreMembership } from '../auth/authorization';

const router = Router();

// ============================================================
// 在庫一覧取得
// ============================================================
router.get('/:storeId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const category = req.query.category as string | undefined;
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) {
      return;
    }

    let query = supabaseAdmin
      .from('inventory_items')
      .select('*')
      .eq('store_id', storeId)
      .order('category')
      .order('name');

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const items = (data || []).map((item: any) => ({
      id: item.id,
      storeId: item.store_id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity: item.quantity,
      minQuantity: item.min_quantity,
      cost: item.cost,
      note: item.note,
      status: item.status,
      lastCheckedAt: item.last_checked_at,
      updatedAt: item.updated_at,
      createdAt: item.created_at,
    }));

    res.json({ items });
  } catch (e: any) {
    console.error('[inventory GET /:storeId/items] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 在庫追加
// ============================================================
router.post('/:storeId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    const name = req.body?.name;
    const category = req.body?.category;
    const unit = req.body?.unit;
    const quantity = req.body?.quantity;
    const minQuantity = req.body?.minQuantity;
    const cost = req.body?.cost;
    const note = req.body?.note;

    if (!name || name.trim() === '') {
      res.status(400).json({ error: '商品名は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_items')
      .insert({
        store_id: storeId,
        name: name.trim(),
        category: category || '',
        unit: unit || '個',
        quantity: quantity ?? 0,
        min_quantity: minQuantity ?? 0,
        cost: cost ?? 0,
        note: note || null,
        status: req.body?.status || '適正',
        last_checked_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ item: data });
  } catch (e: any) {
    console.error('[inventory POST /:storeId/items] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 在庫更新
// ============================================================
router.put('/:storeId/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId = String(req.params.itemId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    const name = req.body?.name;
    const category = req.body?.category;
    const unit = req.body?.unit;
    const quantity = req.body?.quantity;
    const minQuantity = req.body?.minQuantity;
    const cost = req.body?.cost;
    const note = req.body?.note;

    const updates: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (unit !== undefined) updates.unit = unit;
    if (quantity !== undefined) updates.quantity = quantity;
    if (minQuantity !== undefined) updates.min_quantity = minQuantity;
    if (cost !== undefined) updates.cost = cost;
    if (note !== undefined) updates.note = note;
    if (req.body?.status !== undefined) updates.status = req.body.status;
    // 数量やステータスが変更された場合、最終確認日を更新
    if (quantity !== undefined || req.body?.status !== undefined) {
      updates.last_checked_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_items')
      .update(updates)
      .eq('id', itemId)
      .eq('store_id', storeId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ item: data });
  } catch (e: any) {
    console.error('[inventory PUT /:storeId/items/:itemId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 在庫削除
// ============================================================
router.delete('/:storeId/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId = String(req.params.itemId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) {
      return;
    }

    const { error } = await supabaseAdmin
      .from('inventory_items')
      .delete()
      .eq('id', itemId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[inventory DELETE /:storeId/items/:itemId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// プラグインエクスポート
// ============================================================
export const inventoryPlugin: Plugin = {
  name: 'inventory',
  version: '0.1.0',
  description: '在庫管理機能',
  label: '在庫管理',
  icon: '📦',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/inventory', router);
  },
};
