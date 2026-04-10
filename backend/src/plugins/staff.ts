/**
 * スタッフ管理プラグイン定義
 * スタッフの招待・管理機能（コア機能）
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

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
