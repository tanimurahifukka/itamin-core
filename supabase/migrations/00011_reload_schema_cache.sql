-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
