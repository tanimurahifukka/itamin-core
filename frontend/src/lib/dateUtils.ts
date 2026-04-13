const ITAMIN_TIMEZONE = 'Asia/Tokyo';
const JST_OFFSET = '+09:00';

/**
 * Returns today's date as a YYYY-MM-DD string in JST (Asia/Tokyo).
 * Use this instead of new Date().toISOString().split('T')[0] which returns UTC.
 */
export function todayJST(now: Date = new Date()): string {
  return formatDateJST(now);
}

export function formatDateJST(date: Date | string): string {
  const value = date instanceof Date ? date : new Date(date);
  return value.toLocaleDateString('sv-SE', { timeZone: ITAMIN_TIMEZONE });
}

export function currentJstYearMonth(now: Date = new Date()): { year: number; month: number } {
  const [year, month] = todayJST(now).split('-').map(Number);
  return { year, month };
}

export function formatTimeJST(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ITAMIN_TIMEZONE,
  });
}

export function formatShortDateJST(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: ITAMIN_TIMEZONE,
  });
}

export function isoToJstDateTimeLocalValue(iso: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ITAMIN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(new Date(iso));
  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
}

export function jstDateTimeLocalValueToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('日時の形式が不正です');
  }

  return new Date(`${value}:00${JST_OFFSET}`).toISOString();
}
