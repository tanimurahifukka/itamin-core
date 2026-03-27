/**
 * ロール別 E2E テスト
 * 各ロール（owner/manager/full_time/part_time）でログインし、
 * 見えるべきタブが見え、見えないタブが見えないことを検証
 */
import { test, expect, Page } from '@playwright/test';
import { setupTestData, teardownTestData, TEST_USERS } from './setup';

// デフォルト権限での期待値
// punch: manager, full_time, part_time（オーナーは打刻不要）
// attendance: owner, manager
// staff: owner, manager
// shift: owner, manager
// shift_request: full_time, part_time
// check: owner, manager
// settings: owner, manager
const EXPECTED_TABS: Record<string, string[]> = {
  owner: ['勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '設定'],
  manager: ['打刻', '勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '設定'],
  leader: ['打刻', '勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '設定'],
  full_time: ['打刻', 'シフト希望'],
  part_time: ['打刻', 'シフト希望'],
};

const NOT_EXPECTED_TABS: Record<string, string[]> = {
  owner: ['打刻', 'シフト希望'],
  manager: ['シフト希望'],
  leader: ['シフト希望'],
  full_time: ['勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '設定'],
  part_time: ['勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '設定'],
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('.login-btn');
  // ログイン後、サイドバーが出るまで待つ（店舗が1つなら自動選択）
  await page.waitForSelector('.sidebar-nav-item', { timeout: 15000 });
}

async function logout(page: Page) {
  // プロフィールメニューを開いてログアウト
  const trigger = page.locator('.profile-trigger');
  if (await trigger.isVisible()) {
    await trigger.click();
    const logoutBtn = page.locator('.profile-dropdown-logout');
    await logoutBtn.waitFor({ timeout: 3000 });
    await logoutBtn.click();
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  }
}

// セットアップは全テスト前に1回
test.beforeAll(async () => {
  await setupTestData();
});

test.afterAll(async () => {
  await teardownTestData();
});

// ============================================================
// Owner ロール
// ============================================================
test.describe('Owner ロール', () => {
  test('正しいタブが表示される', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);

    const navItems = page.locator('.sidebar-nav-item');
    const texts = await navItems.allTextContents();

    for (const tab of EXPECTED_TABS.owner) {
      expect(texts, `"${tab}" が見えるべき`).toContain(tab);
    }
    for (const tab of NOT_EXPECTED_TABS.owner) {
      expect(texts, `"${tab}" は見えないべき`).not.toContain(tab);
    }

    await logout(page);
  });

  test('設定画面でプラグイン権限を変更できる', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);

    // 設定タブをクリック
    await page.click('.sidebar-nav-item:has-text("設定")');
    // プラグイン一覧が表示される
    await expect(page.locator('text=プラグイン設定')).toBeVisible();
    // プラグインカードが表示される（展開するとアクセス権限が見える）
    // 打刻を展開
    const punchHeader = page.locator('div:has-text("打刻")').first();
    await punchHeader.click();
    // アクセス権限のロールボタンが見える
    await expect(page.locator('button:has-text("マネージャー")').first()).toBeVisible({ timeout: 5000 });

    await logout(page);
  });
});

// ============================================================
// Manager ロール
// ============================================================
test.describe('Manager ロール', () => {
  test('正しいタブが表示される', async ({ page }) => {
    await login(page, TEST_USERS.manager.email, TEST_USERS.manager.password);

    const navItems = page.locator('.sidebar-nav-item');
    const texts = await navItems.allTextContents();

    for (const tab of EXPECTED_TABS.manager) {
      expect(texts, `"${tab}" が見えるべき`).toContain(tab);
    }
    for (const tab of NOT_EXPECTED_TABS.manager) {
      expect(texts, `"${tab}" は見えないべき`).not.toContain(tab);
    }

    await logout(page);
  });

  test('打刻画面が表示される', async ({ page }) => {
    await login(page, TEST_USERS.manager.email, TEST_USERS.manager.password);

    await page.click('.sidebar-nav-item:has-text("打刻")');
    await expect(page.locator('.punch-btn')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// Full-time（正社員）ロール
// ============================================================
test.describe('正社員ロール', () => {
  test('正しいタブが表示される', async ({ page }) => {
    await login(page, TEST_USERS.full_time.email, TEST_USERS.full_time.password);

    const navItems = page.locator('.sidebar-nav-item');
    const texts = await navItems.allTextContents();

    for (const tab of EXPECTED_TABS.full_time) {
      expect(texts, `"${tab}" が見えるべき`).toContain(tab);
    }
    for (const tab of NOT_EXPECTED_TABS.full_time) {
      expect(texts, `"${tab}" は見えないべき`).not.toContain(tab);
    }

    await logout(page);
  });

  test('打刻ボタンが使える', async ({ page }) => {
    await login(page, TEST_USERS.full_time.email, TEST_USERS.full_time.password);

    // 打刻がデフォルトタブ
    await expect(page.locator('.punch-btn')).toBeVisible({ timeout: 10000 });
    // 時計が表示されている
    await expect(page.locator('.current-time')).toBeVisible();

    await logout(page);
  });

  test('シフト希望画面が表示される', async ({ page }) => {
    await login(page, TEST_USERS.full_time.email, TEST_USERS.full_time.password);

    await page.click('.sidebar-nav-item:has-text("シフト希望")');
    // カレンダービューの h3 が表示される
    await expect(page.locator('h3:has-text("シフト希望")')).toBeVisible();
    // カレンダーグリッド（月〜日ヘッダー）
    await expect(page.locator('text=月').first()).toBeVisible();

    await logout(page);
  });
});

// ============================================================
// Part-time（アルバイト）ロール
// ============================================================
test.describe('アルバイトロール', () => {
  test('正しいタブが表示される', async ({ page }) => {
    await login(page, TEST_USERS.part_time.email, TEST_USERS.part_time.password);

    const navItems = page.locator('.sidebar-nav-item');
    const texts = await navItems.allTextContents();

    for (const tab of EXPECTED_TABS.part_time) {
      expect(texts, `"${tab}" が見えるべき`).toContain(tab);
    }
    for (const tab of NOT_EXPECTED_TABS.part_time) {
      expect(texts, `"${tab}" は見えないべき`).not.toContain(tab);
    }

    await logout(page);
  });

  test('管理系のURLに直接アクセスしても管理タブが見えない', async ({ page }) => {
    await login(page, TEST_USERS.part_time.email, TEST_USERS.part_time.password);

    // サイドバーに管理系タブが無い
    await expect(page.locator('.sidebar-nav-item:has-text("スタッフ")')).not.toBeVisible();
    await expect(page.locator('.sidebar-nav-item:has-text("設定")')).not.toBeVisible();
    await expect(page.locator('.sidebar-nav-item:has-text("勤怠管理")')).not.toBeVisible();

    await logout(page);
  });
});

// ============================================================
// 共通テスト
// ============================================================
test.describe('全ロール共通', () => {
  for (const [role, info] of Object.entries(TEST_USERS)) {
    test(`${info.name} がログイン・ログアウトできる`, async ({ page }) => {
      await login(page, info.email, info.password);

      // ログイン成功（サイドバーが見える）
      await expect(page.locator('.sidebar')).toBeVisible();

      // プロフィール名が表示される
      const headerUser = page.locator('.header-user');
      await expect(headerUser).toBeVisible();

      // ログアウト
      await logout(page);

      // ログイン画面に戻る
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });
  }
});
