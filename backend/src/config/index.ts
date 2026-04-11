import dotenv from 'dotenv';
if (process.env.VERCEL !== '1') {
  dotenv.config();
}

// 環境変数の末尾改行・空白を除去（Vercel CLI が \n を付与する問題の防御）
const env = (key: string, fallback = '') => (process.env[key] || fallback).replace(/\\n|\n/g, '').trim();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function requireSecret(key: string, devFallback: string): string {
  const raw = (process.env[key] || '').replace(/\\n|\n/g, '').trim();
  if (raw) return raw;
  if (isProduction) {
    throw new Error(`[config] ${key} must be set in production. Refusing to start with insecure default.`);
  }
  return devFallback;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv,

  supabase: {
    url: env('SUPABASE_URL'),
    anonKey: env('SUPABASE_ANON_KEY'),
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  },

  frontendUrl: env('FRONTEND_URL', 'http://localhost:3000'),
  kioskJwtSecret: requireSecret('KIOSK_JWT_SECRET', 'itamin-kiosk-dev-secret-change-in-prod'),
};
