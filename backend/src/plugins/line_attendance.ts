/**
 * LINE打刻プラグイン定義
 * スタッフ向け打刻 + 管理者向け勤怠管理
 */
import type { Plugin } from '../types';
import type { Express } from 'express';

// スタッフ向け LINE打刻
export const lineAttendancePlugin: Plugin = {
  name: 'line_attendance',
  version: '1.0.0',
  description: 'LINE打刻・勤怠セルフサービス',
  label: 'LINE打刻',
  icon: '📱',
  core: false,
  defaultRoles: ['manager', 'leader', 'full_time', 'part_time'],
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
