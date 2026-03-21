import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

interface PluginInfo {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}

const pluginLabels: Record<string, { label: string; icon: string }> = {
  shift: { label: 'シフト調整', icon: '📅' },
  check: { label: 'チェックリスト', icon: '✅' },
};

export default function PluginSettingsPage() {
  const { selectedStore } = useAuth();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);

  const loadPlugins = async () => {
    if (!selectedStore) return;
    try {
      const data = await api.getPluginSettings(selectedStore.id);
      setPlugins(data.plugins);
    } catch {}
  };

  useEffect(() => { loadPlugins(); }, [selectedStore]);

  const togglePlugin = async (pluginName: string, enabled: boolean) => {
    if (!selectedStore) return;
    try {
      await api.togglePlugin(selectedStore.id, pluginName, enabled);
      setPlugins(prev => prev.map(p =>
        p.name === pluginName ? { ...p, enabled } : p
      ));
    } catch {}
  };

  return (
    <div className="main-content">
      <h3 style={{ marginBottom: 20 }}>プラグイン設定</h3>
      <p style={{ color: '#888', marginBottom: 24, fontSize: '0.9rem' }}>
        事業所で使用する機能を選択してください
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plugins.map(p => {
          const info = pluginLabels[p.name] || { label: p.name, icon: '🔌' };
          return (
            <div key={p.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', background: 'white', borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                  {info.icon} {info.label}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#888', marginTop: 4 }}>
                  {p.description} <span style={{ color: '#bbb' }}>v{p.version}</span>
                </div>
              </div>
              <label style={{ position: 'relative', width: 50, height: 28, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={e => togglePlugin(p.name, e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', inset: 0, borderRadius: 14,
                  background: p.enabled ? '#e94560' : '#ddd',
                  transition: 'background 0.2s',
                }} />
                <span style={{
                  position: 'absolute', top: 3, left: p.enabled ? 25 : 3,
                  width: 22, height: 22, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
