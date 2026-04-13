-- Add form_schema column to reservation_events for Google-Forms-style custom booking forms
ALTER TABLE public.reservation_events
  ADD COLUMN IF NOT EXISTS form_schema JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.reservation_events.form_schema IS
  'Google Forms 風のフォーム定義。EventFormField[] の JSON 配列';
