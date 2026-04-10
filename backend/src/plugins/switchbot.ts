/**
 * SwitchBot連携プラグイン定義
 * SwitchBot温度計からHACCPチェックリストに自動入力する機能
 * settingsSchema: APIトークンとシークレットキーの設定を含む
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

export const switchbotPlugin: Plugin = {
  name: 'switchbot',
  version: '1.0.0',
  description: 'SwitchBot温度計からHACCPチェックリストに自動入力',
  label: 'SwitchBot',
  icon: '🌡️',
  core: false,
  defaultRoles: ['owner', 'manager'],
  settingsSchema: [
    { key: 'token', label: 'APIトークン', type: 'password', description: 'SwitchBotアプリ → プロフィール → 開発者向けオプション' },
    { key: 'secret', label: 'シークレットキー', type: 'password', description: 'SwitchBotアプリ v6.14以降で取得' },
  ],
  initialize: (_app: Express) => {},
};
