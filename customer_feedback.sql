-- お客様の声テーブル
CREATE TABLE IF NOT EXISTS public.customer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'suggestion',
  content TEXT NOT NULL,
  response TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT '未対応',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_feedback_select"
  ON public.customer_feedback FOR SELECT
  USING (store_id IN (SELECT get_my_store_ids()));

CREATE POLICY "customer_feedback_insert"
  ON public.customer_feedback FOR INSERT
  WITH CHECK (store_id IN (SELECT get_my_managed_store_ids()));

CREATE POLICY "customer_feedback_update"
  ON public.customer_feedback FOR UPDATE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE POLICY "customer_feedback_delete"
  ON public.customer_feedback FOR DELETE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_customer_feedback_store
  ON public.customer_feedback(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_status
  ON public.customer_feedback(store_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_date
  ON public.customer_feedback(store_id, date);
