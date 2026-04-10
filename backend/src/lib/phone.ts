/**
 * 電話番号を正規化する。
 * 数字以外の文字（ハイフン、括弧、スペース、+等）をすべて除去し、数字のみの文字列を返す。
 *
 * @example
 * normalizePhone("080-1234-5678")    // => "08012345678"
 * normalizePhone("+81 80-1234-5678") // => "818012345678"
 * normalizePhone("(03) 1234-5678")   // => "0312345678"
 * normalizePhone("")                 // => null
 * normalizePhone(null)               // => null
 * normalizePhone(undefined)          // => null
 * normalizePhone("abc")              // => null
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = phone.replace(/\D/g, '');
  return normalized.length > 0 ? normalized : null;
}
