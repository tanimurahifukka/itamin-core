-- ============================================================
-- 00024: Reservation plugin — table resource & double-booking guard
-- ============================================================
-- 目的:
--   テーブル予約プラグイン (reservation_type='table') 用の
--   リソース表と重複予約防止の排他制約を追加する。
--
-- 依存:
--   - 00023_reservation_core.sql (reservations マスタ)
--   - btree_gist 拡張 (UUID を GiST に載せるために必須)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1. reservation_tables (物理テーブル/席) ────────────────
CREATE TABLE IF NOT EXISTS public.reservation_tables (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  capacity       INT  NOT NULL CHECK (capacity > 0),
  min_party_size INT  NOT NULL DEFAULT 1 CHECK (min_party_size > 0),
  location       TEXT,
  sort_order     INT  NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_reservation_tables_store
  ON public.reservation_tables(store_id, sort_order)
  WHERE active = true;

CREATE TRIGGER handle_reservation_tables_updated_at
  BEFORE UPDATE ON public.reservation_tables
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ── 2. 重複予約防止の排他制約 ────────────────────────────
--  同じテーブル (resource_ref) で時間帯が重なる予約を DB レベルで禁止する。
--  pending / confirmed / seated のみを対象に、cancelled / no_show は除外する。
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_no_overlap_table
  EXCLUDE USING gist (
    resource_ref WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (
    reservation_type = 'table'
    AND resource_ref IS NOT NULL
    AND status IN ('pending','confirmed','seated')
  );

-- ── 3. 営業時間・受付設定 (plugin 設定と別に永続化したいもの) ─
--    プラグイン固有の簡易設定は store_plugins.config で持つが、
--    曜日別営業時間は列数が多いのでここに正規化する。
CREATE TABLE IF NOT EXISTS public.reservation_business_hours (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  plugin         TEXT NOT NULL,                 -- 'reservation_table' 等
  day_of_week    INT  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time      TIME NOT NULL,
  close_time     TIME NOT NULL,
  last_order_min INT  NOT NULL DEFAULT 60,      -- 閉店何分前まで受付
  slot_minutes   INT  NOT NULL DEFAULT 30,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, plugin, day_of_week),
  CHECK (close_time > open_time)
);

CREATE TRIGGER handle_reservation_business_hours_updated_at
  BEFORE UPDATE ON public.reservation_business_hours
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ── 4. RLS ───────────────────────────────────────────────
ALTER TABLE public.reservation_tables         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_business_hours ENABLE ROW LEVEL SECURITY;

-- reservation_tables: 所属メンバーは閲覧可、書き込みは管理ロール
DROP POLICY IF EXISTS reservation_tables_select_members ON public.reservation_tables;
CREATE POLICY reservation_tables_select_members ON public.reservation_tables
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS reservation_tables_write_managed ON public.reservation_tables;
CREATE POLICY reservation_tables_write_managed ON public.reservation_tables
  FOR ALL TO authenticated
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
  )
  WITH CHECK (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
  );

-- reservation_business_hours: 同上
DROP POLICY IF EXISTS reservation_business_hours_select_members ON public.reservation_business_hours;
CREATE POLICY reservation_business_hours_select_members ON public.reservation_business_hours
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS reservation_business_hours_write_managed ON public.reservation_business_hours;
CREATE POLICY reservation_business_hours_write_managed ON public.reservation_business_hours
  FOR ALL TO authenticated
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
  )
  WITH CHECK (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
  );

SELECT 'RESERVATION TABLES SCHEMA COMPLETE' AS status;
