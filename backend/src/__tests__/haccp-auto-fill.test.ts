import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabaseAdmin をテスト毎に差し替えるため、モジュールレベル mock を用意する。
// 実装側は `from('table').select().eq().eq()...` のチェーンと
// `.insert(...).select().single()` の両系統を使うので、
// 1 つの「チェーナー関数」で両方に答えられるようにする。

type QueryResult<T = unknown> = { data: T | null; error: unknown };

interface Chainable {
  select: (...args: unknown[]) => Chainable;
  insert: (...args: unknown[]) => Chainable;
  eq: (col: string, val: unknown) => Chainable;
  single: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
  then: (onFulfilled: (v: QueryResult) => unknown) => Promise<unknown>;
}

interface FromHandler {
  (builder: {
    select?: unknown[];
    insert?: unknown[];
    filters?: Array<[string, unknown]>;
  }): QueryResult;
}

function makeClient(handlers: Record<string, FromHandler>) {
  function makeChain(table: string): Chainable {
    const state: { select?: unknown[]; insert?: unknown[]; filters: Array<[string, unknown]> } = { filters: [] };
    const chain: Chainable = {
      select: (...args) => { state.select = args; return chain; },
      insert: (...args) => { state.insert = args; return chain; },
      eq: (col, val) => { state.filters.push([col, val]); return chain; },
      single: async () => handlers[table]?.(state) ?? { data: null, error: null },
      maybeSingle: async () => handlers[table]?.(state) ?? { data: null, error: null },
      then: (onFulfilled) => Promise.resolve(handlers[table]?.(state) ?? { data: null, error: null }).then(onFulfilled),
    };
    return chain;
  }
  return { from: (table: string) => makeChain(table) };
}

vi.mock('../config/supabase', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

import { autoFillFromSwitchBot } from '../services/haccp/auto-fill';
import { supabaseAdmin } from '../config/supabase';

describe('autoFillFromSwitchBot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero when no template item is linked to the device', async () => {
    const client = makeClient({
      checklist_template_items: () => ({ data: [], error: null }),
    });
    (supabaseAdmin.from as any).mockImplementation(client.from);

    const result = await autoFillFromSwitchBot('store-1', 'SB-ABC', {
      value: 5,
      unit: '°C',
      recordedAt: '2026-04-11T10:00:00Z',
    });

    expect(result).toEqual({ matched: 0, measurements: 0, deviations: 0 });
  });

  it('inserts a measurement when a numeric item matches within threshold', async () => {
    const measurementInserts: unknown[] = [];
    const deviationInserts: unknown[] = [];

    const client = makeClient({
      checklist_template_items: () => ({
        data: [{
          id: 'item-1',
          item_key: 'fridge_temp',
          item_type: 'numeric',
          min_value: 0,
          max_value: 10,
          is_ccp: false,
          deviation_action: null,
          required: true,
        }],
        error: null,
      }),
      checklist_measurements: (state) => {
        if (state.insert) {
          measurementInserts.push(state.insert[0]);
          return { data: { id: 'meas-1' }, error: null };
        }
        // dup check returns no existing row
        return { data: null, error: null };
      },
      checklist_deviations: (state) => {
        if (state.insert) deviationInserts.push(state.insert[0]);
        return { data: null, error: null };
      },
    });
    (supabaseAdmin.from as any).mockImplementation(client.from);

    const result = await autoFillFromSwitchBot('store-1', 'SB-ABC', {
      value: 5,
      unit: '°C',
      recordedAt: '2026-04-11T10:00:00Z',
    });

    expect(result.matched).toBe(1);
    expect(result.measurements).toBe(1);
    expect(result.deviations).toBe(0);
    expect(measurementInserts).toHaveLength(1);
    const m = measurementInserts[0] as any;
    expect(m.numeric_value).toBe(5);
    expect(m.passed).toBe(true);
    expect(m.source).toBe('sensor');
  });

  it('auto-creates a ccp deviation when threshold is exceeded', async () => {
    const deviationInserts: unknown[] = [];

    const client = makeClient({
      checklist_template_items: () => ({
        data: [{
          id: 'item-2',
          item_key: 'freezer_temp',
          item_type: 'numeric',
          min_value: -25,
          max_value: -15,
          is_ccp: true,
          deviation_action: '冷凍庫を確認する',
          required: true,
        }],
        error: null,
      }),
      checklist_measurements: (state) => {
        if (state.insert) return { data: { id: 'meas-2' }, error: null };
        return { data: null, error: null };
      },
      checklist_deviations: (state) => {
        if (state.insert) deviationInserts.push(state.insert[0]);
        return { data: null, error: null };
      },
    });
    (supabaseAdmin.from as any).mockImplementation(client.from);

    const result = await autoFillFromSwitchBot('store-1', 'SB-XYZ', {
      value: -5, // too warm
      unit: '°C',
      recordedAt: '2026-04-11T11:00:00Z',
    });

    expect(result.measurements).toBe(1);
    expect(result.deviations).toBe(1);
    expect(deviationInserts).toHaveLength(1);
    const d = deviationInserts[0] as any;
    expect(d.severity).toBe('ccp');
    expect(d.status).toBe('open');
    expect(d.detected_value).toBe('-5');
  });

  it('skips non-numeric items', async () => {
    const client = makeClient({
      checklist_template_items: () => ({
        data: [{
          id: 'item-3',
          item_key: 'cleaning_check',
          item_type: 'checkbox',
          min_value: null,
          max_value: null,
          is_ccp: false,
          deviation_action: null,
          required: true,
        }],
        error: null,
      }),
    });
    (supabaseAdmin.from as any).mockImplementation(client.from);

    const result = await autoFillFromSwitchBot('store-1', 'SB-ABC', {
      value: 1,
      unit: '',
      recordedAt: '2026-04-11T12:00:00Z',
    });

    expect(result.matched).toBe(1);
    expect(result.measurements).toBe(0);
    expect(result.deviations).toBe(0);
  });
});
