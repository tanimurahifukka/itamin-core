import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import type { Express } from 'express';
import type { Plugin } from '../types';
import { requireManagedStore, requireStoreMembership } from '../auth/authorization';

const router = Router();

// ============================================================
// 連絡ノート一覧取得
// ============================================================
router.get('/:storeId/posts', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) return;

  const userId = (req as any).userId;

  const { data, error } = await supabaseAdmin
    .from('notices')
    .select('*')
    .eq('store_id', storeId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // 既読情報を取得
  const noticeIds = (data || []).map((n: any) => n.id);
  const { data: reads } = noticeIds.length > 0
    ? await supabaseAdmin
        .from('notice_reads')
        .select('notice_id, read_at')
        .eq('user_id', userId)
        .in('notice_id', noticeIds)
    : { data: [] };

  const readMap = new Map((reads || []).map((r: any) => [r.notice_id, r.read_at]));

  const notices = (data || []).map((n: any) => ({
    id: n.id,
    storeId: n.store_id,
    authorId: n.author_id,
    authorName: n.author_name,
    title: n.title,
    body: n.body,
    pinned: n.pinned,
    createdAt: n.created_at,
    isRead: readMap.has(n.id),
    readAt: readMap.get(n.id) || null,
  }));

  res.json({ notices });
});

// ============================================================
// 連絡ノート投稿
// ============================================================
router.post('/:storeId/posts', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) return;

  const { title, body } = req.body;
  const userId = (req as any).userId;

  if (!title || !title.trim()) {
    res.status(400).json({ error: 'タイトルは必須です' });
    return;
  }

  // 投稿者名を取得
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const authorName = userData?.user?.user_metadata?.full_name || userData?.user?.email || '不明';

  const { data, error } = await supabaseAdmin
    .from('notices')
    .insert({
      store_id: storeId,
      author_id: userId,
      author_name: authorName,
      title: title.trim(),
      body: body || '',
      pinned: false,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ notice: data });
});

// ============================================================
// 既読にする
// ============================================================
router.post('/:storeId/posts/:noticeId/read', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const noticeId = String(req.params.noticeId);
  const membership = await requireStoreMembership(req, res, storeId);
  if (!membership) return;

  const userId = (req as any).userId;

  const { error } = await supabaseAdmin
    .from('notice_reads')
    .upsert({
      notice_id: noticeId,
      user_id: userId,
      read_at: new Date().toISOString(),
    }, { onConflict: 'notice_id,user_id' });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// ============================================================
// ピン留め切替
// ============================================================
router.put('/:storeId/posts/:noticeId/pin', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const noticeId = String(req.params.noticeId);
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) return;

  const { pinned } = req.body;

  const { error } = await supabaseAdmin
    .from('notices')
    .update({ pinned: !!pinned })
    .eq('id', noticeId)
    .eq('store_id', storeId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// ============================================================
// 連絡ノート削除
// ============================================================
router.delete('/:storeId/posts/:noticeId', requireAuth, async (req: Request, res: Response) => {
  const storeId = String(req.params.storeId);
  const noticeId = String(req.params.noticeId);
  const membership = await requireManagedStore(req, res, storeId);
  if (!membership) return;

  const { error } = await supabaseAdmin
    .from('notices')
    .delete()
    .eq('id', noticeId)
    .eq('store_id', storeId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

export const noticePlugin: Plugin = {
  name: 'notice',
  version: '0.1.0',
  description: 'スタッフ間の申し送り・既読管理',
  label: '連絡ノート',
  icon: '💬',
  defaultRoles: ['owner', 'manager', 'full_time', 'part_time'],
  initialize: (app: Express) => {
    app.use('/api/notice', router);
  },
};
