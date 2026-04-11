-- ============================================================
-- RLS ヘルパー関数（SECURITY DEFINER でRLSバイパス）
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

-- ============================================================
-- Fix store_staff SELECT policy (infinite recursion fix)
-- ============================================================
DROP POLICY IF EXISTS "所属店舗のスタッフを読める" ON public.store_staff;
CREATE POLICY "所属店舗のスタッフを読める"
  ON public.store_staff FOR SELECT
  USING (user_id = auth.uid() OR store_id IN (SELECT public.get_my_store_ids()));

-- ============================================================
-- Fix stores SELECT policy
-- ============================================================
DROP POLICY IF EXISTS "所属店舗を読める" ON public.stores;
CREATE POLICY "所属店舗を読める"
  ON public.stores FOR SELECT
  USING (id IN (SELECT public.get_my_store_ids()));

-- ============================================================
-- Fix profiles policies
-- ============================================================
DROP POLICY IF EXISTS "同じ店舗のプロフィールを読める" ON public.profiles;
CREATE POLICY "同じ店舗のプロフィールを読める"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR id IN (
      SELECT ss.user_id FROM public.store_staff ss
      WHERE ss.store_id IN (SELECT public.get_my_store_ids())
    )
  );

-- ============================================================
-- Fix time_records policies
-- ============================================================
DROP POLICY IF EXISTS "所属店舗のタイムカードを読める" ON public.time_records;
CREATE POLICY "所属店舗のタイムカードを読める"
  ON public.time_records FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "自分の打刻を作成できる" ON public.time_records;
CREATE POLICY "自分の打刻を作成できる"
  ON public.time_records FOR INSERT
  WITH CHECK (staff_id IN (SELECT public.get_my_staff_ids()));

DROP POLICY IF EXISTS "自分の打刻を更新できる" ON public.time_records;
CREATE POLICY "自分の打刻を更新できる"
  ON public.time_records FOR UPDATE
  USING (staff_id IN (SELECT public.get_my_staff_ids()));

-- ============================================================
-- Fix store_plugins policies
-- ============================================================
DROP POLICY IF EXISTS "所属店舗のプラグインを読める" ON public.store_plugins;
CREATE POLICY "所属店舗のプラグインを読める"
  ON public.store_plugins FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上がプラグインを管理できる" ON public.store_plugins;
CREATE POLICY "manager以上がプラグインを管理できる"
  ON public.store_plugins FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- Fix plugin_permissions policies
-- ============================================================
DROP POLICY IF EXISTS "所属店舗の権限を読める" ON public.plugin_permissions;
CREATE POLICY "所属店舗の権限を読める"
  ON public.plugin_permissions FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上が権限を管理できる" ON public.plugin_permissions;
CREATE POLICY "manager以上が権限を管理できる"
  ON public.plugin_permissions FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- v1 checklists/check_records は 00013 で drop 済み。
-- HACCP v2 (checklist_templates/_submissions) の policy は 00013 で定義済み。
-- ============================================================

-- ============================================================
-- Fix shifts policies
-- ============================================================
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗のシフトを読める" ON public.shifts;
CREATE POLICY "所属店舗のシフトを読める"
  ON public.shifts FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上がシフトを管理できる" ON public.shifts;
CREATE POLICY "manager以上がシフトを管理できる"
  ON public.shifts FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

DROP POLICY IF EXISTS "自分のシフトを追加できる" ON public.shifts;
CREATE POLICY "自分のシフトを追加できる"
  ON public.shifts FOR INSERT
  WITH CHECK (staff_id IN (SELECT public.get_my_staff_ids()));

-- ============================================================
-- Fix shift_requests policies
-- ============================================================
ALTER TABLE public.shift_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "シフト希望を読める" ON public.shift_requests;
CREATE POLICY "シフト希望を読める"
  ON public.shift_requests FOR SELECT
  USING (staff_id IN (SELECT public.get_my_staff_ids()) OR store_id IN (SELECT public.get_my_managed_store_ids()));

DROP POLICY IF EXISTS "自分のシフト希望を登録できる" ON public.shift_requests;
CREATE POLICY "自分のシフト希望を登録できる"
  ON public.shift_requests FOR INSERT
  WITH CHECK (staff_id IN (SELECT public.get_my_staff_ids()));

DROP POLICY IF EXISTS "自分のシフト希望を更新できる" ON public.shift_requests;
CREATE POLICY "自分のシフト希望を更新できる"
  ON public.shift_requests FOR UPDATE
  USING (staff_id IN (SELECT public.get_my_staff_ids()));

DROP POLICY IF EXISTS "manager以上がシフト希望を削除できる" ON public.shift_requests;
CREATE POLICY "manager以上がシフト希望を削除できる"
  ON public.shift_requests FOR DELETE
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- Fix shift_templates policies
-- ============================================================
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗のテンプレートを読める" ON public.shift_templates;
CREATE POLICY "所属店舗のテンプレートを読める"
  ON public.shift_templates FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上がテンプレートを管理できる" ON public.shift_templates;
CREATE POLICY "manager以上がテンプレートを管理できる"
  ON public.shift_templates FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- Fix store_invitations policies
-- ============================================================
ALTER TABLE public.store_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の招待を読める" ON public.store_invitations;
CREATE POLICY "所属店舗の招待を読める"
  ON public.store_invitations FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上が招待を作成できる" ON public.store_invitations;
CREATE POLICY "manager以上が招待を作成できる"
  ON public.store_invitations FOR INSERT
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ============================================================
-- Fix reservations policies
-- ============================================================
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗の予約を読める" ON public.reservations;
CREATE POLICY "所属店舗の予約を読める"
  ON public.reservations FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上が予約を管理できる" ON public.reservations;
CREATE POLICY "manager以上が予約を管理できる"
  ON public.reservations FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

SELECT 'RLS FIX COMPLETE' AS status;
