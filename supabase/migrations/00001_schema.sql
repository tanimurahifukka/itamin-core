-- ============================================================
-- ITAMIN CORE 統合スキーマ v2
-- 予約システム結合を見据えた設計
-- ============================================================

-- ============================================================
-- ENUM 型定義（一箇所で管理）
-- ============================================================
CREATE TYPE staff_role       AS ENUM ('owner', 'manager', 'full_time', 'part_time');
CREATE TYPE check_timing     AS ENUM ('clock_in', 'clock_out');
CREATE TYPE shift_status     AS ENUM ('draft', 'published');
CREATE TYPE request_type     AS ENUM ('available', 'unavailable', 'preferred');
-- 予約システム用（将来）
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

-- ============================================================
-- 1. profiles（Supabase Auth 連携）
-- ============================================================
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT,
  picture    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自分のプロフィールを読める"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "自分のプロフィールを更新できる"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 新規ユーザー作成時に自動でprofileを作る
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, phone, picture)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. stores（事業所）
-- ============================================================
CREATE TABLE public.stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  owner_id    UUID NOT NULL REFERENCES public.profiles(id),
  timezone    TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. store_staff（スタッフ所属）
-- ============================================================
CREATE TABLE public.store_staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        staff_role NOT NULL DEFAULT 'part_time',
  hourly_wage INTEGER,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, user_id)
);

ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS ヘルパー関数（再帰防止用 SECURITY DEFINER）
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_store_ids()
RETURNS SETOF UUID AS $$
  SELECT store_id FROM public.store_staff WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_managed_store_ids()
RETURNS SETOF UUID AS $$
  SELECT store_id FROM public.store_staff
  WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_staff_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM public.store_staff WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- stores RLS
CREATE POLICY "所属店舗を読める"
  ON public.stores FOR SELECT
  USING (id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "店舗を作成できる"
  ON public.stores FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- store_staff RLS
CREATE POLICY "所属店舗のスタッフを読める"
  ON public.store_staff FOR SELECT
  USING (user_id = auth.uid() OR store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "スタッフを追加できる"
  ON public.store_staff FOR INSERT
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()) OR user_id = auth.uid());

-- ============================================================
-- 4. store_invitations（招待）
-- ============================================================
CREATE TABLE public.store_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name        TEXT,
  email       TEXT NOT NULL,
  role        staff_role NOT NULL DEFAULT 'part_time',
  hourly_wage INTEGER,
  invited_by  UUID NOT NULL REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, email)
);

ALTER TABLE public.store_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所属店舗の招待を読める"
  ON public.store_invitations FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上が招待を作成できる"
  ON public.store_invitations FOR INSERT
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

-- 招待自動処理
CREATE OR REPLACE FUNCTION public.process_invitations()
RETURNS TRIGGER AS $$
DECLARE inv RECORD;
BEGIN
  FOR inv IN SELECT * FROM public.store_invitations WHERE email = new.email
  LOOP
    IF inv.name IS NOT NULL AND inv.name != '' THEN
      UPDATE public.profiles SET name = inv.name WHERE id = new.id;
    END IF;
    INSERT INTO public.store_staff (store_id, user_id, role, hourly_wage)
    VALUES (inv.store_id, new.id, inv.role, inv.hourly_wage)
    ON CONFLICT (store_id, user_id) DO NOTHING;
    DELETE FROM public.store_invitations WHERE id = inv.id;
  END LOOP;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_profile_created_process_invitations
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.process_invitations();

-- ============================================================
-- 5. time_records（タイムカード）
-- ============================================================
CREATE TABLE public.time_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id      UUID NOT NULL REFERENCES public.store_staff(id) ON DELETE CASCADE,
  clock_in      TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out     TIMESTAMPTZ,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.time_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所属店舗のタイムカードを読める"
  ON public.time_records FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "自分の打刻を作成できる"
  ON public.time_records FOR INSERT
  WITH CHECK (staff_id IN (SELECT public.get_my_staff_ids()));
CREATE POLICY "自分の打刻を更新できる"
  ON public.time_records FOR UPDATE
  USING (staff_id IN (SELECT public.get_my_staff_ids()));

-- ============================================================
-- 6. store_plugins（プラグイン管理）
-- ============================================================
CREATE TABLE public.store_plugins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  plugin_name TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, plugin_name)
);

ALTER TABLE public.store_plugins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所属店舗のプラグインを読める"
  ON public.store_plugins FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上がプラグインを管理できる"
  ON public.store_plugins FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- 6b. plugin_permissions（プラグインごとのロール別アクセス権）
-- ============================================================
CREATE TABLE public.plugin_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  plugin_name TEXT NOT NULL,
  role        staff_role NOT NULL,
  UNIQUE(store_id, plugin_name, role)
);

ALTER TABLE public.plugin_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所属店舗の権限を読める"
  ON public.plugin_permissions FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上が権限を管理できる"
  ON public.plugin_permissions FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

CREATE INDEX idx_plugin_permissions_store ON public.plugin_permissions(store_id, plugin_name);

-- ============================================================
-- 7. checklists + check_records（HACCP チェック）
-- ============================================================
CREATE TABLE public.checklists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  timing     check_timing NOT NULL,
  items      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, timing)
);

CREATE TABLE public.check_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id    UUID NOT NULL REFERENCES public.store_staff(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id),
  timing      check_timing NOT NULL,
  results     JSONB NOT NULL DEFAULT '[]',
  all_checked BOOLEAN NOT NULL DEFAULT false,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所属店舗のチェックリストを読める"
  ON public.checklists FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上がチェックリストを管理できる"
  ON public.checklists FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));
CREATE POLICY "所属店舗のチェック記録を読める"
  ON public.check_records FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "自分のチェック記録を作成できる"
  ON public.check_records FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 8. shifts（シフト — ENUM status）
-- ============================================================
CREATE TABLE public.shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id      UUID NOT NULL REFERENCES public.store_staff(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  status        shift_status NOT NULL DEFAULT 'draft',
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, staff_id, date)
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所属店舗のシフトを読める"
  ON public.shifts FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上がシフトを管理できる"
  ON public.shifts FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));
CREATE POLICY "自分のシフトを追加できる"
  ON public.shifts FOR INSERT
  WITH CHECK (staff_id IN (SELECT public.get_my_staff_ids()));

-- ============================================================
-- 9. shift_requests（シフト希望 — ENUM request_type）
-- ============================================================
CREATE TABLE public.shift_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES public.store_staff(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  request_type request_type NOT NULL DEFAULT 'available',
  start_time   TIME,
  end_time     TIME,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, staff_id, date)
);

ALTER TABLE public.shift_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "シフト希望を読める"
  ON public.shift_requests FOR SELECT
  USING (staff_id IN (SELECT public.get_my_staff_ids()) OR store_id IN (SELECT public.get_my_managed_store_ids()));
CREATE POLICY "自分のシフト希望を登録できる"
  ON public.shift_requests FOR INSERT
  WITH CHECK (staff_id IN (SELECT public.get_my_staff_ids()));
CREATE POLICY "自分のシフト希望を更新できる"
  ON public.shift_requests FOR UPDATE
  USING (staff_id IN (SELECT public.get_my_staff_ids()));
CREATE POLICY "manager以上がシフト希望を削除できる"
  ON public.shift_requests FOR DELETE
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- 10. shift_templates（シフトテンプレート）
-- ============================================================
CREATE TABLE public.shift_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  color         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, name)
);

ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所属店舗のテンプレートを読める"
  ON public.shift_templates FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上がテンプレートを管理できる"
  ON public.shift_templates FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- 11. reservations（予約 — 将来拡張用スタブ）
-- ============================================================
CREATE TABLE public.reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT,
  customer_email  TEXT,
  party_size      INTEGER NOT NULL DEFAULT 1,
  reserved_date   DATE NOT NULL,
  reserved_time   TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status          reservation_status NOT NULL DEFAULT 'pending',
  assigned_staff  UUID REFERENCES public.store_staff(id),
  note            TEXT,
  source          TEXT DEFAULT 'manual',  -- manual / web / phone / external
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "所属店舗の予約を読める"
  ON public.reservations FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "manager以上が予約を管理できる"
  ON public.reservations FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- インデックス
-- ============================================================
CREATE INDEX idx_store_staff_user          ON public.store_staff(user_id);
CREATE INDEX idx_store_staff_store         ON public.store_staff(store_id);
CREATE INDEX idx_time_records_store_date   ON public.time_records(store_id, clock_in);
CREATE INDEX idx_time_records_staff        ON public.time_records(staff_id);
CREATE INDEX idx_check_records_store_date  ON public.check_records(store_id, checked_at);
CREATE INDEX idx_shifts_store_date         ON public.shifts(store_id, date);
CREATE INDEX idx_shifts_staff              ON public.shifts(staff_id);
CREATE INDEX idx_shifts_status             ON public.shifts(store_id, status);
CREATE INDEX idx_shift_requests_store_date ON public.shift_requests(store_id, date);
CREATE INDEX idx_shift_requests_staff      ON public.shift_requests(staff_id);
CREATE INDEX idx_reservations_store_date   ON public.reservations(store_id, reserved_date);
CREATE INDEX idx_reservations_status       ON public.reservations(store_id, status);
