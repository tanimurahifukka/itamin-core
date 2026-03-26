-- notices テーブルに画像URL配列カラムを追加
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Storage RLS: notice-images バケット
-- 認証済みユーザーがアップロード可能
INSERT INTO storage.buckets (id, name, public) VALUES ('notice-images', 'notice-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "認証済みユーザーが画像をアップロードできる"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'notice-images' AND auth.role() = 'authenticated');

CREATE POLICY "誰でも画像を閲覧できる"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notice-images');

CREATE POLICY "認証済みユーザーが画像を削除できる"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'notice-images' AND auth.role() = 'authenticated');
