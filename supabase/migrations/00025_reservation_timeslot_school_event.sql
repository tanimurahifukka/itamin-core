-- ============================================================
-- 00025: Reservation — timeslot / school / event resources
-- ============================================================
-- 目的:
--   テーブル予約以外の 3 プラグインで使うリソース表を追加する。
--   いずれも capacity ベース (席数ではなく定員ベース) で
--   reservations.resource_ref に紐付ける。
--
-- 依存: 00023_reservation_core.sql
-- ============================================================

-- ── 1. timeslot (時間帯予約) ───────────────────────────────
-- 例: ランチ A / ランチ B / 予約制バイキング
-- 曜日と開始/終了時刻で定義し、指定曜日のみ有効。
CREATE TABLE IF NOT EXISTS public.reservation_timeslots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  day_of_week    INT  NOT NULL CHECK (day_of_week BETWEEN -1 AND 6), -- -1 = 毎日
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  capacity       INT  NOT NULL CHECK (capacity > 0),
  price          INT,                    -- 参考価格（円）、決済は後続フェーズ
  active         BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_reservation_timeslots_store
  ON public.reservation_timeslots(store_id, sort_order)
  WHERE active = true;

CREATE TRIGGER handle_reservation_timeslots_updated_at
  BEFORE UPDATE ON public.reservation_timeslots
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ── 2. school (スクール/コース) ────────────────────────────
-- 例: 料理教室、ヨガ教室、子供向けサッカー教室
-- 1 コース = 1 回または複数回のセッションで構成される。
CREATE TABLE IF NOT EXISTS public.reservation_schools (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  instructor     TEXT,
  capacity       INT  NOT NULL CHECK (capacity > 0),
  price          INT,                    -- 参考価格（円）
  image_url      TEXT,
  active         BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER handle_reservation_schools_updated_at
  BEFORE UPDATE ON public.reservation_schools
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- スクールの開催セッション (実際の日時)
CREATE TABLE IF NOT EXISTS public.reservation_school_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES public.reservation_schools(id) ON DELETE CASCADE,
  store_id       UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,
  capacity_override INT,                 -- NULL なら親コースの capacity
  status         TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','cancelled','completed')),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_school_sessions_school
  ON public.reservation_school_sessions(school_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_school_sessions_store_upcoming
  ON public.reservation_school_sessions(store_id, starts_at)
  WHERE status = 'scheduled';

-- ── 3. event (単発イベント) ───────────────────────────────
-- 例: 貸切パーティ、ライブ、ワイン会
CREATE TABLE IF NOT EXISTS public.reservation_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,
  capacity       INT  NOT NULL CHECK (capacity > 0),
  price          INT,                    -- 参考価格（円）
  image_url      TEXT,
  status         TEXT NOT NULL DEFAULT 'published'
                  CHECK (status IN ('draft','published','cancelled','completed')),
  sort_order     INT  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_reservation_events_store_starts
  ON public.reservation_events(store_id, starts_at DESC)
  WHERE status = 'published';

CREATE TRIGGER handle_reservation_events_updated_at
  BEFORE UPDATE ON public.reservation_events
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ── 4. RLS ─────────────────────────────────────────────────
ALTER TABLE public.reservation_timeslots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_schools         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_school_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_events          ENABLE ROW LEVEL SECURITY;

-- 共通ポリシー: 所属メンバーは参照、管理ロールは書き込み
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'reservation_timeslots',
    'reservation_schools',
    'reservation_school_sessions',
    'reservation_events'
  ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_select_members ON public.%I;',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_select_members ON public.%I
         FOR SELECT TO authenticated
         USING (store_id IN (SELECT public.get_my_store_ids()));',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_write_managed ON public.%I;',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_write_managed ON public.%I
         FOR ALL TO authenticated
         USING (
           store_id IN (SELECT public.get_my_store_ids())
           AND public.get_my_role_in_store(store_id) IN (''owner'',''manager'',''leader'')
         )
         WITH CHECK (
           store_id IN (SELECT public.get_my_store_ids())
           AND public.get_my_role_in_store(store_id) IN (''owner'',''manager'',''leader'')
         );',
      t, t
    );
  END LOOP;
END $$;

-- ── 5. 予約リクエストのレート制限用テーブル ─────────────
-- 公開予約 API のブルートフォース・スパム抑止。
-- IP + 店舗 + action 単位でリクエスト時刻を記録する。
CREATE TABLE IF NOT EXISTS public.reservation_rate_limits (
  id         BIGSERIAL PRIMARY KEY,
  ip         TEXT NOT NULL,
  store_id   UUID,
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_rate_limits_lookup
  ON public.reservation_rate_limits(ip, action, created_at DESC);

-- 古いエントリは手動クリーンで OK (cron で 1h 以上古いものを削除する想定)。

SELECT 'RESERVATION PLUGINS (timeslot/school/event) SCHEMA COMPLETE' AS status;
