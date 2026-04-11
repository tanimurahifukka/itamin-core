-- 00013_checklist_v2_haccp.sql
-- v1 clean break → v2 HACCP 準拠正規化構造
-- E2E verified on Postgres 16

-- ── 1. Drop v1 tables (CASCADE で依存FK/インデックスも消去) ───────────────────
DROP TABLE IF EXISTS check_records CASCADE;
DROP TABLE IF EXISTS shift_checklist_map CASCADE;
DROP TABLE IF EXISTS checklist_templates CASCADE;
DROP TABLE IF EXISTS checklists CASCADE;

-- ── 2. System template master（業種別テンプレートマスタ）─────────────────────
CREATE TABLE checklist_system_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_type text       NOT NULL,
  name          text       NOT NULL,
  timing        text       NOT NULL
    CHECK (timing IN ('clock_in','clock_out','store_opening','store_closing','store_daily','ad_hoc')),
  scope         text       NOT NULL DEFAULT 'personal'
    CHECK (scope IN ('store','personal')),
  layer         text       NOT NULL DEFAULT 'base'
    CHECK (layer IN ('base','shift')),
  description   text,
  is_active     boolean    NOT NULL DEFAULT true,
  sort_order    integer    NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checklist_system_template_items (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  system_template_id        uuid        NOT NULL REFERENCES checklist_system_templates(id) ON DELETE CASCADE,
  item_key                  text        NOT NULL,
  label                     text        NOT NULL,
  item_type                 text        NOT NULL DEFAULT 'checkbox'
    CHECK (item_type IN ('checkbox','numeric','text','photo','select')),
  required                  boolean     NOT NULL DEFAULT true,
  min_value                 numeric,
  max_value                 numeric,
  unit                      text,
  options                   jsonb       NOT NULL DEFAULT '{}',
  is_ccp                    boolean     NOT NULL DEFAULT false,
  tracking_mode             text        NOT NULL DEFAULT 'submission_only'
    CHECK (tracking_mode IN ('submission_only','measurement_only','both')),
  frequency_per_day         integer,
  frequency_interval_minutes integer,
  deviation_action          text,
  sort_order                integer     NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Store template layer ───────────────────────────────────────────────────
CREATE TABLE checklist_templates (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  system_template_id uuid        REFERENCES checklist_system_templates(id),
  name               text        NOT NULL,
  timing             text        NOT NULL
    CHECK (timing IN ('clock_in','clock_out','store_opening','store_closing','store_daily','ad_hoc')),
  scope              text        NOT NULL DEFAULT 'personal'
    CHECK (scope IN ('store','personal')),
  layer              text        NOT NULL DEFAULT 'base'
    CHECK (layer IN ('base','shift')),
  version            integer     NOT NULL DEFAULT 1,
  is_active          boolean     NOT NULL DEFAULT true,
  description        text,
  sort_order         integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid        REFERENCES auth.users(id),
  updated_by         uuid        REFERENCES auth.users(id)
);

CREATE TABLE checklist_template_items (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                   uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  template_id                uuid        NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  item_key                   text        NOT NULL,
  label                      text        NOT NULL,
  item_type                  text        NOT NULL DEFAULT 'checkbox'
    CHECK (item_type IN ('checkbox','numeric','text','photo','select')),
  required                   boolean     NOT NULL DEFAULT true,
  min_value                  numeric,
  max_value                  numeric,
  unit                       text,
  options                    jsonb       NOT NULL DEFAULT '{}',
  is_ccp                     boolean     NOT NULL DEFAULT false,
  tracking_mode              text        NOT NULL DEFAULT 'submission_only'
    CHECK (tracking_mode IN ('submission_only','measurement_only','both')),
  frequency_per_day          integer,
  frequency_interval_minutes integer,
  deviation_action           text,
  sort_order                 integer     NOT NULL DEFAULT 0,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checklist_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  timing      text        NOT NULL
    CHECK (timing IN ('clock_in','clock_out','store_opening','store_closing','store_daily','ad_hoc')),
  scope       text        NOT NULL DEFAULT 'personal'
    CHECK (scope IN ('store','personal')),
  shift_type  text,
  template_id uuid        NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, timing, scope, shift_type, template_id)
);

-- ── 4. Submission layer ───────────────────────────────────────────────────────
CREATE TABLE checklist_submissions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                 uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  membership_id            uuid        NOT NULL REFERENCES store_staff(id),
  session_id               uuid,
  shift_slot_id            uuid,
  timing                   text        NOT NULL
    CHECK (timing IN ('clock_in','clock_out','store_opening','store_closing','store_daily','ad_hoc')),
  scope                    text        NOT NULL DEFAULT 'personal'
    CHECK (scope IN ('store','personal')),
  template_id              uuid        NOT NULL REFERENCES checklist_templates(id),
  template_version         integer     NOT NULL DEFAULT 1,
  all_passed               boolean     NOT NULL DEFAULT false,
  has_deviation            boolean     NOT NULL DEFAULT false,
  responsible_membership_id uuid       REFERENCES store_staff(id),
  submitted_at             timestamptz NOT NULL DEFAULT now(),
  submitted_by             uuid        NOT NULL REFERENCES auth.users(id),
  approved_by              uuid        REFERENCES auth.users(id),
  approved_at              timestamptz,
  snapshot                 jsonb       NOT NULL DEFAULT '{}'
);

CREATE TABLE checklist_submission_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  submission_id    uuid        NOT NULL REFERENCES checklist_submissions(id) ON DELETE CASCADE,
  template_item_id uuid        REFERENCES checklist_template_items(id),
  item_key         text        NOT NULL,
  bool_value       boolean,
  numeric_value    numeric,
  text_value       text,
  select_value     text,
  file_path        text,
  passed           boolean,
  measurement_id   uuid,
  checked_by       uuid        REFERENCES auth.users(id),
  checked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 5. Measurement layer（時系列測定）────────────────────────────────────────
CREATE TABLE checklist_measurements (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  template_item_id uuid        REFERENCES checklist_template_items(id),
  item_key         text        NOT NULL,
  bool_value       boolean,
  numeric_value    numeric,
  text_value       text,
  passed           boolean,
  measured_at      timestamptz NOT NULL DEFAULT now(),
  source           text        NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','sensor','import')),
  context          jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- submission_items から measurement への FK（測定層と提出層のリンク）
ALTER TABLE checklist_submission_items
  ADD CONSTRAINT fk_measurement FOREIGN KEY (measurement_id) REFERENCES checklist_measurements(id);

-- ── 6. Sensor devices ─────────────────────────────────────────────────────────
CREATE TABLE sensor_devices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_key       text        NOT NULL,
  label            text        NOT NULL,
  item_key         text,
  template_item_id uuid        REFERENCES checklist_template_items(id),
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, device_key)
);

CREATE TABLE sensor_readings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_id      uuid        NOT NULL REFERENCES sensor_devices(id) ON DELETE CASCADE,
  item_key       text,
  numeric_value  numeric     NOT NULL,
  measured_at    timestamptz NOT NULL DEFAULT now(),
  measurement_id uuid        REFERENCES checklist_measurements(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 7. Deviations（逸脱記録）─────────────────────────────────────────────────
CREATE TABLE checklist_deviations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  submission_id      uuid        REFERENCES checklist_submissions(id),
  submission_item_id uuid        REFERENCES checklist_submission_items(id),
  measurement_id     uuid        REFERENCES checklist_measurements(id),
  template_item_id   uuid        REFERENCES checklist_template_items(id),
  item_key           text        NOT NULL,
  severity           text        NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','ccp')),
  status             text        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','corrected','approved','closed')),
  detected_value     text,
  description        text,
  corrective_action  text,
  corrected_by       uuid        REFERENCES auth.users(id),
  corrected_at       timestamptz,
  approved_by        uuid        REFERENCES auth.users(id),
  approved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ── 8. Monthly HACCP reports（月次帳票）──────────────────────────────────────
CREATE TABLE haccp_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  year         integer     NOT NULL,
  month        integer     NOT NULL,
  status       text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved')),
  summary      jsonb       NOT NULL DEFAULT '{}',
  generated_by uuid        REFERENCES auth.users(id),
  generated_at timestamptz,
  approved_by  uuid        REFERENCES auth.users(id),
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, year, month)
);

-- ── 9. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_ctl_store_active     ON checklist_templates(store_id, is_active);
CREATE INDEX idx_ctl_timing_scope     ON checklist_templates(store_id, timing, scope, is_active);
CREATE INDEX idx_ctli_template        ON checklist_template_items(template_id);
CREATE INDEX idx_cta_store_timing     ON checklist_assignments(store_id, timing, scope);
CREATE INDEX idx_cs_store_timing      ON checklist_submissions(store_id, timing, scope, submitted_at);
CREATE INDEX idx_cs_membership        ON checklist_submissions(membership_id, submitted_at);
CREATE INDEX idx_csi_submission       ON checklist_submission_items(submission_id);
CREATE INDEX idx_cm_store_item        ON checklist_measurements(store_id, item_key, measured_at);
CREATE INDEX idx_cd_store_status      ON checklist_deviations(store_id, status);
CREATE INDEX idx_sr_device_time       ON sensor_readings(device_id, measured_at);

-- ── 10. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE checklist_system_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_system_template_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_submissions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_submission_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_measurements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_devices                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_deviations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_reports                    ENABLE ROW LEVEL SECURITY;

-- System templates: 認証済み全ユーザー読み取り可
CREATE POLICY "cst_read" ON checklist_system_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "csti_read" ON checklist_system_template_items
  FOR SELECT TO authenticated USING (true);

-- Store templates: メンバー読み取り、管理者書き込み
CREATE POLICY "ct_read"  ON checklist_templates
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "ct_write" ON checklist_templates
  FOR ALL TO authenticated
  USING     (store_id IN (SELECT public.get_my_managed_store_ids()))
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

CREATE POLICY "ctli_read"  ON checklist_template_items
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "ctli_write" ON checklist_template_items
  FOR ALL TO authenticated
  USING     (store_id IN (SELECT public.get_my_managed_store_ids()))
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

CREATE POLICY "cta_read"  ON checklist_assignments
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "cta_write" ON checklist_assignments
  FOR ALL TO authenticated
  USING     (store_id IN (SELECT public.get_my_managed_store_ids()))
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

-- Submissions: メンバー読み取り・投稿、管理者承認
CREATE POLICY "csub_read"   ON checklist_submissions
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "csub_insert" ON checklist_submissions
  FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "csub_update" ON checklist_submissions
  FOR UPDATE TO authenticated USING (store_id IN (SELECT public.get_my_managed_store_ids()));

CREATE POLICY "csi_read"   ON checklist_submission_items
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "csi_insert" ON checklist_submission_items
  FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));

-- Measurements
CREATE POLICY "cm_read"   ON checklist_measurements
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "cm_insert" ON checklist_measurements
  FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));

-- Sensors
CREATE POLICY "sd_read"  ON sensor_devices
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "sd_write" ON sensor_devices
  FOR ALL TO authenticated
  USING     (store_id IN (SELECT public.get_my_managed_store_ids()))
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

CREATE POLICY "sr_read"   ON sensor_readings
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "sr_insert" ON sensor_readings
  FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));

-- Deviations
CREATE POLICY "cd_read"   ON checklist_deviations
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "cd_insert" ON checklist_deviations
  FOR INSERT TO authenticated WITH CHECK (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "cd_update" ON checklist_deviations
  FOR UPDATE TO authenticated USING (store_id IN (SELECT public.get_my_managed_store_ids()));

-- HACCP reports
CREATE POLICY "hr_read"  ON haccp_reports
  FOR SELECT TO authenticated USING (store_id IN (SELECT public.get_my_store_ids()));
CREATE POLICY "hr_write" ON haccp_reports
  FOR ALL TO authenticated
  USING     (store_id IN (SELECT public.get_my_managed_store_ids()))
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

-- ── 11. Cafe seed data（6テンプレ 27項目 CCP7）───────────────────────────────
INSERT INTO checklist_system_templates
  (id, business_type, name, timing, scope, layer, description, sort_order)
VALUES
  ('11000001-0000-0000-0000-000000000001', 'cafe', '出勤前健康・衛生確認',   'clock_in',      'personal', 'base',  'スタッフ出勤時の健康・衛生チェック', 1),
  ('11000001-0000-0000-0000-000000000002', 'cafe', '退勤前清掃・記録確認',   'clock_out',     'personal', 'base',  'スタッフ退勤前の清掃・記録確認',    2),
  ('11000001-0000-0000-0000-000000000003', 'cafe', '開店前温度・設備確認',   'store_opening', 'store',    'base',  '開店前の温度管理・設備確認',        3),
  ('11000001-0000-0000-0000-000000000004', 'cafe', '日中温度巡回確認',       'store_daily',   'store',    'base',  '日中の定期温度巡回',                4),
  ('11000001-0000-0000-0000-000000000005', 'cafe', '閉店前清掃・施錠確認',   'store_closing', 'store',    'base',  '閉店前の清掃・施錠確認',            5),
  ('11000001-0000-0000-0000-000000000006', 'cafe', '早番仕込み確認',         'clock_in',      'personal', 'shift', '早番スタッフの仕込み確認',          6);

INSERT INTO checklist_system_template_items
  (system_template_id, item_key, label, item_type, required,
   min_value, max_value, unit, is_ccp, tracking_mode, deviation_action, sort_order)
VALUES
  -- 出勤前健康・衛生確認
  ('11000001-0000-0000-0000-000000000001','health_check','体調不良・発熱・下痢・嘔吐がないことを確認した','checkbox',true,null,null,null,false,'submission_only',null,1),
  ('11000001-0000-0000-0000-000000000001','hand_wash','手洗い・消毒を実施した','checkbox',true,null,null,null,false,'submission_only',null,2),
  ('11000001-0000-0000-0000-000000000001','uniform_check','制服・帽子・身だしなみを確認した','checkbox',true,null,null,null,false,'submission_only',null,3),
  ('11000001-0000-0000-0000-000000000001','wound_check','手指の傷・爪の確認をした','checkbox',true,null,null,null,false,'submission_only',null,4),
  ('11000001-0000-0000-0000-000000000001','body_temp','体温（°C）','numeric',true,35.0,37.5,'°C',true,'both','37.5°C超の場合は勤務停止・管理者に報告',5),
  -- 退勤前清掃・記録確認
  ('11000001-0000-0000-0000-000000000002','equipment_clean','使用機器の洗浄・消毒を完了した','checkbox',true,null,null,null,false,'submission_only',null,1),
  ('11000001-0000-0000-0000-000000000002','storage_check','原材料の保管状態・温度を確認した','checkbox',true,null,null,null,false,'submission_only',null,2),
  ('11000001-0000-0000-0000-000000000002','waste_disposal','ゴミ処理・排水口清掃を完了した','checkbox',true,null,null,null,false,'submission_only',null,3),
  ('11000001-0000-0000-0000-000000000002','record_confirm','温度記録・異常報告を確認した','checkbox',true,null,null,null,false,'submission_only',null,4),
  -- 開店前温度・設備確認（CCP）
  ('11000001-0000-0000-0000-000000000003','fridge_temp','冷蔵庫温度（°C）','numeric',true,-1.0,5.0,'°C',true,'both','5°C超の場合は食材移動・管理者に報告・温度計を再確認',1),
  ('11000001-0000-0000-0000-000000000003','freezer_temp','冷凍庫温度（°C）','numeric',true,-25.0,-15.0,'°C',true,'both','-15°C超の場合は食材確認・管理者に報告',2),
  ('11000001-0000-0000-0000-000000000003','showcase_temp','ショーケース温度（°C）','numeric',true,2.0,8.0,'°C',true,'both','8°C超の場合は修理手配・食材撤去',3),
  ('11000001-0000-0000-0000-000000000003','room_temp','室温（°C）','numeric',false,null,null,'°C',false,'both',null,4),
  ('11000001-0000-0000-0000-000000000003','opening_clean','開店前清掃・テーブル・椅子確認','checkbox',true,null,null,null,false,'submission_only',null,5),
  ('11000001-0000-0000-0000-000000000003','equipment_check','機器（エスプレッソマシン等）の動作確認','checkbox',true,null,null,null,false,'submission_only',null,6),
  -- 日中温度巡回確認
  ('11000001-0000-0000-0000-000000000004','daytime_fridge','冷蔵庫温度（°C）','numeric',true,-1.0,5.0,'°C',true,'measurement_only','5°C超の場合は即管理者に報告',1),
  ('11000001-0000-0000-0000-000000000004','daytime_showcase','ショーケース温度（°C）','numeric',true,2.0,8.0,'°C',true,'measurement_only','8°C超の場合は修理手配',2),
  ('11000001-0000-0000-0000-000000000004','hand_wash_mid','手洗い実施（中間）','checkbox',true,null,null,null,false,'submission_only',null,3),
  -- 閉店前清掃・施錠確認（CCP）
  ('11000001-0000-0000-0000-000000000005','closing_clean','店内清掃・ゴミ出しを完了した','checkbox',true,null,null,null,false,'submission_only',null,1),
  ('11000001-0000-0000-0000-000000000005','fire_check','火元・ガス・電気機器の確認をした','checkbox',true,null,null,null,false,'submission_only',null,2),
  ('11000001-0000-0000-0000-000000000005','lock_check','施錠・防犯確認をした','checkbox',true,null,null,null,false,'submission_only',null,3),
  ('11000001-0000-0000-0000-000000000005','closing_fridge','閉店時冷蔵庫温度（°C）','numeric',true,-1.0,5.0,'°C',true,'both','5°C超の場合は管理者に報告',4),
  ('11000001-0000-0000-0000-000000000005','closing_freezer','閉店時冷凍庫温度（°C）','numeric',true,-25.0,-15.0,'°C',true,'both','-15°C超の場合は緊急対応',5),
  -- 早番仕込み確認
  ('11000001-0000-0000-0000-000000000006','delivery_check','納品食材の受入・状態確認をした','checkbox',true,null,null,null,false,'submission_only',null,1),
  ('11000001-0000-0000-0000-000000000006','expiry_check','食材の期限・ロット確認をした','checkbox',true,null,null,null,false,'submission_only',null,2),
  ('11000001-0000-0000-0000-000000000006','prep_amount','仕込み量と在庫を確認した','checkbox',true,null,null,null,false,'submission_only',null,3),
  ('11000001-0000-0000-0000-000000000006','prep_temp','仕込み品の加熱温度（°C）','numeric',false,75.0,null,'°C',true,'both','75°C未満の場合は再加熱',4);
