// ===== プラグインシステム =====

export interface PluginSettingField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'password';
  default?: string | number | boolean;
  options?: { value: string; label: string }[];  // type=select 用
  description?: string;
}

export type StaffRole = 'owner' | 'manager' | 'leader' | 'full_time' | 'part_time';

export type PluginCategory = 'core' | 'attendance' | 'sales' | 'reservation' | 'operations' | 'communication' | 'device';

export interface Plugin {
  name: string;
  version: string;
  description: string;
  label: string;
  icon: string;
  core?: boolean;                        // true = 無効化不可（打刻・設定など）
  category: PluginCategory;
  defaultEnabled?: boolean;              // store_plugins に未登録のときの既定値（非core プラグイン用）
  defaultRoles: StaffRole[];             // デフォルトでアクセスできるロール
  settingsSchema?: PluginSettingField[];
  initialize: (app: import('express').Express) => void;
}

// ===== Express Request 拡張 =====
// any キャストを避けるため、ミドルウェアが Request に付与する拡張プロパティを
// ここで一元的に宣言する。利用箇所では `req.kioskStoreId` のように直接アクセスできる。
declare global {
  namespace Express {
    interface Request {
      user?: import('@supabase/supabase-js').User;
      accessToken?: string;
      kioskStoreId?: string;
      rawBody?: Buffer;
      platformRole?: string;
    }
  }
}
