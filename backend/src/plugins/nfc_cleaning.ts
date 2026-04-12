/**
 * NFC 清掃チェックプラグイン
 * 物理的な場所 (トイレ等) に NFC タグを貼り、スタッフが per-staff PIN +
 * チェック入力で HACCP 記録を残す。実装ルートは backend/src/nfc/routes.ts
 * (公開) と backend/src/auth/stores.ts (管理者用) に分散している。
 * 本プラグインは プラグイン一覧・権限設定・設定パネル用の登録のみ担う。
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

export const nfcCleaningPlugin: Plugin = {
  name: 'nfc_cleaning',
  version: '1.0.0',
  description: 'NFC タグから開くチェック入力 (PIN 認証 + チェックリスト自動記録)',
  label: 'NFC チェック',
  icon: '🧹',
  core: false,
  defaultRoles: ['owner', 'manager', 'leader', 'full_time', 'part_time'],
  initialize: (_app: Express) => {},
};
