-- SwitchBot 温湿度ログテーブル
-- 30分ごとにバックグラウンドで取得・記録する

CREATE TABLE IF NOT EXISTS switchbot_readings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  device_name  TEXT,
  temperature  NUMERIC(5,1),
  humidity     NUMERIC(5,1),
  battery      INTEGER,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_switchbot_readings_store_recorded
  ON switchbot_readings (store_id, recorded_at DESC);

CREATE INDEX idx_switchbot_readings_device
  ON switchbot_readings (store_id, device_id, recorded_at DESC);

-- RLS: 管理者のみ参照可能
ALTER TABLE switchbot_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store members can read switchbot_readings"
  ON switchbot_readings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM store_staff
      WHERE store_staff.store_id = switchbot_readings.store_id
        AND store_staff.user_id = auth.uid()
    )
  );
