/**
 * Tests for HACCP system template auto-provisioning.
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SYSTEM_TEMPLATES = [
  {
    id: '11000001-0000-0000-0000-000000000001',
    business_type: 'cafe',
    name: '出勤前健康・衛生確認',
    timing: 'clock_in',
    scope: 'personal',
    layer: 'base',
    description: 'スタッフ出勤時の健康・衛生チェック',
    sort_order: 1,
    is_active: true,
  },
  {
    id: '11000001-0000-0000-0000-000000000002',
    business_type: 'cafe',
    name: '退勤前清掃・記録確認',
    timing: 'clock_out',
    scope: 'personal',
    layer: 'base',
    description: 'スタッフ退勤前の清掃・記録確認',
    sort_order: 2,
    is_active: true,
  },
];

const SYSTEM_ITEMS = [
  {
    system_template_id: '11000001-0000-0000-0000-000000000001',
    item_key: 'health_check',
    label: '体調確認',
    item_type: 'checkbox',
    required: true,
    min_value: null,
    max_value: null,
    unit: null,
    options: {},
    is_ccp: false,
    tracking_mode: 'submission_only',
    frequency_per_day: null,
    frequency_interval_minutes: null,
    deviation_action: null,
    sort_order: 1,
  },
  {
    system_template_id: '11000001-0000-0000-0000-000000000002',
    item_key: 'equipment_clean',
    label: '機器洗浄確認',
    item_type: 'checkbox',
    required: true,
    min_value: null,
    max_value: null,
    unit: null,
    options: {},
    is_ccp: false,
    tracking_mode: 'submission_only',
    frequency_per_day: null,
    frequency_interval_minutes: null,
    deviation_action: null,
    sort_order: 1,
  },
];

// ── Mock client builder ────────────────────────────────────────────────────────

/**
 * Returns a chainable Supabase-like mock.
 * Individual tests can override specific table+method behaviour via
 * `mockFromImpl`.
 */
function buildMockClient() {
  // A simple, chainable query builder stub
  const makeChain = (result: { data: any; error: any }) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
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
    // Make the chain itself thenable
    return chain;
  };

  const client = {
    from: vi.fn((_table: string) => makeChain({ data: [], error: null })),
  };
  return client;
}

// ── Import after mocks ────────────────────────────────────────────────────────

import { provisionSystemTemplates } from '../services/haccp/templates';
import { supabaseAdmin } from '../config/supabase';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Configure `supabaseAdmin.from` to return different values per call.
 * Call sequence:
 *   1st  → checklist_system_templates (list)
 *   2nd  → checklist_system_template_items (list)
 *   3rd  → checklist_templates (existing, select system_template_id)
 *   4th+ → checklist_templates (insert) + checklist_template_items (insert)
 */
function setupFromMock(responses: { data: any; error: any }[]) {
  let callIndex = 0;

  (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((_table: string) => {
    const result = responses[callIndex] ?? { data: null, error: null };
    callIndex++;

    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      insert: () => chain,
      upsert: () => chain,
      update: () => chain,
      delete: () => chain,
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      // Make chain thenable (awaiting the chain itself)
      then: (resolve: Function, reject: Function) =>
        Promise.resolve(result).then(resolve as any, reject as any),
    };
    return chain;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('provisionSystemTemplates', () => {
  it('provisions all system templates for an empty store and returns the count', async () => {
    // Per-call responses in order:
    // 1. system templates fetch  → 2 templates
    // 2. system items fetch      → 2 items
    // 3. existing templates      → none (empty store)
    // 4. insert template #1      → success
    // 5. insert items for #1     → success
    // 6. insert template #2      → success
    // 7. insert items for #2     → success
    setupFromMock([
      { data: SYSTEM_TEMPLATES, error: null },
      { data: SYSTEM_ITEMS, error: null },
      { data: [], error: null },
      { data: { id: 'new-tpl-1', ...SYSTEM_TEMPLATES[0] }, error: null },
      { data: [], error: null },
      { data: { id: 'new-tpl-2', ...SYSTEM_TEMPLATES[1] }, error: null },
      { data: [], error: null },
    ]);

    const count = await provisionSystemTemplates('store-uuid', 'cafe', 'user-uuid');
    expect(count).toBe(2);
  });

  it('is idempotent: skips already-provisioned templates on second call', async () => {
    // Existing templates already has both system_template_ids
    const existingRows = [
      { system_template_id: '11000001-0000-0000-0000-000000000001' },
      { system_template_id: '11000001-0000-0000-0000-000000000002' },
    ];

    setupFromMock([
      { data: SYSTEM_TEMPLATES, error: null },
      { data: SYSTEM_ITEMS, error: null },
      { data: existingRows, error: null },
      // No further insert calls should happen
    ]);

    const count = await provisionSystemTemplates('store-uuid', 'cafe', 'user-uuid');
    expect(count).toBe(0);
  });

  it('provisions only missing templates when some are already present', async () => {
    // First template already provisioned, second is missing
    const existingRows = [
      { system_template_id: '11000001-0000-0000-0000-000000000001' },
    ];

    setupFromMock([
      { data: SYSTEM_TEMPLATES, error: null },
      { data: SYSTEM_ITEMS, error: null },
      { data: existingRows, error: null },
      // Insert only template #2
      { data: { id: 'new-tpl-2', ...SYSTEM_TEMPLATES[1] }, error: null },
      { data: [], error: null }, // items insert
    ]);

    const count = await provisionSystemTemplates('store-uuid', 'cafe', 'user-uuid');
    expect(count).toBe(1);
  });

  it('returns 0 when no system templates exist for the category', async () => {
    setupFromMock([
      { data: [], error: null }, // no system templates
    ]);

    const count = await provisionSystemTemplates('store-uuid', 'cafe');
    expect(count).toBe(0);
  });

  it('throws when fetching system templates fails', async () => {
    setupFromMock([
      { data: null, error: { message: 'DB connection error' } },
    ]);

    await expect(provisionSystemTemplates('store-uuid', 'cafe')).rejects.toThrow(
      'Failed to fetch system templates',
    );
  });

  it('works without a userId (kiosk-triggered call)', async () => {
    setupFromMock([
      { data: [SYSTEM_TEMPLATES[0]], error: null },
      { data: [SYSTEM_ITEMS[0]], error: null },
      { data: [], error: null },
      { data: { id: 'new-tpl-1', ...SYSTEM_TEMPLATES[0] }, error: null },
      { data: [], error: null },
    ]);

    // userId omitted → should not throw
    const count = await provisionSystemTemplates('store-uuid', 'cafe');
    expect(count).toBe(1);
  });
});
