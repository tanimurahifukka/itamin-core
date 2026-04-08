import dotenv from 'dotenv';
if (process.env.VERCEL !== '1') {
  dotenv.config();
}

// 環境変数の末尾改行・空白を除去（Vercel CLI が \n を付与する問題の防御）
const env = (key: string, fallback = '') => (process.env[key] || fallback).replace(/\\n|\n/g, '').trim();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  supabase: {
    url: env('SUPABASE_URL'),
    anonKey: env('SUPABASE_ANON_KEY'),
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  },

  frontendUrl: env('FRONTEND_URL', 'http://localhost:3000'),
  kioskJwtSecret: env('KIOSK_JWT_SECRET', 'itamin-kiosk-dev-secret-change-in-prod'),
};
