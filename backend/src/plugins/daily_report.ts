import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore } from '../auth/authorization';

const router = Router();

// ============================================================
// 日報一覧取得（月別）
// ============================================================
router.get('/:storeId/reports', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const { data, error } = await supabaseAdmin
      .from('daily_reports')
      .select('*')
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lt('date', endDate)
      .order('date', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // 報告者名を取得
    interface DailyReportRow {
      id: string;
      store_id: string;
      date: string;
      sales: number;
      customer_count: number;
      weather: string;
      memo: string;
      created_by: string;
      created_at: string;
    }
    const userIds = [...new Set((data || []).map((r: DailyReportRow) => r.created_by).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      interface ProfileRow { id: string; name: string }
      (profiles || []).forEach((p: ProfileRow) => nameMap.set(p.id, p.name));
    }

    const reports = (data || []).map((r: DailyReportRow) => ({
      id: r.id,
      storeId: r.store_id,
      date: r.date,
      sales: r.sales,
      customerCount: r.customer_count,
      weather: r.weather,
      memo: r.memo,
      createdBy: r.created_by,
      createdByName: nameMap.get(r.created_by) || '',
      createdAt: r.created_at,
    }));

    // 月次サマリー
    const totalSales = reports.reduce((sum: number, r: { sales: number }) => sum + (Number(r.sales) || 0), 0);
    const totalCustomers = reports.reduce((sum: number, r: { customerCount: number }) => sum + (Number(r.customerCount) || 0), 0);
    const avgCustomers = reports.length > 0 ? Math.round(totalCustomers / reports.length) : 0;

    res.json({ reports, summary: { totalSales, totalCustomers, avgCustomers, reportCount: reports.length }, year, month });
  } catch (e: unknown) {
    console.error('[daily_report GET /:storeId/reports] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 日報取得（1日分）
// ============================================================
router.get('/:storeId/reports/:date', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const date = String(req.params.date);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('daily_reports')
      .select('*')
      .eq('store_id', storeId)
      .eq('date', date)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    if (!data) {
      res.json({ report: null, items: [] });
      return;
    }

    const { data: itemRows, error: itemsError } = await supabaseAdmin
      .from('daily_report_items')
      .select('id, menu_item_id, quantity, unit_price, subtotal')
      .eq('report_id', data.id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      res.status(500).json({ error: itemsError.message });
      return;
    }

    // メニュー名を別クエリで取得
    interface ReportItemRow { id: string; menu_item_id: string; quantity: number; unit_price: number; subtotal: number }
    const menuIds = [...new Set((itemRows || []).map((r: ReportItemRow) => r.menu_item_id))];
    const menuNameMap = new Map<string, string>();
    if (menuIds.length > 0) {
      const { data: menuData } = await supabaseAdmin
        .from('menu_items')
        .select('id, name')
        .in('id', menuIds);
      interface MenuNameRow { id: string; name: string }
      (menuData || []).forEach((m: MenuNameRow) => menuNameMap.set(m.id, m.name));
    }

    res.json({
      report: {
        id: data.id,
        storeId: data.store_id,
        date: data.date,
        sales: data.sales,
        customerCount: data.customer_count,
        weather: data.weather,
        memo: data.memo,
        createdBy: data.created_by,
      },
      items: (itemRows || []).map((item: ReportItemRow) => ({
        id: item.id,
        menuItemId: item.menu_item_id,
        menuItemName: menuNameMap.get(item.menu_item_id) || '',
        quantity: item.quantity,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
      })),
    });
  } catch (e: unknown) {
    console.error('[daily_report GET /:storeId/reports/:date] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 日報作成・更新（upsert）
// ============================================================
router.post('/:storeId/reports', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const date = req.body?.date;
    const sales = req.body?.sales;
    const customerCount = req.body?.customerCount;
    const weather = req.body?.weather;
    const memo = req.body?.memo;
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : undefined;

    if (!date) {
      res.status(400).json({ error: '日付は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('daily_reports')
      .upsert({
        store_id: storeId,
        date,
        sales: sales ?? 0,
        customer_count: customerCount ?? 0,
        weather: weather || '',
        memo: memo || '',
        created_by: req.user!.id,
      }, { onConflict: 'store_id,date' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    if (rawItems) {
      const itemQuantityMap = new Map<string, number>();
      for (const item of rawItems) {
        if (!item || !item.menuItemId) continue;
        const menuItemId = String(item.menuItemId);
        const quantity = Number(item.quantity) || 0;
        itemQuantityMap.set(menuItemId, (itemQuantityMap.get(menuItemId) || 0) + quantity);
      }

      const items = Array.from(itemQuantityMap.entries())
        .map(([menuItemId, quantity]) => ({
          menuItemId,
          quantity,
        }))
        .filter(item => item.quantity > 0);

      const { error: deleteError } = await supabaseAdmin
        .from('daily_report_items')
        .delete()
        .eq('report_id', data.id);

      if (deleteError) {
        res.status(500).json({ error: deleteError.message });
        return;
      }

      let totalSales = 0;

      if (items.length > 0) {
        const menuItemIds = [...new Set(items.map(item => item.menuItemId))];
        const { data: menuRows, error: menuError } = await supabaseAdmin
          .from('menu_items')
          .select('id, name, price, is_active, store_id')
          .eq('store_id', storeId)
          .in('id', menuItemIds);

        if (menuError) {
          res.status(500).json({ error: menuError.message });
          return;
        }

        interface MenuRow { id: string; name: string; price: number; is_active: boolean; store_id: string }
        const menuMap = new Map<string, MenuRow>((menuRows || []).map((item: MenuRow) => [item.id, item]));
        const invalidItem = items.find(item => {
          const menu = menuMap.get(item.menuItemId);
          return !menu || menu.store_id !== storeId;
        });

        if (invalidItem) {
          res.status(400).json({ error: '無効な商品が含まれています' });
          return;
        }

        const insertRows = items.map(item => {
          const menu = menuMap.get(item.menuItemId)!;
          const unitPrice = Number(menu.price) || 0;
          const quantity = item.quantity;
          const subtotal = quantity * unitPrice;
          totalSales += subtotal;

          return {
            report_id: data.id,
            menu_item_id: item.menuItemId,
            quantity,
            unit_price: unitPrice,
            subtotal,
          };
        });

        const { error: insertError } = await supabaseAdmin
          .from('daily_report_items')
          .insert(insertRows);

        if (insertError) {
          res.status(500).json({ error: insertError.message });
          return;
        }
      }

      const { error: updateSalesError } = await supabaseAdmin
        .from('daily_reports')
        .update({ sales: totalSales })
        .eq('id', data.id)
        .eq('store_id', storeId);

      if (updateSalesError) {
        res.status(500).json({ error: updateSalesError.message });
        return;
      }

      res.status(201).json({
        report: {
          ...data,
          sales: totalSales,
        },
      });
      return;
    }

    res.status(201).json({ report: data });
  } catch (e: unknown) {
    console.error('[daily_report POST /:storeId/reports] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 日報削除
// ============================================================
router.delete('/:storeId/reports/:reportId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const reportId = String(req.params.reportId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { error } = await supabaseAdmin
      .from('daily_reports')
      .delete()
      .eq('id', reportId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[daily_report DELETE /:storeId/reports/:reportId] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const dailyReportPlugin: Plugin = {
  name: 'daily_report',
  version: '0.1.0',
  description: '毎日の売上・来客数・天気・メモを記録',
  label: '日報',
  icon: '📝',
  category: 'sales',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/daily-report', router);
  },
};
