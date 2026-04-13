import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore, requireStoreMembership, staffBelongsToStore } from '../auth/authorization';

const router = Router();

// ============================================================
// スタッフ別有給残日数一覧
// ============================================================
router.get('/:storeId/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const userId = req.user!.id;
    const fiscalYear = Number(req.query.fiscalYear) || new Date().getFullYear();
    const isManager = membership.role === 'owner' || membership.role === 'manager' || membership.role === 'leader';

    let query = supabaseAdmin
      .from('paid_leaves')
      .select('*')
      .eq('store_id', storeId)
      .eq('fiscal_year', fiscalYear);

    // スタッフは自分のデータのみ
    if (!isManager) {
      query = query.eq('staff_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // スタッフ名を取得
    const staffIds = [...new Set((data || []).map((d: any) => d.staff_id))];
    const { data: members } = staffIds.length > 0
      ? await supabaseAdmin
          .from('store_staff')
          .select('user_id, role, user:profiles(name, email)')
          .eq('store_id', storeId)
          .in('user_id', staffIds)
      : { data: [] };

    type StaffWithProfile = { user_id: string; role: string; user?: { name?: string; email?: string } | null };
    const memberMap = new Map((members || []).map((m) => {
      const userJoin = Array.isArray(m.user) ? m.user[0] : m.user;
      return [m.user_id, { ...m, user: userJoin } as StaffWithProfile] as const;
    }));

    const summary = (data || []).map((d: { id: string; staff_id: string; total_days: number; used_days: number; fiscal_year: number }) => {
      const member = memberMap.get(d.staff_id);
      return {
        id: d.id,
        staffId: d.staff_id,
        staffName: member?.user?.name || member?.user?.email || '不明',
        totalDays: d.total_days,
        usedDays: d.used_days,
        remainingDays: d.total_days - d.used_days,
        fiscalYear: d.fiscal_year,
      };
    });

    res.json({ summary, fiscalYear });
  } catch (e: unknown) {
    console.error('[paid_leave GET /:storeId/summary] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 有給付与・残日数更新
// ============================================================
router.post('/:storeId/grant', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const staffId = req.body?.staffId;
    const totalDays = req.body?.totalDays;
    const fiscalYear = req.body?.fiscalYear;

    if (!staffId || totalDays === undefined) {
      res.status(400).json({ error: 'スタッフIDと付与日数は必須です' });
      return;
    }

    // テナント越境防止: 対象スタッフがこの店舗に所属していることを確認する
    if (!(await staffBelongsToStore(storeId, staffId))) {
      res.status(403).json({ error: '対象スタッフはこの店舗に所属していません' });
      return;
    }

    const year = fiscalYear || new Date().getFullYear();

    // 既存レコードがあればtotal_daysのみ更新、なければ新規作成
    const { data: existing } = await supabaseAdmin
      .from('paid_leaves')
      .select('id, used_days')
      .eq('store_id', storeId)
      .eq('staff_id', staffId)
      .eq('fiscal_year', year)
      .maybeSingle();

    let data, error;
    if (existing) {
      ({ data, error } = await supabaseAdmin
        .from('paid_leaves')
        .update({ total_days: totalDays })
        .eq('id', existing.id)
        .select()
        .single());
    } else {
      ({ data, error } = await supabaseAdmin
        .from('paid_leaves')
        .insert({
          store_id: storeId,
          staff_id: staffId,
          total_days: totalDays,
          used_days: 0,
          fiscal_year: year,
        })
        .select()
        .single());
    }

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json({ leave: data });
  } catch (e: unknown) {
    console.error('[paid_leave POST /:storeId/grant] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 取得記録一覧
// ============================================================
router.get('/:storeId/records', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const userId = req.user!.id;
    const staffId = req.query.staffId as string | undefined;
    const isManager = membership.role === 'owner' || membership.role === 'manager' || membership.role === 'leader';

    let query = supabaseAdmin
      .from('leave_records')
      .select('*')
      .eq('store_id', storeId)
      .order('date', { ascending: false });

    if (staffId && isManager) {
      query = query.eq('staff_id', staffId);
    } else if (!isManager) {
      query = query.eq('staff_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ records: data || [] });
  } catch (e: unknown) {
    console.error('[paid_leave GET /:storeId/records] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 有給取得記録の登録
// ============================================================
router.post('/:storeId/records', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const staffId = req.body?.staffId;
    const date = req.body?.date;
    const type = req.body?.type;
    const note = req.body?.note;

    if (!staffId || !date) {
      res.status(400).json({ error: 'スタッフIDと日付は必須です' });
      return;
    }

    if (!(await staffBelongsToStore(storeId, staffId))) {
      res.status(403).json({ error: '対象スタッフはこの店舗に所属していません' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('leave_records')
      .insert({
        store_id: storeId,
        staff_id: staffId,
        date,
        type: type || '全日',
        note: note || '',
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // used_daysを原子的に加算
    const increment = type === '半日' ? 0.5 : 1;
    const fiscalYear = new Date(date).getFullYear();

    await supabaseAdmin.rpc('increment_used_days', {
      p_store_id: storeId,
      p_staff_id: staffId,
      p_fiscal_year: fiscalYear,
      p_increment: increment,
    });

    res.status(201).json({ record: data });
  } catch (e: unknown) {
    console.error('[paid_leave POST /:storeId/records] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 取得記録削除
// ============================================================
router.delete('/:storeId/records/:recordId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const recordId = String(req.params.recordId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    // 削除前にレコード情報を取得（used_daysを戻すため）
    const { data: record } = await supabaseAdmin
      .from('leave_records')
      .select('staff_id, date, type')
      .eq('id', recordId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!record) {
      res.status(404).json({ error: '取得記録が見つかりません' });
      return;
    }

    // used_daysを先に減算（削除が失敗した場合は戻す）
    const decrement = record.type === '半日' ? 0.5 : 1;
    const fiscalYear = new Date(record.date).getFullYear();

    await supabaseAdmin.rpc('increment_used_days', {
      p_store_id: storeId,
      p_staff_id: record.staff_id,
      p_fiscal_year: fiscalYear,
      p_increment: -decrement,
    });

    const { error } = await supabaseAdmin
      .from('leave_records')
      .delete()
      .eq('id', recordId)
      .eq('store_id', storeId);

    if (error) {
      // 削除失敗 → 減算を元に戻す
      await supabaseAdmin.rpc('increment_used_days', {
        p_store_id: storeId,
        p_staff_id: record.staff_id,
        p_fiscal_year: fiscalYear,
        p_increment: decrement,
      });
      res.status(500).json({ error: '削除に失敗しました' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[paid_leave DELETE /:storeId/records/:recordId] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const paidLeavePlugin: Plugin = {
  name: 'paid_leave',
  version: '0.1.0',
  description: '有給残日数管理・取得記録',
  label: '有給管理',
  icon: '🏖️',
  category: 'attendance',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/paid-leave', router);
  },
};
