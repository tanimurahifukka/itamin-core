import { describe, it, expect } from 'vitest';
import {
  escapeCsvCell,
  toCsvRow,
  buildDetailCsv,
  buildSummaryCsv,
} from '../timecard/csv';
import type { DetailRecord, SummaryRecord } from '../timecard/csv';

describe('escapeCsvCell', () => {
  it('通常文字列はそのまま返す', () => {
    expect(escapeCsvCell('hello')).toBe('hello');
  });

  it('数値はそのまま返す', () => {
    expect(escapeCsvCell(123)).toBe('123');
  });

  it('null は空文字を返す', () => {
    expect(escapeCsvCell(null)).toBe('');
  });

  it('undefined は空文字を返す', () => {
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('カンマを含む場合はダブルクォートで囲む', () => {
    expect(escapeCsvCell('山田, 太郎')).toBe('"山田, 太郎"');
  });

  it('ダブルクォートを含む場合はダブルクォートで囲み、内部の " を "" に置換する', () => {
    expect(escapeCsvCell('彼は"hello"と言った')).toBe('"彼は""hello""と言った"');
  });

  it('改行(\\n)を含む場合はダブルクォートで囲む', () => {
    expect(escapeCsvCell('行1\n行2')).toBe('"行1\n行2"');
  });

  it('改行(\\r)を含む場合はダブルクォートで囲む', () => {
    expect(escapeCsvCell('行1\r行2')).toBe('"行1\r行2"');
  });

  it('カンマ・ダブルクォートを同時に含む場合も正しく処理する', () => {
    expect(escapeCsvCell('a,"b",c')).toBe('"a,""b"",c"');
  });
});

describe('toCsvRow', () => {
  it('各セルをカンマ区切りで結合する', () => {
    expect(toCsvRow(['2026-04-01', '田中', '09:00', '18:00'])).toBe('2026-04-01,田中,09:00,18:00');
  });

  it('空配列は空文字列を返す', () => {
    expect(toCsvRow([])).toBe('');
  });

  it('null を含む場合は空セルになる', () => {
    expect(toCsvRow(['a', null, 'b'])).toBe('a,,b');
  });
});

describe('buildDetailCsv', () => {
  it('BOM で始まる', () => {
    const csv = buildDetailCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('空配列はヘッダーのみ出力する', () => {
    const csv = buildDetailCsv([]);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('日付');
    expect(lines[0]).toContain('スタッフ名');
    expect(lines[0]).toContain('出勤時刻');
    expect(lines[0]).toContain('退勤時刻');
    expect(lines[0]).toContain('休憩(分)');
    expect(lines[0]).toContain('実働(時間)');
    expect(lines[0]).toContain('概算給与');
  });

  it('レコードが正しく出力される', () => {
    const record: DetailRecord = {
      date: '2026-04-01',
      staffName: '田中 太郎',
      clockIn: '09:00',
      clockOut: '18:00',
      breakMinutes: 60,
      workMinutes: 480,
      estimatedSalary: 12000,
    };
    const csv = buildDetailCsv([record]);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('2026-04-01');
    expect(lines[1]).toContain('田中 太郎');
    expect(lines[1]).toContain('09:00');
    expect(lines[1]).toContain('18:00');
    expect(lines[1]).toContain('60');
    expect(lines[1]).toContain('12000');
  });

  it('スタッフ名にカンマが含まれる場合、ダブルクォートで囲む', () => {
    const record: DetailRecord = {
      date: '2026-04-01',
      staffName: '山田, 太郎',
      clockIn: '09:00',
      clockOut: '17:00',
      breakMinutes: 0,
      workMinutes: 480,
      estimatedSalary: 9600,
    };
    const csv = buildDetailCsv([record]);
    expect(csv).toContain('"山田, 太郎"');
  });

  it('スタッフ名にダブルクォートが含まれる場合、エスケープする', () => {
    const record: DetailRecord = {
      date: '2026-04-01',
      staffName: '田中 "タロウ"',
      clockIn: '10:00',
      clockOut: '19:00',
      breakMinutes: 60,
      workMinutes: 480,
      estimatedSalary: 9600,
    };
    const csv = buildDetailCsv([record]);
    expect(csv).toContain('"田中 ""タロウ"""');
  });

  it('実働時間は workMinutes / 60 で小数点2桁になる', () => {
    const record: DetailRecord = {
      date: '2026-04-01',
      staffName: '佐藤',
      clockIn: '09:00',
      clockOut: '14:30',
      breakMinutes: 0,
      workMinutes: 330,
      estimatedSalary: 5280,
    };
    const csv = buildDetailCsv([record]);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0);
    // 5.5 hours
    expect(lines[1]).toContain('5.5');
  });
});

describe('buildSummaryCsv', () => {
  it('BOM で始まる', () => {
    const csv = buildSummaryCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('空配列はヘッダーのみ出力する', () => {
    const csv = buildSummaryCsv([]);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('スタッフ名');
    expect(lines[0]).toContain('出勤日数');
    expect(lines[0]).toContain('総労働時間');
    expect(lines[0]).toContain('総休憩(分)');
    expect(lines[0]).toContain('概算給与合計');
  });

  it('サマリレコードが正しく出力される', () => {
    const record: SummaryRecord = {
      staffName: '鈴木 花子',
      workDays: 20,
      totalWorkHours: 160,
      totalBreakMinutes: 1200,
      estimatedSalary: 160000,
    };
    const csv = buildSummaryCsv([record]);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('鈴木 花子');
    expect(lines[1]).toContain('20');
    expect(lines[1]).toContain('160');
    expect(lines[1]).toContain('1200');
    expect(lines[1]).toContain('160000');
  });
});
