import type { Express } from 'express';
import type { Plugin } from '../types';
import { tableReservationAdminRouter } from '../services/reservation/table_routes';
import { reservationSlugRouter } from '../services/reservation/slug_routes';

export const reservationTablePlugin: Plugin = {
  name: 'reservation_table',
  version: '0.1.0',
  description: 'テーブル予約（席単位で枠を管理する一般飲食店向け予約）',
  label: 'テーブル予約',
  icon: '📅',
  core: false,
  defaultRoles: ['owner', 'manager', 'leader'],
  settingsSchema: [
    {
      key: 'default_duration_minutes',
      label: 'デフォルト予約時間（分）',
      type: 'number',
      default: 120,
      description: '1 予約あたりの標準利用時間。',
    },
    {
      key: 'accept_days_ahead',
      label: '何日先まで予約受付',
      type: 'number',
      default: 30,
      description: '今日から何日先までの予約を受け付けるか。',
    },
    {
      key: 'allow_same_day',
      label: '当日予約を許可',
      type: 'boolean',
      default: true,
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
    app.use('/api/reservation/table', tableReservationAdminRouter);
    // slug 管理は複数予約プラグインで共有する。ここで mount しても他プラグイン未有効時は単独で動く。
    app.use('/api/reservation', reservationSlugRouter);
  },
};
