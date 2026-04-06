-- store_staff に交通費（日額）カラムを追加
ALTER TABLE public.store_staff
  ADD COLUMN IF NOT EXISTS transport_fee INT DEFAULT 0;

COMMENT ON COLUMN public.store_staff.transport_fee IS '交通費（日額・円）';
