/**
 * スタッフ向け LINE 打刻プラグイン
 *
 * LINE チャネル情報は施設 (store) 単位で store_plugins.config に保存する。
 * 各施設が自分の LINE Official Account を紐づける設計。
 *
 * 注: 管理者向け勤怠管理プラグインは `attendance_admin.ts` に分離している (鉄則1)。
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

export const lineAttendancePlugin: Plugin = {
  name: 'line_attendance',
  version: '1.1.0',
  description: 'LINE打刻・勤怠セルフサービス',
  label: 'LINE打刻',
  icon: '📱',
  core: false,
  category: 'attendance',
  defaultEnabled: true,
  defaultRoles: ['manager', 'leader', 'full_time', 'part_time'],
  settingsSchema: [
    {
      key: 'line_login_channel_id',
      label: 'LINE Login チャネル ID',
      type: 'text',
      description: 'LINE Developers Console で作成した LINE Login チャネルの ID',
    },
    {
      key: 'line_login_channel_secret',
      label: 'LINE Login チャネルシークレット',
      type: 'text',
      description: 'LINE Login チャネルのシークレットキー',
    },
    {
      key: 'line_login_callback_url',
      label: 'LINE Login コールバック URL',
      type: 'text',
      description: 'LINE Login 認可後のリダイレクト先（例: https://your-app.vercel.app/auth/line/callback?storeId=YOUR_STORE_ID）',
    },
    {
      key: 'line_liff_id',
      label: 'LIFF アプリ ID（旧方式・未使用）',
      type: 'text',
      description: '現在の LINE 連携は LINE Login OAuth に統一しているため未使用です',
    },
    {
      key: 'line_bot_channel_secret',
      label: 'Messaging API チャネルシークレット（任意）',
      type: 'text',
      description: '通知やリッチメニューを使う場合のみ',
    },
    {
      key: 'line_bot_channel_access_token',
      label: 'Messaging API アクセストークン（任意）',
      type: 'text',
      description: '通知やリッチメニューを使う場合のみ',
    },
  ],
  initialize: (_app: Express) => {
    // ルーティングは attendanceApiRouter / lineRouter で登録済み
  },
};
