// ============================================================
// Store slug management (shared by all reservation plugins)
// ============================================================
// 公開予約 URL の入口として store.slug を管理する。

import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireManagedStore, requireStoreMembership } from '../../auth/authorization';
import { supabaseAdmin } from '../../config/supabase';

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'nfc', 'r', 'public', 'www', 'app',
  'auth', 'login', 'logout', 'settings', 'store', 'stores',
]);

export const reservationSlugRouter = Router();

reservationSlugRouter.get(
  '/:storeId/slug',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('stores')
      .select('slug')
      .eq('id', storeId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
    res.json({ slug: (data as { slug: string | null } | null)?.slug || null });
  },
);

reservationSlugRouter.put(
  '/:storeId/slug',
  requireAuth,
  async (req: Request, res: Response) => {
    const storeId = String(req.params.storeId);
    const membership = await requireManagedStore(req, res, storeId);
    if (!membership) return;

    const rawSlug = String((req.body as { slug?: string })?.slug || '').trim().toLowerCase();

    if (!rawSlug) {
      // clear
      const { error } = await supabaseAdmin
        .from('stores')
        .update({ slug: null })
        .eq('id', storeId);
      if (error) {
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      }
      res.json({ slug: null });
      return;
    }

    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(rawSlug)) {
      res.status(400).json({ error: 'slug は英数字とハイフン、3〜64 文字で入力してください' });
      return;
    }
    if (RESERVED_SLUGS.has(rawSlug)) {
      res.status(400).json({ error: 'この slug は予約語のため使用できません' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('stores')
      .update({ slug: rawSlug })
      .eq('id', storeId);

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: 'この slug は既に使われています' });
        return;
      }
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
    res.json({ slug: rawSlug });
  },
);
