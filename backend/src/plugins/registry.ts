import type { Express } from 'express';
import type { Plugin } from '../types';

class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
    console.log(`[Plugin] Registered: ${plugin.name} v${plugin.version}`);
  }

  initializeAll(app: Express): void {
    for (const [name, plugin] of this.plugins) {
      plugin.initialize(app);
      console.log(`[Plugin] Initialized: ${name}`);
    }
  }

  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}

export const pluginRegistry = new PluginRegistry();
