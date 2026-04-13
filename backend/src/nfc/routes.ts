/**
 * NFC cleaning check-in routes (public, PIN-authenticated)
 *
 * 物理トイレ等に貼った NFC タグから開かれる公開エンドポイント。
 * スタッフは Supabase セッションを持っていないため、認証は
 * store 内ユニークな per-staff PIN で行う。記録は既存の
 * checklist_submissions テーブルに書き込み、HACCP月次帳票に
 * 自動的に反映される。
 */
import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

/** Shape of a single item in the POST /submit request body */
interface NfcSubmitItem {
  template_item_id?: string | null;
  item_key?: string;
  bool_value?: boolean | null;
  numeric_value?: number | null;
  text_value?: string | null;
  select_value?: string | null;
}

export const nfcRouter = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/nfc/location/:id
// NFC タグから開かれたページが最初に叩く。
// location id から 店舗名・場所名・テンプレート項目を返す。
// 認証不要 (意図的に公開)。返却情報に PII/機密は含めない。
// ─────────────────────────────────────────────────────────────
nfcRouter.get('/location/:id', async (req: Request, res: Response) => {
  try {
    const locationId = req.params.id as string;

    const { data: location, error: locErr } = await supabaseAdmin
      .from('nfc_cleaning_locations')
      .select('id, store_id, slug, name, template_id, active')
      .eq('id', locationId)
      .maybeSingle();

    if (locErr || !location) {
      res.status(404).json({ error: '無効なタグです' });
      return;
    }

    const loc = location as {
      id: string;
      store_id: string;
      slug: string;
      name: string;
      template_id: string | null;
      active: boolean;
    };

    if (!loc.active) {
      res.status(410).json({ error: 'この場所は現在無効化されています' });
      return;
    }

    if (!loc.template_id) {
      res.status(412).json({ error: 'この場所に紐付いたチェックリストが設定されていません' });
      return;
    }

    // 店舗名
    const { data: store, error: storeErr } = await supabaseAdmin
      .from('stores')
      .select('id, name')
      .eq('id', loc.store_id)
      .maybeSingle();

    if (storeErr) {
      console.error('[nfc GET /location/:id] store fetch error:', storeErr);
    }

    const storeRow = store as { id: string; name: string } | null;

    // テンプレート + 項目
    const { data: template, error: tmplErr } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, name, description')
      .eq('id', loc.template_id)
      .maybeSingle();

    if (tmplErr) {
      console.error('[nfc GET /location/:id] template fetch error:', tmplErr);
    }

    if (!template) {
      res.status(404).json({ error: 'チェックリストが見つかりません' });
      return;
    }

    const tmpl = template as { id: string; name: string; description: string | null };

    const { data: items, error: itemsErr } = await supabaseAdmin
      .from('checklist_template_items')
      .select('id, item_key, label, item_type, required, options, sort_order')
      .eq('template_id', loc.template_id)
      .order('sort_order', { ascending: true });

    if (itemsErr) {
      console.error('[nfc GET /location/:id] template items fetch error:', itemsErr);
    }

    res.json({
      location: { id: loc.id, name: loc.name, slug: loc.slug },
      store: { id: storeRow?.id, name: storeRow?.name || '' },
      template: {
        id: tmpl.id,
        name: tmpl.name,
        description: tmpl.description,
        items: items || [],
      },
    });
  } catch (e: unknown) {
    console.error('[nfc GET /location/:id] error:', e);
    const message = e instanceof Error ? e.message : 'Internal Server Error';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/nfc/submit
// body: { locationId, pin, items: [{ template_item_id, bool_value, text_value, select_value }] }
// 認証: store 内ユニークな per-staff PIN で照合
// ─────────────────────────────────────────────────────────────
nfcRouter.post('/submit', async (req: Request, res: Response) => {
  try {
    const { locationId, pin, items } = req.body ?? {};

    if (typeof locationId !== 'string' || !locationId) {
      res.status(400).json({ error: 'locationId は必須です' });
      return;
    }
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'PIN は4桁の数字で入力してください' });
      return;
    }
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'items は配列で送信してください' });
      return;
    }

    // 1) location 取得
    const { data: location, error: locErr } = await supabaseAdmin
      .from('nfc_cleaning_locations')
      .select('id, store_id, template_id, active')
      .eq('id', locationId)
      .maybeSingle();

    const loc = location as {
      id: string;
      store_id: string;
      template_id: string | null;
      active: boolean;
    } | null;

    if (locErr || !loc || !loc.active || !loc.template_id) {
      res.status(404).json({ error: '無効なタグです' });
      return;
    }

    const storeId = loc.store_id;
    const templateId = loc.template_id;

    // 2) PIN 照合 (store 内ユニーク)
    const { data: pinRow, error: pinErr } = await supabaseAdmin
      .from('staff_cleaning_pins')
      .select('membership_id, store_id')
      .eq('store_id', storeId)
      .eq('pin', pin)
      .maybeSingle();

    if (pinErr || !pinRow) {
      res.status(401).json({ error: 'PIN が正しくありません' });
      return;
    }

    const pinRecord = pinRow as { membership_id: string; store_id: string };
    const membershipId = pinRecord.membership_id;

    // 3) スタッフ情報と user_id 取得 (submitted_by 用)
    const { data: staff } = await supabaseAdmin
      .from('store_staff')
      .select('id, user_id, store_id, user:profiles(name)')
      .eq('id', membershipId)
      .maybeSingle();

    const staffRow = staff as {
      id: string;
      user_id: string;
      store_id: string;
      user: { name: string } | null;
    } | null;

    if (!staffRow || staffRow.store_id !== storeId) {
      res.status(401).json({ error: 'スタッフ情報の解決に失敗しました' });
      return;
    }

    const userId = staffRow.user_id;
    const staffName = staffRow.user?.name || null;

    // 4) テンプレートバージョン取得
    const { data: template } = await supabaseAdmin
      .from('checklist_templates')
      .select('id, version, name')
      .eq('id', templateId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!template) {
      res.status(404).json({ error: 'テンプレートが見つかりません' });
      return;
    }

    const tmpl = template as { id: string; version: number; name: string };

    // 5) submission insert
    const { data: submission, error: subErr } = await supabaseAdmin
      .from('checklist_submissions')
      .insert({
        store_id: storeId,
        template_id: templateId,
        template_version: tmpl.version ?? 1,
        scope: 'personal',
        timing: 'ad_hoc',
        membership_id: membershipId,
        submitted_at: new Date().toISOString(),
        submitted_by: userId,
        snapshot: {
          source: 'nfc',
          location_id: locationId,
          staff_name: staffName,
        },
      })
      .select('id')
      .single();

    if (subErr || !submission) {
      console.error('[nfc submit] submission insert failed', subErr);
      res.status(500).json({ error: subErr?.message || '送信に失敗しました' });
      return;
    }

    const submissionRow = submission as { id: string };

    // 6) submission items insert
    const rows = (items as NfcSubmitItem[]).map((item) => ({
      store_id: storeId,
      submission_id: submissionRow.id,
      template_item_id: item.template_item_id || null,
      item_key: item.item_key || '',
      bool_value: item.bool_value ?? null,
      numeric_value: item.numeric_value ?? null,
      text_value: item.text_value ?? null,
      select_value: item.select_value ?? null,
      checked_by: userId,
      checked_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error: itemErr } = await supabaseAdmin
        .from('checklist_submission_items')
        .insert(rows);
      if (itemErr) {
        console.error('[nfc submit] items insert failed', itemErr);
        // best effort: submission は残るが、items 失敗を報告
        res.status(500).json({ error: itemErr.message });
        return;
      }
    }

    res.status(201).json({
      ok: true,
      submissionId: submissionRow.id,
      staffName,
      message: 'チェック記録を送信しました',
    });
  } catch (e: unknown) {
    console.error('[nfc POST /submit] error:', e);
    const message = e instanceof Error ? e.message : 'Internal Server Error';
    res.status(500).json({ error: message });
  }
});
