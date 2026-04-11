/**
 * スタッフ退職機能テスト
 * - 退職メニューの表示/非表示 (owner 行には表示されない)
 * - Git 風の確認モーダル（事業所名入力）
 * - 入力一致しないと削除不可
 */
import { test, expect, Page, Locator } from '@playwright/test';
import { DEMO_USERS, DEMO_STORE_NAME } from './demo-users';

const OWNER = DEMO_USERS.owner;
const STAFF = DEMO_USERS.full_time;

async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('.login-btn');
  await Promise.race([
    page.waitForSelector('.sidebar-nav-item', { timeout: 15000 }),
    page.waitForSelector('.store-name-link', { timeout: 15000 }),
  ]);
}

async function logout(page: Page) {
  const trigger = page.locator('.profile-trigger');
  if (await trigger.isVisible()) {
    await trigger.click();
    const logoutBtn = page.locator('.profile-dropdown-logout');
    await logoutBtn.waitFor({ timeout: 3000 });
    await logoutBtn.click();
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  }
}

// ⋯ メニューから「退職処理」を開くヘルパー。
// StaffPage は各行に `.staff-action-menu-btn` を持ち、クリックするとドロップダウンが出て
// そこに `.staff-action-remove` (退職処理) が現れる。
async function openRemoveMenu(page: Page): Promise<Locator> {
  const actionBtn = page.locator('.staff-action-menu-btn').first();
  await expect(actionBtn).toBeVisible({ timeout: 5000 });
  await actionBtn.click();
  const removeItem = page.locator('.staff-action-remove').first();
  await expect(removeItem).toBeVisible({ timeout: 3000 });
  await removeItem.click();
  return page.locator('.remove-modal');
}

// ============================================================
// 1. アクションメニューの表示
// ============================================================
test.describe('退職ボタン表示', () => {
  test('オーナーのスタッフ画面にアクションメニューが表示される（owner 以外）', async ({ page }) => {
    await login(page, OWNER.email, OWNER.password);
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    // 非 owner 行にはアクションメニューがある
    const menuBtns = page.locator('.staff-action-menu-btn');
    const count = await menuBtns.count();
    expect(count).toBeGreaterThan(0);

    // owner 行にはアクションメニューがない (StaffPage が s.role !== 'owner' で gating)
    const staffItems = page.locator('.staff-item');
    const itemCount = await staffItems.count();
    for (let i = 0; i < itemCount; i++) {
      const item = staffItems.nth(i);
      const badge = item.locator('.role-badge');
      if ((await badge.count()) === 0) continue;
      const badgeText = await badge.textContent();
      if (badgeText?.includes('オーナー')) {
        const btn = item.locator('.staff-action-menu-btn');
        expect(await btn.count()).toBe(0);
      }
    }

    await logout(page);
  });

  test('スタッフロールにはスタッフ管理タブ/アクションメニューが見えない', async ({ page }) => {
    await login(page, STAFF.email, STAFF.password);

    const staffTab = page.locator('.sidebar-nav-item:has-text("スタッフ")');
    const hasStaffTab = await staffTab.count() > 0;
    if (hasStaffTab) {
      await staffTab.click();
      await page.waitForTimeout(2000);
      // アクセスできたとしても、退職トリガーは見えない
      expect(await page.locator('.staff-action-menu-btn').count()).toBe(0);
    }

    await logout(page);
  });
});

// ============================================================
// 2. 退職確認モーダル
// ============================================================
test.describe('退職確認モーダル', () => {
  test('退職メニューからモーダルが開く', async ({ page }) => {
    await login(page, OWNER.email, OWNER.password);
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    const modal = await openRemoveMenu(page);
    await expect(modal).toBeVisible();
    await expect(page.locator('.remove-modal-title')).toContainText('退職処理');
    await expect(page.locator('.remove-modal-icon')).toBeVisible();
    await expect(page.locator('.remove-modal-input')).toBeVisible();
    // 確認ラベルに事業所名が表示されている
    await expect(page.locator('.remove-modal-label')).toContainText(DEMO_STORE_NAME);

    await page.click('.remove-modal-cancel');
    await expect(modal).not.toBeVisible();

    await logout(page);
  });

  test('事業所名が一致しないと退職ボタンが無効', async ({ page }) => {
    await login(page, OWNER.email, OWNER.password);
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    const modal = await openRemoveMenu(page);
    await expect(modal).toBeVisible();

    await page.fill('.remove-modal-input', 'wrong name');

    const submitBtn = page.locator('.remove-modal-submit');
    await expect(submitBtn).not.toHaveClass(/active/);
    await expect(submitBtn).toBeDisabled();

    await page.click('.remove-modal-cancel');
    await logout(page);
  });

  test('事業所名が一致すると退職ボタンが有効になる', async ({ page }) => {
    await login(page, OWNER.email, OWNER.password);
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    const modal = await openRemoveMenu(page);
    await expect(modal).toBeVisible();

    await page.fill('.remove-modal-input', DEMO_STORE_NAME);
    await page.waitForTimeout(300);

    const submitBtn = page.locator('.remove-modal-submit');
    await expect(submitBtn).toHaveClass(/active/, { timeout: 5000 });

    // 実際には削除しない
    await page.click('.remove-modal-cancel');
    await logout(page);
  });

  test('モーダル外クリックで閉じる', async ({ page }) => {
    await login(page, OWNER.email, OWNER.password);
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    const modal = await openRemoveMenu(page);
    await expect(modal).toBeVisible();

    await page.click('.remove-modal-overlay', { position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);
    await expect(modal).not.toBeVisible();

    await logout(page);
  });
});

// ============================================================
// 3. JSエラーなし回帰テスト
// ============================================================
test.describe('回帰テスト', () => {
  test('スタッフ画面でJSエラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, OWNER.email, OWNER.password);
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    // メニュー → モーダル → キャンセル
    const actionBtn = page.locator('.staff-action-menu-btn').first();
    if (await actionBtn.isVisible()) {
      await actionBtn.click();
      const removeItem = page.locator('.staff-action-remove').first();
      if (await removeItem.isVisible()) {
        await removeItem.click();
        await page.waitForTimeout(300);
        await page.click('.remove-modal-cancel');
        await page.waitForTimeout(300);
      }
    }

    expect(errors).toEqual([]);
    await logout(page);
  });
});
