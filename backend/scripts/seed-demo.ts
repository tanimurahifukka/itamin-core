/**
 * 永続デモ店舗 seed スクリプト
 *
 * ローカル `supabase start` に対して以下を冪等に投入する:
 *   - 1 店舗 (DEMO_STORE_ID 固定)
 *   - 5 ロール分の Auth ユーザー + store_staff
 *   - DEMO_ENABLED_PLUGINS の有効化
 *   - 代表的な seed データ (お知らせ 1 件、予約枠 1 件)
 *
 * 手動デモ・スクリーンショット撮影・E2E (role-matrix 系) の共通基盤として使う。
 * 書き込み系 E2E (role-deep) は別途使い捨て店舗を作る。
 *
 * 実行:  `npm run seed:demo`  (repo root)
 * 前提:  `supabase start` 済み、`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が env にある
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import {
  DEMO_STORE_ID,
  DEMO_STORE_NAME,
  DEMO_USERS,
  DEMO_ROLES,
  DEMO_ENABLED_PLUGINS,
} from './demo-users';

// backend/.env → repo root/.env の順に読む
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function pickEnv(...names: string[]): string {
  for (const n of names) {
    const raw = (process.env[n] || '').replace(/\\n|\n/g, '').trim();
    if (raw) return raw;
  }
  console.error(`[seed-demo] one of ${names.join(' / ')} is required. Set it in backend/.env or export it in your shell.`);
  process.exit(1);
}

// backend convention と E2E convention の両方を許容 (ローカル supabase start では同じ値を指す)。
// 前提: 絶対に本番に流し込まない。localhost 以外なら CONFIRM_SEED_NON_LOCAL=1 が必要。
const SUPABASE_URL = pickEnv('SUPABASE_URL', 'TEST_SUPABASE_URL');
const SERVICE_ROLE_KEY = pickEnv('SUPABASE_SERVICE_ROLE_KEY', 'TEST_SUPABASE_SERVICE_KEY');
const isLocal = /127\.0\.0\.1|localhost/.test(SUPABASE_URL);
if (!isLocal && process.env.CONFIRM_SEED_NON_LOCAL !== '1') {
  console.error(`[seed-demo] SUPABASE_URL (${SUPABASE_URL}) is not local.`);
  console.error('[seed-demo] Refusing to seed. Set CONFIRM_SEED_NON_LOCAL=1 if you know what you are doing.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function upsertAuthUser(email: string, password: string, name: string): Promise<string> {
  // listUsers はページネーションあるが、デモ環境はユーザー数が少ないので 1 ページで十分
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) {
    // パスワードを既知の値にリセット（デモ用・安心して配布できるように）
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { ...existing.user_metadata, full_name: name },
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw new Error(`createUser failed (${email}): ${error.message}`);
  return data.user!.id;
}

async function upsertProfile(userId: string, email: string, name: string) {
  const { error } = await admin
    .from('profiles')
    .upsert({ id: userId, email, name }, { onConflict: 'id' });
  if (error) throw new Error(`profile upsert failed (${email}): ${error.message}`);
}

async function upsertDemoStore(ownerId: string) {
  const { error } = await admin
    .from('stores')
    .upsert(
      {
        id: DEMO_STORE_ID,
        name: DEMO_STORE_NAME,
        owner_id: ownerId,
        timezone: 'Asia/Tokyo',
        address: '東京都渋谷区デモ町1-2-3',
        phone: '03-0000-0000',
      },
      { onConflict: 'id' }
    );
  if (error) throw new Error(`stores upsert failed: ${error.message}`);
}

async function upsertStoreStaff(userId: string, role: string) {
  const { error } = await admin
    .from('store_staff')
    .upsert(
      { store_id: DEMO_STORE_ID, user_id: userId, role },
      { onConflict: 'store_id,user_id' }
    );
  if (error) throw new Error(`store_staff upsert failed (${role}): ${error.message}`);
}

async function enablePlugins() {
  const rows = DEMO_ENABLED_PLUGINS.map((plugin_name) => ({
    store_id: DEMO_STORE_ID,
    plugin_name,
    enabled: true,
  }));
  const { error } = await admin
    .from('store_plugins')
    .upsert(rows, { onConflict: 'store_id,plugin_name' });
  if (error) throw new Error(`store_plugins upsert failed: ${error.message}`);
}

async function seedNotice(ownerId: string) {
  // notices テーブルが無い環境もあるので失敗しても無視
  const { error } = await admin.from('notices').upsert(
    {
      id: '00000000-0000-0000-0000-00000000dd01',
      store_id: DEMO_STORE_ID,
      author_id: ownerId,
      title: 'デモ店舗へようこそ',
      body: 'これはデモ用の永続 seed お知らせです。自由にログインして触ってみてください。',
    },
    { onConflict: 'id' }
  );
  if (error) console.warn(`[seed-demo] notice upsert skipped: ${error.message}`);
}

async function main() {
  console.log(`[seed-demo] target: ${SUPABASE_URL}`);
  console.log(`[seed-demo] store: ${DEMO_STORE_NAME} (${DEMO_STORE_ID})`);

  const userIds: Record<string, string> = {};
  for (const role of DEMO_ROLES) {
    const u = DEMO_USERS[role];
    const id = await upsertAuthUser(u.email, u.password, u.name);
    await upsertProfile(id, u.email, u.name);
    userIds[role] = id;
    console.log(`[seed-demo] user ${role.padEnd(9)} ${u.email}  id=${id}`);
  }

  await upsertDemoStore(userIds.owner);
  for (const role of DEMO_ROLES) {
    await upsertStoreStaff(userIds[role], role);
  }
  console.log('[seed-demo] store + staff ready');

  await enablePlugins();
  console.log(`[seed-demo] plugins enabled: ${DEMO_ENABLED_PLUGINS.join(', ')}`);

  await seedNotice(userIds.owner);

  console.log('');
  console.log('[seed-demo] done. Login with any of:');
  for (const role of DEMO_ROLES) {
    const u = DEMO_USERS[role];
    console.log(`  ${role.padEnd(9)}  email=${u.email}  password=${u.password}`);
  }
}

main().catch((e) => {
  console.error('[seed-demo] failed:', e);
  process.exit(1);
});
