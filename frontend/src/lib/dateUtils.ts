/**
 * Returns today's date as a YYYY-MM-DD string in JST (Asia/Tokyo).
 * Use this instead of new Date().toISOString().split('T')[0] which returns UTC.
 */
export function todayJST(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}
