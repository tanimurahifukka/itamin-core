/**
 * E2Eテスト用セットアップ
 * テストユーザー・店舗・スタッフを Supabase Admin API で作成
 */
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Playwright E2E setup`);
  }
  return value;
}

const SUPABASE_URL = requireEnv('TEST_SUPABASE_URL');
const SERVICE_ROLE_KEY = requireEnv('TEST_SUPABASE_SERVICE_KEY');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const TEST_USERS = {
  owner: { email: 'owner@test.local', password: 'test1234', name: 'テストオーナー' },
  manager: { email: 'manager@test.local', password: 'test1234', name: 'テストマネージャー' },
  full_time: { email: 'fulltime@test.local', password: 'test1234', name: 'テスト正社員' },
  part_time: { email: 'parttime@test.local', password: 'test1234', name: 'テストアルバイト' },
} as const;

export async function setupTestData() {
  console.log('[Setup] テストデータを作成中...');

  // 1. テストユーザー作成
  const userIds: Record<string, string> = {};
  for (const [role, info] of Object.entries(TEST_USERS)) {
    // 既存ユーザー検索
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing?.users?.find(u => u.email === info.email);

    if (found) {
      userIds[role] = found.id;
      console.log(`[Setup] ${role} 既存: ${found.id}`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: info.email,
        password: info.password,
        email_confirm: true,
        user_metadata: { full_name: info.name },
      });
      if (error) throw new Error(`ユーザー作成失敗 (${role}): ${error.message}`);
      userIds[role] = data.user.id;
      console.log(`[Setup] ${role} 作成: ${data.user.id}`);
    }
  }

  // 2. 店舗作成（オーナーが作成）
  const { data: existingStores } = await admin.from('stores').select('id').eq('name', 'テスト店舗');
  let storeId: string;

  if (existingStores && existingStores.length > 0) {
    storeId = existingStores[0].id;
    console.log(`[Setup] 店舗 既存: ${storeId}`);
  } else {
    const { data: store, error } = await admin
      .from('stores')
      .insert({ name: 'テスト店舗', owner_id: userIds.owner })
      .select()
      .single();
    if (error) throw new Error(`店舗作成失敗: ${error.message}`);
    storeId = store.id;
    console.log(`[Setup] 店舗 作成: ${storeId}`);
  }

  // 3. スタッフ登録（各ロール）
  const roles = ['owner', 'manager', 'full_time', 'part_time'] as const;
  for (const role of roles) {
    const { error } = await admin
      .from('store_staff')
      .upsert({
        store_id: storeId,
        user_id: userIds[role],
        role,
      }, { onConflict: 'store_id,user_id' });
    if (error) console.warn(`[Setup] スタッフ追加警告 (${role}): ${error.message}`);
    else console.log(`[Setup] スタッフ ${role} 登録完了`);
  }

  // 4. プラグイン有効化（shift, shift_request, check）
  for (const pluginName of ['shift', 'shift_request', 'check']) {
    await admin.from('store_plugins').upsert({
      store_id: storeId,
      plugin_name: pluginName,
      enabled: true,
    }, { onConflict: 'store_id,plugin_name' });
  }
  console.log('[Setup] プラグイン有効化完了');

  console.log('[Setup] セットアップ完了');
  return { userIds, storeId };
}

export async function teardownTestData() {
  // テスト店舗を削除（CASCADE で関連データも消える）
  await admin.from('stores').delete().eq('name', 'テスト店舗');

  // テストユーザー削除
  for (const info of Object.values(TEST_USERS)) {
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing?.users?.find(u => u.email === info.email);
    if (found) {
      await admin.auth.admin.deleteUser(found.id);
    }
  }
  console.log('[Teardown] テストデータ削除完了');
}
