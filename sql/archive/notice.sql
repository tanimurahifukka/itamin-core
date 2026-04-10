-- 連絡ノートテーブル
CREATE TABLE IF NOT EXISTS public.notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notices_select"
  ON public.notices FOR SELECT
  USING (store_id IN (SELECT get_my_store_ids()));

CREATE POLICY "notices_insert"
  ON public.notices FOR INSERT
  WITH CHECK (store_id IN (SELECT get_my_store_ids()));

CREATE POLICY "notices_update"
  ON public.notices FOR UPDATE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE POLICY "notices_delete"
  ON public.notices FOR DELETE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_notices_store_id
  ON public.notices(store_id);
CREATE INDEX IF NOT EXISTS idx_notices_store_created
  ON public.notices(store_id, created_at DESC);

-- 既読管理テーブル
CREATE TABLE IF NOT EXISTS public.notice_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(notice_id, user_id)
);

ALTER TABLE public.notice_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notice_reads_select"
  ON public.notice_reads FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notice_reads_insert"
  ON public.notice_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notice_reads_update"
  ON public.notice_reads FOR UPDATE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notice_reads_user
  ON public.notice_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_notice_reads_notice
  ON public.notice_reads(notice_id);
