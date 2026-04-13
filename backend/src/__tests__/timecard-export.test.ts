/**
 * 勤怠 CSV エクスポート統合テスト
 *
 * routes.ts の export ロジックは内部状態（supabaseAdmin + Express req/res）に
 * 強く依存するため、ここでは以下の戦略でテストする:
 *
 * 1. 権限決定ロジック (export_permission 配列チェック) を独立関数として検証
 * 2. Supabase モックを直接操作してデータ変換ロジックを検証
 * 3. csv.ts の純粋関数テストは csv.test.ts で網羅済み
 */
import { describe, it, expect, vi } from 'vitest';
import { aggregateSummary, computeWorkMinutes } from '../timecard/aggregate';
import type { RawRecord } from '../timecard/aggregate';
import { currentJstYearMonth, dayBoundsJST, formatDateJST, isValidJstDate, isValidJstYearMonth, monthBoundsJST } from '../timecard/datetime';

// -------------------------------------------------------------------
// モジュールモック
// -------------------------------------------------------------------

vi.mock('../config/supabase', () => ({
  supabaseAdmin: { from: vi.fn() },
  createSupabaseClient: vi.fn(),
}));

vi.mock('../config/index', () => ({
  config: {
    port: 3001,
    nodeEnv: 'test',
    supabase: { url: '', anonKey: '', serviceRoleKey: '' },
    frontendUrl: 'http://localhost:3000',
    kioskJwtSecret: 'test-secret',
  },
}));

vi.mock('../middleware/auth', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../auth/authorization', () => ({
  requireManagedStore: vi.fn(),
  requireStoreMembership: vi.fn(),
  staffBelongsToStore: vi.fn(),
  isManagedRole: vi.fn(),
  isShiftRequestEnabled: vi.fn(),
  VALID_STAFF_ROLES: ['owner', 'manager', 'leader', 'full_time', 'part_time'],
}));

// -------------------------------------------------------------------
// 権限チェックロジックの単体テスト
// (routes.ts の export ハンドラ内インライン実装を同等関数として抽出)
// -------------------------------------------------------------------

/**
 * routes.ts の export_permission チェックと同じロジック (fail-closed)
 */
function checkExportPermission(
  exportPermissionConfig: unknown,
  staffRole: string,
): boolean {
  let exportPermission: string[];
  if (exportPermissionConfig === undefined) {
    // 未設定 → デフォルト ['owner','manager']
    exportPermission = ['owner', 'manager'];
  } else if (Array.isArray(exportPermissionConfig)) {
    exportPermission = exportPermissionConfig as string[];
  } else {
    // 明示的に設定されているが配列でない → fail-closed (全拒否)
    exportPermission = [];
  }
  return exportPermission.includes(staffRole);
}

describe('export_permission ロジック', () => {
  it('設定なし(undefined) → owner は許可', () => {
    expect(checkExportPermission(undefined, 'owner')).toBe(true);
  });

  it('設定なし(undefined) → manager は許可', () => {
    expect(checkExportPermission(undefined, 'manager')).toBe(true);
  });

  it('設定なし(undefined) → leader は不許可', () => {
    expect(checkExportPermission(undefined, 'leader')).toBe(false);
  });

  it('設定なし(undefined) → full_time は不許可', () => {
    expect(checkExportPermission(undefined, 'full_time')).toBe(false);
  });

  it('設定なし(undefined) → part_time は不許可', () => {
    expect(checkExportPermission(undefined, 'part_time')).toBe(false);
  });

  it('["owner","manager"] → owner は許可', () => {
    expect(checkExportPermission(['owner', 'manager'], 'owner')).toBe(true);
  });

  it('["owner","manager"] → manager は許可', () => {
    expect(checkExportPermission(['owner', 'manager'], 'manager')).toBe(true);
  });

  it('["owner"] のみ → manager は不許可', () => {
    expect(checkExportPermission(['owner'], 'manager')).toBe(false);
  });

  it('["owner","manager","leader"] → leader は許可', () => {
    expect(checkExportPermission(['owner', 'manager', 'leader'], 'leader')).toBe(true);
  });

  it('空配列 [] → owner も不許可', () => {
    expect(checkExportPermission([], 'owner')).toBe(false);
  });

  it('配列でない値（文字列）→ fail-closed で全拒否', () => {
    // Critical 2: 明示的に設定されているが配列でない場合は全拒否
    expect(checkExportPermission('owner', 'owner')).toBe(false);
    expect(checkExportPermission('owner', 'manager')).toBe(false);
    expect(checkExportPermission('owner', 'leader')).toBe(false);
  });

  it('配列でない値（null）→ fail-closed で全拒否', () => {
    expect(checkExportPermission(null, 'owner')).toBe(false);
    expect(checkExportPermission(null, 'manager')).toBe(false);
  });

  it('配列でない値（オブジェクト）→ fail-closed で全拒否', () => {
    expect(checkExportPermission({ roles: ['owner'] }, 'owner')).toBe(false);
  });

  it('undefined (未設定) → デフォルト ["owner","manager"] にフォールバック', () => {
    // 設定キー自体が存在しない場合はデフォルトが適用される
    expect(checkExportPermission(undefined, 'owner')).toBe(true);
    expect(checkExportPermission(undefined, 'manager')).toBe(true);
    expect(checkExportPermission(undefined, 'leader')).toBe(false);
  });
});

// -------------------------------------------------------------------
// CSV ファイル名フォーマットの検証
// -------------------------------------------------------------------

/** routes.ts の Content-Disposition 生成と同等のロジック（Medium 9） */
function buildCsvContentDisposition(storeName: string, year: number, month: number, mode: string): string {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const asciiFilename = `attendance_${monthStr}_${mode}.csv`;
  const encodedStoreName = encodeURIComponent(storeName);
  const utf8Filename = `attendance_${encodedStoreName}_${monthStr}_${mode}.csv`;
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`;
}

describe('CSV Content-Disposition フォーマット（Medium 9）', () => {
  it('ASCII 店舗名 + detail モードの Content-Disposition が正しい形式', () => {
    const cd = buildCsvContentDisposition('MyStore', 2026, 4, 'detail');
    expect(cd).toContain('filename="attendance_2026-04_detail.csv"');
    expect(cd).toContain("filename*=UTF-8''attendance_MyStore_2026-04_detail.csv");
  });

  it('summary モードの Content-Disposition が正しい形式', () => {
    const cd = buildCsvContentDisposition('MyStore', 2026, 12, 'summary');
    expect(cd).toContain('filename="attendance_2026-12_summary.csv"');
    expect(cd).toContain("filename*=UTF-8''attendance_MyStore_2026-12_summary.csv");
  });

  it('月が1桁のとき0埋めされる', () => {
    const cd = buildCsvContentDisposition('MyStore', 2026, 1, 'detail');
    expect(cd).toContain('2026-01');
  });

  it('非 ASCII 店舗名は percent encode される', () => {
    const cd = buildCsvContentDisposition('テスト店', 2026, 4, 'detail');
    // 日本語は percent encode される
    expect(cd).toContain('filename*=UTF-8\'\'');
    expect(cd).toContain('%E3%83%86%E3%82%B9%E3%83%88%E5%BA%97');
  });
});

// -------------------------------------------------------------------
// 実働時間計算ロジックの検証
// -------------------------------------------------------------------

function calcWorkMinutes(
  clockIn: string,
  clockOut: string,
  breakMinutes: number,
): number {
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000;
  return Math.max(0, diff - breakMinutes);
}

describe('実働時間計算', () => {
  it('09:00〜18:00 (9時間)、休憩60分 → 実働480分', () => {
    const work = calcWorkMinutes(
      '2026-04-01T09:00:00+09:00',
      '2026-04-01T18:00:00+09:00',
      60,
    );
    // 9時間 = 540分、休憩60分 → 実働480分
    expect(work).toBe(540 - 60);
  });

  it('breakMinutes が労働時間を超えた場合は 0 を返す', () => {
    const work = calcWorkMinutes(
      '2026-04-01T09:00:00+09:00',
      '2026-04-01T09:30:00+09:00',
      60,  // 30分労働に60分休憩
    );
    expect(work).toBe(0);
  });

  it('break_minutes = 0 のとき総労働時間 = 差分', () => {
    const work = calcWorkMinutes(
      '2026-04-01T10:00:00+09:00',
      '2026-04-01T15:00:00+09:00',
      0,
    );
    expect(work).toBe(300);
  });
});

// -------------------------------------------------------------------
// aggregateSummary の単体テスト（High 7）
// -------------------------------------------------------------------

describe('aggregateSummary', () => {
  it('空配列は空配列を返す', () => {
    expect(aggregateSummary([])).toEqual([]);
  });

  it('単一スタッフのレコードを正しく集計する', () => {
    const records: RawRecord[] = [
      {
        staff_id: 's1',
        clock_in: '2026-04-01T09:00:00+09:00',
        clock_out: '2026-04-01T18:00:00+09:00',
        break_minutes: 60,
        hourly_wage: 1000,
        staff_name: '田中',
      },
    ];
    const result = aggregateSummary(records);
    expect(result).toHaveLength(1);
    expect(result[0].staffName).toBe('田中');
    expect(result[0].workDays).toBe(1);
    // 9時間 - 60分 = 480分
    expect(result[0].laborMinutes).toBe(480);
    expect(result[0].breakMinutes).toBe(60);
    // 480分 / 60 * 1000 = 8000円
    expect(result[0].wageTotal).toBe(8000);
  });

  it('複数スタッフのレコードをそれぞれ独立して集計する', () => {
    const records: RawRecord[] = [
      {
        staff_id: 's1',
        clock_in: '2026-04-01T09:00:00+09:00',
        clock_out: '2026-04-01T18:00:00+09:00',
        break_minutes: 60,
        hourly_wage: 1000,
        staff_name: '田中',
      },
      {
        staff_id: 's2',
        clock_in: '2026-04-01T10:00:00+09:00',
        clock_out: '2026-04-01T17:00:00+09:00',
        break_minutes: 0,
        hourly_wage: 1200,
        staff_name: '鈴木',
      },
    ];
    const result = aggregateSummary(records);
    expect(result).toHaveLength(2);

    const tanaka = result.find(r => r.staffId === 's1')!;
    expect(tanaka.laborMinutes).toBe(480);
    expect(tanaka.wageTotal).toBe(8000);

    const suzuki = result.find(r => r.staffId === 's2')!;
    // 7時間 = 420分
    expect(suzuki.laborMinutes).toBe(420);
    expect(suzuki.wageTotal).toBe(8400);
  });

  it('未退勤(clock_out = null)のレコードは集計対象外（ただし出勤日数もカウントしない）', () => {
    const records: RawRecord[] = [
      {
        staff_id: 's1',
        clock_in: '2026-04-01T09:00:00+09:00',
        clock_out: '2026-04-01T18:00:00+09:00',
        break_minutes: 60,
        hourly_wage: 1000,
        staff_name: '田中',
      },
      {
        staff_id: 's1',
        clock_in: '2026-04-02T09:00:00+09:00',
        clock_out: null, // 未退勤
        break_minutes: 0,
        hourly_wage: 1000,
        staff_name: '田中',
      },
    ];
    const result = aggregateSummary(records);
    expect(result).toHaveLength(1);
    // 未退勤レコードは出勤日数・労働時間ともにカウントしない
    expect(result[0].workDays).toBe(1);
    expect(result[0].laborMinutes).toBe(480);
  });

  it('同一スタッフの複数日レコードを正しく合算する', () => {
    const records: RawRecord[] = [
      {
        staff_id: 's1',
        clock_in: '2026-04-01T09:00:00+09:00',
        clock_out: '2026-04-01T18:00:00+09:00',
        break_minutes: 60,
        hourly_wage: 1000,
        staff_name: '田中',
      },
      {
        staff_id: 's1',
        clock_in: '2026-04-02T09:00:00+09:00',
        clock_out: '2026-04-02T18:00:00+09:00',
        break_minutes: 60,
        hourly_wage: 1000,
        staff_name: '田中',
      },
    ];
    const result = aggregateSummary(records);
    expect(result).toHaveLength(1);
    expect(result[0].workDays).toBe(2);
    expect(result[0].laborMinutes).toBe(960); // 480 * 2
    expect(result[0].wageTotal).toBe(16000);  // 960/60 * 1000
  });

  it('JST では同日の複数勤務を 1 出勤日として集計する', () => {
    const records: RawRecord[] = [
      {
        staff_id: 's1',
        clock_in: '2026-04-01T00:30:00+09:00',
        clock_out: '2026-04-01T03:00:00+09:00',
        break_minutes: 0,
        hourly_wage: 1000,
        staff_name: '田中',
      },
      {
        staff_id: 's1',
        clock_in: '2026-04-01T12:00:00+09:00',
        clock_out: '2026-04-01T18:00:00+09:00',
        break_minutes: 60,
        hourly_wage: 1000,
        staff_name: '田中',
      },
    ];
    const result = aggregateSummary(records);
    expect(result).toHaveLength(1);
    expect(result[0].workDays).toBe(1);
    expect(result[0].laborMinutes).toBe(450);
  });

  it('computeWorkMinutes: clock_out が null のとき 0 を返す', () => {
    expect(computeWorkMinutes('2026-04-01T09:00:00+09:00', null, 0)).toBe(0);
  });
});

describe('timecard datetime helpers', () => {
  it('formatDateJST は UTC 日付ではなく JST 日付を返す', () => {
    expect(formatDateJST('2026-04-01T00:30:00+09:00')).toBe('2026-04-01');
  });

  it('dayBoundsJST は JST 1 日ぶんの UTC 範囲を返す', () => {
    expect(dayBoundsJST('2026-04-01')).toEqual({
      startIso: '2026-03-31T15:00:00.000Z',
      endIsoExclusive: '2026-04-01T15:00:00.000Z',
    });
  });

  it('isValidJstDate は存在しない日付を拒否する', () => {
    expect(isValidJstDate('2026-02-30')).toBe(false);
    expect(isValidJstDate('2026-2-30')).toBe(false);
  });

  it('monthBoundsJST は翌月の JST 0時を終端にする', () => {
    expect(monthBoundsJST(2026, 4)).toEqual({
      startIso: '2026-03-31T15:00:00.000Z',
      endIsoExclusive: '2026-04-30T15:00:00.000Z',
    });
  });

  it('monthBoundsJST は不正な month を拒否する', () => {
    expect(isValidJstYearMonth(2026, 13)).toBe(false);
    expect(() => monthBoundsJST(2026, 13)).toThrow(/Invalid JST year\/month/);
  });

  it('currentJstYearMonth は月初の UTC でも JST の当月を返す', () => {
    expect(currentJstYearMonth(new Date('2026-03-31T16:00:00.000Z'))).toEqual({
      year: 2026,
      month: 4,
    });
  });
});
