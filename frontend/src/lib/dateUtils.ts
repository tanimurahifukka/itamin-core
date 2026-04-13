/**
 * Returns today's date as a YYYY-MM-DD string in JST (Asia/Tokyo).
 * Use this instead of new Date().toISOString().split('T')[0] which returns UTC.
 */
export function todayJST(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

/**
 * Formats a Date object as YYYY-MM-DD using local date components.
 * Use this instead of d.toISOString().split('T')[0] which returns UTC date
 * and shifts back by 1 day in timezones ahead of UTC (e.g. JST).
 */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Add (or subtract) N days from a YYYY-MM-DD string, returning YYYY-MM-DD.
 * Parses as local time to avoid UTC date-shift issues.
 */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
