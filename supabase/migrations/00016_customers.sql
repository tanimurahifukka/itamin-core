-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- ============================================================
-- customers テーブル
-- ============================================================
CREATE TABLE public.customers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  name_kana         TEXT,
  phone             TEXT,
  phone_normalized  TEXT,
  email             TEXT,
  birthday          DATE,
  note              TEXT,
  tags              TEXT[]      NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- ============================================================
-- RLS ヘルパー関数: ログインユーザーの指定店舗でのロールを返す
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role_in_store(store_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.store_staff
  WHERE user_id = auth.uid() AND store_id = $1
  LIMIT 1
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- moddatetime トリガー (updated_at 自動更新)
-- ============================================================
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ============================================================
-- インデックス
-- ============================================================
-- store_id (論理削除フィルタ付き)
CREATE INDEX idx_customers_store_id
  ON public.customers(store_id)
  WHERE deleted_at IS NULL;

-- phone_normalized ユニーク (store_id + phone_normalized, 論理削除フィルタ付き)
CREATE UNIQUE INDEX idx_customers_store_phone_normalized
  ON public.customers(store_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL AND deleted_at IS NULL;

-- name トライグラム全文検索
CREATE INDEX idx_customers_name_trgm
  ON public.customers
  USING GIN (name gin_trgm_ops);

-- name_kana トライグラム全文検索
CREATE INDEX idx_customers_name_kana_trgm
  ON public.customers
  USING GIN (name_kana gin_trgm_ops);

-- tags GIN インデックス
CREATE INDEX idx_customers_tags
  ON public.customers
  USING GIN (tags);

-- ============================================================
-- RLS 有効化
-- ============================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS ポリシー
-- ============================================================
-- SELECT: 所属店舗かつ owner/manager/leader のみ閲覧可
CREATE POLICY "顧客を読める"
  ON public.customers FOR SELECT
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner', 'manager', 'leader')
  );

-- INSERT: 所属店舗かつ owner/manager/leader のみ作成可
CREATE POLICY "顧客を作成できる"
  ON public.customers FOR INSERT
  WITH CHECK (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner', 'manager', 'leader')
  );

-- UPDATE: 所属店舗かつ owner/manager/leader のみ更新可（論理削除も UPDATE で行う）
CREATE POLICY "顧客を更新できる"
  ON public.customers FOR UPDATE
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner', 'manager', 'leader')
  );

-- DELETE ポリシーなし（論理削除: deleted_at を UPDATE で設定する）

SELECT 'CUSTOMERS MIGRATION COMPLETE' AS status;
