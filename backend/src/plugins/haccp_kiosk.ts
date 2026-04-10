/**
 * HACCPキオスクプラグイン定義
 * キオスク端末からHACCPチェックリストを記録・提出する機能
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

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
