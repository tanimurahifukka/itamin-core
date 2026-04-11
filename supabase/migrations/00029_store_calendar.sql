-- ============================================================
-- 00029: Store calendar (営業日カレンダー)
-- ============================================================
-- 背景:
--   営業時間情報が stores.settings.open_time / reservation_business_hours
--   (予約プラグインごと) / reservation_blackouts に散在しており、
--   非予約機能 (シフト・打刻・HACCP・キオスク) が営業日を知らない。
--
-- 対策:
--   店舗レベルの営業カレンダーを 1 ソース化する。
--     - store_business_hours          曜日別 通常営業時間
--     - store_calendar_overrides      日単位の例外 (休業・特別営業・祝日)
--   既存 reservation_business_hours は予約特化の補正層として残すが、
--   store_business_hours を master として優先する運用に切り替える。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.store_business_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT false,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_business_hours_open_before_close
    CHECK (is_closed OR open_time < close_time),
  UNIQUE (store_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_store_business_hours_store
  ON public.store_business_hours (store_id, day_of_week);

CREATE TABLE IF NOT EXISTS public.store_calendar_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('closed', 'special_hours', 'holiday')),
  open_time   TIME,
  close_time  TIME,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_calendar_overrides_special_hours_needs_times
    CHECK (kind <> 'special_hours' OR (open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time)),
  UNIQUE (store_id, date)
);

CREATE INDEX IF NOT EXISTS idx_calendar_overrides_store_date
  ON public.store_calendar_overrides (store_id, date);

-- 既存 stores.settings.open_time / close_time を 7 曜日分の business_hours に展開
INSERT INTO public.store_business_hours (store_id, day_of_week, open_time, close_time)
SELECT
  s.id,
  dow,
  COALESCE(NULLIF(s.settings->>'open_time', '')::TIME, '10:00'::TIME),
  COALESCE(NULLIF(s.settings->>'close_time', '')::TIME, '22:00'::TIME)
FROM public.stores s
CROSS JOIN generate_series(0, 6) AS dow
ON CONFLICT (store_id, day_of_week) DO NOTHING;

ALTER TABLE public.store_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_calendar_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_business_hours_select ON public.store_business_hours;
CREATE POLICY store_business_hours_select ON public.store_business_hours
  FOR SELECT USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS store_calendar_overrides_select ON public.store_calendar_overrides;
CREATE POLICY store_calendar_overrides_select ON public.store_calendar_overrides
  FOR SELECT USING (store_id IN (SELECT public.get_my_store_ids()));

SELECT 'STORE CALENDAR COMPLETE' AS status;
