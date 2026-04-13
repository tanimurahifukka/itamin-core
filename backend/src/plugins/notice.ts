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
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('notices')
      .select('*')
      .eq('store_id', storeId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
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

    // コメント数を取得
    const commentCountMap = new Map<string, number>();
    if (noticeIds.length > 0) {
      const { data: commentCounts } = await supabaseAdmin
        .from('notice_comments')
        .select('notice_id')
        .eq('store_id', storeId)
        .in('notice_id', noticeIds);
      (commentCounts || []).forEach((c: any) => {
        commentCountMap.set(c.notice_id, (commentCountMap.get(c.notice_id) || 0) + 1);
      });
    }

    const notices = (data || []).map((n: any) => ({
      id: n.id,
      storeId: n.store_id,
      authorId: n.author_id,
      authorName: n.author_name,
      title: n.title,
      body: n.body,
      pinned: n.pinned,
      imageUrls: n.image_urls || [],
      createdAt: n.created_at,
      commentCount: commentCountMap.get(n.id) || 0,
      isRead: readMap.has(n.id),
      readAt: readMap.get(n.id) || null,
    }));

    res.json({ notices });
  } catch (e: unknown) {
    console.error('[notice:get] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 連絡ノート投稿
// ============================================================
router.post('/:storeId/posts', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body : '';
    const userId = req.user!.id;

    if (!title) {
      res.status(400).json({ error: 'タイトルは必須です' });
      return;
    }

    // profiles テーブルから投稿者情報を取得（FK制約対応）
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[notice:post] profile lookup failed', profileError);
      res.status(500).json({ error: '投稿者情報の取得に失敗しました' });
      return;
    }

    if (!profile) {
      console.error('[notice:post] profile not found for user:', userId);
      res.status(409).json({ error: 'プロフィール未作成のため投稿できません' });
      return;
    }

    const authorName = profile.name || profile.email || '不明';

    const { data, error } = await supabaseAdmin
      .from('notices')
      .insert({
        store_id: storeId,
        author_id: profile.id,
        author_name: authorName,
        title,
        body,
        pinned: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[notice:post] insert failed', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      res.status(500).json({ error: '連絡ノートの投稿に失敗しました' });
      return;
    }

    res.status(201).json({ notice: data });
  } catch (e: unknown) {
    console.error('[notice:post] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 既読にする
// ============================================================
router.post('/:storeId/posts/:noticeId/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const noticeId = String(req.params.noticeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const userId = req.user!.id;

    const { error } = await supabaseAdmin
      .from('notice_reads')
      .upsert({
        notice_id: noticeId,
        user_id: userId,
        read_at: new Date().toISOString(),
      }, { onConflict: 'notice_id,user_id' });

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[notice:read] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 連絡ノート編集
// ============================================================
router.put('/:storeId/posts/:noticeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const noticeId = String(req.params.noticeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const userId = req.user!.id;

    // 投稿者本人 or マネージャー以上のみ編集可
    const { data: notice } = await supabaseAdmin
      .from('notices')
      .select('author_id')
      .eq('id', noticeId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!notice) {
      res.status(404).json({ error: '投稿が見つかりません' });
      return;
    }

    const isAuthor = notice.author_id === userId;
    const isAdmin = ['owner', 'manager'].includes(membership.role);
    if (!isAuthor && !isAdmin) {
      res.status(403).json({ error: '編集権限がありません' });
      return;
    }

    const update: any = {};
    if (typeof req.body?.title === 'string' && req.body.title.trim()) {
      update.title = req.body.title.trim();
    }
    if (typeof req.body?.body === 'string') {
      update.body = req.body.body;
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: '更新する項目がありません' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('notices')
      .update(update)
      .eq('id', noticeId)
      .eq('store_id', storeId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ notice: data });
  } catch (e: unknown) {
    console.error('[notice:edit] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// ピン留め切替
// ============================================================
router.put('/:storeId/posts/:noticeId/pin', requireAuth, async (req: Request, res: Response) => {
  try {
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
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[notice:pin] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 画像URL更新
// ============================================================
router.patch('/:storeId/posts/:noticeId/images', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const noticeId = String(req.params.noticeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const imageUrls = req.body?.imageUrls;
    if (!Array.isArray(imageUrls)) {
      res.status(400).json({ error: 'imageUrls は配列で指定してください' });
      return;
    }

    if (imageUrls.length > 5) {
      res.status(400).json({ error: '画像は最大5枚までです' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('notices')
      .update({ image_urls: imageUrls })
      .eq('id', noticeId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[notice:images] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// コメント一覧
// ============================================================
router.get('/:storeId/posts/:noticeId/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const noticeId = String(req.params.noticeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const { data, error } = await supabaseAdmin
      .from('notice_comments')
      .select('*')
      .eq('store_id', storeId)
      .eq('notice_id', noticeId)
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    const comments = (data || []).map((c: any) => ({
      id: c.id,
      noticeId: c.notice_id,
      authorId: c.author_id,
      authorName: c.author_name,
      body: c.body,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    res.json({ comments });
  } catch (e: unknown) {
    console.error('[notice:comments:get] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// コメント投稿
// ============================================================
router.post('/:storeId/posts/:noticeId/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const noticeId = String(req.params.noticeId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) {
      res.status(400).json({ error: 'コメント本文は必須です' });
      return;
    }

    const userId = req.user!.id;
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email')
      .eq('id', userId)
      .maybeSingle();

    const authorName = profile?.name || profile?.email || '不明';

    const { data, error } = await supabaseAdmin
      .from('notice_comments')
      .insert({
        store_id: storeId,
        notice_id: noticeId,
        author_id: userId,
        author_name: authorName,
        body,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.status(201).json({
      comment: {
        id: data.id,
        noticeId: data.notice_id,
        authorId: data.author_id,
        authorName: data.author_name,
        body: data.body,
        createdAt: data.created_at,
      },
    });
  } catch (e: unknown) {
    console.error('[notice:comments:post] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// コメント削除
// ============================================================
router.delete('/:storeId/posts/:noticeId/comments/:commentId', requireAuth, async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId);
    const commentId = String(req.params.commentId);
    const membership = await requireStoreMembership(req, res, storeId);
    if (!membership) return;

    const userId = req.user!.id;

    // 本人 or マネージャー以上
    const { data: comment } = await supabaseAdmin
      .from('notice_comments')
      .select('author_id')
      .eq('id', commentId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!comment) {
      res.status(404).json({ error: 'コメントが見つかりません' });
      return;
    }

    const isAuthor = comment.author_id === userId;
    const isAdmin = ['owner', 'manager'].includes(membership.role);
    if (!isAuthor && !isAdmin) {
      res.status(403).json({ error: '削除権限がありません' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('notice_comments')
      .delete()
      .eq('id', commentId)
      .eq('store_id', storeId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[notice:comments:delete] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// 連絡ノート削除
// ============================================================
router.delete('/:storeId/posts/:noticeId', requireAuth, async (req: Request, res: Response) => {
  try {
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
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[notice:delete] error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export const noticePlugin: Plugin = {
  name: 'notice',
  version: '0.1.0',
  description: 'スタッフ間の申し送り・既読管理',
  label: '連絡ノート',
  icon: '💬',
  category: 'communication',
  defaultRoles: ['owner', 'manager', 'leader', 'full_time', 'part_time'],
  initialize: (app: Express) => {
    app.use('/api/notice', router);
  },
};
