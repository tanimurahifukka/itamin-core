-- 有給残日数テーブル
CREATE TABLE IF NOT EXISTS public.paid_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL,
  total_days NUMERIC NOT NULL DEFAULT 0,
  used_days NUMERIC NOT NULL DEFAULT 0,
  fiscal_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(store_id, staff_id, fiscal_year)
);

ALTER TABLE public.paid_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paid_leaves_select"
  ON public.paid_leaves FOR SELECT
  USING (store_id IN (SELECT get_my_store_ids()));

CREATE POLICY "paid_leaves_insert"
  ON public.paid_leaves FOR INSERT
  WITH CHECK (store_id IN (SELECT get_my_managed_store_ids()));

CREATE POLICY "paid_leaves_update"
  ON public.paid_leaves FOR UPDATE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_paid_leaves_store_year
  ON public.paid_leaves(store_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_paid_leaves_staff
  ON public.paid_leaves(store_id, staff_id);

-- 有給取得記録テーブル
CREATE TABLE IF NOT EXISTS public.leave_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT '全日',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_records_select"
  ON public.leave_records FOR SELECT
  USING (store_id IN (SELECT get_my_store_ids()));

CREATE POLICY "leave_records_insert"
  ON public.leave_records FOR INSERT
  WITH CHECK (store_id IN (SELECT get_my_managed_store_ids()));

CREATE POLICY "leave_records_delete"
  ON public.leave_records FOR DELETE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_leave_records_store_staff
  ON public.leave_records(store_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_records_date
  ON public.leave_records(store_id, date);

-- 有給使用日数の原子的な加減算
CREATE OR REPLACE FUNCTION increment_used_days(
  p_store_id UUID,
  p_staff_id UUID,
  p_fiscal_year INTEGER,
  p_increment NUMERIC
) RETURNS void AS $$
BEGIN
  UPDATE public.paid_leaves
  SET used_days = GREATEST(0, used_days + p_increment)
  WHERE store_id = p_store_id
    AND staff_id = p_staff_id
    AND fiscal_year = p_fiscal_year;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
