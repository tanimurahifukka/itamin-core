-- Drop legacy time_records table
--
-- 勤怠ドメインを attendance_records / attendance_breaks / attendance_events に一本化する
-- リファクタに伴い、旧 time_records テーブルと関連する RLS ポリシーを削除する。
-- time_records は staff_id (store_staff.id) ベースで、新テーブルの user_id (auth.users.id) と
-- モデルが根本的に異なるため、データ移行はせずクリーン drop とする。
-- 既存の運用データがある場合は事前にバックアップを取得すること。

DROP TABLE IF EXISTS public.time_records CASCADE;
