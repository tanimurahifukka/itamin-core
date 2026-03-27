/**
 * コア機能プラグイン定義
 * ルーティングは既存のまま、プラグインメタデータとして登録する
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

// 打刻（全スタッフ向け、オーナーは不要なことが多い）
export const punchPlugin: Plugin = {
  name: 'punch',
  version: '1.0.0',
  description: 'タイムカード打刻',
  label: '打刻',
  icon: '🕐',
  core: true,
  defaultRoles: ['manager', 'leader', 'full_time', 'part_time'],
  initialize: (_app: Express) => {
    // ルーティングは timecardRouter で既に登録済み
  },
};

// 勤怠管理（管理者向け）
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

// スタッフ管理
export const staffPlugin: Plugin = {
  name: 'staff',
  version: '1.0.0',
  description: 'スタッフの招待・管理',
  label: 'スタッフ',
  icon: '👥',
  core: true,
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (_app: Express) => {},
};

// プラグイン設定（オーナーのみ）
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
