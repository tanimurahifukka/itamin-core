-- PostgREST schema cache reload + テーブル確認
NOTIFY pgrst, 'reload schema';

-- Grant確認（念のため）
GRANT ALL ON public.line_link_tokens TO anon, authenticated, service_role;
GRANT ALL ON public.line_user_links TO anon, authenticated, service_role;
GRANT ALL ON public.attendance_records TO anon, authenticated, service_role;
GRANT ALL ON public.attendance_breaks TO anon, authenticated, service_role;
GRANT ALL ON public.attendance_events TO anon, authenticated, service_role;
GRANT ALL ON public.attendance_correction_requests TO anon, authenticated, service_role;
GRANT ALL ON public.attendance_policies TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
