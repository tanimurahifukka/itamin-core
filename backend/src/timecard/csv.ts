/**
 * 勤怠データの CSV 生成ロジック（純粋関数）
 * テスト容易性のため、DB アクセスを持たない純粋関数として切り出す。
 */

/**
 * CSV セル値のエスケープ
 * カンマ・ダブルクォート・改行を含む場合はダブルクォートで囲み、
 * 内部のダブルクォートは "" に置換する。
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * 1行分の CSV 行文字列を生成する
 */
export function toCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

/** 1勤務レコード（detail モード用） */
export interface DetailRecord {
  date: string;         // YYYY-MM-DD
  staffName: string;
  clockIn: string;      // HH:mm
  clockOut: string;     // HH:mm または空文字
  breakMinutes: number;
  workMinutes: number;  // break_minutes 差し引き済みの実働分
  estimatedSalary: number;
}

/** 1スタッフ/月サマリ（summary モード用） */
export interface SummaryRecord {
  staffName: string;
  workDays: number;
  totalWorkHours: number;  // 小数点2桁
  totalBreakMinutes: number;
  estimatedSalary: number;
}

/**
 * detail CSV: 1行=1勤務レコード
 */
export function buildDetailCsv(records: DetailRecord[]): string {
  const header = toCsvRow(['日付', 'スタッフ名', '出勤時刻', '退勤時刻', '休憩(分)', '実働(時間)', '概算給与']);
  const rows = records.map(r =>
    toCsvRow([
      r.date,
      r.staffName,
      r.clockIn,
      r.clockOut,
      r.breakMinutes,
      Math.round(r.workMinutes / 60 * 100) / 100,
      r.estimatedSalary,
    ])
  );
  return '\uFEFF' + [header, ...rows].join('\r\n') + '\r\n';
}

/**
 * summary CSV: 1行=1スタッフ/月
 */
export function buildSummaryCsv(records: SummaryRecord[]): string {
  const header = toCsvRow(['スタッフ名', '出勤日数', '総労働時間', '総休憩(分)', '概算給与合計']);
  const rows = records.map(r =>
    toCsvRow([
      r.staffName,
      r.workDays,
      r.totalWorkHours,
      r.totalBreakMinutes,
      r.estimatedSalary,
    ])
  );
  return '\uFEFF' + [header, ...rows].join('\r\n') + '\r\n';
}
