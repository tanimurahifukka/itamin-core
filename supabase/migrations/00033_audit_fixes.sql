-- ============================================================
-- 00033: audit_fixes — セキュリティ・整合性の修正バッチ
-- ============================================================
-- 対象: #2, #9, #10, #11, #28, #29, #30, #31, #32, #33
-- 全修正は冪等（IF NOT EXISTS / OR REPLACE / DROP IF EXISTS を使用）
-- ============================================================


-- ============================================================
-- #2: Storage RLS — テナント境界の強制
-- ============================================================
-- notice-images バケット
-- (00005_notice_images.sql で作成された過剰許可ポリシーを置換)

DROP POLICY IF EXISTS "認証済みユーザーが画像をアップロードできる" ON storage.objects;
DROP POLICY IF EXISTS "認証済みユーザーが画像を削除できる" ON storage.objects;
-- SELECT ポリシーは public バケットのためそのまま（誰でも閲覧可）だが、
-- 念のためバケット固有の名前で DROP しておく
DROP POLICY IF EXISTS "誰でも画像を閲覧できる" ON storage.objects;

-- INSERT: フォルダ第1階層が自分の所属 store_id であることを必須とする
CREATE POLICY "notice_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'notice-images'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_store_ids())
  );

-- SELECT: public バケットのため store_id チェックは不要だが、
-- バケット限定ポリシーとして再定義する（匿名アクセス可）
CREATE POLICY "notice_images_select" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'notice-images');

-- DELETE: フォルダ第1階層が自分の所属 store_id であることを必須とする
CREATE POLICY "notice_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'notice-images'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_store_ids())
  );

-- sales-receipts バケット
-- (00007_sales_capture.sql で作成された過剰許可ポリシーを置換)

DROP POLICY IF EXISTS "認証済みユーザーがレシートをアップロード" ON storage.objects;
DROP POLICY IF EXISTS "認証済みユーザーがレシートを閲覧" ON storage.objects;
DROP POLICY IF EXISTS "認証済みユーザーがレシートを削除" ON storage.objects;

-- INSERT: フォルダ第1階層が自分の所属 store_id であることを必須とする
CREATE POLICY "sales_receipts_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sales-receipts'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_store_ids())
  );

-- SELECT: 所属スタッフのみ閲覧可（private バケット）
CREATE POLICY "sales_receipts_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'sales-receipts'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_store_ids())
  );

-- DELETE: manager 以上のみ削除可
CREATE POLICY "sales_receipts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'sales-receipts'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_managed_store_ids())
  );


-- ============================================================
-- #9: 出勤テーブルへの anon GRANT を取り消す
-- ============================================================
-- (00010_grant_attendance_tables.sql で誤って付与された GRANT ALL を REVOKE)

REVOKE ALL ON public.attendance_records             FROM anon;
REVOKE ALL ON public.attendance_events              FROM anon;
REVOKE ALL ON public.attendance_correction_requests FROM anon;
REVOKE ALL ON public.attendance_policies            FROM anon;
REVOKE ALL ON public.line_user_links                FROM anon;


-- ============================================================
-- #10: paid_leaves.staff_id / leave_records.staff_id の FK を
--      profiles → store_staff に修正
-- ============================================================
-- (00002_plugin_tables.sql 193-198 行: profiles(id) 参照を store_staff(id) に変更)
-- store_staff.id は UUID PRIMARY KEY なので参照型は互換
-- ※ 適用前に以下で孤立行がないか確認すること:
--   SELECT COUNT(*) FROM paid_leaves WHERE staff_id NOT IN (SELECT id FROM store_staff);
--   SELECT COUNT(*) FROM leave_records WHERE staff_id NOT IN (SELECT id FROM store_staff);

ALTER TABLE public.paid_leaves
  DROP CONSTRAINT IF EXISTS paid_leaves_staff_id_fkey;

ALTER TABLE public.paid_leaves
  ADD CONSTRAINT paid_leaves_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.store_staff(id) ON DELETE CASCADE;

ALTER TABLE public.leave_records
  DROP CONSTRAINT IF EXISTS leave_records_staff_id_fkey;

ALTER TABLE public.leave_records
  ADD CONSTRAINT leave_records_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.store_staff(id) ON DELETE CASCADE;


-- ============================================================
-- #11: get_my_managed_store_ids() に 'leader' ロールを追加
-- ============================================================
-- (00015_fix_rls.sql では 'owner'/'manager' のみ。'leader' が抜けていた)

CREATE OR REPLACE FUNCTION public.get_my_managed_store_ids()
RETURNS SETOF UUID AS $$
  SELECT store_id FROM public.store_staff
  WHERE user_id = auth.uid() AND role IN ('owner', 'manager', 'leader')
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================================
-- #28: checklist_system_template_items に UNIQUE 制約を追加
-- ============================================================
-- 同一システムテンプレート内で item_key の重複を DB レベルで禁止する

ALTER TABLE public.checklist_system_template_items
  ADD CONSTRAINT checklist_sys_tpl_items_tpl_key_uniq
    UNIQUE (system_template_id, item_key);


-- ============================================================
-- #29: checklist_submissions.template_id に ON DELETE RESTRICT を追加
-- ============================================================
-- HACCP 記録は法的保存義務があるため、テンプレート削除は RESTRICT で阻止する
-- (00013_checklist_v2_haccp.sql では ON DELETE 句が未指定 = NO ACTION = 実質 RESTRICT と同等だが、
--  明示的に宣言してセマンティクスを確定させる)

ALTER TABLE public.checklist_submissions
  DROP CONSTRAINT IF EXISTS checklist_submissions_template_id_fkey;

ALTER TABLE public.checklist_submissions
  ADD CONSTRAINT checklist_submissions_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.checklist_templates(id) ON DELETE RESTRICT;


-- ============================================================
-- #30: reservation_rate_limits に RLS を有効化
-- ============================================================
-- (00025_reservation_timeslot_school_event.sql で RLS が未設定)
-- 読み書きは service_role のみ許可。anon/authenticated は直接アクセス不可。

ALTER TABLE public.reservation_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limits_service_only" ON public.reservation_rate_limits;
CREATE POLICY "rate_limits_service_only" ON public.reservation_rate_limits
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- #31: store_invitations.intended_role を staff_role enum にキャスト
-- ============================================================
-- (00026_store_invitations.sql では TEXT 型で定義されていた)
-- staff_role enum は 00001_schema.sql で定義済み

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'staff_role'
  ) THEN
    ALTER TABLE public.store_invitations
      ALTER COLUMN intended_role TYPE staff_role
        USING intended_role::staff_role;
  END IF;
END $$;


-- ============================================================
-- #32: attendance_records.shift_id に shifts テーブルへの FK を追加
-- ============================================================
-- (00009_attendance.sql では shift_id UUID として定義されているが FK なし)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_shift_id_fkey'
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_records_shift_id_fkey
        FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ============================================================
-- #33: store_business_hours / store_calendar_overrides の書き込みポリシーを追加
-- ============================================================
-- (00029_store_calendar.sql では SELECT ポリシーのみ定義されていた)

DROP POLICY IF EXISTS "bh_write" ON public.store_business_hours;
CREATE POLICY "bh_write" ON public.store_business_hours
  FOR ALL TO authenticated
  USING     (store_id IN (SELECT public.get_my_managed_store_ids()))
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));

DROP POLICY IF EXISTS "co_write" ON public.store_calendar_overrides;
CREATE POLICY "co_write" ON public.store_calendar_overrides
  FOR ALL TO authenticated
  USING     (store_id IN (SELECT public.get_my_managed_store_ids()))
  WITH CHECK (store_id IN (SELECT public.get_my_managed_store_ids()));


SELECT 'AUDIT FIXES COMPLETE' AS status;
