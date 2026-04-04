/**
 * LINE打刻プラグイン定義
 * スタッフ向け打刻 + 管理者向け勤怠管理
 *
 * LINE チャネル情報は施設（store）単位で store_plugins.config に保存する。
 * 各施設が自分の LINE Official Account を紐づける設計。
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

// スタッフ向け LINE打刻
export const lineAttendancePlugin: Plugin = {
  name: 'line_attendance',
  version: '1.1.0',
  description: 'LINE打刻・勤怠セルフサービス',
  label: 'LINE打刻',
  icon: '📱',
  core: false,
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
      description: 'LINE Login 認可後のリダイレクト先（例: https://your-app.vercel.app/auth/line/callback）',
    },
    {
      key: 'line_liff_id',
      label: 'LIFF アプリ ID',
      type: 'text',
      description: 'LINE Developers Console で作成した LIFF アプリの ID',
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

// 管理者向け 勤怠管理（LINE対応版）
export const attendanceAdminPlugin: Plugin = {
  name: 'attendance_admin',
  version: '1.0.0',
  description: '勤怠管理（LINE打刻対応）',
  label: '勤怠管理(LINE)',
  icon: '📋',
  core: false,
  defaultRoles: ['owner', 'manager'],
  initialize: (_app: Express) => {},
};
