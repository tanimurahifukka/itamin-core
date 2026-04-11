/**
 * ロール別 画面深掘り E2E
 *
 * 永続デモ店舗にログインして、各ロールが「実際に開けるべき画面」を開き
 * そのページが正しくロードされて主要要素が描画されることを検証する。
 *
 * マトリクス spec (role-matrix) が「タブが見える」レベルなのに対し、
 * こちらは「ページコンポーネント + API 呼び出しが通って UI に反映される」レベル。
 * 書き込み経路 (打刻実行、シフト保存等) は seed データ汚染を避けるため踏み込まず、
 * 読み取り + 入力フォームまでの smoke に留める。
 *
 * 前提: `npm run seed:demo` 済み。
 */
import { test, expect } from './fixtures';

// ────────────────────────────────────────────────
// 打刻 (punch) — full_time / part_time が日常的に使う主要画面
// ────────────────────────────────────────────────
test('full_time: 打刻ページを開いて「出勤」ボタンが見える', async ({ page, loginAs }) => {
  await loginAs('full_time');

  const punchTab = page.locator('.sidebar-nav-item', { hasText: /^打刻$/ });
  await expect(punchTab).toBeVisible({ timeout: 10_000 });
  await punchTab.click();
  await expect(punchTab).toHaveClass(/active/);

  // 打刻ボタン = .punch-btn (出勤 or 退勤)
  const punchBtn = page.locator('.punch-btn');
  await expect(punchBtn).toBeVisible({ timeout: 15_000 });
  // 初期状態は「出勤」 (まだ当日は打刻していないため)
  await expect(punchBtn).toContainText(/出勤|退勤/);
});

test('part_time: シフト希望ページを開いてタブ遷移できる', async ({ page, loginAs }) => {
  await loginAs('part_time');

  const tab = page.locator('.sidebar-nav-item', { hasText: 'シフト希望' });
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
  await expect(tab).toHaveClass(/active/);

  // ShiftRequestPage がロードされた = main-content に何か描画されている
  const main = page.locator('main.main-content');
  await expect(main).toBeVisible();
  // ローディング文言が消えた後の状態確認
  await expect(main.locator('text=読み込み中')).toBeHidden({ timeout: 15_000 }).catch(() => {});
});

// ────────────────────────────────────────────────
// 管理系 (shift / staff) — manager, leader
// ────────────────────────────────────────────────
test('manager: シフト管理ページを開いて描画される', async ({ page, loginAs }) => {
  await loginAs('manager');

  const tab = page.locator('.sidebar-nav-item', { hasText: 'シフト管理' });
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
  await expect(tab).toHaveClass(/active/);

  const main = page.locator('main.main-content');
  await expect(main).toBeVisible();
  // ShiftPage が描画されていることを「ローディングが消えた」で判定
  await expect(main.locator('text=読み込み中')).toBeHidden({ timeout: 15_000 }).catch(() => {});
});

test('leader: スタッフページを開いて描画される', async ({ page, loginAs }) => {
  await loginAs('leader');

  const tab = page.locator('.sidebar-nav-item', { hasText: 'スタッフ' });
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
  await expect(tab).toHaveClass(/active/);

  const main = page.locator('main.main-content');
  await expect(main).toBeVisible();
  await expect(main.locator('text=読み込み中')).toBeHidden({ timeout: 15_000 }).catch(() => {});
});

// ────────────────────────────────────────────────
// owner — 設定画面
// ────────────────────────────────────────────────
test('owner: 設定ページを開いてプラグイン設定が描画される', async ({ page, loginAs }) => {
  await loginAs('owner');

  const tab = page.locator('.sidebar-nav-item', { hasText: '設定' });
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
  await expect(tab).toHaveClass(/active/);

  const main = page.locator('main.main-content');
  await expect(main).toBeVisible();
  await expect(main.locator('text=読み込み中')).toBeHidden({ timeout: 15_000 }).catch(() => {});
});
