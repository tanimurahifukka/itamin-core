import { describe, it, expect, vi } from 'vitest';
import type { Plugin } from '../types';

// Mock Supabase and config to avoid requiring real env vars during import
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

// Mock auth middleware to prevent side effects on import
vi.mock('../middleware/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('../auth/authorization', () => ({
  requireManagedStore: vi.fn(),
  requireStoreMembership: vi.fn(),
  staffBelongsToStore: vi.fn(),
  isManagedRole: vi.fn(),
  isShiftRequestEnabled: vi.fn(),
  VALID_STAFF_ROLES: ['owner', 'manager', 'leader', 'full_time', 'part_time'],
}));

// Mock pluginRegistry to avoid circular dependency issues
vi.mock('../plugins/registry', () => ({
  pluginRegistry: { list: vi.fn(() => []), register: vi.fn() },
  PluginRegistry: class {
    private plugins = new Map();
    register(p: Plugin) { this.plugins.set(p.name, p); }
    list() { return Array.from(this.plugins.values()); }
    initializeAll() {}
  },
}));

// Import all plugins
import { attendancePlugin } from '../plugins/attendance_plugin';
import { haccpPlugin } from '../plugins/haccp';
import { consecutiveWorkPlugin } from '../plugins/consecutive_work';
import { dailyReportPlugin } from '../plugins/daily_report';
import { expensePlugin } from '../plugins/expense';
import { feedbackPlugin } from '../plugins/feedback';
import { inventoryPlugin } from '../plugins/inventory';
import { kioskPlugin } from '../plugins/kiosk';
import { lineAttendancePlugin } from '../plugins/line_attendance';
import { attendanceAdminPlugin } from '../plugins/attendance_admin';
import { menuPlugin } from '../plugins/menu';
import { noticePlugin } from '../plugins/notice';
import { overtimeAlertPlugin } from '../plugins/overtime_alert';
import { paidLeavePlugin } from '../plugins/paid_leave';
import { punchPlugin } from '../plugins/punch';
import { salesCapturePlugin } from '../plugins/sales_capture';
import { settingsPlugin } from '../plugins/settings_plugin';
import { shiftPlugin } from '../plugins/shift';
import { shiftRequestPlugin } from '../plugins/shift_request';
import { staffPlugin } from '../plugins/staff';
import { switchbotPlugin } from '../plugins/switchbot';

const ALL_PLUGINS: Plugin[] = [
  attendancePlugin,
  haccpPlugin,
  consecutiveWorkPlugin,
  dailyReportPlugin,
  expensePlugin,
  feedbackPlugin,
  inventoryPlugin,
  kioskPlugin,
  lineAttendancePlugin,
  attendanceAdminPlugin,
  menuPlugin,
  noticePlugin,
  overtimeAlertPlugin,
  paidLeavePlugin,
  punchPlugin,
  salesCapturePlugin,
  settingsPlugin,
  shiftPlugin,
  shiftRequestPlugin,
  staffPlugin,
  switchbotPlugin,
];

const REQUIRED_FIELDS: (keyof Plugin)[] = [
  'name',
  'version',
  'description',
  'label',
  'icon',
  'defaultRoles',
  'initialize',
];

describe('Plugin interface compliance', () => {
  it.each(ALL_PLUGINS)('$name satisfies the Plugin interface', (plugin) => {
    for (const field of REQUIRED_FIELDS) {
      expect(plugin).toHaveProperty(field);
      expect(plugin[field]).toBeDefined();
    }
  });

  it('all plugin names are unique', () => {
    const names = ALL_PLUGINS.map(p => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('core plugins have core: true', () => {
    const corePlugins = ALL_PLUGINS.filter(p => p.core);
    const coreNames = corePlugins.map(p => p.name);
    // At minimum, 'punch', 'attendance', and 'settings' must be core
    expect(coreNames).toContain('punch');
    expect(coreNames).toContain('attendance');
    expect(coreNames).toContain('settings');
  });

  it('non-core plugins do not have core: true', () => {
    const nonCorePlugins = ALL_PLUGINS.filter(p => !p.core);
    for (const plugin of nonCorePlugins) {
      expect(plugin.core).not.toBe(true);
    }
  });

  it('line_attendance and attendance_admin are defaultEnabled', () => {
    // スタッフの出勤画面 (AttendanceStaffPage) と
    // 管理者の今日の出勤ボード (AttendanceAdminPage) は
    // store_plugins 未登録のときも既定で有効化されている必要がある
    expect(lineAttendancePlugin.defaultEnabled).toBe(true);
    expect(attendanceAdminPlugin.defaultEnabled).toBe(true);
  });

  it('each plugin has at least one defaultRole', () => {
    for (const plugin of ALL_PLUGINS) {
      expect(Array.isArray(plugin.defaultRoles)).toBe(true);
      expect(plugin.defaultRoles.length).toBeGreaterThan(0);
    }
  });

  it('settingsSchema fields have key, label, and type when present', () => {
    const pluginsWithSchema = ALL_PLUGINS.filter(p => p.settingsSchema && p.settingsSchema.length > 0);
    expect(pluginsWithSchema.length).toBeGreaterThan(0); // at least one plugin has a schema

    for (const plugin of pluginsWithSchema) {
      for (const field of plugin.settingsSchema!) {
        expect(field).toHaveProperty('key');
        expect(field).toHaveProperty('label');
        expect(field).toHaveProperty('type');
        expect(typeof field.key).toBe('string');
        expect(typeof field.label).toBe('string');
        expect(typeof field.type).toBe('string');
      }
    }
  });
});
