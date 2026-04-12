import { describe, it, expect, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../config/supabase', () => ({
  supabaseAdmin: {},
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

vi.mock('../middleware/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('../auth/authorization', () => ({
  requireManagedStore: vi.fn(),
  requireStoreMembership: vi.fn(),
  staffBelongsToStore: vi.fn(),
  isManagedRole: vi.fn(),
  isShiftRequestEnabled: vi.fn(),
  requireOrgManager: vi.fn(),
  getOrgStoreIds: vi.fn(() => []),
  VALID_STAFF_ROLES: ['owner', 'manager', 'leader', 'full_time', 'part_time'],
}));

vi.mock('../plugins/registry', () => ({
  pluginRegistry: { list: vi.fn(() => []), register: vi.fn() },
}));

import { shiftMultiPlugin, hasTimeOverlap } from '../plugins/shift_multi';

describe('shiftMultiPlugin', () => {
  it('exports a valid Plugin interface', () => {
    expect(shiftMultiPlugin.name).toBe('shift_multi');
    expect(shiftMultiPlugin.version).toBe('0.1.0');
    expect(shiftMultiPlugin.label).toBe('マルチ店舗シフト');
    expect(shiftMultiPlugin.icon).toBe('🏢');
    expect(shiftMultiPlugin.defaultRoles).toEqual(['owner', 'manager']);
    expect(typeof shiftMultiPlugin.initialize).toBe('function');
  });

  it('is not a core plugin', () => {
    expect(shiftMultiPlugin.core).toBeFalsy();
  });
});

describe('hasTimeOverlap', () => {
  it('detects overlap when shifts overlap partially', () => {
    expect(hasTimeOverlap(
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '12:00', endTime: '17:00' },
    )).toBe(true);
  });

  it('detects overlap when one shift contains another', () => {
    expect(hasTimeOverlap(
      { startTime: '08:00', endTime: '18:00' },
      { startTime: '10:00', endTime: '14:00' },
    )).toBe(true);
  });

  it('detects overlap when shifts are identical', () => {
    expect(hasTimeOverlap(
      { startTime: '09:00', endTime: '17:00' },
      { startTime: '09:00', endTime: '17:00' },
    )).toBe(true);
  });

  it('returns false when shifts are sequential (no gap)', () => {
    expect(hasTimeOverlap(
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '13:00', endTime: '17:00' },
    )).toBe(false);
  });

  it('returns false when shifts do not overlap', () => {
    expect(hasTimeOverlap(
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '18:00' },
    )).toBe(false);
  });

  it('returns false for morning/afternoon at different stores', () => {
    expect(hasTimeOverlap(
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '14:00', endTime: '22:00' },
    )).toBe(false);
  });
});
