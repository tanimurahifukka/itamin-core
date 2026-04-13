-- Force PostgREST schema cache reload after form_schema column addition
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
