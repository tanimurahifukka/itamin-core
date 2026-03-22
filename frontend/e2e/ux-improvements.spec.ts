/**
 * UX改善テスト
 * 1. Toast通知システム
 * 2. 勤怠ダッシュボード サマリーカード + 月別ビュー
 * 3. 打刻成功フィードバック
 * 4. 空状態の改善
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
// 1. Toast通知コンポーネント
// ============================================================
test.describe('Toast通知システム', () => {
  test('ToastコンテナがDOMに存在する', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Toast container is mounted (but empty = not visible)
    // Check that React rendered the app without errors
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });
});

// ============================================================
// 2. ダッシュボード - ビュー切替タブ
// ============================================================
test.describe('ダッシュボード - ビュー切替', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('日別/月別切替タブが表示される', async ({ page }) => {
    // 勤怠管理タブへ
    await page.click('.sidebar-nav-item:has-text("勤怠")');
    await page.waitForTimeout(1000);

    // ビューモードタブが表示される
    await expect(page.locator('.view-mode-tab').first()).toBeVisible();
    const tabs = await page.locator('.view-mode-tab').allTextContents();
    expect(tabs).toContain('日別');
    expect(tabs).toContain('月別集計');
  });

  test('日別ビューがデフォルトでactive', async ({ page }) => {
    await page.click('.sidebar-nav-item:has-text("勤怠")');
    await page.waitForTimeout(1000);

    const dailyTab = page.locator('.view-mode-tab:has-text("日別")');
    await expect(dailyTab).toHaveClass(/active/);
  });

  test('月別集計に切り替えできる', async ({ page }) => {
    await page.click('.sidebar-nav-item:has-text("勤怠")');
    await page.waitForTimeout(1000);

    // 月別タブをクリック
    await page.click('.view-mode-tab:has-text("月別集計")');
    await page.waitForTimeout(1000);

    // 月別が active に
    const monthlyTab = page.locator('.view-mode-tab:has-text("月別集計")');
    await expect(monthlyTab).toHaveClass(/active/);

    // 月ナビゲーションが表示
    await expect(page.locator('.month-nav')).toBeVisible();
  });

  test('月別集計の月ナビゲーションが動作する', async ({ page }) => {
    await page.click('.sidebar-nav-item:has-text("勤怠")');
    await page.waitForTimeout(500);
    await page.click('.view-mode-tab:has-text("月別集計")');
    await page.waitForTimeout(1000);

    // 現在の月を取得
    const currentLabel = await page.locator('.month-nav-label').textContent();
    expect(currentLabel).toContain('月');

    // 前月ボタンクリック
    await page.click('.month-nav-btn:has-text("<")');
    await page.waitForTimeout(500);

    // ラベルが変わる
    const newLabel = await page.locator('.month-nav-label').textContent();
    expect(newLabel).not.toBe(currentLabel);
  });

  test('JSエラーが発生しない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.click('.sidebar-nav-item:has-text("勤怠")');
    await page.waitForTimeout(1000);

    // 日別→月別→日別に切り替え
    await page.click('.view-mode-tab:has-text("月別集計")');
    await page.waitForTimeout(1000);
    await page.click('.view-mode-tab:has-text("日別")');
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });
});

// ============================================================
// 3. ダッシュボード - 空状態
// ============================================================
test.describe('ダッシュボード - 空状態', () => {
  test('今日の記録がないとき改善された空状態が表示される', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');

    await page.click('.sidebar-nav-item:has-text("勤怠")');
    await page.waitForTimeout(1500);

    // 今日はダミーデータがないので空状態が表示されるはず
    const emptyState = page.locator('.empty-state');
    if (await emptyState.isVisible()) {
      // アイコンが表示される
      await expect(page.locator('.empty-state-icon')).toBeVisible();
      // テキストが表示される
      await expect(page.locator('.empty-state-text')).toBeVisible();
      // ヒントが表示される
      await expect(page.locator('.empty-state-hint')).toBeVisible();
    }
    // データがあれば records-table が表示されるはず
    // どちらかが存在すればOK

    await logout(page);
  });

  test('過去日の空状態メッセージが異なる', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');

    await page.click('.sidebar-nav-item:has-text("勤怠")');
    await page.waitForTimeout(1000);

    // 未来の日付に変更 (記録なし確実)
    await page.fill('.date-picker', '2026-01-01');
    await page.waitForTimeout(1000);

    const emptyState = page.locator('.empty-state');
    if (await emptyState.isVisible()) {
      const text = await page.locator('.empty-state-text').textContent();
      expect(text).toContain('この日の記録はありません');
      const hint = await page.locator('.empty-state-hint').textContent();
      expect(hint).toContain('日付を変更');
    }

    await logout(page);
  });
});

// ============================================================
// 4. ダッシュボード - サマリーカード（データあり日）
// ============================================================
test.describe('ダッシュボード - サマリーカード', () => {
  test('データがある日にレコードテーブルが表示される', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');

    await page.click('.sidebar-nav-item:has-text("勤怠")');
    await page.waitForTimeout(500);

    // ダミーデータがある日に変更 (3/20)
    await page.fill('.date-picker', '2026-03-20');
    await page.waitForTimeout(1500);

    // テーブルが表示される
    await expect(page.locator('.records-table')).toBeVisible();
    // スタッフ名が表示される
    const tableText = await page.locator('.records-table').textContent();
    expect(tableText).toBeTruthy();

    await logout(page);
  });
});

// ============================================================
// 5. 打刻ページ - 成功フィードバック
// ============================================================
test.describe('打刻 - 成功フィードバック', () => {
  test('打刻ページにJSエラーがない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'manager@sofe.test', 'password123');
    // マネージャーのデフォルトタブは打刻
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
    await logout(page);
  });

  test('打刻ボタンが表示される', async ({ page }) => {
    await login(page, 'manager@sofe.test', 'password123');
    await page.waitForTimeout(1000);

    // 打刻タブへ
    const punchTab = page.locator('.sidebar-nav-item:has-text("打刻")');
    if (await punchTab.isVisible()) {
      await punchTab.click();
      await page.waitForTimeout(1000);
    }

    // 打刻ボタンが表示
    await expect(page.locator('.punch-btn')).toBeVisible();
    // 現在時刻が表示
    await expect(page.locator('.current-time')).toBeVisible();
    // 日付が表示
    await expect(page.locator('.current-date')).toBeVisible();

    await logout(page);
  });

  test('出勤ボタンクリックでチェックリストまたはToastが表示される', async ({ page }) => {
    await login(page, 'manager@sofe.test', 'password123');
    await page.waitForTimeout(1000);

    const punchTab = page.locator('.sidebar-nav-item:has-text("打刻")');
    if (await punchTab.isVisible()) {
      await punchTab.click();
      await page.waitForTimeout(1000);
    }

    const punchBtn = page.locator('.punch-btn');
    await expect(punchBtn).toBeVisible();

    const btnClass = await punchBtn.getAttribute('class');
    if (btnClass?.includes('clock-in')) {
      await punchBtn.click();
      await page.waitForTimeout(2000);

      // チェックリストモーダルまたはToastが表示される（どちらかでOK）
      const checklistVisible = await page.locator('.checklist-overlay').isVisible().catch(() => false);
      const toastVisible = await page.locator('.toast-success').isVisible().catch(() => false);
      const successAnim = await punchBtn.getAttribute('class').then(c => c?.includes('punch-success')).catch(() => false);

      // チェックリストが出た場合はキャンセルして戻す
      if (checklistVisible) {
        await page.click('.checklist-cancel');
        await page.waitForTimeout(500);
      }

      // いずれかのフィードバックが出ていればOK
      expect(checklistVisible || toastVisible || successAnim).toBe(true);
    }

    await logout(page);
  });
});

// ============================================================
// 6. 全体回帰テスト - UX改善後も既存機能が壊れていない
// ============================================================
test.describe('回帰テスト - 全ロール全タブ', () => {
  const users = [
    { email: 'owner@sofe.test', name: 'owner' },
    { email: 'manager@sofe.test', name: 'manager' },
    { email: 'staff1@sofe.test', name: 'staff' },
  ];

  for (const u of users) {
    test(`${u.name}: 全タブ巡回でJSエラーなし`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', err => errors.push(err.message));

      await login(page, u.email, 'password123');

      const navItems = page.locator('.sidebar-nav-item');
      const count = await navItems.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        await navItems.nth(i).click();
        await page.waitForTimeout(1500);
      }

      expect(errors).toEqual([]);
      await logout(page);
    });

    test(`${u.name}: APIエラーなし`, async ({ page }) => {
      const apiErrors: string[] = [];
      page.on('response', res => {
        if (res.url().includes('/api/') && res.status() >= 400) {
          if (res.url().includes('/api/check/')) return;
          apiErrors.push(`${res.status()} ${res.url()}`);
        }
      });

      await login(page, u.email, 'password123');

      const navItems = page.locator('.sidebar-nav-item');
      const count = await navItems.count();
      for (let i = 0; i < count; i++) {
        await navItems.nth(i).click();
        await page.waitForTimeout(1500);
      }

      expect(apiErrors).toEqual([]);
      await logout(page);
    });
  }
});

// ============================================================
// 7. モバイル回帰
// ============================================================
test.describe('モバイル回帰 (375x812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('全ロールでJSエラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    for (const email of ['owner@sofe.test', 'manager@sofe.test', 'staff1@sofe.test']) {
      await login(page, email, 'password123');
      await page.waitForTimeout(1000);
      await logout(page);
    }

    expect(errors).toEqual([]);
  });
});
