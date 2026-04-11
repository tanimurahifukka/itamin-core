-- SwitchBot デバイス → HACCP テンプレート項目の紐付け
--
-- `sensor_devices` テーブルも 00013 で用意されているが、
-- 実運用では「テンプレート項目側に switchbot_device_id を直接持たせる」方が
-- cron の auto-fill ロジックが単純になる (join 不要で一発 lookup)。
-- sensor_devices テーブルは将来 Govee / Inkbird 等を導入するときの汎用層として温存する。

ALTER TABLE checklist_template_items
  ADD COLUMN IF NOT EXISTS switchbot_device_id text;

CREATE INDEX IF NOT EXISTS idx_cti_switchbot_device
  ON checklist_template_items(store_id, switchbot_device_id)
  WHERE switchbot_device_id IS NOT NULL;

COMMENT ON COLUMN checklist_template_items.switchbot_device_id IS
  'SwitchBot デバイス ID (hub/meter)。設定されている numeric 項目は cron 実行時に自動で checklist_measurements に書き込まれる。';
