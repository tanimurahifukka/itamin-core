import { describe, it, expect } from 'vitest';
import type { StaffRole, Plugin, PluginSettingField } from '../types';

// All valid StaffRole values defined in types/index.ts
const VALID_STAFF_ROLES: StaffRole[] = [
  'owner',
  'manager',
  'leader',
  'full_time',
  'part_time',
];

describe('StaffRole', () => {
  it('has exactly 5 valid role values', () => {
    expect(VALID_STAFF_ROLES).toHaveLength(5);
  });

  it.each(VALID_STAFF_ROLES)('"%s" is a valid StaffRole', (role) => {
    // Type-level check: if this compiles, the value is assignable to StaffRole
    const r: StaffRole = role;
    expect(typeof r).toBe('string');
  });

  it('contains the expected role strings', () => {
    expect(VALID_STAFF_ROLES).toContain('owner');
    expect(VALID_STAFF_ROLES).toContain('manager');
    expect(VALID_STAFF_ROLES).toContain('leader');
    expect(VALID_STAFF_ROLES).toContain('full_time');
    expect(VALID_STAFF_ROLES).toContain('part_time');
  });
});

describe('Plugin interface required fields', () => {
  it('a minimal valid Plugin object satisfies the interface', () => {
    const plugin: Plugin = {
      name: 'test',
      version: '1.0.0',
      description: 'A test plugin',
      label: 'Test',
      icon: '🔧',
      defaultRoles: ['owner'],
      initialize: () => {},
    };

    expect(plugin.name).toBe('test');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.description).toBe('A test plugin');
    expect(plugin.label).toBe('Test');
    expect(plugin.icon).toBe('🔧');
    expect(plugin.defaultRoles).toEqual(['owner']);
    expect(typeof plugin.initialize).toBe('function');
  });

  it('Plugin.core is optional and defaults to undefined', () => {
    const plugin: Plugin = {
      name: 'non-core',
      version: '1.0.0',
      description: 'Non-core plugin',
      label: 'Non-core',
      icon: '📦',
      defaultRoles: ['manager'],
      initialize: () => {},
    };
    expect(plugin.core).toBeUndefined();
  });

  it('Plugin.settingsSchema is optional', () => {
    const pluginWithoutSchema: Plugin = {
      name: 'no-schema',
      version: '1.0.0',
      description: 'Plugin without schema',
      label: 'No Schema',
      icon: '📦',
      defaultRoles: ['owner'],
      initialize: () => {},
    };
    expect(pluginWithoutSchema.settingsSchema).toBeUndefined();
  });

  it('PluginSettingField requires key, label, and type', () => {
    const field: PluginSettingField = {
      key: 'my_setting',
      label: 'My Setting',
      type: 'text',
    };
    expect(field.key).toBe('my_setting');
    expect(field.label).toBe('My Setting');
    expect(field.type).toBe('text');
  });

  it('PluginSettingField supports all valid type values', () => {
    const validTypes: PluginSettingField['type'][] = [
      'text',
      'textarea',
      'number',
      'boolean',
      'select',
      'password',
    ];
    expect(validTypes).toHaveLength(6);
    for (const type of validTypes) {
      const field: PluginSettingField = { key: 'k', label: 'L', type };
      expect(field.type).toBe(type);
    }
  });
});
