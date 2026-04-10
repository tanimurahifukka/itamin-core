-- ============================================================
-- 00019: Audit logs + admin session revocation RPC
-- ============================================================
-- 目的:
--   1. 管理アクション (パスワードリセット等) を追跡するための
--      audit_logs テーブルを追加する
--   2. 管理者がパスワードをリセットした際、対象ユーザーの既存
--      auth.sessions / refresh_tokens を即座に revoke するための
--      SECURITY DEFINER 関数を追加する
-- ============================================================

-- 1) audit_logs テーブル
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name    TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,                  -- 'password_reset' 等
  target_type   TEXT,                           -- 'staff' / 'store' / ...
  target_id     UUID,
  target_name   TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_store_created
  ON public.audit_logs (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (store_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs (store_id, target_type, target_id, created_at DESC);

-- RLS: 読み取りは store のメンバーのみ (書き込みは backend service_role で行うので不要)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_members ON public.audit_logs;
CREATE POLICY audit_logs_select_members ON public.audit_logs
  FOR SELECT
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    OR public.is_platform_team()
  );

-- 2) admin session revocation RPC
--    パスワードリセット等の後、対象ユーザーの既存セッションを即時無効化する。
--    Supabase 標準の updateUserById は refresh_token を失効させるが、
--    既発行の access_token は TTL まで有効なままのため、
--    auth.sessions を直接削除して強制ログアウトする。
CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  -- refresh_tokens は auth.sessions への FK CASCADE で自動削除されるが、
  -- 古い Supabase 構成では orphan が残るため明示的に削除する
  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id = target_user_id::text;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL;
  END;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- service_role のみ実行可 (anon/authenticated には渡さない)
REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(UUID) TO service_role;

SELECT 'AUDIT LOGS + REVOKE RPC COMPLETE' AS status;
