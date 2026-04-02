-- ============================================================
-- 連絡ノート: スレッド（返信コメント）機能
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notice_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  notice_id   UUID NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.profiles(id),
  author_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notice_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所属店舗のコメントを閲覧" ON public.notice_comments
  FOR SELECT USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "所属スタッフがコメントを投稿" ON public.notice_comments
  FOR INSERT WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "自分のコメントを編集" ON public.notice_comments
  FOR UPDATE USING (author_id = auth.uid());
CREATE POLICY "manager以上がコメントを削除" ON public.notice_comments
  FOR DELETE USING (store_id IN (SELECT public.get_my_managed_store_ids()) OR author_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notice_comments_notice ON public.notice_comments(notice_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notice_comments_store ON public.notice_comments(store_id);
