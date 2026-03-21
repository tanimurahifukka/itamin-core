import dotenv from 'dotenv';
if (process.env.VERCEL !== '1') {
  dotenv.config();
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};
