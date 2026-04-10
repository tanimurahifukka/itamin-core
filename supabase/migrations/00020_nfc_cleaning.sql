-- ============================================================
-- 00020: NFC-based cleaning check-in (per-staff PIN + per-location templates)
-- ============================================================
-- 目的:
--   物理トイレ等に貼った NFC タグに URL を書き込み、スタッフが
--   スマホでタップ → ブラウザ上で個人 PIN + チェック項目入力 →
--   既存の checklist_submissions に投入する。
--
-- 既存との統合方針:
--   - 記録は既存の checklist_submissions / checklist_submission_items
--     に入れる (HACCP月次帳票に自動反映、既存の ChecklistAdminPage
--     でそのまま閲覧可能)
--   - スタッフは既存の store_staff を使う
--   - PIN は per-staff で staff_cleaning_pins テーブルに保持 (平文、MVP)
--   - NFC タグは nfc_cleaning_locations で (store_id, template_id) に紐付け
-- ============================================================

-- ── 1. staff_cleaning_pins ───────────────────────────────────
-- スタッフごとの清掃記録用 PIN (4桁、平文保存、MVP許容)
CREATE TABLE IF NOT EXISTS public.staff_cleaning_pins (
  membership_id UUID PRIMARY KEY REFERENCES public.store_staff(id) ON DELETE CASCADE,
  store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  pin           TEXT NOT NULL CHECK (pin ~ '^[0-9]{4}$'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同一店舗内で PIN が衝突しないようにする
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_cleaning_pins_store_pin
  ON public.staff_cleaning_pins (store_id, pin);

CREATE INDEX IF NOT EXISTS idx_staff_cleaning_pins_store
  ON public.staff_cleaning_pins (store_id);

ALTER TABLE public.staff_cleaning_pins ENABLE ROW LEVEL SECURITY;

-- 読み取り: 管理者ロールのみ (平文 PIN を一覧できるのは運用者限定)
DROP POLICY IF EXISTS scp_select_managed ON public.staff_cleaning_pins;
CREATE POLICY scp_select_managed ON public.staff_cleaning_pins
  FOR SELECT TO authenticated
  USING (
    store_id IN (SELECT public.get_my_managed_store_ids())
    OR public.is_platform_team()
  );

-- 書き込みは backend (service_role) のみ想定 (RLS bypass)

-- ── 2. nfc_cleaning_locations ────────────────────────────────
-- NFC タグごとの物理的な場所 (トイレ1 等) と、どのテンプレを表示するか
CREATE TABLE IF NOT EXISTS public.nfc_cleaning_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,       -- URL に載せる短識別子 ('toilet-1' 等)
  name        TEXT NOT NULL,       -- 画面表示用 ('トイレ1' 等)
  template_id UUID REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_nfc_locations_store_active
  ON public.nfc_cleaning_locations (store_id, active);

ALTER TABLE public.nfc_cleaning_locations ENABLE ROW LEVEL SECURITY;

-- 読み取り: 店舗メンバー全員
DROP POLICY IF EXISTS ncl_select_members ON public.nfc_cleaning_locations;
CREATE POLICY ncl_select_members ON public.nfc_cleaning_locations
  FOR SELECT TO authenticated
  USING (
    store_id IN (SELECT public.get_my_store_ids())
    OR public.is_platform_team()
  );

-- 書き込み: 管理者ロールのみ
DROP POLICY IF EXISTS ncl_write_managed ON public.nfc_cleaning_locations;
CREATE POLICY ncl_write_managed ON public.nfc_cleaning_locations
  FOR ALL TO authenticated
  USING     (store_id IN (SELECT public.get_my_managed_store_ids()))
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ── 3. "トイレ清掃" system template seed ─────────────────────
-- 既存の sofe 仕様書の 6 項目をそのまま登録する。
-- 既に同じ ID でデータがあればスキップ (idempotent)。
INSERT INTO public.checklist_system_templates
  (id, business_type, name, timing, scope, layer, description, sort_order)
VALUES
  ('22000002-0000-0000-0000-000000000001',
   'cafe',
   'トイレ清掃チェック',
   'ad_hoc',
   'personal',
   'base',
   'NFC タグからの入室時清掃チェック (便器・床・洗面・消毒液・ペーパー・ゴミ)',
   100)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.checklist_system_template_items
  (system_template_id, item_key, label, item_type, required,
   options, is_ccp, tracking_mode, sort_order)
VALUES
  ('22000002-0000-0000-0000-000000000001', 'toilet_bowl',      '便器の清掃',     'checkbox', true, '{}', false, 'submission_only', 1),
  ('22000002-0000-0000-0000-000000000001', 'floor',            '床の清掃',       'checkbox', true, '{}', false, 'submission_only', 2),
  ('22000002-0000-0000-0000-000000000001', 'sink',             '洗面台の清掃',   'checkbox', true, '{}', false, 'submission_only', 3),
  ('22000002-0000-0000-0000-000000000001', 'sanitizer_level',  '手指消毒液の残量','select',  true,
     '{"choices":["ok","low","refill"],"labels":{"ok":"OK","low":"少","refill":"要補充"}}', false, 'submission_only', 4),
  ('22000002-0000-0000-0000-000000000001', 'paper_level',      'ペーパーの残量', 'select',  true,
     '{"choices":["ok","low","refill"],"labels":{"ok":"OK","low":"少","refill":"要補充"}}', false, 'submission_only', 5),
  ('22000002-0000-0000-0000-000000000001', 'trash',            'ゴミ箱',         'checkbox', true, '{}', false, 'submission_only', 6),
  ('22000002-0000-0000-0000-000000000001', 'note',             '特記事項',       'text',     false, '{}', false, 'submission_only', 7)
ON CONFLICT DO NOTHING;

SELECT 'NFC CLEANING SCHEMA COMPLETE' AS status;
