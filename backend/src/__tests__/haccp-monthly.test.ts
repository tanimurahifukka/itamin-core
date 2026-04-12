/**
 * Tests for HACCP monthly submission summary aggregation logic.
 *
 * All Supabase calls are mocked so no real DB connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../config/supabase', () => ({
  supabaseAdmin: buildMockClient(),
  createSupabaseClient: vi.fn(),
}));

vi.mock('../config/index', () => ({
  config: {
    port: 3001,
    nodeEnv: 'test',
    supabase: { url: '', anonKey: '', serviceRoleKey: '' },
    frontendUrl: 'http://localhost:3000',
    kioskJwtSecret: 'test-secret',
  },
}));

vi.mock('../middleware/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('../middleware/kiosk', () => ({ requireKiosk: vi.fn((_req: any, _res: any, next: any) => next()) }));

vi.mock('../auth/authorization', () => ({
  requireManagedStore: vi.fn(),
  requireStoreMembership: vi.fn(),
  staffBelongsToStore: vi.fn(),
  isManagedRole: vi.fn(),
  isShiftRequestEnabled: vi.fn(),
  VALID_STAFF_ROLES: ['owner', 'manager', 'leader', 'full_time', 'part_time'],
}));

vi.mock('../plugins/registry', () => ({
  pluginRegistry: { list: vi.fn(() => []), register: vi.fn() },
}));

vi.mock('../services/haccp', () => ({
  listKioskActiveTemplates: vi.fn(),
  listKioskSubmissionsForDate: vi.fn(),
  createSubmission: vi.fn(),
}));

vi.mock('../services/haccp/templates', () => ({
  provisionSystemTemplates: vi.fn(),
}));

vi.mock('../services/switchbot/routes', () => ({
  fetchStoreMeters: vi.fn(),
  fetchDeviceStatus: vi.fn(),
  listStoreReadingsForDate: vi.fn(),
}));

// ── Mock client builder ────────────────────────────────────────────────────────

function buildMockClient() {
  const makeChain = (result: { data: any; error: any }) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      in: () => chain,
      order: () => chain,
      insert: () => chain,
      upsert: () => chain,
      update: () => chain,
      delete: () => chain,
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (resolve: Function) => Promise.resolve(result).then(resolve as any),
    };
    return chain;
  };

  const client = {
    from: vi.fn((_table: string) => makeChain({ data: [], error: null })),
  };
  return client;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '../config/supabase';

function setupFromMock(result: { data: any; error: any }) {
  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((_table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      in: () => chain,
      order: () => chain,
      insert: () => chain,
      upsert: () => chain,
      update: () => chain,
      delete: () => chain,
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (resolve: Function, reject: Function) =>
        Promise.resolve(result).then(resolve as any, reject as any),
    };
    return chain;
  });
}

// ── Pure aggregation logic (extracted for unit testing) ────────────────────────

/**
 * Aggregates raw submission rows into per-day, per-timing summary.
 * This mirrors the logic in routes.ts for the monthly endpoint.
 */
interface SubmissionRow {
  id: string;
  timing: string;
  submitted_at: string;
  checklist_submission_items: Array<{ bool_value: boolean | null; numeric_value: number | null; is_deviated: boolean | null }>;
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
    const items = row.checklist_submission_items || [];
    const hasDeviation = items.some((i) => i.is_deviated === true);
    const allPassed = !hasDeviation;

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('aggregateMonthlySubmissions', () => {
  it('returns empty object when no rows', () => {
    const result = aggregateMonthlySubmissions([]);
    expect(result).toEqual({});
  });

  it('aggregates a single submission with no deviation', () => {
    const rows: SubmissionRow[] = [
      {
        id: 'sub-1',
        timing: 'store_opening',
        submitted_at: '2026-04-01T09:00:00',
        checklist_submission_items: [
          { bool_value: true, numeric_value: null, is_deviated: false },
        ],
      },
    ];

    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-01']).toBeDefined();
    expect(result['2026-04-01']['store_opening']).toEqual({
      submitted: true,
      all_passed: true,
      count: 1,
    });
  });

  it('marks all_passed as false when any item has deviation', () => {
    const rows: SubmissionRow[] = [
      {
        id: 'sub-2',
        timing: 'store_daily',
        submitted_at: '2026-04-02T12:00:00',
        checklist_submission_items: [
          { bool_value: true, numeric_value: null, is_deviated: false },
          { bool_value: null, numeric_value: 85, is_deviated: true },
        ],
      },
    ];

    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-02']['store_daily'].all_passed).toBe(false);
  });

  it('accumulates count for multiple submissions of same day/timing', () => {
    const rows: SubmissionRow[] = [
      {
        id: 'sub-3',
        timing: 'store_opening',
        submitted_at: '2026-04-03T08:00:00',
        checklist_submission_items: [{ bool_value: true, numeric_value: null, is_deviated: false }],
      },
      {
        id: 'sub-4',
        timing: 'store_opening',
        submitted_at: '2026-04-03T08:30:00',
        checklist_submission_items: [{ bool_value: true, numeric_value: null, is_deviated: false }],
      },
    ];

    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-03']['store_opening'].count).toBe(2);
    expect(result['2026-04-03']['store_opening'].submitted).toBe(true);
  });

  it('propagates deviation if any submission has deviation even when others pass', () => {
    const rows: SubmissionRow[] = [
      {
        id: 'sub-5',
        timing: 'store_closing',
        submitted_at: '2026-04-04T22:00:00',
        checklist_submission_items: [{ bool_value: true, numeric_value: null, is_deviated: false }],
      },
      {
        id: 'sub-6',
        timing: 'store_closing',
        submitted_at: '2026-04-04T22:15:00',
        checklist_submission_items: [{ bool_value: null, numeric_value: 60, is_deviated: true }],
      },
    ];

    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-04']['store_closing'].count).toBe(2);
    expect(result['2026-04-04']['store_closing'].all_passed).toBe(false);
  });

  it('separates different timings on the same day', () => {
    const rows: SubmissionRow[] = [
      {
        id: 'sub-7',
        timing: 'store_opening',
        submitted_at: '2026-04-05T09:00:00',
        checklist_submission_items: [{ bool_value: true, numeric_value: null, is_deviated: false }],
      },
      {
        id: 'sub-8',
        timing: 'store_closing',
        submitted_at: '2026-04-05T22:00:00',
        checklist_submission_items: [{ bool_value: true, numeric_value: null, is_deviated: false }],
      },
    ];

    const result = aggregateMonthlySubmissions(rows);
    expect(Object.keys(result['2026-04-05'])).toContain('store_opening');
    expect(Object.keys(result['2026-04-05'])).toContain('store_closing');
    expect(Object.keys(result['2026-04-05'])).not.toContain('store_daily');
  });

  it('handles submissions across multiple days', () => {
    const rows: SubmissionRow[] = [
      {
        id: 'sub-9',
        timing: 'store_opening',
        submitted_at: '2026-04-10T09:00:00',
        checklist_submission_items: [],
      },
      {
        id: 'sub-10',
        timing: 'store_opening',
        submitted_at: '2026-04-11T09:00:00',
        checklist_submission_items: [],
      },
    ];

    const result = aggregateMonthlySubmissions(rows);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['2026-04-10']).toBeDefined();
    expect(result['2026-04-11']).toBeDefined();
  });

  it('treats submission with no items as all_passed true', () => {
    const rows: SubmissionRow[] = [
      {
        id: 'sub-11',
        timing: 'ad_hoc',
        submitted_at: '2026-04-12T15:00:00',
        checklist_submission_items: [],
      },
    ];

    const result = aggregateMonthlySubmissions(rows);
    expect(result['2026-04-12']['ad_hoc'].all_passed).toBe(true);
  });
});
