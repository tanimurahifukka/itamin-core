/**
 * ロール × 機能 可視性マトリクス E2E
 *
 * 永続デモ店舗 (DEMO_STORE_ID) にログインして、5 ロールそれぞれで
 * 「見えるべきタブが見える / 見えないべきタブが見えない」ことを検証する。
 *
 * 前提: `npm run seed:demo` 済み。
 * verify:e2e ではこのコマンドが先に走るので自動的に満たされる。
 *
 * 既存の `roles.spec.ts` も似たことをしているが、あちらは使い捨て「テスト店舗」を
 * 毎回作り直す形で、有効プラグインは shift/shift_request/check しか無い。
 * こちらは永続デモ店舗でより多くのプラグインを有効化した状態で検証する。
 */
import { test, expect } from './fixtures';
import type { DemoRole } from './demo-users';

/**
 * 各ロールが「見えるべきタブ」
 * - 打刻 (punch, core): owner を除く
 * - 勤怠管理 (attendance_plugin, core): owner/manager/leader
 * - スタッフ (staff, core): owner/manager/leader
 * - 設定 (settings_plugin, core): owner/manager/leader
 * - シフト管理 (shift): owner/manager/leader
 * - シフト希望 (shift_request): full_time/part_time
 * - チェックリスト (check): owner/manager/leader
 * - 経費管理 (expense): owner/manager/leader
 * - 連絡ノート (notice): 全ロール
 * - 勤怠管理(LINE) (attendance_admin): owner/manager
 */
const EXPECTED_TABS: Record<DemoRole, string[]> = {
  owner:     ['勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '経費管理', '連絡ノート', '設定', '勤怠管理(LINE)'],
  manager:   ['打刻', '勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '経費管理', '連絡ノート', '設定', '勤怠管理(LINE)'],
  leader:    ['打刻', '勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '経費管理', '連絡ノート', '設定'],
  full_time: ['打刻', 'シフト希望', '連絡ノート'],
  part_time: ['打刻', 'シフト希望', '連絡ノート'],
};

const FORBIDDEN_TABS: Record<DemoRole, string[]> = {
  owner:     ['打刻', 'シフト希望'],
  manager:   ['シフト希望'],
  leader:    ['シフト希望', '勤怠管理(LINE)'],
  full_time: ['勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '経費管理', '設定', '勤怠管理(LINE)'],
  part_time: ['勤怠管理', 'スタッフ', 'シフト管理', 'チェックリスト', '経費管理', '設定', '勤怠管理(LINE)'],
};

const ALL_ROLES: DemoRole[] = ['owner', 'manager', 'leader', 'full_time', 'part_time'];

// ログインのオーバーヘッドを抑えるため、1 ロール = 1 test にまとめる
// (可視性チェック + 先頭タブのクリック smoke を同じ context でまとめて実行)
for (const role of ALL_ROLES) {
  test(`role=${role}: tabs match matrix and first tab opens`, async ({ page, loginAs }) => {
    await loginAs(role);

    const navItems = page.locator('.sidebar-nav-item');
    await expect(navItems.first()).toBeVisible({ timeout: 15_000 });
    const texts = (await navItems.allTextContents()).map((t) => t.trim());

    for (const tab of EXPECTED_TABS[role]) {
      expect(texts, `[${role}] "${tab}" should be visible`).toContain(tab);
    }
    for (const tab of FORBIDDEN_TABS[role]) {
      expect(texts, `[${role}] "${tab}" should NOT be visible`).not.toContain(tab);
    }

    // smoke: 最初の許可タブをクリックして active 化を確認
    const firstTab = EXPECTED_TABS[role][0];
    const target = navItems.filter({ hasText: firstTab }).first();
    await target.click();
    await expect(target).toHaveClass(/active/, { timeout: 5_000 });
  });
}
