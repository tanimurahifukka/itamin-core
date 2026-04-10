/**
 * キオスクモードプラグイン定義
 * 店舗共用端末（タブレット等）からの打刻・シフト確認機能
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

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
