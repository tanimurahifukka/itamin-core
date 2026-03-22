-- 日報テーブル
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sales NUMERIC NOT NULL DEFAULT 0,
  customer_count INTEGER NOT NULL DEFAULT 0,
  weather TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(store_id, date)
);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_reports_select"
  ON public.daily_reports FOR SELECT
  USING (store_id IN (SELECT get_my_store_ids()));

CREATE POLICY "daily_reports_insert"
  ON public.daily_reports FOR INSERT
  WITH CHECK (store_id IN (SELECT get_my_managed_store_ids()));

CREATE POLICY "daily_reports_update"
  ON public.daily_reports FOR UPDATE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE POLICY "daily_reports_delete"
  ON public.daily_reports FOR DELETE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_daily_reports_store_date
  ON public.daily_reports(store_id, date);
