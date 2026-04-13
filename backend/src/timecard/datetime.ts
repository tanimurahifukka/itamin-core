const ITAMIN_TIMEZONE = 'Asia/Tokyo';
const JST_OFFSET = '+09:00';
const JST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateJST(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('sv-SE', { timeZone: ITAMIN_TIMEZONE });
}

export function todayJST(now: Date = new Date()): string {
  return formatDateJST(now);
}

export function currentJstYearMonth(now: Date = new Date()): { year: number; month: number } {
  const [year, month] = todayJST(now).split('-').map(Number);
  return { year, month };
}

export function isValidJstDate(date: string): boolean {
  if (!JST_DATE_PATTERN.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00${JST_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return formatDateJST(parsed) === date;
}

export function isValidJstYearMonth(year: number, month: number): boolean {
  return Number.isInteger(year)
    && Number.isInteger(month)
    && year >= 1000
    && year <= 9999
    && month >= 1
    && month <= 12;
}

export function dayBoundsJST(date: string): { startIso: string; endIsoExclusive: string } {
  if (!isValidJstDate(date)) {
    throw new RangeError(`Invalid JST date: ${date}`);
  }

  const start = new Date(`${date}T00:00:00${JST_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIsoExclusive: end.toISOString(),
  };
}

export function monthBoundsJST(year: number, month: number): { startIso: string; endIsoExclusive: string } {
  if (!isValidJstYearMonth(year, month)) {
    throw new RangeError(`Invalid JST year/month: ${year}-${month}`);
  }

  const start = new Date(`${year}-${pad(month)}-01T00:00:00${JST_OFFSET}`);
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const end = new Date(`${endYear}-${pad(endMonth)}-01T00:00:00${JST_OFFSET}`);
  return {
    startIso: start.toISOString(),
    endIsoExclusive: end.toISOString(),
  };
}
