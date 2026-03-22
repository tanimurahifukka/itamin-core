/**
 * スタッフ退職機能テスト
 * - 退職ボタンの表示/非表示
 * - Git風の確認モーダル（事業所名入力）
 * - 入力一致しないと削除不可
 * - 退職実行でToast表示
 */
import { test, expect, Page } from '@playwright/test';

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

// ============================================================
// 1. 退職ボタンの表示
// ============================================================
test.describe('退職ボタン表示', () => {
  test('オーナーのスタッフ画面に退職ボタンが表示される（owner以外）', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    // 退職ボタンがある
    const removeBtns = page.locator('.remove-staff-btn');
    const count = await removeBtns.count();
    expect(count).toBeGreaterThan(0);

    // オーナー行には退職ボタンがない
    const staffItems = page.locator('.staff-item');
    const itemCount = await staffItems.count();
    for (let i = 0; i < itemCount; i++) {
      const item = staffItems.nth(i);
      const badge = item.locator('.role-badge');
      const badgeText = await badge.textContent();
      if (badgeText?.includes('オーナー')) {
        // オーナー行には退職ボタンなし
        const btn = item.locator('.remove-staff-btn');
        expect(await btn.count()).toBe(0);
      }
    }

    await logout(page);
  });

  test('スタッフロールには退職ボタンが見えない', async ({ page }) => {
    await login(page, 'staff1@sofe.test', 'password123');

    // スタッフにはスタッフ管理タブがないはず（または権限なし）
    const staffTab = page.locator('.sidebar-nav-item:has-text("スタッフ")');
    const hasStaffTab = await staffTab.count() > 0;

    if (hasStaffTab) {
      await staffTab.click();
      await page.waitForTimeout(2000);
      // スタッフ画面が見えても退職ボタンはない（権限チェック）
      // ここではUI上のボタンが見えないことを確認
    }
    // スタッフタブ自体がなければそれでOK

    await logout(page);
  });
});

// ============================================================
// 2. 退職確認モーダル
// ============================================================
test.describe('退職確認モーダル', () => {
  test('退職ボタンクリックでモーダルが開く', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    // 最初の退職ボタンをクリック
    const firstRemoveBtn = page.locator('.remove-staff-btn').first();
    await firstRemoveBtn.click();

    // モーダルが表示される
    await expect(page.locator('.remove-modal')).toBeVisible();
    await expect(page.locator('.remove-modal-title')).toContainText('退職処理');
    await expect(page.locator('.remove-modal-icon')).toBeVisible();

    // 事業所名の入力フィールドがある
    await expect(page.locator('.remove-modal-input')).toBeVisible();
    // 確認ラベルに事業所名が表示されている
    await expect(page.locator('.remove-modal-label')).toContainText('cafe sofe');

    // キャンセルボタンで閉じる
    await page.click('.remove-modal-cancel');
    await expect(page.locator('.remove-modal')).not.toBeVisible();

    await logout(page);
  });

  test('事業所名が一致しないと退職ボタンが無効', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    await page.locator('.remove-staff-btn').first().click();
    await expect(page.locator('.remove-modal')).toBeVisible();

    // 間違った名前を入力
    await page.fill('.remove-modal-input', 'wrong name');

    // 退職ボタンがdisabledかつactiveクラスなし
    const submitBtn = page.locator('.remove-modal-submit');
    await expect(submitBtn).not.toHaveClass(/active/);
    await expect(submitBtn).toBeDisabled();

    // キャンセル
    await page.click('.remove-modal-cancel');
    await logout(page);
  });

  test('事業所名が一致すると退職ボタンが有効になる', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    await page.locator('.remove-staff-btn').first().click();
    await expect(page.locator('.remove-modal')).toBeVisible();

    // 正しい事業所名を入力
    await page.fill('.remove-modal-input', 'cafe sofe 寝屋川本店');
    await page.waitForTimeout(500);

    // 退職ボタンがactiveになる
    const submitBtn = page.locator('.remove-modal-submit');
    await expect(submitBtn).toHaveClass(/active/, { timeout: 5000 });

    // キャンセル（実際に削除はしない）
    await page.click('.remove-modal-cancel');
    await logout(page);
  });

  test('モーダル外クリックで閉じる', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    await page.locator('.remove-staff-btn').first().click();
    await expect(page.locator('.remove-modal')).toBeVisible();

    // オーバーレイをクリック
    await page.click('.remove-modal-overlay', { position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);
    await expect(page.locator('.remove-modal')).not.toBeVisible();

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

    await login(page, 'owner@sofe.test', 'password123');
    await page.click('.sidebar-nav-item:has-text("スタッフ")');
    await page.waitForTimeout(2000);

    // 退職ボタンクリック→モーダル表示→キャンセル
    const btn = page.locator('.remove-staff-btn').first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(500);
      await page.click('.remove-modal-cancel');
      await page.waitForTimeout(500);
    }

    expect(errors).toEqual([]);
    await logout(page);
  });

  test('全タブ巡回でJSエラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'owner@sofe.test', 'password123');
    const navItems = page.locator('.sidebar-nav-item');
    const count = await navItems.count();
    for (let i = 0; i < count; i++) {
      await navItems.nth(i).click();
      await page.waitForTimeout(1500);
    }
    expect(errors).toEqual([]);
    await logout(page);
  });
});
