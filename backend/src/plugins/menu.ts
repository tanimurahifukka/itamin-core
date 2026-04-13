import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore, requireStoreMembership } from '../auth/authorization';

const router = Router();

// ============================================================
// 商品一覧取得
// ============================================================
router.get('/:storeId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const activeParam = typeof req.query.active === 'string' ? req.query.active : undefined;

    let query = supabaseAdmin
      .from('menu_items')
      .select('*')
      .eq('store_id', storeId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (activeParam !== undefined) {
      query = query.eq('is_active', activeParam === 'true');
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const items = (data || []).map((item: any) => ({
      id: item.id,
      storeId: item.store_id,
      name: item.name,
      category: item.category,
      price: item.price,
      displayOrder: item.display_order,
      isActive: item.is_active,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    res.json({ items });
  } catch (e: unknown) {
    console.error('[menu GET /:storeId/items] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 商品追加
// ============================================================
router.post('/:storeId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
    const price = Number(req.body?.price) || 0;
    const displayOrder = Number(req.body?.display_order) || 0;

    if (!name) {
      res.status(400).json({ error: '商品名は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('menu_items')
      .insert({
        store_id: storeId,
        name,
        category,
        price,
        display_order: displayOrder,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json({ item: data });
  } catch (e: unknown) {
    console.error('[menu POST /:storeId/items] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 商品更新
// ============================================================
router.put('/:storeId/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId = String(req.params.itemId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) {
        res.status(400).json({ error: '商品名は必須です' });
        return;
      }
      updates.name = name;
    }
    if (req.body?.category !== undefined) updates.category = String(req.body.category).trim();
    if (req.body?.price !== undefined) updates.price = Number(req.body.price) || 0;
    if (req.body?.display_order !== undefined) updates.display_order = Number(req.body.display_order) || 0;
    if (req.body?.is_active !== undefined) updates.is_active = !!req.body.is_active;

    const { data, error } = await supabaseAdmin
      .from('menu_items')
      .update(updates)
      .eq('id', itemId)
      .eq('store_id', storeId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ item: data });
  } catch (e: unknown) {
    console.error('[menu PUT /:storeId/items/:itemId] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 商品論理削除
// ============================================================
router.delete('/:storeId/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId = String(req.params.itemId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('menu_items')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[menu DELETE /:storeId/items/:itemId] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const menuPlugin: Plugin = {
  name: 'menu',
  version: '0.1.0',
  description: '商品マスタを管理し日報明細と連携',
  label: 'メニュー管理',
  icon: '☕',
  category: 'sales',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/menu', router);
  },
};
