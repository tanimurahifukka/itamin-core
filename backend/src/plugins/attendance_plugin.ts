/**
 * 勤怠管理プラグイン定義
 * 勤怠記録の閲覧・管理機能（管理者向け、コア機能）
 * ルーティングは attendanceApiRouter で既に登録済み
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

export const attendancePlugin: Plugin = {
  name: 'attendance',
  version: '1.0.0',
  description: '勤怠記録の閲覧・管理',
  label: '勤怠管理',
  icon: '📊',
  core: true,
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (_app: Express) => {},
};
