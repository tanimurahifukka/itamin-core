-- ============================================================
-- 00023: Reservation core schema (shared across all reservation types)
-- ============================================================
-- 目的:
--   店舗予約システムの共有基盤。テーブル/時間帯/スクール/イベント
--   の 4 タイプ全てが reservations 行に統一して書き込む。タイプ固有
--   のリソース (tables, timeslots 等) は後続マイグレーションで追加する。
--
-- 方針:
--   - 既存の customers テーブル (00016) を拡張して予約とリンク
--   - stores に slug を追加して公開予約 URL の入口にする
--   - reservations は全 4 タイプ共通のマスタ行
--   - 監査ログと通知キューを同時に用意
--   - RLS は「所属店舗かつ owner/manager/leader」を踏襲
-- ============================================================

-- ── 1. stores.slug (公開 URL 用) ────────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 予約語 (admin, api, nfc, r, public) の使用禁止と英数ハイフンのみ許容
ALTER TABLE public.stores
  ADD CONSTRAINT stores_slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_slug
  ON public.stores(slug) WHERE slug IS NOT NULL;

-- ── 2. customers 拡張 ──────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS line_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS visit_count      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visited_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source           TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_store_line
  ON public.customers(store_id, line_user_id)
  WHERE line_user_id IS NOT NULL AND deleted_at IS NULL;

-- ── 3. reservations (4 タイプ共通マスタ) ───────────────────
CREATE TABLE IF NOT EXISTS public.reservations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id        UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  reservation_type   TEXT NOT NULL CHECK (reservation_type IN ('table','timeslot','school','event')),
  status             TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('pending','confirmed','seated','completed','no_show','cancelled')),
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  party_size         INT NOT NULL DEFAULT 1 CHECK (party_size > 0),
  resource_ref       UUID,
  source             TEXT NOT NULL CHECK (source IN ('web','line','phone','walkin','admin')),
  confirmation_code  TEXT NOT NULL,
  customer_name      TEXT NOT NULL,
  customer_phone     TEXT,
  customer_email     TEXT,
  notes              TEXT,
  internal_notes     TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount_total       INT,
  paid               BOOLEAN NOT NULL DEFAULT false,
  payment_method     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at       TIMESTAMPTZ,
  cancelled_reason   TEXT,
  created_by         UUID,
  UNIQUE (store_id, confirmation_code),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_reservations_store_starts
  ON public.reservations(store_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_store_type_status
  ON public.reservations(store_id, reservation_type, status);
CREATE INDEX IF NOT EXISTS idx_reservations_customer
  ON public.reservations(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_resource
  ON public.reservations(resource_ref) WHERE resource_ref IS NOT NULL;

CREATE TRIGGER handle_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ── 4. reservation_logs (監査ログ) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.reservation_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,
  actor_type     TEXT NOT NULL CHECK (actor_type IN ('customer','staff','system')),
  actor_id       UUID,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_logs_reservation
  ON public.reservation_logs(reservation_id, created_at DESC);

-- ── 5. reservation_notifications (送信履歴) ────────────────
CREATE TABLE IF NOT EXISTS public.reservation_notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL CHECK (channel IN ('email','line','sms')),
  kind           TEXT NOT NULL CHECK (kind IN ('confirm','reminder','cancel','modify')),
  status         TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed','skipped')),
  recipient      TEXT,
  scheduled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at        TIMESTAMPTZ,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_notifications_pending
  ON public.reservation_notifications(status, scheduled_at)
  WHERE status = 'pending';

-- ── 6. reservation_blackouts (休業日) ──────────────────────
CREATE TABLE IF NOT EXISTS public.reservation_blackouts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  plugin     TEXT,
  date       DATE NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_blackouts_uniq
  ON public.reservation_blackouts(store_id, COALESCE(plugin, ''), date);

-- ── 7. RLS ─────────────────────────────────────────────────
ALTER TABLE public.reservations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_blackouts     ENABLE ROW LEVEL SECURITY;

-- reservations: owner/manager/leader は全操作、書き込みは主に service_role
DROP POLICY IF EXISTS reservations_select_managed ON public.reservations;
CREATE POLICY reservations_select_managed ON public.reservations
  FOR SELECT TO authenticated
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
  );

DROP POLICY IF EXISTS reservations_write_managed ON public.reservations;
CREATE POLICY reservations_write_managed ON public.reservations
  FOR ALL TO authenticated
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
  )
  WITH CHECK (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
  );

-- reservation_logs: 管理ロールのみ閲覧、書き込みは service_role 経由
DROP POLICY IF EXISTS reservation_logs_select_managed ON public.reservation_logs;
CREATE POLICY reservation_logs_select_managed ON public.reservation_logs
  FOR SELECT TO authenticated
  USING (
    reservation_id IN (
      SELECT id FROM public.reservations
      WHERE store_id IN (SELECT public.get_my_store_ids())
        AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
    )
  );

-- reservation_notifications: 同上
DROP POLICY IF EXISTS reservation_notifications_select_managed ON public.reservation_notifications;
CREATE POLICY reservation_notifications_select_managed ON public.reservation_notifications
  FOR SELECT TO authenticated
  USING (
    reservation_id IN (
      SELECT id FROM public.reservations
      WHERE store_id IN (SELECT public.get_my_store_ids())
        AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
    )
  );

-- reservation_blackouts: 管理ロールの読み書き可
DROP POLICY IF EXISTS reservation_blackouts_select_members ON public.reservation_blackouts;
CREATE POLICY reservation_blackouts_select_members ON public.reservation_blackouts
  FOR SELECT TO authenticated
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS reservation_blackouts_write_managed ON public.reservation_blackouts;
CREATE POLICY reservation_blackouts_write_managed ON public.reservation_blackouts
  FOR ALL TO authenticated
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
  )
  WITH CHECK (
    store_id IN (SELECT public.get_my_store_ids())
    AND public.get_my_role_in_store(store_id) IN ('owner','manager','leader')
  );

SELECT 'RESERVATION CORE SCHEMA COMPLETE' AS status;
