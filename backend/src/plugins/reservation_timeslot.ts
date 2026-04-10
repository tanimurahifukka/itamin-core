import type { Express } from 'express';
import type { Plugin } from '../types';
import { timeslotAdminRouter } from '../services/reservation/timeslot_routes';

export const reservationTimeslotPlugin: Plugin = {
  name: 'reservation_timeslot',
  version: '0.1.0',
  description: '時間帯予約（ランチ枠・ディナー枠など時間帯ごとに定員管理）',
  label: '時間帯予約',
  icon: '⏰',
  core: false,
  defaultRoles: ['owner', 'manager', 'leader'],
  settingsSchema: [
    {
      key: 'accept_days_ahead',
      label: '何日先まで受付',
      type: 'number',
      default: 30,
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
    app.use('/api/reservation/timeslot', timeslotAdminRouter);
  },
};
