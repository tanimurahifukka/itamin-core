/**
 * デモ用アカウント / 店舗の定数定義
 *
 * `backend/scripts/seed-demo.ts`（永続デモ投入）と
 * `frontend/e2e/setup.ts`（使い捨て E2E データ）の双方から import する。
 * ここを一元化することで「seed した email とテストが使う email がズレる」事故を防ぐ。
 *
 * NOTE: ここは d.ts 無しの純粋な TS モジュールで、実行環境依存を持たない。
 * Supabase クライアント等はここで import しない。
 */

export const DEMO_STORE_ID = '00000000-0000-0000-0000-00000000dem0';
export const DEMO_STORE_NAME = 'ITAMIN デモカフェ';
export const DEMO_PASSWORD = 'Demo1234!';

export type DemoRole = 'owner' | 'manager' | 'leader' | 'full_time' | 'part_time';

export interface DemoUser {
  role: DemoRole;
  email: string;
  password: string;
  name: string;
}

export const DEMO_USERS: Record<DemoRole, DemoUser> = {
  owner:     { role: 'owner',     email: 'owner@demo.itamin.local',    password: DEMO_PASSWORD, name: 'デモオーナー' },
  manager:   { role: 'manager',   email: 'manager@demo.itamin.local',  password: DEMO_PASSWORD, name: 'デモマネージャー' },
  leader:    { role: 'leader',    email: 'leader@demo.itamin.local',   password: DEMO_PASSWORD, name: 'デモリーダー' },
  full_time: { role: 'full_time', email: 'fulltime@demo.itamin.local', password: DEMO_PASSWORD, name: 'デモ正社員' },
  part_time: { role: 'part_time', email: 'parttime@demo.itamin.local', password: DEMO_PASSWORD, name: 'デモアルバイト' },
};

export const DEMO_ROLES: DemoRole[] = ['owner', 'manager', 'leader', 'full_time', 'part_time'];

// 永続デモ店舗で有効化するプラグイン一覧。
// core プラグイン（punch/attendance/staff/settings）はコード上で常時有効なので含めない。
export const DEMO_ENABLED_PLUGINS = [
  'shift',
  'shift_request',
  'check',
  'menu',
  'daily_report',
  'inventory',
  'notice',
  'paid_leave',
  'expense',
  'feedback',
  'line_attendance',
  'attendance_admin',
];
