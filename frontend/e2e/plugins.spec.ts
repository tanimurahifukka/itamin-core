/**
 * Plugin smoke tests
 * Verifies that each plugin page renders without crashing.
 * All tests run as owner, who has access to most management plugins.
 *
 * Plugins that require a non-default setup (notice, daily_report, menu,
 * inventory, expense, feedback, paid_leave, sales_capture, overtime_alert,
 * consecutive_work) are enabled in beforeAll via the admin client.
 */
import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { setupTestData, teardownTestData, TEST_USERS } from './setup';

// ============================================================
// Helpers
// ============================================================
async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('.login-btn');
  // password-store.spec.ts が並列で第2店舗を作ると StoreSelectPage が出るので、
  // その場合は主テスト店舗を選ぶ。通常は sidebar が直接出る。
  await Promise.race([
    page.waitForSelector('.sidebar-nav-item', { timeout: 15000 }),
    page.waitForSelector('.store-selector', { timeout: 15000 }),
  ]);
  // SideBar が出ても直後に StoreSelectPage に切り替わるケースがあるため少し待つ
  await page.waitForTimeout(300);
  const selectorVisible = await page.locator('.store-selector').isVisible().catch(() => false);
  if (selectorVisible) {
    const cards = page.locator('.store-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const title = (await cards.nth(i).locator('h3').textContent())?.trim();
      if (title === 'テスト店舗') {
        await cards.nth(i).click();
        break;
      }
    }
    await page.waitForSelector('.sidebar-nav-item', { timeout: 15000 });
  }
  await page.waitForFunction(
    () => document.querySelectorAll('.sidebar-nav-item').length > 0,
    undefined,
    { timeout: 3000 },
  ).catch(() => {});
}

async function logout(page: Page): Promise<void> {
  const trigger = page.locator('.profile-trigger');
  if (await trigger.isVisible()) {
    await trigger.click();
    const logoutBtn = page.locator('.profile-dropdown-logout');
    await logoutBtn.waitFor({ timeout: 3000 });
    await logoutBtn.click();
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  }
}

async function navigateToTab(page: Page, tabLabel: string): Promise<void> {
  await page.click(`.sidebar-nav-item:has-text("${tabLabel}")`);
  // Wait for navigation to settle
  await page.waitForTimeout(800);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for E2E tests`);
  return value;
}

/** Enable additional plugins for the test store via admin client */
async function enablePluginsForTestStore(pluginNames: string[]): Promise<void> {
  const admin = createClient(
    requireEnv('TEST_SUPABASE_URL'),
    requireEnv('TEST_SUPABASE_SERVICE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: stores } = await admin
    .from('stores')
    .select('id')
    .eq('name', 'テスト店舗');

  if (!stores || stores.length === 0) return;
  const storeId = stores[0].id;

  for (const pluginName of pluginNames) {
    await admin.from('store_plugins').upsert(
      { store_id: storeId, plugin_name: pluginName, enabled: true },
      { onConflict: 'store_id,plugin_name' },
    );
  }
}

// ============================================================
// Setup / Teardown
// ============================================================
test.beforeAll(async () => {
  await setupTestData();
  // Enable all non-default plugins needed for smoke tests
  await enablePluginsForTestStore([
    'notice',
    'daily_report',
    'menu',
    'inventory',
    'expense',
    'feedback',
    'paid_leave',
    'sales_capture',
    'overtime_alert',
    'consecutive_work',
  ]);
});

test.afterAll(async () => {
  await teardownTestData();
});

// ============================================================
// 1. DashboardPage (attendance plugin) – owner can access
// ============================================================
test.describe('DashboardPage smoke test', () => {
  test('DashboardPage renders with attendance records area', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);

    // Owner's first tab should be 勤怠管理 (attendance)
    await navigateToTab(page, '勤怠管理');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// 2. NoticePage (notice plugin)
// ============================================================
test.describe('NoticePage smoke test', () => {
  test('NoticePage renders', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, '連絡ノート');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// 3. DailyReportPage (daily_report plugin)
// ============================================================
test.describe('DailyReportPage smoke test', () => {
  test('DailyReportPage renders', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, '日報');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// 4. MenuPage (menu plugin)
// ============================================================
test.describe('MenuPage smoke test', () => {
  test('MenuPage renders', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, 'メニュー管理');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// 5. InventoryPage (inventory plugin)
// ============================================================
test.describe('InventoryPage smoke test', () => {
  test('InventoryPage renders', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, '在庫管理');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// 6. ExpensePage (expense plugin)
// ============================================================
test.describe('ExpensePage smoke test', () => {
  test('ExpensePage renders', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, '経費管理');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// 7. FeedbackPage (feedback plugin)
// ============================================================
test.describe('FeedbackPage smoke test', () => {
  test('FeedbackPage renders', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, 'お客様の声');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// 8. PaidLeavePage (paid_leave plugin)
// ============================================================
test.describe('PaidLeavePage smoke test', () => {
  test('PaidLeavePage renders', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, '有給管理');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// 9. SalesCapturePage (sales_capture plugin)
// ============================================================
test.describe('SalesCapturePage smoke test', () => {
  test('SalesCapturePage renders', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, '売上締め');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });

    await logout(page);
  });
});

// ============================================================
// 10. OvertimeAlertPage (overtime_alert plugin)
// ============================================================
test.describe('OvertimeAlertPage smoke test', () => {
  test('OvertimeAlertPage renders with summary cards', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, '残業アラート');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.today-summary')).toBeVisible();

    await logout(page);
  });
});

// ============================================================
// 11. ConsecutiveWorkPage (consecutive_work plugin)
// ============================================================
test.describe('ConsecutiveWorkPage smoke test', () => {
  test('ConsecutiveWorkPage renders with summary cards', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, '連勤チェック');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.today-summary')).toBeVisible();

    await logout(page);
  });
});

// ============================================================
// 12. ShiftPage (shift plugin) – already enabled in default setup
// ============================================================
test.describe('ShiftPage smoke test', () => {
  test('ShiftPage renders with shift table heading', async ({ page }) => {
    await login(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await navigateToTab(page, 'シフト管理');
    await expect(page.locator('main.main-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h3:has-text("シフト表")')).toBeVisible();

    await logout(page);
  });
});
