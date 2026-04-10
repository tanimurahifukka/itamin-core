-- ============================================================
-- 00018: Prevent duplicate open clock-in records via partial unique index
-- ============================================================
-- 背景:
--   打刻 API は「未退勤レコードがあるかチェック → INSERT」の2段階で
--   行っていたため、並行リクエスト (ボタン連打・クライアント再送) で
--   race condition が発生し、同一スタッフが複数の clock_out=null
--   レコードを保持してしまう事例が発生した。
--
-- 対策:
--   (store_id, staff_id) に partial unique index を貼り、
--   clock_out が NULL のレコードは1スタッフあたり1件までに制限する。
--   DB レベルで原子的に保証されるため race condition が排除される。
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_records_one_open_per_staff
  ON public.time_records (store_id, staff_id)
  WHERE clock_out IS NULL;

SELECT 'TIME_RECORDS UNIQUE OPEN INDEX COMPLETE' AS status;
