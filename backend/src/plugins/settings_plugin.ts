/**
 * 設定プラグイン定義
 * プラグイン・権限の設定機能（オーナー・管理者向け、コア機能）
 * ルーターの実装は settings.ts（pluginSettingsRouter）に分離されている
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

export const settingsPlugin: Plugin = {
  name: 'settings',
  version: '1.0.0',
  description: 'プラグイン・権限の設定',
  label: '設定',
  icon: '⚙️',
  core: true,
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (_app: Express) => {},
};
