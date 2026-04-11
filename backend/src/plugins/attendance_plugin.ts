/**
 * 勤怠プラグイン定義（コア機能）
 *
 * 鉄則に従い、勤怠ドメインの全機能をこの1プラグインに集約する。
 * - スタッフ向け打刻セルフサービス（出勤/退勤/休憩/履歴/修正申請）
 * - 管理者向け勤怠管理（今日の出勤ボード・月次一覧・修正承認・LINE連携・ポリシー）
 *
 * HTTP ルーティングは initialize(app) でこのプラグインが所有する。
 * LINE Login チャネル情報は施設ごとに store_plugins.config に格納する。
 */
import type { Express } from 'express';
import type { Plugin } from '../types';
import { attendanceApiRouter } from '../services/attendance/routes';

export const attendancePlugin: Plugin = {
  name: 'attendance',
  version: '2.0.0',
  description: '勤怠管理（打刻・履歴・修正申請・管理者ボード）',
  label: '勤怠',
  icon: '🕐',
  core: true,
  defaultRoles: ['owner', 'manager', 'leader', 'full_time', 'part_time'],
  settingsSchema: [
    {
      key: 'line_login_channel_id',
      label: 'LINE Login チャネル ID',
      type: 'text',
      description: 'LINE Developers Console で作成した LINE Login チャネルの ID（LINE 打刻を使う場合のみ）',
    },
    {
      key: 'line_login_channel_secret',
      label: 'LINE Login チャネルシークレット',
      type: 'password',
      description: 'LINE Login チャネルのシークレットキー',
    },
    {
      key: 'line_login_callback_url',
      label: 'LINE Login コールバック URL',
      type: 'text',
      description: 'LINE Login 認可後のリダイレクト先（例: https://your-app.vercel.app/auth/line/callback?storeId=YOUR_STORE_ID）',
    },
    {
      key: 'line_bot_channel_secret',
      label: 'Messaging API チャネルシークレット（任意）',
      type: 'password',
      description: 'LINE 通知やリッチメニューを使う場合のみ設定',
    },
    {
      key: 'line_bot_channel_access_token',
      label: 'Messaging API アクセストークン（任意）',
      type: 'password',
      description: 'LINE 通知やリッチメニューを使う場合のみ設定',
    },
  ],
  initialize: (app: Express) => {
    // 鉄則3: 本体ではなくこのプラグイン自身がルーティングを所有する
    app.use('/api/attendance', attendanceApiRouter);
  },
};
