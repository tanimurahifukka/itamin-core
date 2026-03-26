import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

interface SettingField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select';
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  description?: string;
}

interface PluginInfo {
  name: string;
  version: string;
  description: string;
  label: string;
  icon: string;
  core: boolean;
  enabled: boolean;
  config: Record<string, any>;
  settingsSchema: SettingField[];
  defaultRoles: string[];
  allowedRoles: string[];
  displayOrder: number;
}

const ALL_ROLES = [
  { value: 'owner', label: 'オーナー' },
  { value: 'manager', label: 'マネージャー' },
  { value: 'full_time', label: '正社員' },
  { value: 'part_time', label: 'アルバイト' },
];

export default function PluginSettingsPage() {
  const { selectedStore } = useAuth();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [localConfigs, setLocalConfigs] = useState<Record<string, Record<string, any>>>({});
  const [localPerms, setLocalPerms] = useState<Record<string, string[]>>({});
  const [savingConfig, setSavingConfig] = useState<string | null>(null);
  const [configMsg, setConfigMsg] = useState<Record<string, string>>({});

  const loadPlugins = async () => {
    if (!selectedStore) return;
    try {
      const data = await api.getPluginSettings(selectedStore.id);
      setPlugins(data.plugins);
      const configs: Record<string, Record<string, any>> = {};
      const perms: Record<string, string[]> = {};
      for (const p of data.plugins) {
        configs[p.name] = { ...p.config };
        perms[p.name] = [...p.allowedRoles];
      }
      setLocalConfigs(configs);
      setLocalPerms(perms);
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
      window.dispatchEvent(new Event('plugins-updated'));
      await loadPlugins();
    } catch {}
  };

  const updateLocalConfig = (pluginName: string, key: string, value: any) => {
    setLocalConfigs(prev => ({
      ...prev,
      [pluginName]: { ...prev[pluginName], [key]: value },
    }));
  };

  const toggleRole = (pluginName: string, role: string) => {
    if (pluginName === 'punch' && role === 'owner') return;
    setLocalPerms(prev => {
      const current = prev[pluginName] || [];
      const next = current.includes(role)
        ? current.filter(r => r !== role)
        : [...current, role];
      return { ...prev, [pluginName]: next };
    });
  };

  const saveSettings = async (pluginName: string) => {
    if (!selectedStore || savingConfig) return;
    setSavingConfig(pluginName);
    setConfigMsg(prev => ({ ...prev, [pluginName]: '' }));
    try {
      // config と permissions を並列保存
      await Promise.all([
        (localConfigs[pluginName] && Object.keys(localConfigs[pluginName]).length > 0)
          ? api.updatePluginConfig(selectedStore.id, pluginName, localConfigs[pluginName])
          : Promise.resolve(),
        api.updatePluginPermissions(selectedStore.id, pluginName, localPerms[pluginName] || []),
      ]);
      window.dispatchEvent(new Event('plugins-updated'));
      await loadPlugins();
      setConfigMsg(prev => ({ ...prev, [pluginName]: '保存しました' }));
      setTimeout(() => setConfigMsg(prev => ({ ...prev, [pluginName]: '' })), 2000);
    } catch (e: any) {
      setConfigMsg(prev => ({ ...prev, [pluginName]: `エラー: ${e.message}` }));
    } finally {
      setSavingConfig(null);
    }
  };

  const renderField = (pluginName: string, field: SettingField) => {
    const value = localConfigs[pluginName]?.[field.key] ?? field.default ?? '';

    if (field.type === 'boolean') {
      return (
        <div key={field.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{field.label}</div>
            {field.description && <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>{field.description}</div>}
          </div>
          <label style={{ position: 'relative', width: 44, height: 24, cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={!!value}
              onChange={e => updateLocalConfig(pluginName, field.key, e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{ position: 'absolute', inset: 0, borderRadius: 12, background: value ? '#2563eb' : '#d4d9df', transition: 'background 0.2s' }} />
            <span style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </label>
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key} style={{ padding: '8px 0' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: 4 }}>{field.label}</div>
          {field.description && <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 4 }}>{field.description}</div>}
          <textarea
            value={String(value)}
            onChange={e => updateLocalConfig(pluginName, field.key, e.target.value)}
            style={{ ...inputStyle, minHeight: 180, resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>
      );
    }

    return (
      <div key={field.key} style={{ padding: '8px 0' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: 4 }}>{field.label}</div>
        {field.description && <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 4 }}>{field.description}</div>}
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={String(value)}
          onChange={e => updateLocalConfig(pluginName, field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
          style={inputStyle}
        />
      </div>
    );
  };

  return (
    <div className="main-content">
      <h3 style={{ marginBottom: 8 }}>プラグイン設定</h3>
      <p style={{ color: '#888', marginBottom: 24, fontSize: '0.85rem' }}>
        機能の有効/無効と、各ロールのアクセス権限を設定
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plugins.map(p => {
          const isExpanded = expandedPlugin === p.name;
          return (
            <div key={p.name} style={{
              background: 'white', borderRadius: 8,
              border: '1px solid #d4d9df', overflow: 'hidden',
            }}>
              {/* ヘッダー */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px',
              }}>
                <div
                  style={{ cursor: 'pointer', flex: 1 }}
                  onClick={() => setExpandedPlugin(isExpanded ? null : p.name)}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {p.icon} {p.label}
                    {p.core && <span style={{ fontSize: '0.65rem', color: '#888', marginLeft: 6, fontWeight: 400 }}>コア</span>}
                    <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: 8 }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>
                    {p.description}
                  </div>
                </div>
                {!p.core && (
                  <label style={{ position: 'relative', width: 50, height: 28, cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={p.enabled}
                      onChange={e => togglePlugin(p.name, e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', inset: 0, borderRadius: 14, background: p.enabled ? '#2563eb' : '#d4d9df', transition: 'background 0.2s' }} />
                    <span style={{ position: 'absolute', top: 3, left: p.enabled ? 25 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </label>
                )}
              </div>

              {/* 展開パネル */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #e8edf3', padding: '16px 20px', background: '#fafbfc' }}>
                  {/* 表示順 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: '#555' }}>
                      表示順
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        value={localConfigs[p.name]?.display_order ?? p.displayOrder}
                        onChange={e => updateLocalConfig(p.name, 'display_order', Number(e.target.value) || 0)}
                        style={{ ...inputStyle, width: 80 }}
                        min={0}
                      />
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>小さい数字ほど上に表示</span>
                    </div>
                  </div>

                  {/* アクセス権限 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: '#555' }}>
                      アクセス権限
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {ALL_ROLES.map(role => {
                        const checked = (localPerms[p.name] || []).includes(role.value);
                        const disabled = p.name === 'punch' && role.value === 'owner';
                        return (
                          <button
                            key={role.value}
                            onClick={() => toggleRole(p.name, role.value)}
                            disabled={disabled}
                            style={{
                              padding: '6px 14px', borderRadius: 4,
                              border: `1px solid ${checked ? '#2563eb' : '#d4d9df'}`,
                              background: checked ? '#eff6ff' : '#fff',
                              color: disabled ? '#bbb' : (checked ? '#2563eb' : '#888'),
                              fontWeight: checked ? 600 : 400,
                              fontSize: '0.85rem', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                              opacity: disabled ? 0.6 : 1,
                            }}
                          >
                            {role.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* プラグイン固有設定 */}
                  {p.settingsSchema.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: '#555' }}>
                        詳細設定
                      </div>
                      {p.settingsSchema.map(field => renderField(p.name, field))}
                    </div>
                  )}

                  {/* 保存ボタン */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <button
                      onClick={() => saveSettings(p.name)}
                      disabled={savingConfig === p.name}
                      style={{
                        padding: '8px 20px', background: '#2563eb', color: 'white',
                        border: 'none', borderRadius: 6, fontSize: '0.85rem',
                        fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {savingConfig === p.name ? '保存中...' : '保存'}
                    </button>
                    {configMsg[p.name] && (
                      <span style={{
                        fontSize: '0.85rem',
                        color: configMsg[p.name].startsWith('エラー') ? '#c53030' : '#22c55e',
                      }}>
                        {configMsg[p.name]}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #d4d9df',
  borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit', background: '#fff',
};
