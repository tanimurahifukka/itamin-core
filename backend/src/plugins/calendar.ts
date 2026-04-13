/**
 * 営業日カレンダープラグイン
 *
 * 店舗レベルの「営業時間 + 日単位の例外 (休業/特別営業/祝日)」を一元管理する。
 * 他プラグイン (予約 / HACCP / キオスクなど) は `services/calendar/resolver.ts`
 * の `getEffectiveHours` / `getEffectiveHoursRange` を呼ぶだけで営業判定が出来る。
 *
 * 鉄則3 (本体は薄く) に従い、ロジックは `services/calendar/*` に逃し、
 * ここは router を /api/calendar にマウントするだけの薄皮。
 */
import type { Plugin } from '../types';
import type { Express } from 'express';
import { calendarRouter } from '../services/calendar/routes';

export const calendarPlugin: Plugin = {
  name: 'calendar',
  version: '0.1.0',
  description: '店舗の営業日・営業時間・休業日カレンダーを管理し、他機能の営業判定ソースにする',
  label: '営業日カレンダー',
  icon: '📅',
  category: 'operations',
  defaultRoles: ['owner', 'manager', 'leader'],
  initialize: (app: Express) => {
    app.use('/api/calendar', calendarRouter);
  },
};
