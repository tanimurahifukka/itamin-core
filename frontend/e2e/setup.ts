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
  leader: { email: 'leader@test.local', password: 'test1234', name: 'テストリーダー' },
  full_time: { email: 'fulltime@test.local', password: 'test1234', name: 'テスト正社員' },
  part_time: { email: 'parttime@test.local', password: 'test1234', name: 'テストアルバイト' },
} as const;

// listUsers はデフォルト 50 件ページングなので、email で全件走査する。
async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  let page = 1;
  const perPage = 200;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const found = data?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return { id: found.id };
    if (!data?.users || data.users.length < perPage) return null;
    page++;
  }
  return null;
}

// profiles 行は stores.owner_id の FK なので、既存ユーザー再利用時にも必ず揃える。
async function ensureProfile(
  userId: string,
  info: { email: string; name: string },
): Promise<void> {
  const { error } = await admin
    .from('profiles')
    .upsert({ id: userId, email: info.email, name: info.name }, { onConflict: 'id' });
  if (error) {
    console.warn(`[Setup] profiles upsert 警告: ${error.message}`);
  }
}

async function createUserFresh(
  role: string,
  info: { email: string; password: string; name: string },
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({
      email: info.email,
      password: info.password,
      email_confirm: true,
      user_metadata: { full_name: info.name },
    });
    if (!error && data?.user) {
      await ensureProfile(data.user.id, info);
      return data.user.id;
    }
    lastError = error;
    console.warn(`[Setup] ${role} 作成失敗 (attempt ${attempt}): ${error?.message ?? 'unknown'}`);
    // "already registered" の場合は既存ユーザー ID を返す
    const msg = error?.message ?? '';
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      const found = await findUserByEmail(info.email);
      if (found) {
        await ensureProfile(found.id, info);
        console.log(`[Setup] ${role} 既存ユーザーを再利用: ${found.id}`);
        return found.id;
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
  throw new Error(`ユーザー作成失敗 (${role}): ${message}`);
}

export async function setupTestData() {
  console.log('[Setup] テストデータを作成中...');

  // 1. テストユーザー作成
  const userIds: Record<string, string> = {};
  for (const [role, info] of Object.entries(TEST_USERS)) {
    const found = await findUserByEmail(info.email);

    if (found) {
      await ensureProfile(found.id, info);
      userIds[role] = found.id;
      console.log(`[Setup] ${role} 既存: ${found.id}`);
    } else {
      userIds[role] = await createUserFresh(role, info);
      console.log(`[Setup] ${role} 作成: ${userIds[role]}`);
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
  const roles = ['owner', 'manager', 'leader', 'full_time', 'part_time'] as const;
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

  // 4. プラグイン有効化（shift, shift_request, haccp）
  for (const pluginName of ['shift', 'shift_request', 'haccp']) {
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
  // 複数 spec ファイルが並列で走る時に teardown が他 spec の setup を破壊するため、
  // 実際の削除は行わない (setupTestData は idempotent なので再利用で問題ない)。
  console.log('[Teardown] スキップ (idempotent setup)');
}
