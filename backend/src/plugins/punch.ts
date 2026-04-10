/**
 * 打刻プラグイン定義
 * タイムカード打刻機能（全スタッフ向け、コア機能）
 * ルーティングは timecardRouter で既に登録済み
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

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
