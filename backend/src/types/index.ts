// ===== プラグインシステム =====

export interface PluginSettingField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select';
  default?: string | number | boolean;
  options?: { value: string; label: string }[];  // type=select 用
  description?: string;
}

export type StaffRole = 'owner' | 'manager' | 'leader' | 'full_time' | 'part_time';

export interface Plugin {
  name: string;
  version: string;
  description: string;
  label: string;
  icon: string;
  core?: boolean;                        // true = 無効化不可（打刻・設定など）
  defaultRoles: StaffRole[];             // デフォルトでアクセスできるロール
  settingsSchema?: PluginSettingField[];
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
