import { formatDateJST } from './datetime';

/**
 * 勤怠集計の純粋関数ライブラリ
 *
 * routes.ts の /export (summary) と /monthly で共有する集計ロジック。
 * DB アクセスを持たない純粋関数として切り出す。
 */

/** 集計に必要な最小限の勤怠レコード型 */
export interface RawRecord {
  staff_id: string;
  clock_in: string;           // ISO8601 文字列
  clock_out: string | null;   // null = 未退勤
  break_minutes: number | null;
  hourly_wage: number;
  staff_name: string;
}

/** aggregateSummary の出力型 */
export interface AggregateSummaryRecord {
  staffId: string;
  staffName: string;
  workDays: number;
  laborMinutes: number;
  breakMinutes: number;
  wageTotal: number;
}

/**
 * clock_in と clock_out から実働分数を算出する。
 * breakMinutes を差し引き、0 以上に clamp する。
 * clock_out が null の場合は 0 を返す(未退勤は集計対象外)。
 */
export function computeWorkMinutes(
  clockIn: string,
  clockOut: string | null,
  breakMinutes: number,
): number {
  if (!clockOut) return 0;
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000;
  return Math.max(0, diff - breakMinutes);
}

/**
 * 勤怠レコード配列をスタッフごとに集計する。
 * clock_out が null のレコード(未退勤)は集計対象外。
 * 出勤日数は clock_in の日付ベースで重複除去する。
 */
export function aggregateSummary(records: RawRecord[]): AggregateSummaryRecord[] {
  const staffMap = new Map<string, {
    staffId: string;
    staffName: string;
    hourlyWage: number;
    laborMinutes: number;
    breakMinutes: number;
    workDays: Set<string>;
  }>();

  for (const r of records) {
    // 未退勤レコードはスキップ
    if (r.clock_out == null) continue;

    if (!staffMap.has(r.staff_id)) {
      staffMap.set(r.staff_id, {
        staffId: r.staff_id,
        staffName: r.staff_name,
        hourlyWage: r.hourly_wage,
        laborMinutes: 0,
        breakMinutes: 0,
        workDays: new Set(),
      });
    }

    const entry = staffMap.get(r.staff_id)!;
    const bm = r.break_minutes ?? 0;
    entry.laborMinutes += computeWorkMinutes(r.clock_in, r.clock_out, bm);
    entry.breakMinutes += bm;

    const day = formatDateJST(r.clock_in);
    entry.workDays.add(day);
  }

  return Array.from(staffMap.values()).map(s => ({
    staffId: s.staffId,
    staffName: s.staffName,
    workDays: s.workDays.size,
    laborMinutes: Math.round(s.laborMinutes),
    breakMinutes: s.breakMinutes,
    wageTotal: Math.round(s.laborMinutes / 60 * s.hourlyWage),
  }));
}
