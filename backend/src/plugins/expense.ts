import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore } from '../auth/authorization';

const router = Router();

// ============================================================
// 経費一覧取得（月別）
// ============================================================
router.get('/:storeId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const category = req.query.category as string | undefined;

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    let query = supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lt('date', endDate)
      .order('date', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const expenses = (data || []).map((e: any) => ({
      id: e.id,
      storeId: e.store_id,
      date: e.date,
      category: e.category,
      description: e.description,
      amount: e.amount,
      receiptNote: e.receipt_note,
      createdBy: e.created_by,
      createdAt: e.created_at,
    }));

    // カテゴリ別サマリー
    const categorySummary: Record<string, number> = {};
    let totalAmount = 0;
    for (const e of expenses) {
      const cat = e.category || '未分類';
      categorySummary[cat] = (categorySummary[cat] || 0) + Number(e.amount);
      totalAmount += Number(e.amount);
    }

    res.json({ expenses, summary: { totalAmount, categorySummary, count: expenses.length }, year, month });
  } catch (e: any) {
    console.error('[expense GET /:storeId/items] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 経費追加
// ============================================================
router.post('/:storeId/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const date = req.body?.date;
    const category = req.body?.category;
    const description = req.body?.description;
    const amount = req.body?.amount;
    const receiptNote = req.body?.receiptNote;

    if (!date || !description || amount === undefined) {
      res.status(400).json({ error: '日付・内容・金額は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .insert({
        store_id: storeId,
        date,
        category: category || '未分類',
        description: description.trim(),
        amount: Number(amount) || 0,
        receipt_note: receiptNote || '',
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ expense: data });
  } catch (e: any) {
    console.error('[expense POST /:storeId/items] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 経費更新
// ============================================================
router.put('/:storeId/items/:expenseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const expenseId = String(req.params.expenseId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const updates: any = {};
    if (req.body.date !== undefined) updates.date = req.body.date;
    if (req.body.category !== undefined) updates.category = req.body.category;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.amount !== undefined) updates.amount = Number(req.body.amount);
    if (req.body.receiptNote !== undefined) updates.receipt_note = req.body.receiptNote;

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update(updates)
      .eq('id', expenseId)
      .eq('store_id', storeId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ expense: data });
  } catch (e: any) {
    console.error('[expense PUT /:storeId/items/:expenseId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 経費削除
// ============================================================
router.delete('/:storeId/items/:expenseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const expenseId = String(req.params.expenseId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[expense DELETE /:storeId/items/:expenseId] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const expensePlugin: Plugin = {
  name: 'expense',
  version: '0.1.0',
  description: '仕入れ・消耗品・光熱費の記録と集計',
  label: '経費管理',
  icon: '💰',
  category: 'sales',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/expense', router);
  },
};
