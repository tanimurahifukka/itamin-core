-- ============================================================
-- 00017: Organization Layer + Platform Admin
-- ============================================================

-- ============================================================
-- 1. ENUM Types
-- ============================================================
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'viewer');
CREATE TYPE platform_role AS ENUM ('super_admin', 'admin', 'support', 'viewer');

-- ============================================================
-- 2. organizations テーブル
-- ============================================================
CREATE TABLE public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  parent_id   UUID REFERENCES public.organizations(id),
  org_type    TEXT NOT NULL DEFAULT 'independent',
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizations_parent_id ON public.organizations(parent_id);
CREATE INDEX idx_organizations_slug ON public.organizations(slug);

CREATE TRIGGER handle_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ============================================================
-- 3. organization_members テーブル
-- ============================================================
CREATE TABLE public.organization_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      org_role NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org_id ON public.organization_members(org_id);

-- ============================================================
-- 4. stores.org_id カラム追加
-- ============================================================
ALTER TABLE public.stores ADD COLUMN org_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_stores_org_id ON public.stores(org_id);

-- ============================================================
-- 5. stores.owner_id を nullable 化
-- ============================================================
ALTER TABLE public.stores ALTER COLUMN owner_id DROP NOT NULL;

-- ============================================================
-- 6. platform_team テーブル
-- ============================================================
CREATE TABLE public.platform_team (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      platform_role NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. plans テーブル
-- ============================================================
CREATE TABLE public.plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  max_stores          INT NOT NULL DEFAULT 1,
  max_staff_per_store INT NOT NULL DEFAULT 10,
  max_plugins         INT NOT NULL DEFAULT 5,
  allowed_plugins     TEXT[] NOT NULL DEFAULT '{}',
  price_monthly_jpy   INT NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. organization_subscriptions テーブル
-- ============================================================
CREATE TABLE public.organization_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES public.plans(id),
  status     TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at    TIMESTAMPTZ,
  UNIQUE(org_id)
);

-- ============================================================
-- 9. RLS ヘルパー関数
-- ============================================================

-- 組織メンバーとしてアクセス可能な store_id を返す
CREATE OR REPLACE FUNCTION public.get_org_store_ids()
RETURNS SETOF UUID AS $$
  SELECT s.id FROM public.stores s
  JOIN public.organization_members om ON om.org_id = s.org_id
  WHERE om.user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- プラットフォームチームか判定
CREATE OR REPLACE FUNCTION public.is_platform_team()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_team WHERE user_id = auth.uid()
  )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- プラットフォームチームのロールを返す
CREATE OR REPLACE FUNCTION public.get_platform_role()
RETURNS platform_role AS $$
  SELECT role FROM public.platform_team WHERE user_id = auth.uid() LIMIT 1
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 既存の get_my_store_ids() を拡張（org 経由も含める）
CREATE OR REPLACE FUNCTION public.get_my_store_ids()
RETURNS SETOF UUID AS $$
  SELECT store_id FROM public.store_staff WHERE user_id = auth.uid()
  UNION
  SELECT s.id FROM public.stores s
  JOIN public.organization_members om ON om.org_id = s.org_id
  WHERE om.user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- 10. RLS 有効化
-- ============================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. RLS ポリシー: organizations
-- ============================================================
-- SELECT: 所属メンバーまたはプラットフォームチーム
CREATE POLICY "組織を読める"
  ON public.organizations FOR SELECT
  USING (
    id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid())
    OR public.is_platform_team()
  );

-- INSERT: 認証済みユーザーなら誰でも作成可
CREATE POLICY "組織を作成できる"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: 組織の owner/admin またはプラットフォームチーム
CREATE POLICY "組織を更新できる"
  ON public.organizations FOR UPDATE
  USING (
    id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR public.is_platform_team()
  );

-- ============================================================
-- 12. RLS ポリシー: organization_members
-- ============================================================
CREATE POLICY "組織メンバーを読める"
  ON public.organization_members FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid())
    OR public.is_platform_team()
  );

CREATE POLICY "組織メンバーを追加できる"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR public.is_platform_team()
  );

CREATE POLICY "組織メンバーを更新できる"
  ON public.organization_members FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR public.is_platform_team()
  );

CREATE POLICY "組織メンバーを削除できる"
  ON public.organization_members FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
    OR public.is_platform_team()
  );

-- ============================================================
-- 13. RLS ポリシー: platform_team
-- ============================================================
-- platform_team は super_admin のみ管理可能
CREATE POLICY "プラットフォームチームを読める"
  ON public.platform_team FOR SELECT
  USING (public.is_platform_team());

CREATE POLICY "プラットフォームチームを管理できる"
  ON public.platform_team FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.platform_team WHERE user_id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "プラットフォームチームを更新できる"
  ON public.platform_team FOR UPDATE
  USING (
    (SELECT role FROM public.platform_team WHERE user_id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "プラットフォームチームを削除できる"
  ON public.platform_team FOR DELETE
  USING (
    (SELECT role FROM public.platform_team WHERE user_id = auth.uid()) = 'super_admin'
  );

-- ============================================================
-- 14. RLS ポリシー: plans
-- ============================================================
-- 全員読める、管理はプラットフォームチームのみ
CREATE POLICY "プランを読める"
  ON public.plans FOR SELECT
  USING (true);

CREATE POLICY "プランを管理できる"
  ON public.plans FOR INSERT
  WITH CHECK (public.is_platform_team());

CREATE POLICY "プランを更新できる"
  ON public.plans FOR UPDATE
  USING (public.is_platform_team());

-- ============================================================
-- 15. RLS ポリシー: organization_subscriptions
-- ============================================================
CREATE POLICY "サブスクリプションを読める"
  ON public.organization_subscriptions FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid())
    OR public.is_platform_team()
  );

CREATE POLICY "サブスクリプションを管理できる"
  ON public.organization_subscriptions FOR INSERT
  WITH CHECK (public.is_platform_team());

CREATE POLICY "サブスクリプションを更新できる"
  ON public.organization_subscriptions FOR UPDATE
  USING (public.is_platform_team());

-- ============================================================
-- 16. stores RLS 拡張: プラットフォームチームも読めるように
-- ============================================================
-- 既存ポリシーを削除して再作成（get_my_store_ids() が拡張されたので org メンバーは自動的にカバー）
DROP POLICY IF EXISTS "所属店舗を読める" ON public.stores;
CREATE POLICY "所属店舗を読める"
  ON public.stores FOR SELECT
  USING (
    id IN (SELECT public.get_my_store_ids())
    OR public.is_platform_team()
  );

-- ============================================================
-- 17. デフォルトプラン投入
-- ============================================================
INSERT INTO public.plans (name, slug, max_stores, max_staff_per_store, max_plugins, price_monthly_jpy)
VALUES
  ('Free',       'free',       1,  5,  3, 0),
  ('Starter',    'starter',    3, 15, 10, 2980),
  ('Business',   'business',  10, 50, 50, 9800),
  ('Enterprise', 'enterprise', -1, -1, -1, 0);  -- -1 = 無制限

SELECT 'ORGANIZATIONS MIGRATION COMPLETE' AS status;
