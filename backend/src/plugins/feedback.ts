import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore } from '../auth/authorization';

const router = Router();

// ============================================================
// お客様の声一覧
// ============================================================
router.get('/:storeId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;

    let query = supabaseAdmin
      .from('customer_feedback')
      .select('*')
      .eq('store_id', storeId)
      .order('date', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const items = (data || []).map((f: any) => ({
      id: f.id,
      storeId: f.store_id,
      date: f.date,
      type: f.type,
      content: f.content,
      response: f.response,
      status: f.status,
      createdBy: f.created_by,
      createdAt: f.created_at,
    }));

    res.json({ items });
  } catch (e: any) {
    console.error('[feedback GET /:storeId/items] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// お客様の声追加
// ============================================================
router.post('/:storeId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const date = req.body?.date;
    const type = req.body?.type;
    const content = req.body?.content;
    const response = req.body?.response;
    const status = req.body?.status;

    if (!content || !content.trim()) {
      res.status(400).json({ error: '内容は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('customer_feedback')
      .insert({
        store_id: storeId,
        date: date || new Date().toISOString().split('T')[0],
        type: type || 'suggestion',
        content: content.trim(),
        response: response || '',
        status: status || '未対応',
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ item: data });
  } catch (e: any) {
    console.error('[feedback POST /:storeId/items] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// お客様の声更新（対応記録・ステータス変更）
// ============================================================
router.put('/:storeId/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId = String(req.params.itemId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const updates: any = {};
    if (req.body.type !== undefined) updates.type = req.body.type;
    if (req.body.content !== undefined) updates.content = req.body.content;
    if (req.body.response !== undefined) updates.response = req.body.response;
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.date !== undefined) updates.date = req.body.date;

    const { data, error } = await supabaseAdmin
      .from('customer_feedback')
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
    console.error('[feedback PUT /:storeId/items/:itemId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// お客様の声削除
// ============================================================
router.delete('/:storeId/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const itemId = String(req.params.itemId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('customer_feedback')
      .delete()
      .eq('id', itemId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[feedback DELETE /:storeId/items/:itemId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const feedbackPlugin: Plugin = {
  name: 'feedback',
  version: '0.1.0',
  description: 'お客様からのクレーム・お褒め・要望の記録',
  label: 'お客様の声',
  icon: '📣',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/feedback', router);
  },
};
