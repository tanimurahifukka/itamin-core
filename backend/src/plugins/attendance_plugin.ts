/**
 * 勤怠管理プラグイン定義
 * 勤怠記録の閲覧・管理機能（管理者向け、コア機能）
 * ルーティングは attendanceApiRouter で既に登録済み
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

export const attendancePlugin: Plugin = {
  name: 'attendance',
  version: '1.1.0',
  description: '勤怠記録の閲覧・管理',
  label: '勤怠管理',
  icon: '📊',
  core: true,
  defaultRoles: ['owner', 'manager', 'leader'],
  // export_permission は config JSONB に role 配列として保存される。
  // PluginSettingField は配列型 default を持てないため settingsSchema に入れず、
  // バックエンドのデフォルト（['owner','manager']）をルートハンドラ内で保持する。
  // フロントの設定画面にはインラインボタン UI で表示する（PluginSettingsPage.tsx）。
  settingsSchema: [],
  initialize: (_app: Express) => {},
};
