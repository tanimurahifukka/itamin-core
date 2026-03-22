-- 経費テーブル
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT '未分類',
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  receipt_note TEXT DEFAULT '',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_select"
  ON public.expenses FOR SELECT
  USING (store_id IN (SELECT get_my_store_ids()));

CREATE POLICY "expenses_insert"
  ON public.expenses FOR INSERT
  WITH CHECK (store_id IN (SELECT get_my_managed_store_ids()));

CREATE POLICY "expenses_update"
  ON public.expenses FOR UPDATE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE POLICY "expenses_delete"
  ON public.expenses FOR DELETE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_expenses_store_date
  ON public.expenses(store_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_store_category
  ON public.expenses(store_id, category);
