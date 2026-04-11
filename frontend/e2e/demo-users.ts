/**
 * Playwright 向けのデモ定数ローカルコピー。
 *
 * backend/scripts/demo-users.ts と内容を同期させる必要がある。
 * Playwright の TS ランナーは ESM/CJS 境界を越えると named import が
 * 解決できなくなるため、同じ ESM パッケージ (frontend) 内に複写している。
 */

export const DEMO_STORE_ID = '00000000-0000-0000-0000-00000000dd00';
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
