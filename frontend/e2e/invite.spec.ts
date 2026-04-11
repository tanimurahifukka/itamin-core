/**
 * 招待フロー E2E テスト
 * - 招待専用登録画面の表示
 * - パスワード確認バリデーション
 * - 通常ログイン画面との分離
 */
import { test, expect, Page } from '@playwright/test';
import { DEMO_USERS, DEMO_STORE_NAME } from './demo-users';

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
    await page.locator('.profile-dropdown-logout').click();
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  }
}

// ============================================================
// 1. 招待画面の表示
// ============================================================
test.describe('招待登録画面', () => {
  test('invite=1 パラメータで専用登録画面が表示される', async ({ page }) => {
    await page.goto('/?invite=1&email=test@example.com&name=テスト太郎&storeName=カフェsofe');
    await page.waitForTimeout(1000);

    // 招待カードが表示
    await expect(page.locator('.invite-card')).toBeVisible();
    await expect(page.locator('.invite-card-icon')).toBeVisible();
    await expect(page.locator('.invite-card-title')).toContainText('スタッフ登録');

    // 事業所名がバッジに表示
    await expect(page.locator('.invite-store-badge')).toContainText('カフェsofe');

    // 説明テキストに事業所名が含まれる
    await expect(page.locator('.invite-card-desc')).toContainText('カフェsofe');
    await expect(page.locator('.invite-card-desc')).toContainText('招待されました');
  });

  test('メールアドレスが読み取り専用で表示される', async ({ page }) => {
    await page.goto('/?invite=1&email=test@example.com&name=テスト太郎&storeName=カフェsofe');
    await page.waitForTimeout(500);

    const emailInput = page.locator('.invite-input-readonly');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveValue('test@example.com');
    await expect(emailInput).toHaveAttribute('readonly', '');
  });

  test('名前がプリフィルされる', async ({ page }) => {
    await page.goto('/?invite=1&email=test@example.com&name=テスト太郎&storeName=カフェsofe');
    await page.waitForTimeout(500);

    const nameInput = page.locator('.invite-input').nth(1); // 2番目のinput = name
    await expect(nameInput).toHaveValue('テスト太郎');
  });

  test('パスワード欄が2つある（確認用）', async ({ page }) => {
    await page.goto('/?invite=1&email=test@example.com&name=テスト太郎&storeName=カフェsofe');
    await page.waitForTimeout(500);

    const passwordInputs = page.locator('input[type="password"]');
    expect(await passwordInputs.count()).toBe(2);
  });

  test('事業所登録切り替えボタンが表示されない', async ({ page }) => {
    await page.goto('/?invite=1&email=test@example.com&name=テスト太郎&storeName=カフェsofe');
    await page.waitForTimeout(500);

    // 通常ログインへの切り替えボタンがない
    await expect(page.locator('.toggle-auth')).not.toBeVisible();
  });
});

// ============================================================
// 2. パスワード確認バリデーション
// ============================================================
test.describe('パスワードバリデーション', () => {
  test('パスワード不一致でエラー表示・ボタン無効', async ({ page }) => {
    await page.goto('/?invite=1&email=test@example.com&name=テスト太郎&storeName=カフェsofe');
    await page.waitForTimeout(500);

    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill('password123');
    await passwords.nth(1).fill('different');

    // エラーメッセージ
    await expect(page.locator('.invite-field-error')).toContainText('パスワードが一致しません');

    // ボタンがdisabled
    const submit = page.locator('.invite-submit');
    await expect(submit).toHaveClass(/disabled/);
  });

  test('パスワード一致でボタン有効', async ({ page }) => {
    await page.goto('/?invite=1&email=test@example.com&name=テスト太郎&storeName=カフェsofe');
    await page.waitForTimeout(500);

    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill('password123');
    await passwords.nth(1).fill('password123');

    // エラーなし
    await expect(page.locator('.invite-field-error')).not.toBeVisible();

    // ボタンが有効
    const submit = page.locator('.invite-submit');
    await expect(submit).not.toHaveClass(/disabled/);
    await expect(submit).toContainText('登録を完了する');
  });
});

// ============================================================
// 3. 通常ログイン画面が壊れていない
// ============================================================
test.describe('通常ログイン回帰テスト', () => {
  test('通常ログイン画面は変わらない', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    // 招待カードは見えない
    await expect(page.locator('.invite-card')).not.toBeVisible();

    // 通常のログインフォーム
    await expect(page.locator('h1')).toContainText('ITAMIN');
    await expect(page.locator('.tagline')).toContainText('痛みを取って、人を育てる。');
    await expect(page.locator('.login-btn')).toContainText('ログイン');
    await expect(page.locator('.toggle-auth')).toBeVisible();
  });

  test('サインアップ切り替えが動く', async ({ page }) => {
    await page.goto('/');
    await page.click('.toggle-auth');
    await expect(page.locator('input[placeholder="お名前"]')).toBeVisible();
    await expect(page.locator('.login-btn')).toContainText('事業所を登録する');
  });

  test('オーナーログインが動く', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await login(page, DEMO_USERS.owner.email, DEMO_USERS.owner.password);
    await expect(page.locator('.store-name-link')).toContainText(DEMO_STORE_NAME);
    expect(errors).toEqual([]);
    await logout(page);
  });
});

// ============================================================
// 4. JSエラーなし
// ============================================================
test.describe('JSエラーなし', () => {
  test('招待画面でJSエラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/?invite=1&email=test@example.com&name=テスト&storeName=テスト店');
    await page.waitForTimeout(1000);

    // フォーム操作
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill('test123');
    await passwords.nth(1).fill('test123');
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });
});
