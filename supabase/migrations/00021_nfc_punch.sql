-- ============================================================
-- 00021: NFC-based punch clock-in (reuses per-staff PIN from 00020)
-- ============================================================
-- 目的:
--   物理店舗入口に貼った NFC タグから公開ページを開き、
--   per-staff PIN 認証で出勤/休憩/退勤を記録する。
--
-- 既存との統合方針:
--   - 記録は既存の attendance_records / attendance_breaks /
--     attendance_events に入れる (LINE 打刻と同じ経路)
--   - PIN は 00020 で作った staff_cleaning_pins を流用
--     (清掃と打刻で同一 PIN。運用シンプル優先の MVP 判断)
--   - attendance_records.source / clock_in_method は自由 TEXT
--     なので 'nfc' / 'nfc_pin' を足すためのスキーマ変更は不要
-- ============================================================

-- staff_cleaning_pins を打刻でも使うことを明示するコメント追記
COMMENT ON TABLE public.staff_cleaning_pins IS
  'per-staff 4-digit PIN. Used for NFC cleaning check-in AND NFC punch clock-in.';

SELECT 'NFC PUNCH SCHEMA COMPLETE' AS status;
