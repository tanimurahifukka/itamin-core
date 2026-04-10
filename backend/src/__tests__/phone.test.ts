import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../lib/phone';

describe('normalizePhone', () => {
  it('removes hyphens from Japanese mobile number', () => {
    expect(normalizePhone('080-1234-5678')).toBe('08012345678');
  });

  it('removes + and spaces from international format', () => {
    expect(normalizePhone('+81 80-1234-5678')).toBe('818012345678');
  });

  it('removes parentheses and spaces from landline format', () => {
    expect(normalizePhone('(03) 1234-5678')).toBe('0312345678');
  });

  it('returns null for empty string', () => {
    expect(normalizePhone('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(normalizePhone(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizePhone(undefined)).toBeNull();
  });

  it('returns null for string with no digits', () => {
    expect(normalizePhone('abc')).toBeNull();
  });
});
