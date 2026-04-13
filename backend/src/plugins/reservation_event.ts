import type { Express } from 'express';
import type { Plugin } from '../types';
import { eventAdminRouter } from '../services/reservation/event_routes';

export const reservationEventPlugin: Plugin = {
  name: 'reservation_event',
  version: '0.1.0',
  description: '単発イベント予約（貸切パーティ、ライブ、ワイン会など）',
  label: 'イベント予約',
  icon: '🎉',
  core: false,
  category: 'reservation',
  defaultRoles: ['owner', 'manager', 'leader'],
  settingsSchema: [
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
    app.use('/api/reservation/event', eventAdminRouter);
  },
};
