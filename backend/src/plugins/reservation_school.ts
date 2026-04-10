import type { Express } from 'express';
import type { Plugin } from '../types';
import { schoolAdminRouter } from '../services/reservation/school_routes';

export const reservationSchoolPlugin: Plugin = {
  name: 'reservation_school',
  version: '0.1.0',
  description: 'スクール/コース予約（料理教室・ヨガなど、コース + 開催セッション管理）',
  label: 'スクール予約',
  icon: '🎓',
  core: false,
  defaultRoles: ['owner', 'manager', 'leader'],
  settingsSchema: [
    {
      key: 'accept_days_ahead',
      label: '何日先まで受付',
      type: 'number',
      default: 60,
    },
    {
      key: 'require_phone',
      label: '電話番号を必須にする',
      type: 'boolean',
      default: false,
    },
    {
      key: 'send_confirmation_email',
      label: '予約確認メールを送信',
      type: 'boolean',
      default: true,
    },
  ],
  initialize: (app: Express) => {
    app.use('/api/reservation/school', schoolAdminRouter);
  },
};
