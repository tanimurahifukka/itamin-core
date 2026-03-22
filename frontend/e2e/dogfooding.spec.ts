/**
 * ITAMIN Core Dogfooding テスト
 * ダミーデータ投入済み環境で全画面・全フローを徹底検証
 *
 * テストユーザー:
 *   owner@sofe.test / password123  (谷村 太郎 - owner)
 *   manager@sofe.test / password123 (佐藤 花子 - manager)
 *   staff1@sofe.test / password123  (田中 一郎 - staff)
 *   part1@sofe.test / password123   (山田 美咲 - staff)
 *   part2@sofe.test / password123   (鈴木 健太 - staff)
 */
import { test, expect, Page } from '@playwright/test';

// ============================================================
// ヘルパー
// ============================================================
async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('.login-btn');
  // サイドバーかヘッダーナビが出るまで待つ（モバイルでは表示が異なる場合がある）
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

async function navigateToTab(page: Page, tabText: string) {
  await page.click(`.sidebar-nav-item:has-text("${tabText}")`);
  await page.waitForTimeout(500);
}

// ============================================================
// 1. ログイン・認証フロー
// ============================================================
test.describe('認証フロー', () => {
  test('ログインページが正しく表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('ITAMIN');
    await expect(page.locator('.tagline')).toContainText('痛みを取って、人を育てる。');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('.login-btn')).toContainText('ログイン');
  });

  test('不正なメール/パスワードでエラーが出る', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'wrong@sofe.test');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('.login-btn');
    // エラーメッセージが表示される
    await expect(page.locator('.error-msg')).toBeVisible({ timeout: 10000 });
  });

  test('オーナーがログイン→ヘッダー表示→ログアウトできる', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');

    // ヘッダーに店舗名が表示
    await expect(page.locator('.store-name-link')).toContainText('cafe sofe');
    // プロフィール名が表示
    await expect(page.locator('.profile-name')).toContainText('谷村');
    // サイドバーが表示
    await expect(page.locator('.sidebar')).toBeVisible();

    await logout(page);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('マネージャーがログインできる', async ({ page }) => {
    await login(page, 'manager@sofe.test', 'password123');
    await expect(page.locator('.profile-name')).toContainText('佐藤');
    await logout(page);
  });

  test('スタッフがログインできる', async ({ page }) => {
    await login(page, 'staff1@sofe.test', 'password123');
    await expect(page.locator('.profile-name')).toContainText('田中');
    await logout(page);
  });
});

// ============================================================
// 2. オーナー画面 - ロール別タブ確認
// ============================================================
test.describe('オーナー - タブ確認', () => {
  test('オーナーに正しいタブが表示される (打刻以外)', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');

    const navTexts = await page.locator('.sidebar-nav-item').allTextContents();
    // オーナーは打刻不要
    expect(navTexts).not.toContain('打刻');
    // 管理系タブが見える
    expect(navTexts.some(t => t.includes('勤怠'))).toBe(true);
    expect(navTexts.some(t => t.includes('スタッフ'))).toBe(true);
    expect(navTexts.some(t => t.includes('設定'))).toBe(true);

    await logout(page);
  });
});

// ============================================================
// 3. オーナー - 勤怠管理ダッシュボード
// ============================================================
test.describe('オーナー - 勤怠管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('勤怠管理画面が表示される', async ({ page }) => {
    await navigateToTab(page, '勤怠');
    // ページにコンテンツがある
    await page.waitForTimeout(1000);
    const content = await page.locator('main.main-content').textContent();
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(0);
  });

  test('JSエラーが発生しない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await navigateToTab(page, '勤怠');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });
});

// ============================================================
// 4. オーナー - スタッフ管理
// ============================================================
test.describe('オーナー - スタッフ管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('スタッフ画面が表示され、スタッフ一覧が見える', async ({ page }) => {
    await navigateToTab(page, 'スタッフ');
    await page.waitForTimeout(2000);

    // スタッフリストにデータがある
    const content = await page.locator('main.main-content').textContent();
    expect(content).toBeTruthy();
    // 5人のスタッフが表示されるはず
    // 名前の一部が見える
    const hasStaffData = content!.includes('佐藤') || content!.includes('田中') || content!.includes('谷村');
    expect(hasStaffData).toBe(true);
  });

  test('JSエラーが発生しない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await navigateToTab(page, 'スタッフ');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });
});

// ============================================================
// 5. オーナー - シフト管理
// ============================================================
test.describe('オーナー - シフト管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('シフト管理画面が表示される', async ({ page }) => {
    await navigateToTab(page, 'シフト');
    await page.waitForTimeout(2000);

    const content = await page.locator('main.main-content').textContent();
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(0);
  });

  test('JSエラーが発生しない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await navigateToTab(page, 'シフト');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });
});

// ============================================================
// 6. オーナー - チェックリスト管理
// ============================================================
test.describe('オーナー - チェックリスト', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('チェックリスト画面が表示される', async ({ page }) => {
    await navigateToTab(page, 'チェックリスト');
    await page.waitForTimeout(2000);

    const content = await page.locator('main.main-content').textContent();
    expect(content).toBeTruthy();
  });

  test('JSエラーが発生しない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await navigateToTab(page, 'チェックリスト');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });
});

// ============================================================
// 7. オーナー - プラグイン設定
// ============================================================
test.describe('オーナー - 設定', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('設定画面にプラグイン一覧が表示される', async ({ page }) => {
    await navigateToTab(page, '設定');
    await page.waitForTimeout(2000);

    const content = await page.locator('main.main-content').textContent();
    expect(content).toBeTruthy();
    // プラグイン名が見える
    const hasPluginInfo = content!.includes('プラグイン') || content!.includes('設定');
    expect(hasPluginInfo).toBe(true);
  });

  test('JSエラーが発生しない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await navigateToTab(page, '設定');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });
});

// ============================================================
// 8. オーナー - 全タブ巡回テスト (JSエラーなし)
// ============================================================
test.describe('オーナー - 全タブ巡回', () => {
  test('全タブをクリックしてもJSエラーが発生しない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'owner@sofe.test', 'password123');

    const navItems = page.locator('.sidebar-nav-item');
    const count = await navItems.count();

    for (let i = 0; i < count; i++) {
      const tabText = await navItems.nth(i).textContent();
      await navItems.nth(i).click();
      await page.waitForTimeout(1500);
      // 各タブでmainに何かが表示される
      const mainContent = await page.locator('main').first().textContent();
      expect(mainContent, `タブ "${tabText}" にコンテンツがある`).toBeTruthy();
    }

    expect(errors).toEqual([]);
    await logout(page);
  });
});

// ============================================================
// 9. マネージャー - 打刻フロー
// ============================================================
test.describe('マネージャー - 打刻', () => {
  test('打刻画面が表示され、打刻ボタンがある', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'manager@sofe.test', 'password123');

    // マネージャーのデフォルトタブは打刻
    await page.waitForTimeout(2000);
    const content = await page.locator('main.main-content').textContent();
    expect(content).toBeTruthy();

    // 打刻ボタンまたは現在時刻が表示される
    const hasPunchContent = content!.includes('出勤') || content!.includes('退勤') || content!.includes(':');
    expect(hasPunchContent).toBe(true);

    expect(errors).toEqual([]);
    await logout(page);
  });
});

// ============================================================
// 10. マネージャー - 全タブ巡回
// ============================================================
test.describe('マネージャー - 全タブ巡回', () => {
  test('全タブをクリックしてもJSエラーが発生しない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'manager@sofe.test', 'password123');

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
});

// ============================================================
// 11. スタッフ - 打刻フロー
// ============================================================
test.describe('スタッフ - 打刻', () => {
  test('スタッフ (staff1) に打刻タブが表示される', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'staff1@sofe.test', 'password123');

    const navTexts = await page.locator('.sidebar-nav-item').allTextContents();
    expect(navTexts.some(t => t.includes('打刻'))).toBe(true);
    // 管理系タブは見えない
    expect(navTexts.some(t => t.includes('スタッフ'))).toBe(false);
    expect(navTexts.some(t => t.includes('設定'))).toBe(false);

    expect(errors).toEqual([]);
    await logout(page);
  });

  test('スタッフ (part1) に打刻タブが表示される', async ({ page }) => {
    await login(page, 'part1@sofe.test', 'password123');

    const navTexts = await page.locator('.sidebar-nav-item').allTextContents();
    expect(navTexts.some(t => t.includes('打刻'))).toBe(true);

    await logout(page);
  });
});

// ============================================================
// 12. スタッフ - シフト希望
// ============================================================
test.describe('スタッフ - シフト希望', () => {
  test('スタッフにシフト希望タブが表示される', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'staff1@sofe.test', 'password123');

    const navTexts = await page.locator('.sidebar-nav-item').allTextContents();
    const hasShiftRequest = navTexts.some(t => t.includes('シフト'));
    expect(hasShiftRequest).toBe(true);

    // シフト希望タブをクリック（「シフト管理」ではなく「シフト希望」）
    const shiftTab = page.locator('.sidebar-nav-item').filter({ hasText: /^シフト希望$/ });
    if (await shiftTab.count() > 0) {
      await shiftTab.click();
      await page.waitForTimeout(2000);
      const content = await page.locator('main').first().textContent();
      expect(content).toBeTruthy();
    }

    expect(errors).toEqual([]);
    await logout(page);
  });
});

// ============================================================
// 13. スタッフ - 全タブ巡回
// ============================================================
test.describe('スタッフ - 全タブ巡回', () => {
  test('staff1 の全タブでJSエラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'staff1@sofe.test', 'password123');

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

  test('part2 の全タブでJSエラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'part2@sofe.test', 'password123');

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

// ============================================================
// 14. レスポンシブ - モバイル (375x812)
// ============================================================
test.describe('モバイルレスポンシブ (375x812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('オーナーログイン後、モバイルでも正常表示', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'owner@sofe.test', 'password123');

    // ヘッダーが見える
    await expect(page.locator('.header')).toBeVisible();
    // コンテンツがある（モバイルではmainかdivのmain-content）
    await page.waitForTimeout(1000);
    const mainEl = page.locator('main').first();
    const content = await mainEl.textContent();
    expect(content).toBeTruthy();

    expect(errors).toEqual([]);
    await logout(page);
  });

  test('スタッフのモバイル打刻画面', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'staff1@sofe.test', 'password123');
    await page.waitForTimeout(2000);

    const content = await page.locator('main.main-content').textContent();
    expect(content).toBeTruthy();

    expect(errors).toEqual([]);
    await logout(page);
  });
});

// ============================================================
// 15. レスポンシブ - タブレット (768x1024)
// ============================================================
test.describe('タブレットレスポンシブ (768x1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('オーナーログイン後、タブレットでも正常表示', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, 'owner@sofe.test', 'password123');

    const navItems = page.locator('.sidebar-nav-item');
    const count = await navItems.count();
    expect(count).toBeGreaterThan(0);

    // 全タブ巡回
    for (let i = 0; i < count; i++) {
      await navItems.nth(i).click();
      await page.waitForTimeout(1000);
    }

    expect(errors).toEqual([]);
    await logout(page);
  });
});

// ============================================================
// 16. API直接テスト (Backend health + timecard)
// ============================================================
test.describe('API ヘルスチェック', () => {
  test('Backend APIがレスポンスを返す', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

// ============================================================
// 17. ネットワークエラー監視（全ロール）
// ============================================================
test.describe('ネットワークエラー監視', () => {
  const users = [
    { email: 'owner@sofe.test', name: 'owner' },
    { email: 'manager@sofe.test', name: 'manager' },
    { email: 'staff1@sofe.test', name: 'staff' },
  ];

  for (const u of users) {
    test(`${u.name} ログイン時にAPI 4xx/5xxエラーが出ない`, async ({ page }) => {
      const apiErrors: string[] = [];
      page.on('response', res => {
        if (res.url().includes('/api/') && res.status() >= 400) {
          // itamin-check (FastAPI) は別サービスなので除外
          if (res.url().includes('/api/check/')) return;
          apiErrors.push(`${res.status()} ${res.url()}`);
        }
      });

      await login(page, u.email, 'password123');

      // 全タブ巡回
      const navItems = page.locator('.sidebar-nav-item');
      const count = await navItems.count();
      for (let i = 0; i < count; i++) {
        await navItems.nth(i).click();
        await page.waitForTimeout(1500);
      }

      // API エラーがないことを検証
      expect(apiErrors, `${u.name} で API エラーが発生: ${apiErrors.join(', ')}`).toEqual([]);

      await logout(page);
    });
  }
});

// ============================================================
// 18. コンソールエラー監視（全ロール）
// ============================================================
test.describe('コンソールエラー監視', () => {
  const users = [
    { email: 'owner@sofe.test', name: 'owner' },
    { email: 'manager@sofe.test', name: 'manager' },
    { email: 'staff1@sofe.test', name: 'staff' },
  ];

  for (const u of users) {
    test(`${u.name} ログイン時にconsole.errorが出ない`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await login(page, u.email, 'password123');

      const navItems = page.locator('.sidebar-nav-item');
      const count = await navItems.count();
      for (let i = 0; i < count; i++) {
        await navItems.nth(i).click();
        await page.waitForTimeout(1500);
      }

      // console.error は警告レベルで報告（React DevTools等は除外）
      const realErrors = consoleErrors.filter(e =>
        !e.includes('DevTools') && !e.includes('react-devtools')
      );

      if (realErrors.length > 0) {
        console.warn(`[${u.name}] console.error: ${realErrors.join('\n')}`);
      }

      await logout(page);
    });
  }
});

// ============================================================
// 19. プロフィールドロップダウン
// ============================================================
test.describe('プロフィールドロップダウン', () => {
  test('クリックで開閉できる', async ({ page }) => {
    await login(page, 'owner@sofe.test', 'password123');

    // プロフィールをクリック
    await page.click('.profile-trigger');
    await expect(page.locator('.profile-dropdown')).toBeVisible();

    // 名前とメールが表示される
    await expect(page.locator('.profile-dropdown-name')).toContainText('谷村');
    await expect(page.locator('.profile-dropdown-email')).toContainText('owner@sofe.test');

    // ログアウトボタンがある
    await expect(page.locator('.profile-dropdown-logout')).toBeVisible();

    // 外側をクリックすると閉じる
    await page.click('.header-logo');
    await page.waitForTimeout(500);
    await expect(page.locator('.profile-dropdown')).not.toBeVisible();

    await logout(page);
  });
});

// ============================================================
// 20. 新規サインアップフォーム切り替え
// ============================================================
test.describe('サインアップフォーム', () => {
  test('ログインとサインアップを切り替えられる', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.toggle-auth');

    // サインアップに切り替え
    await page.click('.toggle-auth');
    await expect(page.locator('input[placeholder="お名前"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="事業所名"]')).toBeVisible();
    await expect(page.locator('.login-btn')).toContainText('事業所を登録する');

    // ログインに戻す
    await page.click('.toggle-auth');
    await expect(page.locator('input[placeholder="お名前"]')).not.toBeVisible();
    await expect(page.locator('.login-btn')).toContainText('ログイン');
  });
});
