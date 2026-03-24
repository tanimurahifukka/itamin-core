-- ============================================================
-- checklist_templates + shift_checklist_map
-- HACCP準拠チェックリスト レイヤー構造
-- ============================================================

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  layer      TEXT NOT NULL CHECK (layer IN ('base', 'shift')),
  timing     TEXT NOT NULL CHECK (timing IN ('clock_in', 'clock_out')),
  items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shift_checklist_map (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  shift_type  TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  UNIQUE(store_id, shift_type, template_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_store_timing_layer_sort
  ON public.checklist_templates(store_id, timing, layer, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_shift_checklist_map_store_shift
  ON public.shift_checklist_map(store_id, shift_type);

CREATE INDEX IF NOT EXISTS idx_shift_checklist_map_template
  ON public.shift_checklist_map(template_id);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_checklist_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所属店舗のチェックテンプレートを読める" ON public.checklist_templates;
CREATE POLICY "所属店舗のチェックテンプレートを読める"
  ON public.checklist_templates FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上がチェックテンプレートを管理できる" ON public.checklist_templates;
CREATE POLICY "manager以上がチェックテンプレートを管理できる"
  ON public.checklist_templates FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));

DROP POLICY IF EXISTS "所属店舗のシフト別チェック紐付けを読める" ON public.shift_checklist_map;
CREATE POLICY "所属店舗のシフト別チェック紐付けを読める"
  ON public.shift_checklist_map FOR SELECT
  USING (store_id IN (SELECT public.get_my_store_ids()));

DROP POLICY IF EXISTS "manager以上がシフト別チェック紐付けを管理できる" ON public.shift_checklist_map;
CREATE POLICY "manager以上がシフト別チェック紐付けを管理できる"
  ON public.shift_checklist_map FOR ALL
  USING (store_id IN (SELECT public.get_my_managed_store_ids()));
