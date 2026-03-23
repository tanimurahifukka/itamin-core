-- ============================================================
-- ITAMIN CORE プラグイン用テーブル追加
-- notices, inventory, daily_reports, expenses, feedback,
-- paid_leave, leave_records
-- ============================================================

-- ============================================================
-- 1. notices（連絡ノート）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.profiles(id),
  author_name TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  pinned      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の連絡ノートを読める" ON public.notices;
CREATE POLICY "所属店舗の連絡ノートを読める"
  ON public.notices FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "所属スタッフが投稿できる" ON public.notices;
CREATE POLICY "所属スタッフが投稿できる"
  ON public.notices FOR INSERT
  WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "manager以上が連絡ノートを管理できる" ON public.notices;
CREATE POLICY "manager以上が連絡ノートを管理できる"
  ON public.notices FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_notices_store ON public.notices(store_id, created_at);

-- ============================================================
-- 2. notice_reads（既読管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notice_reads (
  notice_id   UUID NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, user_id)
);

ALTER TABLE public.notice_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "自分の既読を読める" ON public.notice_reads;
CREATE POLICY "自分の既読を読める"
  ON public.notice_reads FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "自分の既読を作成できる" ON public.notice_reads;
CREATE POLICY "自分の既読を作成できる"
  ON public.notice_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 3. inventory_items（在庫管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT '',
  unit            TEXT NOT NULL DEFAULT '個',
  quantity        INTEGER NOT NULL DEFAULT 0,
  min_quantity    INTEGER NOT NULL DEFAULT 0,
  cost            INTEGER NOT NULL DEFAULT 0,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT '適正',
  last_checked_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の在庫を読める" ON public.inventory_items;
CREATE POLICY "所属店舗の在庫を読める"
  ON public.inventory_items FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "所属スタッフが在庫を管理できる" ON public.inventory_items;
CREATE POLICY "所属スタッフが在庫を管理できる"
  ON public.inventory_items FOR ALL
  USING (store_id IN (SELECT public.get_my_store_ids()));

CREATE INDEX IF NOT EXISTS idx_inventory_items_store ON public.inventory_items(store_id);

-- ============================================================
-- 4. daily_reports（日報）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  sales          INTEGER NOT NULL DEFAULT 0,
  customer_count INTEGER NOT NULL DEFAULT 0,
  weather        TEXT NOT NULL DEFAULT '',
  memo           TEXT NOT NULL DEFAULT '',
  created_by     UUID NOT NULL REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, date)
);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の日報を読める" ON public.daily_reports;
CREATE POLICY "所属店舗の日報を読める"
  ON public.daily_reports FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "所属スタッフが日報を書ける" ON public.daily_reports;
CREATE POLICY "所属スタッフが日報を書ける"
  ON public.daily_reports FOR INSERT
  WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "所属スタッフが日報を更新できる" ON public.daily_reports;
CREATE POLICY "所属スタッフが日報を更新できる"
  ON public.daily_reports FOR UPDATE
  USING (store_id IN (SELECT public.get_my_store_ids()));

CREATE INDEX IF NOT EXISTS idx_daily_reports_store_date ON public.daily_reports(store_id, date);

-- ============================================================
-- 5. expenses（経費）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  category     TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  amount       INTEGER NOT NULL DEFAULT 0,
  receipt_note TEXT,
  created_by   UUID NOT NULL REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の経費を読める" ON public.expenses;
CREATE POLICY "所属店舗の経費を読める"
  ON public.expenses FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "所属スタッフが経費を登録できる" ON public.expenses;
CREATE POLICY "所属スタッフが経費を登録できる"
  ON public.expenses FOR INSERT
  WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "manager以上が経費を管理できる" ON public.expenses;
CREATE POLICY "manager以上が経費を管理できる"
  ON public.expenses FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_expenses_store_date ON public.expenses(store_id, date);

-- ============================================================
-- 6. customer_feedback（顧客フィードバック）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  type       TEXT NOT NULL DEFAULT 'suggestion',
  content    TEXT NOT NULL DEFAULT '',
  response   TEXT,
  status     TEXT NOT NULL DEFAULT '未対応',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗のフィードバックを読める" ON public.customer_feedback;
CREATE POLICY "所属店舗のフィードバックを読める"
  ON public.customer_feedback FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "所属スタッフがフィードバックを登録できる" ON public.customer_feedback;
CREATE POLICY "所属スタッフがフィードバックを登録できる"
  ON public.customer_feedback FOR INSERT
  WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "manager以上がフィードバックを管理できる" ON public.customer_feedback;
CREATE POLICY "manager以上がフィードバックを管理できる"
  ON public.customer_feedback FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_customer_feedback_store ON public.customer_feedback(store_id, date);

-- ============================================================
-- 7. paid_leaves（有給残日数）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paid_leaves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_days  NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days   NUMERIC(5,1) NOT NULL DEFAULT 0,
  fiscal_year INTEGER NOT NULL,
  UNIQUE(store_id, staff_id, fiscal_year)
);

ALTER TABLE public.paid_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の有給を読める" ON public.paid_leaves;
CREATE POLICY "所属店舗の有給を読める"
  ON public.paid_leaves FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "manager以上が有給を管理できる" ON public.paid_leaves;
CREATE POLICY "manager以上が有給を管理できる"
  ON public.paid_leaves FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- 8. leave_records（有給取得履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_records (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date     DATE NOT NULL,
  type     TEXT NOT NULL DEFAULT '全日',
  note     TEXT
);

ALTER TABLE public.leave_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の有給履歴を読める" ON public.leave_records;
CREATE POLICY "所属店舗の有給履歴を読める"
  ON public.leave_records FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));
DROP POLICY IF EXISTS "manager以上が有給履歴を管理できる" ON public.leave_records;
CREATE POLICY "manager以上が有給履歴を管理できる"
  ON public.leave_records FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

CREATE INDEX IF NOT EXISTS idx_leave_records_store ON public.leave_records(store_id, staff_id, date);

-- ============================================================
-- 9. increment_used_days ストアドプロシージャ
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_used_days(
  p_store_id UUID,
  p_staff_id UUID,
  p_fiscal_year INTEGER,
  p_increment NUMERIC
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.paid_leaves
  SET used_days = used_days + p_increment
  WHERE store_id = p_store_id
    AND staff_id = p_staff_id
    AND fiscal_year = p_fiscal_year;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
