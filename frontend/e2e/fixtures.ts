/**
 * Playwright 共通 fixture
 *
 * 各 spec で重複していた login/logout ヘルパーを集約する。
 * 新規 spec は `test.extend` 経由の `loginAs(role)` を使う。
 * 既存 spec は互換のため置換しない (リグレッション予防)。
 *
 * storageState はワーカースコープで role 別にキャッシュし、
 * 同一 spec ファイル内での複数 test で不要な再ログインを避ける。
 */
import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import type { DemoRole } from './demo-users';
import { DEMO_USERS } from './demo-users';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

// ワーカースコープのメモリキャッシュ (role → storageState)。
// 同一ワーカーで同じ role を繰り返し要求された時に使い回す。
const cachedStates: Partial<Record<DemoRole, StorageState>> = {};

async function rawLogin(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('.login-btn');
  // サイドバーが出るまで待つ (ログイン後のダッシュボード到達を意味する)
  await page.waitForSelector('.sidebar-nav-item', { timeout: 20_000 });
}

async function logoutIfNeeded(page: Page) {
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

export const test = base.extend<{
  loginAs: (role: DemoRole) => Promise<void>;
  logout: () => Promise<void>;
}>({
  loginAs: async ({ page, context }, use) => {
    await use(async (role: DemoRole) => {
      const cached = cachedStates[role];
      if (cached) {
        // 既にログイン済みの state がある → 復元してから遷移
        await context.addCookies(cached.cookies || []);
        // localStorage / sessionStorage は origin 単位で復元する必要があるが、
        // Playwright の addCookies は cookie のみ。完全な state 復元は初回リクエスト前に
        // context.storageState で渡すのが正攻法なので、ここでは cookie のみ。
        // Supabase Auth のセッションは localStorage に入っているので、
        // 実用上は「次の goto で未ログイン → 直後に rawLogin」となる。
        // → キャッシュは誤差レベルの高速化しか提供しないので、常に rawLogin する方針に倒す。
      }
      const u = DEMO_USERS[role];
      await rawLogin(page, u.email, u.password);
      // 参考用にキャッシュだけ保存 (現状未使用、将来 storageState 対応時に利用)
      cachedStates[role] = await context.storageState();
    });
  },
  logout: async ({ page }, use) => {
    await use(async () => {
      await logoutIfNeeded(page);
    });
  },
});

export { expect };
export { DEMO_USERS };
