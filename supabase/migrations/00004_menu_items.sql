-- ============================================================
-- menu_items + daily_report_items
-- 商品マスタと日報明細
-- ============================================================

-- ============================================================
-- 1. menu_items（商品マスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT '',
  price         INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_menu_items_store_active_order
  ON public.menu_items(store_id, is_active, display_order);

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の商品マスタを読める" ON public.menu_items;
CREATE POLICY "所属店舗の商品マスタを読める"
  ON public.menu_items FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上が商品マスタを管理できる" ON public.menu_items;
CREATE POLICY "manager以上が商品マスタを管理できる"
  ON public.menu_items FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()))
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- 2. daily_report_items（日報明細）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_report_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id),
  quantity     INTEGER NOT NULL DEFAULT 0,
  unit_price   INTEGER NOT NULL DEFAULT 0,
  subtotal     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(report_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_report_items_report
  ON public.daily_report_items(report_id);

ALTER TABLE public.daily_report_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の日報明細を読める" ON public.daily_report_items;
CREATE POLICY "所属店舗の日報明細を読める"
  ON public.daily_report_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.daily_reports dr
      WHERE dr.id = daily_report_items.report_id
        AND dr.store_id IN (SELECT public.get_my_store_ids())
    )
  );

DROP POLICY IF EXISTS "manager以上が日報明細を管理できる" ON public.daily_report_items;
CREATE POLICY "manager以上が日報明細を管理できる"
  ON public.daily_report_items FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.daily_reports dr
      WHERE dr.id = daily_report_items.report_id
        AND dr.store_id IN (SELECT public.get_my_managed_store_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.daily_reports dr
      WHERE dr.id = daily_report_items.report_id
        AND dr.store_id IN (SELECT public.get_my_managed_store_ids())
    )
  );
