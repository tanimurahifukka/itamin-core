import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore, requireStoreMembership } from '../auth/authorization';

const router = Router();

// ============================================================
// レシート一覧（営業日ごと）
// ============================================================
router.get('/:storeId/receipts', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const date = req.query.date as string | undefined;

    let query = supabaseAdmin
      .from('sales_receipts')
      .select('*')
      .eq('store_id', storeId)
      .order('uploaded_at', { ascending: false });

    if (date) query = query.eq('business_date', date);

    const { data, error } = await query.limit(100);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // アップロード者名を取得
    const userIds = [...new Set((data || []).map((r: any) => r.uploaded_by).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      (profiles || []).forEach((p: any) => nameMap.set(p.id, p.name));
    }

    const receipts = (data || []).map((r: any) => ({
      id: r.id,
      storeId: r.store_id,
      businessDate: r.business_date,
      sourceType: r.source_type,
      filePath: r.file_path,
      fileName: r.file_name,
      parsedSummary: r.parsed_summary,
      confidence: r.confidence,
      status: r.status,
      uploadedBy: r.uploaded_by,
      uploadedByName: nameMap.get(r.uploaded_by) || '',
      reviewedBy: r.reviewed_by,
      uploadedAt: r.uploaded_at,
      reviewedAt: r.reviewed_at,
    }));

    res.json({ receipts });
  } catch (e: any) {
    console.error('[sales_capture GET /:storeId/receipts] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 署名付きアップロードURL発行
// ============================================================
router.post('/:storeId/upload-url', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { fileName, contentType } = req.body;
    if (!fileName) {
      res.status(400).json({ error: 'ファイル名が必要です' });
      return;
    }

    const ext = fileName.split('.').pop() || 'jpg';
    const path = `${storeId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabaseAdmin
      .storage
      .from('sales-receipts')
      .createSignedUploadUrl(path);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ signedUrl: data.signedUrl, token: data.token, path });
  } catch (e: any) {
    console.error('[sales_capture POST /:storeId/upload-url] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// レシート登録（アップロード後にメタデータ登録）
// ============================================================
router.post('/:storeId/receipts', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { businessDate, filePath, fileName, sourceType } = req.body;
    if (!businessDate || !filePath || !fileName) {
      res.status(400).json({ error: '営業日、ファイルパス、ファイル名は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('sales_receipts')
      .insert({
        store_id: storeId,
        business_date: businessDate,
        file_path: filePath,
        file_name: fileName,
        source_type: sourceType || 'close_receipt',
        uploaded_by: req.user!.id,
        status: 'uploaded',
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({
      receipt: {
        id: data.id,
        businessDate: data.business_date,
        filePath: data.file_path,
        fileName: data.file_name,
        status: data.status,
      },
    });
  } catch (e: any) {
    console.error('[sales_capture POST /:storeId/receipts] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 売上確定データ登録 / 更新（手入力 or レシートから確認後）
// ============================================================
router.post('/:storeId/closes', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const {
      businessDate, registerCode,
      grossSales, netSales, taxAmount, discountAmount, refundAmount,
      cashSales, cardSales, qrSales, otherSales,
      receiptCount, sourceReceiptId,
    } = req.body;

    if (!businessDate) {
      res.status(400).json({ error: '営業日は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('sales_closes')
      .upsert({
        store_id: storeId,
        business_date: businessDate,
        register_code: registerCode || null,
        gross_sales: grossSales ?? 0,
        net_sales: netSales ?? 0,
        tax_amount: taxAmount ?? 0,
        discount_amount: discountAmount ?? 0,
        refund_amount: refundAmount ?? 0,
        cash_sales: cashSales ?? 0,
        card_sales: cardSales ?? 0,
        qr_sales: qrSales ?? 0,
        other_sales: otherSales ?? 0,
        receipt_count: receiptCount ?? 0,
        source_receipt_id: sourceReceiptId || null,
        created_by: req.user!.id,
      }, { onConflict: 'store_id,business_date,register_code' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // レシートのステータスを confirmed に更新
    if (sourceReceiptId) {
      await supabaseAdmin
        .from('sales_receipts')
        .update({ status: 'confirmed', reviewed_by: req.user!.id, reviewed_at: new Date().toISOString() })
        .eq('id', sourceReceiptId)
        .eq('store_id', storeId);
    }

    // daily_reports の sales にも反映
    await supabaseAdmin
      .from('daily_reports')
      .upsert({
        store_id: storeId,
        date: businessDate,
        sales: data.net_sales || data.gross_sales,
        created_by: req.user!.id,
      }, { onConflict: 'store_id,date' });

    res.status(201).json({
      close: {
        id: data.id,
        businessDate: data.business_date,
        grossSales: data.gross_sales,
        netSales: data.net_sales,
        cashSales: data.cash_sales,
        cardSales: data.card_sales,
        qrSales: data.qr_sales,
        receiptCount: data.receipt_count,
      },
    });
  } catch (e: any) {
    console.error('[sales_capture POST /:storeId/closes] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 売上確定データ取得（営業日）
// ============================================================
router.get('/:storeId/closes/:date', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const date = String(req.params.date);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('sales_closes')
      .select('*')
      .eq('store_id', storeId)
      .eq('business_date', date)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      res.json({ close: null });
      return;
    }

    res.json({
      close: {
        id: data.id,
        businessDate: data.business_date,
        registerCode: data.register_code,
        grossSales: data.gross_sales,
        netSales: data.net_sales,
        taxAmount: data.tax_amount,
        discountAmount: data.discount_amount,
        refundAmount: data.refund_amount,
        cashSales: data.cash_sales,
        cardSales: data.card_sales,
        qrSales: data.qr_sales,
        otherSales: data.other_sales,
        receiptCount: data.receipt_count,
        approvedBy: data.approved_by,
        approvedAt: data.approved_at,
      },
    });
  } catch (e: any) {
    console.error('[sales_capture GET /:storeId/closes/:date] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 売上承認
// ============================================================
router.post('/:storeId/closes/:date/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const date = String(req.params.date);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('sales_closes')
      .update({
        approved_by: req.user!.id,
        approved_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('business_date', date)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ ok: true, close: data });
  } catch (e: any) {
    console.error('[sales_capture POST /:storeId/closes/:date/approve] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 現金締め登録/更新
// ============================================================
router.post('/:storeId/cash-close', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const { businessDate, expectedCash, countedCash, note } = req.body;
    if (!businessDate) {
      res.status(400).json({ error: '営業日は必須です' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('cash_close_records')
      .upsert({
        store_id: storeId,
        business_date: businessDate,
        expected_cash: expectedCash ?? 0,
        counted_cash: countedCash ?? 0,
        note: note || null,
        counted_by: req.user!.id,
      }, { onConflict: 'store_id,business_date' })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({
      cashClose: {
        id: data.id,
        businessDate: data.business_date,
        expectedCash: data.expected_cash,
        countedCash: data.counted_cash,
        overShort: data.over_short,
        note: data.note,
      },
    });
  } catch (e: any) {
    console.error('[sales_capture POST /:storeId/cash-close] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ============================================================
// 現金締め取得
// ============================================================
router.get('/:storeId/cash-close/:date', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const date = String(req.params.date);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('cash_close_records')
      .select('*')
      .eq('store_id', storeId)
      .eq('business_date', date)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      cashClose: data ? {
        id: data.id,
        businessDate: data.business_date,
        expectedCash: data.expected_cash,
        countedCash: data.counted_cash,
        overShort: data.over_short,
        note: data.note,
      } : null,
    });
  } catch (e: any) {
    console.error('[sales_capture GET /:storeId/cash-close/:date] error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

export const salesCapturePlugin: Plugin = {
  name: 'sales_capture',
  version: '0.1.0',
  description: '売上証跡のアップロード・精算・現金締めを管理',
  label: '売上締め',
  icon: '💰',
  category: 'sales',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/sales-capture', router);
  },
};
