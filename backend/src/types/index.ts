// ===== プラグインシステム =====

export interface Plugin {
  name: string;
  version: string;
  description: string;
  initialize: (app: import('express').Express) => void;
}

// ===== Express Request 拡張 =====
declare global {
  namespace Express {
    interface Request {
      user?: import('@supabase/supabase-js').User;
      accessToken?: string;
    }
  }
}
