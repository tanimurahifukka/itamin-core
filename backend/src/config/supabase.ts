import { createClient } from '@supabase/supabase-js';
import { config } from './index';

// サービスロールクライアント（RLSバイパス、サーバーサイドのみ）
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

// ユーザーのJWTでクライアントを作る（RLS適用）
export function createSupabaseClient(accessToken: string) {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
