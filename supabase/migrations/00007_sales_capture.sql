-- ============================================================
-- 売上証跡取込（sales_capture）プラグイン
-- ============================================================

-- レシート画像/PDF アップロード管理
CREATE TABLE IF NOT EXISTS public.sales_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,
  source_type     TEXT NOT NULL DEFAULT 'close_receipt',
  file_path       TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  raw_ocr_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  parsed_summary  JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence      NUMERIC,
  status          TEXT NOT NULL DEFAULT 'uploaded',
  duplicate_of    UUID REFERENCES public.sales_receipts(id),
  uploaded_by     UUID NOT NULL REFERENCES public.profiles(id),
  reviewed_by     UUID REFERENCES public.profiles(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 確定売上（日次精算）
CREATE TABLE IF NOT EXISTS public.sales_closes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  business_date     DATE NOT NULL,
  register_code     TEXT,
  gross_sales       INTEGER NOT NULL DEFAULT 0,
  net_sales         INTEGER NOT NULL DEFAULT 0,
  tax_amount        INTEGER NOT NULL DEFAULT 0,
  discount_amount   INTEGER NOT NULL DEFAULT 0,
  refund_amount     INTEGER NOT NULL DEFAULT 0,
  cash_sales        INTEGER NOT NULL DEFAULT 0,
  card_sales        INTEGER NOT NULL DEFAULT 0,
  qr_sales          INTEGER NOT NULL DEFAULT 0,
  other_sales       INTEGER NOT NULL DEFAULT 0,
  receipt_count     INTEGER NOT NULL DEFAULT 0,
  source_receipt_id UUID REFERENCES public.sales_receipts(id),
  approved_by       UUID REFERENCES public.profiles(id),
  approved_at       TIMESTAMPTZ,
  created_by        UUID NOT NULL REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, business_date, register_code)
);

-- 現金過不足
CREATE TABLE IF NOT EXISTS public.cash_close_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,
  expected_cash   INTEGER NOT NULL DEFAULT 0,
  counted_cash    INTEGER NOT NULL DEFAULT 0,
  over_short      INTEGER GENERATED ALWAYS AS (counted_cash - expected_cash) STORED,
  note            TEXT,
  counted_by      UUID REFERENCES public.profiles(id),
  approved_by     UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, business_date)
);

-- RLS
ALTER TABLE public.sales_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_close_records ENABLE ROW LEVEL SECURITY;

-- sales_receipts policies
CREATE POLICY "所属店舗のレシートを閲覧" ON public.sales_receipts
  FOR SELECT USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "所属スタッフがレシートをアップロード" ON public.sales_receipts
  FOR INSERT WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上がレシートを管理" ON public.sales_receipts
  FOR UPDATE USING (store_id IN (SELECT public.get_my_managed_store_ids()));
CREATE POLICY "manager以上がレシートを削除" ON public.sales_receipts
  FOR DELETE USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- sales_closes policies
CREATE POLICY "所属店舗の売上確定を閲覧" ON public.sales_closes
  FOR SELECT USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上が売上確定を作成" ON public.sales_closes
  FOR INSERT WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));
CREATE POLICY "manager以上が売上確定を管理" ON public.sales_closes
  FOR UPDATE USING (store_id IN (SELECT public.get_my_managed_store_ids()));
CREATE POLICY "manager以上が売上確定を削除" ON public.sales_closes
  FOR DELETE USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- cash_close_records policies
CREATE POLICY "所属店舗の現金締めを閲覧" ON public.cash_close_records
  FOR SELECT USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上が現金締めを作成" ON public.cash_close_records
  FOR INSERT WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));
CREATE POLICY "manager以上が現金締めを管理" ON public.cash_close_records
  FOR UPDATE USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_receipts_store_date ON public.sales_receipts(store_id, business_date);
CREATE INDEX IF NOT EXISTS idx_sales_closes_store_date ON public.sales_closes(store_id, business_date);
CREATE INDEX IF NOT EXISTS idx_cash_close_records_store_date ON public.cash_close_records(store_id, business_date);

-- Storage bucket for receipt images
INSERT INTO storage.buckets (id, name, public) VALUES ('sales-receipts', 'sales-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "認証済みユーザーがレシートをアップロード" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'sales-receipts' AND auth.role() = 'authenticated');
CREATE POLICY "認証済みユーザーがレシートを閲覧" ON storage.objects
  FOR SELECT USING (bucket_id = 'sales-receipts' AND auth.role() = 'authenticated');
CREATE POLICY "認証済みユーザーがレシートを削除" ON storage.objects
  FOR DELETE USING (bucket_id = 'sales-receipts' AND auth.role() = 'authenticated');
