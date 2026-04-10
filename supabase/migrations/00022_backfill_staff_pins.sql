-- ============================================================
-- 00022: Backfill staff PINs for all existing staff
-- ============================================================
-- 目的:
--   staff_cleaning_pins は元々「清掃用」として導入したが、
--   NFC 打刻 (00021) でも同じ PIN を使う設計になったため、
--   全スタッフに PIN が存在する前提にする。
--
--   この移行で PIN 未発行のスタッフに対して、店舗内ユニークな
--   ランダム 4桁 PIN を一括発行する。既存の PIN は一切変更しない。
--
-- 方針:
--   - 既存 PIN がある人はスキップ (上書きしない)
--   - 新規発行は store_id ごとに 0000-9999 の範囲でランダム
--   - 同じ店舗内で衝突したら最大 100 回再試行
--   - 試行が尽きた場合はその 1 件だけスキップして次へ進む
--     (店舗に 100 人以上いれば PIN 空間が埋まる可能性があるが MVP 許容)
-- ============================================================

DO $$
DECLARE
  s RECORD;
  new_pin TEXT;
  attempts INT;
BEGIN
  FOR s IN
    SELECT ss.id AS membership_id, ss.store_id
    FROM public.store_staff ss
    LEFT JOIN public.staff_cleaning_pins p ON p.membership_id = ss.id
    WHERE p.membership_id IS NULL
  LOOP
    attempts := 0;
    LOOP
      new_pin := lpad((floor(random() * 10000))::int::text, 4, '0');
      BEGIN
        INSERT INTO public.staff_cleaning_pins (membership_id, store_id, pin)
        VALUES (s.membership_id, s.store_id, new_pin);
        EXIT; -- success
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts >= 100 THEN
          RAISE WARNING 'Could not generate unique PIN for membership % in store % after 100 attempts', s.membership_id, s.store_id;
          EXIT;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

-- 確認用: 未発行スタッフがいないか
SELECT
  COUNT(*) FILTER (WHERE p.membership_id IS NULL) AS missing_pins,
  COUNT(*) AS total_staff
FROM public.store_staff ss
LEFT JOIN public.staff_cleaning_pins p ON p.membership_id = ss.id;

SELECT 'STAFF PIN BACKFILL COMPLETE' AS status;
