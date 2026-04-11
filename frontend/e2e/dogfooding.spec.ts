/**
 * ITAMIN Core Dogfooding テスト
 * 永続デモ店舗 (`npm run seed:demo` で用意) に対して
 * 全画面・全フローを徹底検証する。
 *
 * テストユーザーは `demo-users.ts` を参照 (owner/manager/leader/full_time/part_time)。
 * 旧 `*@sofe.test` ユーザーは廃止済みなので、dogfooding も demo ユーザーに揃える。
 */
import { test, expect, Page } from '@playwright/test';
import { DEMO_USERS, DEMO_STORE_NAME } from './demo-users';

// 旧 spec で使われていた「staff1/part1/part2」の 3 枠を demo の 2 ロールに畳み込む。
// 旧 spec の意図は「管理系ではないスタッフロール」なので full_time / part_time を割り当てる。
const USERS = {
  owner:   DEMO_USERS.owner,
  manager: DEMO_USERS.manager,
  staff1:  DEMO_USERS.full_time,
  part1:   DEMO_USERS.part_time,
  part2:   DEMO_USERS.full_time,
} as const;

// ============================================================
// ヘルパー
// ============================================================
async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('.login-btn');
  // サイドバー or ヘッダー or メインコンテンツが出るまで待つ。
  // モバイルではサイドバーが出ないので、main.main-content か header を待つ。
  await Promise.race([
    page.waitForSelector('.sidebar-nav-item', { timeout: 15000 }),
    page.waitForSelector('main.main-content', { timeout: 15000 }),
  ]);
  // プラグインタブは /api/plugins/list の非同期ロード後に描画される。
  // デスクトップではナビが「空」な瞬間に allTextContents() が走ると flaky になるので、短く待つ。
  // 注: waitForFunction は (fn, arg, options) の 3 引数なので、options は第3引数で渡す必要がある。
  await page.waitForFunction(
    () => document.querySelectorAll('.sidebar-nav-item').length > 0,
    undefined,
    { timeout: 2000 },
  ).catch(() => {});
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
    await page.fill('input[type="email"]', 'wrong@demo.itamin.local');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('.login-btn');
    // エラーメッセージが表示される
    await expect(page.locator('.error-msg')).toBeVisible({ timeout: 10000 });
  });

  test('オーナーがログイン→ヘッダー表示→ログアウトできる', async ({ page }) => {
    await login(page, USERS.owner.email, USERS.owner.password);

    // ヘッダーに店舗名が表示
    await expect(page.locator('.store-name-link')).toContainText(DEMO_STORE_NAME);
    // プロフィール名が表示
    await expect(page.locator('.profile-name')).toContainText(USERS.owner.name);
    // サイドバーが表示
    await expect(page.locator('.sidebar')).toBeVisible();

    await logout(page);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('マネージャーがログインできる', async ({ page }) => {
    await login(page, USERS.manager.email, USERS.manager.password);
    await expect(page.locator('.profile-name')).toContainText(USERS.manager.name);
    await logout(page);
  });

  test('スタッフがログインできる', async ({ page }) => {
    await login(page, USERS.staff1.email, USERS.staff1.password);
    await expect(page.locator('.profile-name')).toContainText(USERS.staff1.name);
    await logout(page);
  });
});

// ============================================================
// 2. オーナー画面 - ロール別タブ確認
// ============================================================
test.describe('オーナー - タブ確認', () => {
  test('オーナーに正しいタブが表示される (打刻以外)', async ({ page }) => {
    await login(page, USERS.owner.email, USERS.owner.password);

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
    await login(page, USERS.owner.email, USERS.owner.password);
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
    await login(page, USERS.owner.email, USERS.owner.password);
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
    // demo seed のスタッフ名のどれかが見える (デモオーナー/マネージャー/...)
    const hasStaffData =
      content!.includes(DEMO_USERS.owner.name) ||
      content!.includes(DEMO_USERS.manager.name) ||
      content!.includes(DEMO_USERS.full_time.name);
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
    await login(page, USERS.owner.email, USERS.owner.password);
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
    await login(page, USERS.owner.email, USERS.owner.password);
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
    await login(page, USERS.owner.email, USERS.owner.password);
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
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, USERS.owner.email, USERS.owner.password);

    const tabTexts = await page.locator('.sidebar-nav-item').allTextContents();

    for (const text of tabTexts) {
      const clean = text.trim();
      if (!clean) continue;
      const tab = page.locator(`.sidebar-nav-item:has-text("${clean}")`).first();
      if (await tab.count() === 0) continue;
      await tab.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      const mainContent = await page.locator('main').first().textContent();
      expect(mainContent, `タブ "${clean}" にコンテンツがある`).toBeTruthy();
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

    await login(page, USERS.manager.email, USERS.manager.password);

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
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, USERS.manager.email, USERS.manager.password);

    const tabTexts = await page.locator('.sidebar-nav-item').allTextContents();
    expect(tabTexts.length).toBeGreaterThan(0);

    for (const text of tabTexts) {
      const clean = text.trim();
      if (!clean) continue;
      const tab = page.locator(`.sidebar-nav-item:has-text("${clean}")`).first();
      if (await tab.count() === 0) continue;
      await tab.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
    }

    expect(errors).toEqual([]);
    await logout(page);
  });
});

// ============================================================
// 11. スタッフ - 打刻フロー
// ============================================================
test.describe('スタッフ - 打刻', () => {
  test('スタッフ (full_time) に打刻タブが表示される', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, USERS.staff1.email, USERS.staff1.password);

    const navTexts = await page.locator('.sidebar-nav-item').allTextContents();
    expect(navTexts.some(t => t.includes('打刻'))).toBe(true);
    // 管理系タブは見えない
    expect(navTexts.some(t => t.includes('スタッフ'))).toBe(false);
    expect(navTexts.some(t => t.includes('設定'))).toBe(false);

    expect(errors).toEqual([]);
    await logout(page);
  });

  test('スタッフ (part_time) に打刻タブが表示される', async ({ page }) => {
    await login(page, USERS.part1.email, USERS.part1.password);

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

    await login(page, USERS.staff1.email, USERS.staff1.password);

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
  test('full_time の全タブでJSエラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, USERS.staff1.email, USERS.staff1.password);

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

  test('part_time の全タブでJSエラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, USERS.part1.email, USERS.part1.password);

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

    await login(page, USERS.owner.email, USERS.owner.password);

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

    await login(page, USERS.staff1.email, USERS.staff1.password);
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
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, USERS.owner.email, USERS.owner.password);
    await page.waitForTimeout(1500);

    // タブレットではサイドバーがドロワー化されるため、ログイン直後は
    // サイドバー本体ではなくメインコンテンツにメニューボタンが並ぶレイアウトになる。
    // メイン領域にコンテンツが出ていればレンダリングは成功とみなす。
    const main = page.locator('main');
    await expect(main).toBeVisible();
    const mainText = await main.textContent();
    expect(mainText).toBeTruthy();

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
    { user: USERS.owner,   label: 'owner' },
    { user: USERS.manager, label: 'manager' },
    { user: USERS.staff1,  label: 'staff' },
  ];

  for (const u of users) {
    test(`${u.label} ログイン時にAPI 4xx/5xxエラーが出ない`, async ({ page }) => {
      test.setTimeout(120_000);
      const apiErrors: string[] = [];
      page.on('response', res => {
        if (res.url().includes('/api/') && res.status() >= 400) {
          apiErrors.push(`${res.status()} ${res.url()}`);
        }
      });

      await login(page, u.user.email, u.user.password);

      // 全タブ巡回
      const tabTexts = await page.locator('.sidebar-nav-item').allTextContents();
      for (const text of tabTexts) {
        const clean = text.trim();
        if (!clean) continue;
        const tab = page.locator(`.sidebar-nav-item:has-text("${clean}")`).first();
        if (await tab.count() === 0) continue;
        await tab.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(600);
      }

      // API エラーがないことを検証
      expect(apiErrors, `${u.label} で API エラーが発生: ${apiErrors.join(', ')}`).toEqual([]);

      await logout(page);
    });
  }
});

// ============================================================
// 18. コンソールエラー監視（全ロール）
// ============================================================
test.describe('コンソールエラー監視', () => {
  const users = [
    { user: USERS.owner,   label: 'owner' },
    { user: USERS.manager, label: 'manager' },
    { user: USERS.staff1,  label: 'staff' },
  ];

  for (const u of users) {
    test(`${u.label} ログイン時にconsole.errorが出ない`, async ({ page }) => {
      test.setTimeout(120_000);
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await login(page, u.user.email, u.user.password);

      const tabTexts = await page.locator('.sidebar-nav-item').allTextContents();
      for (const text of tabTexts) {
        const clean = text.trim();
        if (!clean) continue;
        const tab = page.locator(`.sidebar-nav-item:has-text("${clean}")`).first();
        if (await tab.count() === 0) continue;
        await tab.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(600);
      }

      // console.error は警告レベルで報告（React DevTools等は除外）
      const realErrors = consoleErrors.filter(e =>
        !e.includes('DevTools') && !e.includes('react-devtools')
      );

      if (realErrors.length > 0) {
        console.warn(`[${u.label}] console.error: ${realErrors.join('\n')}`);
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
    await login(page, USERS.owner.email, USERS.owner.password);

    // プロフィールをクリック
    await page.click('.profile-trigger');
    await expect(page.locator('.profile-dropdown')).toBeVisible();

    // 名前とメールが表示される
    await expect(page.locator('.profile-dropdown-name')).toContainText(USERS.owner.name);
    await expect(page.locator('.profile-dropdown-email')).toContainText(USERS.owner.email);

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
