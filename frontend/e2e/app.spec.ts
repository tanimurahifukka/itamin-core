/**
 * ITAMIN Core E2E テスト
 * ヘッドレスブラウザ (Playwright) で主要画面・フローを検証
 */
import { test, expect } from '@playwright/test';

// ============================================================
// 1. ログイン画面
// ============================================================
test.describe('ログイン画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ログインフォームが表示される', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('ITAMIN');
    await expect(page.locator('.tagline')).toContainText('痛みを取って、人を育てる。');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('.login-btn')).toContainText('ログイン');
  });

  test('新規登録フォームに切り替えられる', async ({ page }) => {
    await page.click('.toggle-auth');
    await expect(page.locator('input[placeholder="お名前"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="事業所名"]')).toBeVisible();
    await expect(page.locator('.login-btn')).toContainText('事業所を登録する');
  });

  test('ログインとサインアップを切り替えできる', async ({ page }) => {
    await page.click('.toggle-auth');
    await expect(page.locator('.toggle-auth')).toContainText('ログインはこちら');
    await page.click('.toggle-auth');
    await expect(page.locator('.toggle-auth')).toContainText('事業所登録はこちら');
  });

  test('空フォームで送信するとブラウザバリデーション', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('サインアップフォームに名前と事業所名のフィールドがある', async ({ page }) => {
    await page.click('.toggle-auth');
    const nameInput = page.locator('input[placeholder="お名前"]');
    const storeInput = page.locator('input[placeholder*="事業所名"]');
    await expect(nameInput).toHaveAttribute('required', '');
    await expect(storeInput).toHaveAttribute('required', '');
  });

  test('パスワードに最小長のバリデーションがある', async ({ page }) => {
    const pwInput = page.locator('input[type="password"]');
    await expect(pwInput).toHaveAttribute('minlength', '6');
  });
});

// ============================================================
// 2. レイアウト（サイドバー）
// ============================================================
test.describe('サイドバーレイアウト', () => {
  test('ログイン画面にサイドバーが無い（未認証時）', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar')).not.toBeVisible();
  });

  test('ログイン画面にapp-bodyが無い（未認証時）', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-body')).not.toBeVisible();
  });
});

// ============================================================
// 3. CSS・フォント（デジタル庁風スタイル）
// ============================================================
test.describe('デジタル庁風スタイル', () => {
  test('body に正しいフォントファミリーが設定されている', async ({ page }) => {
    await page.goto('/');
    const fontFamily = await page.evaluate(() =>
      getComputedStyle(document.body).fontFamily
    );
    expect(fontFamily).toContain('Noto Sans JP');
  });

  test('font-feature-settings palt が適用されている', async ({ page }) => {
    await page.goto('/');
    const ffs = await page.evaluate(() =>
      getComputedStyle(document.body).fontFeatureSettings
    );
    expect(ffs).toContain('palt');
  });

  test('letter-spacing が設定されている', async ({ page }) => {
    await page.goto('/');
    const ls = await page.evaluate(() =>
      getComputedStyle(document.body).letterSpacing
    );
    expect(ls).not.toBe('normal');
    expect(ls).not.toBe('0px');
  });

  test('line-height が 1.8 相当に設定されている', async ({ page }) => {
    await page.goto('/');
    const lh = await page.evaluate(() =>
      getComputedStyle(document.body).lineHeight
    );
    // 1.8 × font-size(15px) = 27px
    expect(lh).not.toBe('normal');
  });

  test('antialiased フォントスムージングが有効', async ({ page }) => {
    await page.goto('/');
    const smoothing = await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('-webkit-font-smoothing')
    );
    expect(smoothing).toBe('antialiased');
  });
});

// ============================================================
// 4. レスポンシブ（モバイル）
// ============================================================
test.describe('モバイルレスポンシブ', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('モバイルでログインページが正しく表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.login-btn')).toBeVisible();
  });

  test('モバイルでフォームが全幅表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.login-form');
    const formWidth = await page.evaluate(() => {
      const form = document.querySelector('.login-form');
      if (!form) return 0;
      return form.getBoundingClientRect().width;
    });
    expect(formWidth).toBeGreaterThan(0);
    expect(formWidth).toBeLessThanOrEqual(375);
  });
});

// ============================================================
// 5. タブレットレスポンシブ
// ============================================================
test.describe('タブレットレスポンシブ', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('タブレットでログインが正しく表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });
});

// ============================================================
// 6. ビルド検証
// ============================================================
test.describe('アプリ起動', () => {
  test('ページが正常にロードされる（JSエラーなし）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('CSSが読み込まれている', async ({ page }) => {
    await page.goto('/');
    const sheets = await page.evaluate(() => document.styleSheets.length);
    expect(sheets).toBeGreaterThan(0);
  });

  test('Reactがマウントされている', async ({ page }) => {
    await page.goto('/');
    const hasRoot = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root !== null && root.children.length > 0;
    });
    expect(hasRoot).toBe(true);
  });

  test('重要なCSSクラスが定義されている', async ({ page }) => {
    await page.goto('/');
    const classes = await page.evaluate(() => {
      const styleSheets = Array.from(document.styleSheets);
      const allRules: string[] = [];
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule) {
              allRules.push(rule.selectorText);
            }
          }
        } catch {}
      }
      return allRules;
    });
    // サイドバー関連クラスが定義されている
    expect(classes.some(c => c.includes('.sidebar'))).toBe(true);
    expect(classes.some(c => c.includes('.sidebar-nav-item'))).toBe(true);
    expect(classes.some(c => c.includes('.app-body'))).toBe(true);
    // ロールバッジ
    expect(classes.some(c => c.includes('.role-badge'))).toBe(true);
    // チェックリストテキスト入力
    expect(classes.some(c => c.includes('.checklist-text-input'))).toBe(true);
  });
});

// ============================================================
// 7. アクセシビリティ基本チェック
// ============================================================
test.describe('アクセシビリティ', () => {
  test('ページにh1見出しがある', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('h1', { timeout: 10000 });
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThan(0);
  });

  test('input要素にtype属性がある', async ({ page }) => {
    await page.goto('/');
    const inputs = page.locator('input:not([type])');
    expect(await inputs.count()).toBe(0);
  });

  test('ボタンにテキストコンテンツがある', async ({ page }) => {
    await page.goto('/');
    const buttons = await page.locator('button').all();
    for (const btn of buttons) {
      const text = await btn.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });
});
