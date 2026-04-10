-- 在庫管理テーブル
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  unit TEXT DEFAULT '個',
  quantity NUMERIC NOT NULL DEFAULT 0,
  min_quantity NUMERIC NOT NULL DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 有効化
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- 所属スタッフは閲覧可能
CREATE POLICY "inventory_items_select"
  ON public.inventory_items
  FOR SELECT
  USING (store_id IN (SELECT get_my_store_ids()));

-- 管理者のみ追加可能
CREATE POLICY "inventory_items_insert"
  ON public.inventory_items
  FOR INSERT
  WITH CHECK (store_id IN (SELECT get_my_managed_store_ids()));

-- 管理者のみ更新可能
CREATE POLICY "inventory_items_update"
  ON public.inventory_items
  FOR UPDATE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

-- 管理者のみ削除可能
CREATE POLICY "inventory_items_delete"
  ON public.inventory_items
  FOR DELETE
  USING (store_id IN (SELECT get_my_managed_store_ids()));

-- インデックス
CREATE INDEX IF NOT EXISTS idx_inventory_items_store_id ON public.inventory_items(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON public.inventory_items(store_id, category);
