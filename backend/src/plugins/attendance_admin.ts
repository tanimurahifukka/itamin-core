/**
 * 勤怠管理 (LINE 打刻対応) プラグイン
 *
 * 鉄則1 (1 Plugin = 1 Function) に従い、スタッフ向け LINE 打刻
 * (`line_attendance.ts`) とは別ファイルで管理する。
 * ルーティングは attendanceApiRouter (services/attendance/routes.ts) で登録済みのため、
 * ここではメタ情報だけを提供する。
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

export const attendanceAdminPlugin: Plugin = {
  name: 'attendance_admin',
  version: '1.1.0',
  description: '勤怠管理（LINE打刻対応）',
  label: '勤怠管理(LINE)',
  icon: '📋',
  core: false,
  category: 'attendance',
  defaultEnabled: true,
  defaultRoles: ['owner', 'manager'],
  initialize: (_app: Express) => {
    // ルーティングは services/attendance/routes.ts で登録済み
  },
};
