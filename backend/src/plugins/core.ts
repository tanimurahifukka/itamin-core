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

// HACCP管理（キオスク向け）
export const haccpKioskPlugin: Plugin = {
  name: 'haccp_kiosk',
  version: '1.0.0',
  description: 'キオスク端末からHACCPチェックリストを記録・提出',
  label: 'HACCP',
  icon: '🌡️',
  core: false,
  defaultRoles: ['owner', 'manager', 'leader', 'full_time', 'part_time'],
  initialize: (_app: Express) => {},
};

// キオスクモード（店舗共用端末へのリンク）
export const kioskPlugin: Plugin = {
  name: 'kiosk',
  version: '1.0.0',
  description: '店舗共用端末（タブレット等）からの打刻・シフト確認',
  label: 'キオスク',
  icon: '🖥️',
  core: false,
  defaultRoles: ['owner', 'manager'],
  initialize: (_app: Express) => {},
};

// SwitchBot連携
export const switchbotPlugin: Plugin = {
  name: 'switchbot',
  version: '1.0.0',
  description: 'SwitchBot温度計からHACCPチェックリストに自動入力',
  label: 'SwitchBot',
  icon: '🌡️',
  core: false,
  defaultRoles: ['owner', 'manager'],
  settingsSchema: [
    { key: 'token', label: 'APIトークン', type: 'text', description: 'SwitchBotアプリ → プロフィール → 開発者向けオプション' },
    { key: 'secret', label: 'シークレットキー', type: 'text', description: 'SwitchBotアプリ v6.14以降で取得' },
  ],
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
