/**
 * 打刻プラグイン定義
 * タイムカード打刻機能（全スタッフ向け、コア機能）
 *
 * 打刻は以下 3 ルートから入れる。店舗ごとに settingsSchema で ON/OFF 可能。
 *   - Web 打刻  (Supabase JWT 経由, /api/attendance/*)
 *   - LINE 打刻 (LINE userId 経由, /api/line-punch/*)
 *   - NFC+PIN   (公開 URL + per-staff PIN, /api/nfc/punch/*)
 *
 * いずれも最終的な記録は `attendance_records` に統一される。
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

export const punchPlugin: Plugin = {
  name: 'punch',
  version: '1.1.0',
  description: 'タイムカード打刻 (Web / LINE / NFC+PIN 選択式)',
  label: '打刻',
  icon: '🕐',
  core: true,
  defaultRoles: ['manager', 'leader', 'full_time', 'part_time'],
  settingsSchema: [
    {
      key: 'enable_web_punch',
      label: 'Web 打刻を有効化',
      type: 'boolean',
      default: true,
      description: 'アプリ画面から Supabase ログイン状態で打刻する経路。',
    },
    {
      key: 'enable_line_punch',
      label: 'LINE 打刻を有効化',
      type: 'boolean',
      default: false,
      description: 'LINE リッチメニュー + LIFF から打刻する経路。LINE 打刻プラグインの設定が別途必要。',
    },
    {
      key: 'enable_nfc_punch',
      label: 'NFC+PIN 打刻を有効化',
      type: 'boolean',
      default: false,
      description: '物理 NFC タグから公開ページを開き、per-staff PIN で打刻する経路。',
    },
  ],
  initialize: (_app: Express) => {
    // ルーティングは既存の timecardRouter / attendanceApiRouter / linePunchRouter /
    // nfcPunchRouter で登録済み。このプラグインは設定とラベルの提供のみ担う。
  },
};
