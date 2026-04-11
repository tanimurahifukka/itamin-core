/**
 * HACCP サービス公開エントリポイント
 *
 * 4 ルータ (templates / submissions / measurements / deviations) を合成した
 * `haccpRouter` を export する。plugins/haccp.ts からマウントされる。
 *
 * kiosk / LINE / cron 等の別経路からは以下の service 関数を直接呼ぶ:
 *  - listActiveChecklist  (active テンプレート取得)
 *  - createSubmission     (提出処理)
 *  - autoFillFromSwitchBot (SwitchBot cron からの自動測定)
 */

import { Router } from 'express';
import { templatesRouter } from './templates';
import { submissionsRouter } from './submissions';
import { measurementsRouter } from './measurements';
import { deviationsRouter } from './deviations';

export const haccpRouter = Router();

// すべて同じ /:storeId/... プレフィックスを共有するので単純に use でチェーンする
haccpRouter.use(templatesRouter);
haccpRouter.use(submissionsRouter);
haccpRouter.use(measurementsRouter);
haccpRouter.use(deviationsRouter);

export {
  listActiveChecklist,
  createSubmission,
  listKioskActiveTemplates,
  listKioskSubmissionsForDate,
} from './submissions';
export { autoFillFromSwitchBot } from './auto-fill';
export type { HaccpTiming, HaccpScope, HaccpLayer } from './helpers';
