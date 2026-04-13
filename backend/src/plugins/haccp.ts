/**
 * HACCP プラグイン定義 (旧 `check` プラグインを改名+分割)
 *
 * 責務はこのファイルにはほぼ無く、`services/haccp/*` の Router を
 * `/api/haccp` にマウントするだけの薄皮。
 *
 * 本体 (index.ts) を薄く保つため、URL マウントもこの initialize 内で行う (鉄則3)。
 */

import type { Plugin } from '../types';
import type { Express } from 'express';
import { haccpRouter } from '../services/haccp';

export const haccpPlugin: Plugin = {
  name: 'haccp',
  version: '2.1.0',
  description: 'HACCP 準拠チェックリスト・測定・逸脱管理',
  label: 'チェックリスト',
  icon: '✅',
  category: 'operations',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/haccp', haccpRouter);
  },
};
