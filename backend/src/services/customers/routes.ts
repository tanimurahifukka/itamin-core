import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireStoreMembership, requireManagedStore } from '../../auth/authorization';
import { supabaseAdmin } from '../../config/supabase';
import { normalizePhone } from '../../lib/phone';

const router = Router();

// PostgREST の .or() フィルタ文字列に埋め込む値をサニタイズする。
// - `,` `(` `)` はフィルタ構文の区切り文字なので、含まれていた場合は別フィルタを注入される恐れがあるため除去する
// - `%` `_` `\` は ILIKE のワイルドカード/エスケープ文字なので、検索語として文字通り扱うためバックスラッシュでエスケープする
// - 長さを 64 文字に制限してリソース消費攻撃を抑える
function sanitizeSearchTerm(raw: string): string {
  return raw
    .slice(0, 64)
    .replace(/[,()]/g, '')
    .replace(/([\\%_])/g, '\\$1')
    .trim();
}

// ============================================================
// 顧客一覧取得
// ============================================================
router.get('/:storeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const q = req.query.q as string | undefined;
    const tagParams = req.query.tag;
    const tags: string[] = Array.isArray(tagParams)
      ? (tagParams as string[]).filter((t) => t.length > 0)
      : typeof tagParams === 'string' && tagParams.length > 0
      ? [tagParams]
      : [];
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const includeDeleted =
      req.query.include_deleted === 'true' && membership.role === 'owner';

    // total count query
    let countQuery = supabaseAdmin
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId);

    if (!includeDeleted) {
      countQuery = countQuery.is('deleted_at', null);
    }

    const safeQ = q ? sanitizeSearchTerm(q) : '';
    const normalizedQ = q ? normalizePhone(q) : '';
    const safePhone = normalizedQ ? normalizedQ.replace(/[^0-9]/g, '').slice(0, 32) : '';

    if (safeQ) {
      if (safePhone) {
        countQuery = countQuery.or(
          `name.ilike.%${safeQ}%,name_kana.ilike.%${safeQ}%,phone_normalized.like.${safePhone}%`
        );
      } else {
        countQuery = countQuery.or(`name.ilike.%${safeQ}%,name_kana.ilike.%${safeQ}%`);
      }
    }

    if (tags.length > 0) {
      countQuery = countQuery.contains('tags', tags);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      res.status(500).json({ error: countError.message });
      return;
    }

    // data query
    let dataQuery = supabaseAdmin
      .from('customers')
      .select('*')
      .eq('store_id', storeId);

    if (!includeDeleted) {
      dataQuery = dataQuery.is('deleted_at', null);
    }

    if (safeQ) {
      if (safePhone) {
        dataQuery = dataQuery.or(
          `name.ilike.%${safeQ}%,name_kana.ilike.%${safeQ}%,phone_normalized.like.${safePhone}%`
        );
      } else {
        dataQuery = dataQuery.or(`name.ilike.%${safeQ}%,name_kana.ilike.%${safeQ}%`);
      }
    }

    if (tags.length > 0) {
      dataQuery = dataQuery.contains('tags', tags);
    }

    dataQuery = dataQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await dataQuery;
    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ data: data ?? [], total: count ?? 0, limit, offset });
  } catch (e: unknown) {
    const message = 'Internal Server Error';
    console.error('[customers GET /:storeId] error:', e);
    res.status(500).json({ error: message });
  }
});

// ============================================================
// 顧客の予約履歴取得 (CRM-1)
// ============================================================
router.get('/:storeId/:customerId/reservations', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const customerId = String(req.params.customerId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const { data, error, count } = await supabaseAdmin
      .from('reservations')
      .select('*', { count: 'exact' })
      .eq('store_id', storeId)
      .eq('customer_id', customerId)
      .order('starts_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ reservations: data ?? [], total: count ?? 0, limit, offset });
  } catch (e: unknown) {
    const message = 'Internal Server Error';
    console.error('[customers GET /:storeId/:customerId/reservations] error:', e);
    res.status(500).json({ error: message });
  }
});

// ============================================================
// 顧客単件取得
// ============================================================
router.get('/:storeId/:customerId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const customerId = String(req.params.customerId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    let query = supabaseAdmin
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .eq('id', customerId);

    if (membership.role !== 'owner') {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    if (!data) {
      res.status(404).json({ error: '顧客が見つかりません' });
      return;
    }

    res.json(data);
  } catch (e: unknown) {
    const message = 'Internal Server Error';
    console.error('[customers GET /:storeId/:customerId] error:', e);
    res.status(500).json({ error: message });
  }
});

// ============================================================
// 顧客作成
// ============================================================
router.post('/:storeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const {
      name,
      name_kana,
      phone,
      email,
      birthday,
      note,
      tags,
    } = req.body as {
      name: string;
      name_kana?: string;
      phone?: string;
      email?: string;
      birthday?: string;
      note?: string;
      tags?: string[];
    };

    if (!name) {
      res.status(400).json({ error: 'name は必須です' });
      return;
    }

    const phone_normalized = normalizePhone(phone);
    const cleanedTags: string[] = Array.isArray(tags)
      ? [...new Set(tags.filter((t) => t.length > 0))]
      : [];

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({
        store_id: storeId,
        name,
        name_kana: name_kana ?? null,
        phone: phone ?? null,
        phone_normalized,
        email: email ?? null,
        birthday: birthday ?? null,
        note: note ?? null,
        tags: cleanedTags,
      })
      .select()
      .single();

    if (error) {
      // unique constraint violation on phone_normalized
      if (error.code === '23505') {
        const { data: existing } = await supabaseAdmin
          .from('customers')
          .select('*')
          .eq('store_id', storeId)
          .eq('phone_normalized', phone_normalized as string)
          .is('deleted_at', null)
          .maybeSingle();
        res.status(409).json({
          error: '同じ電話番号の顧客が既に存在します',
          existing,
        });
        return;
      }
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json(data);
  } catch (e: unknown) {
    const message = 'Internal Server Error';
    console.error('[customers POST /:storeId] error:', e);
    res.status(500).json({ error: message });
  }
});

// ============================================================
// 電話番号重複チェック
// ============================================================
router.post('/:storeId/check-duplicate', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { phone } = req.body as { phone: string };
    if (!phone) {
      res.status(400).json({ error: 'phone は必須です' });
      return;
    }

    const phone_normalized = normalizePhone(phone);
    if (!phone_normalized) {
      res.json({ exists: false, customer: null });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .eq('phone_normalized', phone_normalized)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ exists: !!data, customer: data ?? null });
  } catch (e: unknown) {
    const message = 'Internal Server Error';
    console.error('[customers POST /:storeId/check-duplicate] error:', e);
    res.status(500).json({ error: message });
  }
});

// ============================================================
// 顧客更新
// ============================================================
router.put('/:storeId/:customerId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const customerId = String(req.params.customerId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const {
      name,
      name_kana,
      phone,
      email,
      birthday,
      note,
      tags,
    } = req.body as {
      name?: string;
      name_kana?: string;
      phone?: string;
      email?: string;
      birthday?: string;
      note?: string;
      tags?: string[];
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (name_kana !== undefined) updates.name_kana = name_kana;
    if (email !== undefined) updates.email = email;
    if (birthday !== undefined) updates.birthday = birthday;
    if (note !== undefined) updates.note = note;

    if (phone !== undefined) {
      updates.phone = phone;
      updates.phone_normalized = normalizePhone(phone);
    }

    if (tags !== undefined) {
      updates.tags = [...new Set(tags.filter((t) => t.length > 0))];
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update(updates)
      .eq('id', customerId)
      .eq('store_id', storeId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const phone_normalized = updates.phone_normalized as string;
        const { data: existing } = await supabaseAdmin
          .from('customers')
          .select('*')
          .eq('store_id', storeId)
          .eq('phone_normalized', phone_normalized)
          .is('deleted_at', null)
          .maybeSingle();
        res.status(409).json({
          error: '同じ電話番号の顧客が既に存在します',
          existing,
        });
        return;
      }
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    if (!data) {
      res.status(404).json({ error: '顧客が見つかりません' });
      return;
    }

    res.json(data);
  } catch (e: unknown) {
    const message = 'Internal Server Error';
    console.error('[customers PUT /:storeId/:customerId] error:', e);
    res.status(500).json({ error: message });
  }
});

// ============================================================
// 顧客削除（ソフトデリート）
// ============================================================
router.delete('/:storeId/:customerId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const customerId = String(req.params.customerId);

    // owner または manager のみ削除可能。leader は 403
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    if (membership.role === 'leader') {
      res.status(403).json({ error: '削除はオーナーまたはマネージャーのみ実行できます' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', customerId)
      .eq('store_id', storeId)
      .is('deleted_at', null);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    const message = 'Internal Server Error';
    console.error('[customers DELETE /:storeId/:customerId] error:', e);
    res.status(500).json({ error: message });
  }
});

export { router as customersRouter };
