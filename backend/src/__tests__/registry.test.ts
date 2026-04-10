import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginRegistry } from '../plugins/registry';
import type { Plugin } from '../types';
import type { Express } from 'express';

// Suppress console.log output during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

function makePlugin(name: string, overrides: Partial<Plugin> = {}): Plugin {
  return {
    name,
    version: '1.0.0',
    description: `${name} plugin`,
    label: name,
    icon: '🔧',
    defaultRoles: ['owner'],
    initialize: (_app: Express) => {},
    ...overrides,
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('registers a plugin successfully', () => {
    const plugin = makePlugin('test_plugin');
    registry.register(plugin);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].name).toBe('test_plugin');
  });

  it('throws an error when registering a duplicate plugin name', () => {
    const plugin = makePlugin('duplicate_plugin');
    registry.register(plugin);
    expect(() => registry.register(plugin)).toThrowError(
      'Plugin "duplicate_plugin" is already registered'
    );
  });

  it('returns all registered plugins via list()', () => {
    registry.register(makePlugin('alpha'));
    registry.register(makePlugin('beta'));
    registry.register(makePlugin('gamma'));

    const names = registry.list().map(p => p.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('gamma');
    expect(names).toHaveLength(3);
  });

  it('calls initialize on all plugins when initializeAll() is invoked', () => {
    const initA = vi.fn();
    const initB = vi.fn();

    registry.register(makePlugin('plugin_a', { initialize: initA }));
    registry.register(makePlugin('plugin_b', { initialize: initB }));

    const mockApp = {} as Express;
    registry.initializeAll(mockApp);

    expect(initA).toHaveBeenCalledOnce();
    expect(initA).toHaveBeenCalledWith(mockApp);
    expect(initB).toHaveBeenCalledOnce();
    expect(initB).toHaveBeenCalledWith(mockApp);
  });
});
