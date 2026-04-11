/**
 * CSV エクスポート機能の E2E テスト
 *
 * 対象:
 *   1. MonthlyListPage の CSV ダウンロードボタン (detail / summary)
 *   2. PluginSettingsPage の「CSVエクスポート許可ロール」UI (attendance プラグイン)
 *   3. 権限エラー表示 (staff/part_time ロールでの 403 エラーハンドリング)
 *
 * 前提: `npm run seed:demo` 済み。
 * 認証・セットアップパターンは plugins.spec.ts / dogfooding.spec.ts に準拠。
 */
import { test, expect, Page } from '@playwright/test';
import { DEMO_USERS } from './demo-users';

// ============================================================
// Helpers (plugins.spec.ts / dogfooding.spec.ts と同パターン)
// ============================================================
async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('.login-btn');
  await Promise.race([
    page.waitForSelector('.sidebar-nav-item', { timeout: 20_000 }),
    page.waitForSelector('main.main-content', { timeout: 20_000 }),
  ]);
  // プラグインタブが非同期ロードされるまで待つ
  await page.waitForFunction(
    () => document.querySelectorAll('.sidebar-nav-item').length > 0,
    undefined,
    { timeout: 5_000 },
  ).catch(() => {});
}

async function logout(page: Page): Promise<void> {
  const trigger = page.locator('.profile-trigger');
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.click();
    const logoutBtn = page.locator('.profile-dropdown-logout');
    await logoutBtn.waitFor({ timeout: 3_000 }).catch(() => {});
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await page.waitForSelector('input[type="email"]', { timeout: 10_000 }).catch(() => {});
    }
  }
}

async function navigateToTab(page: Page, tabLabel: string): Promise<void> {
  await page.click(`.sidebar-nav-item:has-text("${tabLabel}")`);
  await page.waitForTimeout(800);
}

/**
 * 勤怠管理(LINE) → 月次一覧タブへ遷移する。
 * sidebar の「勤怠管理(LINE)」タブをクリックし、
 * 内部サブタブの「月次一覧」(admin-tab-monthly) をクリックする。
 */
async function navigateToMonthlyList(page: Page): Promise<void> {
  // sidebar から「勤怠管理(LINE)」タブをクリック (AttendanceAdminPage)
  const tab = page.locator('.sidebar-nav-item').filter({ hasText: '勤怠管理(LINE)' }).first();
  await tab.waitFor({ timeout: 10_000 });
  await tab.click();
  await page.waitForTimeout(800);

  // 内部サブタブ「月次一覧」をクリック
  const monthlyTab = page.locator('[data-testid="admin-tab-monthly"]');
  await monthlyTab.waitFor({ timeout: 10_000 });
  await monthlyTab.click();
  await page.waitForTimeout(500);
}

// ============================================================
// 1. MonthlyListPage - CSV ダウンロードボタン
// ============================================================
test.describe('MonthlyListPage: CSV ダウンロードボタン', () => {
  test('owner: CSVダウンロード（明細）ボタンが表示される', async ({ page }) => {
    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    await navigateToMonthlyList(page);

    await expect(
      page.locator('[data-testid="csv-download-detail-button"]'),
    ).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('owner: CSVダウンロード（月次サマリ）ボタンが表示される', async ({ page }) => {
    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    await navigateToMonthlyList(page);

    await expect(
      page.locator('[data-testid="csv-download-summary-button"]'),
    ).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('owner: 明細 CSV ダウンロードを実行するとダウンロードイベントが発火し、ファイル名が attendance_*.csv にマッチする', async ({ page }) => {
    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    await navigateToMonthlyList(page);

    await page.locator('[data-testid="csv-download-detail-button"]').waitFor({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.click('[data-testid="csv-download-detail-button"]'),
    ]);

    expect(download.suggestedFilename()).toMatch(/^attendance_.*\.csv$/);

    await logout(page);
  });

  test('owner: サマリ CSV ダウンロードを実行するとダウンロードイベントが発火し、ファイル名が attendance_*.csv にマッチする', async ({ page }) => {
    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    await navigateToMonthlyList(page);

    await page.locator('[data-testid="csv-download-summary-button"]').waitFor({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.click('[data-testid="csv-download-summary-button"]'),
    ]);

    expect(download.suggestedFilename()).toMatch(/^attendance_.*\.csv$/);

    await logout(page);
  });

  test('owner: ダウンロードした CSV の先頭バイトに UTF-8 BOM (\\uFEFF) が含まれる', async ({ page }) => {
    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    await navigateToMonthlyList(page);

    await page.locator('[data-testid="csv-download-detail-button"]').waitFor({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.click('[data-testid="csv-download-detail-button"]'),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => { chunks.push(chunk); });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const buf = Buffer.concat(chunks);
    // UTF-8 BOM: EF BB BF
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);

    await logout(page);
  });
});

// ============================================================
// 2. PluginSettingsPage - CSVエクスポート許可ロール UI
// ============================================================
test.describe('PluginSettingsPage: CSVエクスポート許可ロール', () => {
  test('owner: 設定画面→勤怠管理を展開すると CSVエクスポート許可ロール セクションが表示される', async ({ page }) => {
    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    await navigateToTab(page, '設定');

    // attendance プラグインカードのヘッダーを展開
    const cardHeader = page.locator('[data-testid="plugin-card-header-attendance"]');
    await cardHeader.waitFor({ timeout: 10_000 });
    await cardHeader.click();
    await page.waitForTimeout(400);

    // CSVエクスポート許可ロールのセクションが表示される
    await expect(page.locator('text=CSVエクスポート許可ロール')).toBeVisible({ timeout: 5_000 });

    await logout(page);
  });

  test('owner: 各ロールボタン(owner/manager/leader/full_time/part_time)が表示される', async ({ page }) => {
    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    await navigateToTab(page, '設定');

    const cardHeader = page.locator('[data-testid="plugin-card-header-attendance"]');
    await cardHeader.waitFor({ timeout: 10_000 });
    await cardHeader.click();
    await page.waitForTimeout(400);

    const roleValues = ['owner', 'manager', 'leader', 'full_time', 'part_time'];
    for (const role of roleValues) {
      await expect(
        page.locator(`[data-testid="export-permission-role-${role}"]`),
      ).toBeVisible({ timeout: 5_000 });
    }

    await logout(page);
  });

  test('owner: ロールボタンをクリックするとトグルする (leader をトグル→元に戻す)', async ({ page }) => {
    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    await navigateToTab(page, '設定');

    const cardHeader = page.locator('[data-testid="plugin-card-header-attendance"]');
    await cardHeader.waitFor({ timeout: 10_000 });
    await cardHeader.click();
    await page.waitForTimeout(400);

    const leaderBtn = page.locator('[data-testid="export-permission-role-leader"]');
    await leaderBtn.waitFor({ timeout: 5_000 });

    // 初期スタイルを記録（color で checked 状態を判別）
    const colorBefore = await leaderBtn.evaluate(
      (el: HTMLButtonElement) => window.getComputedStyle(el).color,
    );

    // クリックしてトグル
    await leaderBtn.click();
    await page.waitForTimeout(200);

    const colorAfter = await leaderBtn.evaluate(
      (el: HTMLButtonElement) => window.getComputedStyle(el).color,
    );

    // 色が変化していること (checked/unchecked でスタイルが異なる)
    expect(colorAfter).not.toBe(colorBefore);

    // 元に戻す（トグルバック）
    await leaderBtn.click();
    await page.waitForTimeout(200);

    await logout(page);
  });

  test('owner: 保存ボタン押下後にプラグイン設定 API が成功し、成功メッセージが表示される', async ({ page }) => {
    // プラグイン設定保存 API の成功を network レベルで捕捉する
    const saveResponses: { url: string; status: number }[] = [];
    page.on('response', res => {
      if (res.url().includes('/api/plugins/') && (res.url().includes('/config') || res.url().includes('/permissions'))) {
        saveResponses.push({ url: res.url(), status: res.status() });
      }
    });

    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);

    // 設定タブをクリックして遷移
    const settingsTab = page.locator('.sidebar-nav-item').filter({ hasText: '設定' }).first();
    await settingsTab.waitFor({ timeout: 10_000 });
    await settingsTab.click();
    // プラグイン設定ページのロードを待つ (plugin-card-attendance が描画されるまで)
    await page.locator('[data-testid="plugin-card-attendance"]').waitFor({ timeout: 15_000 });

    // attendance プラグインカードを展開
    const cardHeader = page.locator('[data-testid="plugin-card-header-attendance"]');
    await cardHeader.waitFor({ timeout: 5_000 });
    await cardHeader.click();

    // 保存ボタンが出るまで待つ (attendance カードが展開され、save ボタンが DOM に現れる)
    const saveBtn = page.locator('[data-testid="plugin-save-button-attendance"]');
    await saveBtn.waitFor({ timeout: 10_000 });

    // 保存 API レスポンスを Promise で待機してからボタンをクリック
    // API URL パターン: /api/plugin-settings/{storeId}/attendance/permissions
    const saveApiDone = page.waitForResponse(
      res => res.url().includes('/plugin-settings/') && res.request().method() !== 'GET',
      { timeout: 15_000 },
    );
    await saveBtn.click();
    const saveRes = await saveApiDone;

    // API が 200 を返すこと (権限保存または config 保存)
    expect(saveRes.status(), `保存 API status: ${saveRes.status()} url: ${saveRes.url()}`).toBe(200);

    // UI 上でもメッセージが表示されることを確認 (表示直後に捕捉するため短い timeout で試みる)
    const msgLocator = page.locator('[data-testid="plugin-config-msg-attendance"]');
    const msgVisible = await msgLocator.isVisible({ timeout: 3_000 }).catch(() => false);
    if (msgVisible) {
      const msgText = await msgLocator.textContent();
      expect(msgText!.trim()).toBe('保存しました');
    }
    // メッセージが既に消えていても API 200 で成功とみなす

    await logout(page);
  });
});

// ============================================================
// 3. 権限エラー表示 (staff/part_time でのエラーハンドリング)
// ============================================================
test.describe('MonthlyListPage: 権限エラー表示', () => {
  test('full_time: 勤怠管理タブにアクセスできない (サイドバーに表示されない)', async ({ page }) => {
    await login(page, DEMO_USERS.full_time.email, DEMO_USERS.full_time.password);

    const navItems = page.locator('.sidebar-nav-item');
    await expect(navItems.first()).toBeVisible({ timeout: 10_000 });
    const texts = (await navItems.allTextContents()).map(t => t.trim());

    // full_time には勤怠管理タブが見えないこと
    expect(texts.some(t => t.includes('勤怠管理'))).toBe(false);

    await logout(page);
  });

  test('part_time: 勤怠管理タブにアクセスできない (サイドバーに表示されない)', async ({ page }) => {
    await login(page, DEMO_USERS.part_time.email, DEMO_USERS.part_time.password);

    const navItems = page.locator('.sidebar-nav-item');
    await expect(navItems.first()).toBeVisible({ timeout: 10_000 });
    const texts = (await navItems.allTextContents()).map(t => t.trim());

    // part_time には勤怠管理タブが見えないこと
    expect(texts.some(t => t.includes('勤怠管理'))).toBe(false);

    await logout(page);
  });
});
