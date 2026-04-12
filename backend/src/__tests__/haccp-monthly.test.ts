/**
 * Tests for HACCP monthly submission summary aggregation logic.
 *
 * Uses all_passed / has_deviation from checklist_submissions directly
 * (no items JOIN needed).
 */

import { describe, it, expect } from 'vitest';

// ── Pure aggregation logic (mirrors routes.ts monthly endpoint) ──────────────

interface SubmissionRow {
  id: string;
  timing: string;
  submitted_at: string;
  all_passed: boolean;
  has_deviation: boolean;
}

interface TimingInfo {
  submitted: boolean;
  all_passed?: boolean;
  count?: number;
}

function aggregateMonthlySubmissions(rows: SubmissionRow[]): Record<string, Record<string, TimingInfo>> {
  const days: Record<string, Record<string, TimingInfo>> = {};

  for (const row of rows) {
    const dateKey = row.submitted_at.split('T')[0];
    if (!days[dateKey]) days[dateKey] = {};

    const timing = row.timing;
    const allPassed = row.all_passed === true && row.has_deviation !== true;

    if (!days[dateKey][timing]) {
      days[dateKey][timing] = { submitted: true, all_passed: allPassed, count: 1 };
    } else {
      const existing = days[dateKey][timing];
      existing.count = (existing.count || 1) + 1;
      existing.all_passed = existing.all_passed && allPassed;
    }
  }

  return days;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('aggregateMonthlySubmissions', () => {
  it('returns empty object when no rows', () => {
    expect(aggregateMonthlySubmissions([])).toEqual({});
  });

  it('aggregates a single submission with all_passed', () => {
    const rows: SubmissionRow[] = [
      { id: 'sub-1', timing: 'store_opening', submitted_at: '2026-04-01T09:00:00', all_passed: true, has_deviation: false },
    ];
    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-01']['store_opening']).toEqual({ submitted: true, all_passed: true, count: 1 });
  });

  it('marks all_passed as false when has_deviation is true', () => {
    const rows: SubmissionRow[] = [
      { id: 'sub-2', timing: 'store_daily', submitted_at: '2026-04-02T12:00:00', all_passed: false, has_deviation: true },
    ];
    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-02']['store_daily'].all_passed).toBe(false);
  });

  it('marks all_passed as false when all_passed=false even without deviation', () => {
    const rows: SubmissionRow[] = [
      { id: 'sub-x', timing: 'store_opening', submitted_at: '2026-04-06T09:00:00', all_passed: false, has_deviation: false },
    ];
    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-06']['store_opening'].all_passed).toBe(false);
  });

  it('accumulates count for multiple submissions of same day/timing', () => {
    const rows: SubmissionRow[] = [
      { id: 'sub-3', timing: 'store_opening', submitted_at: '2026-04-03T08:00:00', all_passed: true, has_deviation: false },
      { id: 'sub-4', timing: 'store_opening', submitted_at: '2026-04-03T08:30:00', all_passed: true, has_deviation: false },
    ];
    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-03']['store_opening'].count).toBe(2);
    expect(result['2026-04-03']['store_opening'].all_passed).toBe(true);
  });

  it('propagates deviation if any submission has deviation', () => {
    const rows: SubmissionRow[] = [
      { id: 'sub-5', timing: 'store_closing', submitted_at: '2026-04-04T22:00:00', all_passed: true, has_deviation: false },
      { id: 'sub-6', timing: 'store_closing', submitted_at: '2026-04-04T22:15:00', all_passed: false, has_deviation: true },
    ];
    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-04']['store_closing'].count).toBe(2);
    expect(result['2026-04-04']['store_closing'].all_passed).toBe(false);
  });

  it('separates different timings on the same day', () => {
    const rows: SubmissionRow[] = [
      { id: 'sub-7', timing: 'store_opening', submitted_at: '2026-04-05T09:00:00', all_passed: true, has_deviation: false },
      { id: 'sub-8', timing: 'store_closing', submitted_at: '2026-04-05T22:00:00', all_passed: true, has_deviation: false },
    ];
    const result = aggregateMonthlySubmissions(rows);
    expect(Object.keys(result['2026-04-05'])).toContain('store_opening');
    expect(Object.keys(result['2026-04-05'])).toContain('store_closing');
    expect(Object.keys(result['2026-04-05'])).not.toContain('store_daily');
  });

  it('handles submissions across multiple days', () => {
    const rows: SubmissionRow[] = [
      { id: 'sub-9', timing: 'store_opening', submitted_at: '2026-04-10T09:00:00', all_passed: true, has_deviation: false },
      { id: 'sub-10', timing: 'store_opening', submitted_at: '2026-04-11T09:00:00', all_passed: true, has_deviation: false },
    ];
    const result = aggregateMonthlySubmissions(rows);
    expect(Object.keys(result)).toHaveLength(2);
  });
});
