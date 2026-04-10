-- ============================================================
-- ITAMIN 勤怠 / LINE打刻テーブル
-- 対象: attendance_policies, line_user_links, line_link_tokens,
--       attendance_records, attendance_breaks, attendance_events,
--       attendance_correction_requests
-- ============================================================

-- 1. 勤怠ポリシー
CREATE TABLE IF NOT EXISTS public.attendance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  business_day_cutoff_hour INT NOT NULL DEFAULT 5,
  rounding_unit_minutes INT NOT NULL DEFAULT 1,
  rounding_mode TEXT NOT NULL DEFAULT 'none',
  auto_close_break_before_clock_out BOOLEAN NOT NULL DEFAULT false,
  require_manager_approval BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_policies_store
  ON public.attendance_policies(store_id);

-- 2. LINE ユーザー連携
CREATE TABLE IF NOT EXISTS public.line_user_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  line_sub TEXT,
  display_name TEXT,
  picture_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id),
  UNIQUE(line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_line_user_links_user ON public.line_user_links(user_id);
CREATE INDEX IF NOT EXISTS idx_line_user_links_line ON public.line_user_links(line_user_id);

-- 3. LINE 連携コード（ワンタイム）
CREATE TABLE IF NOT EXISTS public.line_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  issued_by UUID NOT NULL REFERENCES auth.users(id),
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_link_tokens_code ON public.line_link_tokens(code);
CREATE INDEX IF NOT EXISTS idx_line_link_tokens_user ON public.line_link_tokens(user_id);

-- 4. 勤怠セッション
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  shift_id UUID,
  business_date DATE NOT NULL,
  session_no INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'working'
    CHECK (status IN ('working', 'on_break', 'completed', 'needs_review', 'cancelled')),
  clock_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out_at TIMESTAMPTZ,
  source TEXT DEFAULT 'web',
  clock_in_method TEXT DEFAULT 'manual',
  clock_out_method TEXT,
  note TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, business_date, session_no),
  CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_store_date
  ON public.attendance_records(store_id, business_date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date
  ON public.attendance_records(user_id, business_date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status
  ON public.attendance_records(user_id, status) WHERE status = 'working';

-- 5. 休憩レコード
CREATE TABLE IF NOT EXISTS public.attendance_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_attendance_breaks_record
  ON public.attendance_breaks(attendance_record_id);

-- 6. 勤怠イベント（監査ログ）
CREATE TABLE IF NOT EXISTS public.attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'web',
  idempotency_key TEXT,
  payload JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_events_record
  ON public.attendance_events(attendance_record_id);
CREATE INDEX IF NOT EXISTS idx_attendance_events_user_date
  ON public.attendance_events(user_id, event_at);
CREATE INDEX IF NOT EXISTS idx_attendance_events_idempotency
  ON public.attendance_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 7. 修正申請
CREATE TABLE IF NOT EXISTS public.attendance_correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL,
  requested_business_date DATE NOT NULL,
  request_type TEXT NOT NULL,
  before_snapshot JSONB DEFAULT '{}',
  after_snapshot JSONB DEFAULT '{}',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_store
  ON public.attendance_correction_requests(store_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_user
  ON public.attendance_correction_requests(user_id);

-- ============================================================
-- RLS 有効化
-- ============================================================
ALTER TABLE public.attendance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_user_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_correction_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS ポリシー（API経由メインだが、読み取りにRLSを敷く）
-- ============================================================

-- attendance_policies
DROP POLICY IF EXISTS "所属店舗のポリシーを読める" ON public.attendance_policies;
CREATE POLICY "所属店舗のポリシーを読める"
  ON public.attendance_policies FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上がポリシーを管理できる" ON public.attendance_policies;
CREATE POLICY "manager以上がポリシーを管理できる"
  ON public.attendance_policies FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- line_user_links
DROP POLICY IF EXISTS "自分のLINE連携を読める" ON public.line_user_links;
CREATE POLICY "自分のLINE連携を読める"
  ON public.line_user_links FOR SELECT
  USING (user_id = auth.uid());

-- line_link_tokens
DROP POLICY IF EXISTS "manager以上が連携コードを管理できる" ON public.line_link_tokens;
CREATE POLICY "manager以上が連携コードを管理できる"
  ON public.line_link_tokens FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- attendance_records
DROP POLICY IF EXISTS "所属店舗の勤怠を読める" ON public.attendance_records;
CREATE POLICY "所属店舗の勤怠を読める"
  ON public.attendance_records FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

-- attendance_breaks
DROP POLICY IF EXISTS "所属店舗の休憩を読める" ON public.attendance_breaks;
CREATE POLICY "所属店舗の休憩を読める"
  ON public.attendance_breaks FOR SELECT
  USING (attendance_record_id IN (
    SELECT id FROM public.attendance_records WHERE store_id IN (SELECT public.get_my_store_ids())
  ));

-- attendance_events
DROP POLICY IF EXISTS "所属店舗のイベントを読める" ON public.attendance_events;
CREATE POLICY "所属店舗のイベントを読める"
  ON public.attendance_events FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

-- attendance_correction_requests
DROP POLICY IF EXISTS "自分の申請を読める" ON public.attendance_correction_requests;
CREATE POLICY "自分の申請を読める"
  ON public.attendance_correction_requests FOR SELECT
  USING (user_id = auth.uid() OR store_id IN (SELECT public.get_my_managed_store_ids()));

SELECT 'ATTENDANCE SQL COMPLETE' AS status;
