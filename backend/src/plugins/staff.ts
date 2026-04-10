/**
 * スタッフ管理プラグイン定義
 * スタッフの招待・管理機能（コア機能）
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

export const staffPlugin: Plugin = {
  name: 'staff',
  version: '1.1.0',
  description: 'スタッフの招待・管理',
  label: 'スタッフ',
  icon: '👥',
  core: true,
  defaultRoles: ['owner', 'manager', 'leader'],
  settingsSchema: [
    {
      key: 'password_reset_roles',
      label: 'パスワードリセット可能なロール',
      type: 'select',
      default: 'manager',
      options: [
        { value: 'owner', label: 'オーナーのみ' },
        { value: 'manager', label: 'オーナー+マネージャー' },
        { value: 'leader', label: 'オーナー+マネージャー+リーダー' },
      ],
      description: '従業員のパスワードをリセットできるロールの範囲を設定します',
    },
  ],
  initialize: (_app: Express) => {},
};
