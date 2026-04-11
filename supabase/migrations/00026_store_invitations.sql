-- ============================================================
-- 00026: Store invitation tokens for safe staff self-join
-- ============================================================
-- 背景:
--   POST /api/stores/:storeId/join は認証不要で任意店舗に
--   part_time として参加できる状態で、storeId さえ知っていれば
--   他店舗のデータを横断閲覧できるテナント越境の温床になっていた。
--
-- 対策:
--   owner/manager が事前に招待トークンを発行し、そのトークンと
--   一致する場合のみ /join を許可する。
--
--   - トークンは 1 招待 = 1 token (単発使用または多回数使用)
--   - 失効日時・使用回数上限・対象 email (任意) でスコープ可能
--   - 使用済みトークンは使用不可
-- ============================================================

-- 00001 の旧スキーマ版 store_invitations (email/name/hourly_wage 方式) と
-- それを参照する process_invitations トリガは token ベース方式では不要なので drop する
DROP TRIGGER IF EXISTS on_profile_created_process_invitations ON public.profiles;
DROP FUNCTION IF EXISTS public.process_invitations();
DROP TABLE IF EXISTS public.store_invitations CASCADE;

CREATE TABLE public.store_invitations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  -- 特定メール限定の場合のみ設定。null なら誰でも使える（既定）
  intended_email TEXT,
  -- 付与ロール (デフォルト part_time)
  intended_role  TEXT NOT NULL DEFAULT 'part_time',
  -- 最大使用可能回数 (default 1 = 単発)
  max_uses       INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  used_count     INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_store_invitations_store
  ON public.store_invitations (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_invitations_token
  ON public.store_invitations (token);

ALTER TABLE public.store_invitations ENABLE ROW LEVEL SECURITY;

-- 読み取りは owner/manager のみ (backend は service_role で行うので最低限でよい)
DROP POLICY IF EXISTS store_invitations_select ON public.store_invitations;
CREATE POLICY store_invitations_select ON public.store_invitations
  FOR SELECT
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    OR public.is_platform_team()
  );

SELECT 'STORE INVITATIONS COMPLETE' AS status;
