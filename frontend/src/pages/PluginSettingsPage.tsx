import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/molecules/Toast';
import type { PluginInfo as ApiPluginInfo, StoreAccount as ApiStoreAccount } from '../types/api';

// プラグイン設定画面でプラグイン固有の追加 UI を差し込みたい場合は、
// このマップに renderer を登録する。hardcoded な plugin.name === 'X' 判定を
// 本体 render から追い出すため (鉄則2: 1 Plugin = 1 Settings Panel)。
interface PluginExtraContext {
  storeId: string;
  kioskUrl: string;
  // switchbot
  switchbotDevices: { deviceId: string; deviceName?: string; deviceType?: string }[];
  loadingDevices: boolean;
  fetchSwitchBotDevices: () => void;
  // kiosk
  kioskPinDraft: string;
  setKioskPinDraft: (v: string) => void;
  editingKioskPin: boolean;
  setEditingKioskPin: (v: boolean) => void;
  savingKioskPin: boolean;
  saveKioskPin: () => void;
  copyText: (value: string, label: string) => void;
}

type PluginExtraRenderer = (ctx: PluginExtraContext) => ReactNode;

// Use shared API types; re-export as local aliases for convenience
type SettingField = ApiPluginInfo['settingsSchema'][number];
type PluginInfo = ApiPluginInfo;

interface StoreAccount {
  id: string;
  name: string;
  address: string;
  phone: string;
  slug: string;
  openTime: string;
  closeTime: string;
}

type StoreAccountForm = Omit<StoreAccount, 'id'>;

const EMPTY_ACCOUNT_FORM: StoreAccountForm = {
  name: '',
  address: '',
  phone: '',
  slug: '',
  openTime: '',
  closeTime: '',
};

const ALL_ROLES = [
  { value: 'owner', label: 'オーナー' },
  { value: 'manager', label: 'マネージャー' },
  { value: 'leader', label: 'リーダー' },
  { value: 'full_time', label: '正社員' },
  { value: 'part_time', label: 'アルバイト' },
];

const CATEGORY_ORDER = ['core', 'attendance', 'sales', 'reservation', 'operations', 'communication', 'device'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  core: 'コア機能',
  attendance: '勤怠・労務',
  sales: '売上・経費',
  reservation: '予約',
  operations: '店舗運営',
  communication: '顧客・コミュニケーション',
  device: 'デバイス連携',
};

function normalizeAccount(account: ApiStoreAccount | null | undefined): StoreAccount {
  return {
    id: String(account?.id ?? ''),
    name: String(account?.name ?? ''),
    address: String(account?.address ?? ''),
    phone: String(account?.phone ?? ''),
    slug: String(account?.slug ?? ''),
    openTime: String(account?.openTime ?? ''),
    closeTime: String(account?.closeTime ?? ''),
  };
}

function toFormState(account: StoreAccount): StoreAccountForm {
  return {
    name: account.name,
    address: account.address,
    phone: account.phone,
    slug: account.slug,
    openTime: account.openTime,
    closeTime: account.closeTime,
  };
}

export default function PluginSettingsPage() {
  const { selectedStore, refreshStores } = useAuth();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [localConfigs, setLocalConfigs] = useState<Record<string, Record<string, unknown>>>({});
  const [localPerms, setLocalPerms] = useState<Record<string, string[]>>({});
  const [savingConfig, setSavingConfig] = useState<string | null>(null);
  const [configMsg, setConfigMsg] = useState<Record<string, string>>({});

  const [storeAccount, setStoreAccount] = useState<StoreAccount | null>(null);
  const [accountForm, setAccountForm] = useState<StoreAccountForm>(EMPTY_ACCOUNT_FORM);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMsg, setAccountMsg] = useState('');

  const [initialPassword, setInitialPassword] = useState('');
  const [editingInitialPassword, setEditingInitialPassword] = useState(false);
  const [initialPasswordDraft, setInitialPasswordDraft] = useState('');
  const [savingInitialPassword, setSavingInitialPassword] = useState(false);

  const [kioskPinDraft, setKioskPinDraft] = useState('');
  const [editingKioskPin, setEditingKioskPin] = useState(false);
  const [savingKioskPin, setSavingKioskPin] = useState(false);
  interface SwitchBotDevice {
    deviceId: string;
    deviceName?: string;
    deviceType?: string;
  }
  const [switchbotDevices, setSwitchbotDevices] = useState<SwitchBotDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!selectedStore) return;
    try {
      const [pluginData, accountData, passwordData] = await Promise.all([
        api.getPluginSettings(selectedStore.id),
        api.getStoreAccount(selectedStore.id),
        api.getInitialPassword(selectedStore.id),
      ]);

      setPlugins(pluginData.plugins);
      const configs: Record<string, Record<string, unknown>> = {};
      const perms: Record<string, string[]> = {};
      for (const plugin of pluginData.plugins) {
        configs[plugin.name] = { ...plugin.config };
        perms[plugin.name] = [...plugin.allowedRoles];
      }
      setLocalConfigs(configs);
      setLocalPerms(perms);

      const normalizedAccount = normalizeAccount(accountData.account);
      setStoreAccount(normalizedAccount);
      setAccountForm(toFormState(normalizedAccount));
      setInitialPassword(passwordData.initialPassword || normalizedAccount.id);
      setInitialPasswordDraft(passwordData.initialPassword || normalizedAccount.id);
      setEditingInitialPassword(false);
      setAccountMsg('');
    } catch {
      setStoreAccount(null);
      setAccountForm(EMPTY_ACCOUNT_FORM);
    }
  }, [selectedStore]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const togglePlugin = async (pluginName: string, enabled: boolean) => {
    if (!selectedStore) return;
    try {
      await api.togglePlugin(selectedStore.id, pluginName, enabled);
      setPlugins(prev => prev.map(plugin => (
        plugin.name === pluginName ? { ...plugin, enabled } : plugin
      )));
      window.dispatchEvent(new Event('plugins-updated'));
      await loadSettings();
    } catch {}
  };

  const updateLocalConfig = (pluginName: string, key: string, value: unknown) => {
    setLocalConfigs(prev => ({
      ...prev,
      [pluginName]: { ...prev[pluginName], [key]: value },
    }));
  };

  const updateAccountField = (key: keyof StoreAccountForm, value: string) => {
    setAccountForm(prev => ({
      ...prev,
      [key]: value,
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
      await Promise.all([
        (localConfigs[pluginName] && Object.keys(localConfigs[pluginName]).length > 0)
          ? api.updatePluginConfig(selectedStore.id, pluginName, localConfigs[pluginName])
          : Promise.resolve(),
        api.updatePluginPermissions(selectedStore.id, pluginName, localPerms[pluginName] || []),
      ]);
      window.dispatchEvent(new Event('plugins-updated'));
      await loadSettings();
      setConfigMsg(prev => ({ ...prev, [pluginName]: '保存しました' }));
      setTimeout(() => setConfigMsg(prev => ({ ...prev, [pluginName]: '' })), 2000);
    } catch (e: unknown) {
      setConfigMsg(prev => ({ ...prev, [pluginName]: `エラー: ${e instanceof Error ? e.message : String(e)}` }));
    } finally {
      setSavingConfig(null);
    }
  };

  const fetchSwitchBotDevices = async () => {
    if (!selectedStore || loadingDevices) return;
    setLoadingDevices(true);
    try {
      const res = await api.getSwitchBotDevices(selectedStore.id);
      setSwitchbotDevices(res.devices || []);
      showToast(`${res.devices?.length || 0}台のデバイスを取得しました`, 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'デバイス取得に失敗しました', 'error');
    } finally {
      setLoadingDevices(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label}をコピーしました`, 'info');
    } catch {
      showToast(`${label}のコピーに失敗しました`, 'error');
    }
  };

  const saveStoreAccount = async () => {
    if (!selectedStore || accountSaving) return;

    const trimmedName = accountForm.name.trim();
    if (!trimmedName) {
      setAccountMsg('エラー: 施設名は必須です');
      return;
    }

    setAccountSaving(true);
    setAccountMsg('');

    try {
      const result = await api.updateStoreAccount(selectedStore.id, {
        name: trimmedName,
        address: accountForm.address.trim(),
        phone: accountForm.phone.trim(),
        slug: accountForm.slug.trim().toLowerCase(),
        openTime: accountForm.openTime,
        closeTime: accountForm.closeTime,
      });

      const normalizedAccount = normalizeAccount(result.account);
      setStoreAccount(normalizedAccount);
      setAccountForm(toFormState(normalizedAccount));
      await refreshStores();
      setAccountMsg('保存しました');
      showToast('施設アカウントを更新しました', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '施設アカウントの保存に失敗しました';
      setAccountMsg(`エラー: ${msg}`);
      showToast(msg, 'error');
    } finally {
      setAccountSaving(false);
    }
  };

  const saveKioskPin = async () => {
    if (!selectedStore || savingKioskPin) return;
    const pin = kioskPinDraft.trim();
    if (!/^\d{4,8}$/.test(pin)) {
      showToast('PINは4〜8桁の数字で設定してください', 'error');
      return;
    }
    setSavingKioskPin(true);
    try {
      await api.setKioskPin(selectedStore.id, pin);
      setEditingKioskPin(false);
      setKioskPinDraft('');
      showToast('キオスクPINを設定しました', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'PINの設定に失敗しました', 'error');
    } finally {
      setSavingKioskPin(false);
    }
  };

  const saveInitialPassword = async () => {
    if (!selectedStore || savingInitialPassword) return;

    const nextPassword = initialPasswordDraft.trim();
    if (nextPassword.length < 6) {
      showToast('初期パスワードは6文字以上で入力してください', 'error');
      return;
    }

    setSavingInitialPassword(true);
    try {
      await api.setInitialPassword(selectedStore.id, nextPassword);
      setInitialPassword(nextPassword);
      setInitialPasswordDraft(nextPassword);
      setEditingInitialPassword(false);
      showToast('初期パスワードを更新しました', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '初期パスワードの更新に失敗しました', 'error');
    } finally {
      setSavingInitialPassword(false);
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
            <input
              type="checkbox"
              checked={!!value}
              onChange={e => updateLocalConfig(pluginName, field.key, e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
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

    if (field.type === 'select' && field.options) {
      return (
        <div key={field.key} style={{ padding: '8px 0' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: 4 }}>{field.label}</div>
          {field.description && <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 4 }}>{field.description}</div>}
          <select
            value={String(value)}
            onChange={e => updateLocalConfig(pluginName, field.key, e.target.value)}
            style={inputStyle}
          >
            {field.options.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
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

  const joinUrl = selectedStore && typeof window !== 'undefined'
    ? `${window.location.origin}?join=${selectedStore.id}`
    : '';

  const kioskUrl = selectedStore && typeof window !== 'undefined'
    ? `${window.location.origin}/kiosk?store=${selectedStore.id}`
    : '';

  const currentAccountId = storeAccount?.id || selectedStore?.id || '';
  const currentInitialPassword = initialPassword || currentAccountId;

  return (
    <div className="w-full min-w-0 max-w-[960px] flex-1 px-8 py-7 max-md:px-3.5 max-md:py-4">
      <h3 style={{ marginBottom: 8 }}>設定</h3>
      <p style={{ color: '#888', marginBottom: 24, fontSize: '0.85rem' }}>
        施設アカウントとプラグイン権限を一元管理できます
      </p>

      <div style={sectionCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.98rem' }}>施設アカウント</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
              施設名・住所・営業時間など、事業所の基本設定をここから調整できます。
            </div>
          </div>
          <span style={badgeStyle}>事業所設定</span>
        </div>

        <div style={accountGridStyle}>
          <div>
            <div style={fieldLabelStyle}>施設名</div>
            <input
              type="text"
              value={accountForm.name}
              onChange={e => updateAccountField('name', e.target.value)}
              placeholder="例: SUNABACO NEYAGAWA"
              style={inputStyle}
            />
          </div>
          <div>
            <div style={fieldLabelStyle}>電話番号</div>
            <input
              type="tel"
              value={accountForm.phone}
              onChange={e => updateAccountField('phone', e.target.value)}
              placeholder="例: 072-000-0000"
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={fieldLabelStyle}>住所</div>
            <input
              type="text"
              value={accountForm.address}
              onChange={e => updateAccountField('address', e.target.value)}
              placeholder="例: 大阪府寝屋川市池田中町1-1"
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={fieldLabelStyle}>公開URL (予約ページ用 slug)</div>
            <input
              type="text"
              value={accountForm.slug}
              onChange={e => updateAccountField('slug', e.target.value.toLowerCase())}
              placeholder="例: sofe (英小文字・数字・ハイフン、2〜63文字)"
              style={inputStyle}
            />
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
              予約ページURL: {accountForm.slug ? `${window.location.origin}/r/${accountForm.slug}` : '未設定'}
            </div>
          </div>
          <div>
            <div style={fieldLabelStyle}>営業開始</div>
            <input
              type="time"
              value={accountForm.openTime}
              onChange={e => updateAccountField('openTime', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={fieldLabelStyle}>営業終了</div>
            <input
              type="time"
              value={accountForm.closeTime}
              onChange={e => updateAccountField('closeTime', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={metaGridStyle}>
          <div style={metaCardStyle}>
            <div style={metaLabelStyle}>施設ID</div>
            <code style={metaValueStyle}>{currentAccountId || '未設定'}</code>
            <button
              onClick={() => currentAccountId && copyText(currentAccountId, '施設ID')}
              style={secondaryButtonStyle}
              disabled={!currentAccountId}
            >
              コピー
            </button>
          </div>
          <div style={metaCardStyle}>
            <div style={metaLabelStyle}>スタッフ登録リンク</div>
            <code style={metaValueStyle}>{joinUrl || '未設定'}</code>
            <button
              onClick={() => joinUrl && copyText(joinUrl, 'スタッフ登録リンク')}
              style={secondaryButtonStyle}
              disabled={!joinUrl}
            >
              コピー
            </button>
          </div>
        </div>

        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #e8edf3' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>スタッフ初期パスワード</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                スタッフ追加時に自動発行されるパスワードです。初回ログイン後に変更を促します。
              </div>
            </div>

            {!editingInitialPassword ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <code style={inlineCodeStyle}>{currentInitialPassword}</code>
                <button
                  onClick={() => currentInitialPassword && copyText(currentInitialPassword, '初期パスワード')}
                  style={secondaryButtonStyle}
                >
                  コピー
                </button>
                <button
                  onClick={() => {
                    setEditingInitialPassword(true);
                    setInitialPasswordDraft(currentInitialPassword);
                  }}
                  style={secondaryButtonStyle}
                >
                  変更
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={initialPasswordDraft}
                  onChange={e => setInitialPasswordDraft(e.target.value)}
                  placeholder="6文字以上で入力"
                  style={{ ...inputStyle, width: 220 }}
                />
                <button
                  onClick={saveInitialPassword}
                  style={primaryButtonStyle}
                  disabled={savingInitialPassword}
                >
                  {savingInitialPassword ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => {
                    setEditingInitialPassword(false);
                    setInitialPasswordDraft(currentInitialPassword);
                  }}
                  style={secondaryButtonStyle}
                  disabled={savingInitialPassword}
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
          <button
            onClick={saveStoreAccount}
            disabled={accountSaving}
            style={primaryButtonStyle}
          >
            {accountSaving ? '保存中...' : '施設アカウントを保存'}
          </button>
          {accountMsg && (
            <span style={{
              fontSize: '0.85rem',
              color: accountMsg.startsWith('エラー') ? '#c53030' : '#22c55e',
            }}>
              {accountMsg}
            </span>
          )}
        </div>
      </div>


      <h4 style={{ margin: '28px 0 8px', fontSize: '1rem' }}>プラグイン設定</h4>
      <p style={{ color: '#888', marginBottom: 20, fontSize: '0.85rem' }}>
        機能の有効/無効と、各ロールのアクセス権限を設定
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {CATEGORY_ORDER.map(cat => {
          const grouped = plugins.filter(p => (p.category || 'core') === cat);
          if (grouped.length === 0) return null;
          return (
            <div key={cat}>
              <h5 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>
                {CATEGORY_LABELS[cat] || cat}
              </h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {grouped.map(plugin => {
          const isExpanded = expandedPlugin === plugin.name;
          return (
            <div key={plugin.name} data-testid={`plugin-card-${plugin.name}`} style={{
              background: 'white',
              borderRadius: 8,
              border: '1px solid #d4d9df',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
              }}>
                <div
                  data-testid={`plugin-card-header-${plugin.name}`}
                  style={{ cursor: 'pointer', flex: 1 }}
                  onClick={() => setExpandedPlugin(isExpanded ? null : plugin.name)}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {plugin.icon} {plugin.label}
                    {plugin.core && <span style={{ fontSize: '0.65rem', color: '#888', marginLeft: 6, fontWeight: 400 }}>コア</span>}
                    <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: 8 }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>
                    {plugin.description}
                  </div>
                </div>
                {!plugin.core && (
                  <label style={{ position: 'relative', width: 50, height: 28, cursor: 'pointer', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={plugin.enabled}
                      onChange={e => togglePlugin(plugin.name, e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{ position: 'absolute', inset: 0, borderRadius: 14, background: plugin.enabled ? '#2563eb' : '#d4d9df', transition: 'background 0.2s' }} />
                    <span style={{ position: 'absolute', top: 3, left: plugin.enabled ? 25 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </label>
                )}
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid #e8edf3', padding: '16px 20px', background: '#fafbfc' }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: '#555' }}>
                      表示順
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        value={Number(localConfigs[plugin.name]?.display_order ?? plugin.displayOrder)}
                        onChange={e => updateLocalConfig(plugin.name, 'display_order', Number(e.target.value) || 0)}
                        style={{ ...inputStyle, width: 80 }}
                        min={0}
                      />
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>小さい数字ほど上に表示</span>
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: '#555' }}>
                      アクセス権限
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {ALL_ROLES.map(role => {
                        const checked = (localPerms[plugin.name] || []).includes(role.value);
                        const disabled = plugin.name === 'punch' && role.value === 'owner';
                        return (
                          <button
                            key={role.value}
                            onClick={() => toggleRole(plugin.name, role.value)}
                            disabled={disabled}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 4,
                              border: `1px solid ${checked ? '#2563eb' : '#d4d9df'}`,
                              background: checked ? '#eff6ff' : '#fff',
                              color: disabled ? '#bbb' : (checked ? '#2563eb' : '#888'),
                              fontWeight: checked ? 600 : 400,
                              fontSize: '0.85rem',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit',
                              opacity: disabled ? 0.6 : 1,
                            }}
                          >
                            {role.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {PLUGIN_EXTRAS[plugin.name]?.({
                    storeId: selectedStore?.id || '',
                    kioskUrl,
                    switchbotDevices,
                    loadingDevices,
                    fetchSwitchBotDevices,
                    kioskPinDraft,
                    setKioskPinDraft,
                    editingKioskPin,
                    setEditingKioskPin,
                    savingKioskPin,
                    saveKioskPin,
                    copyText,
                  })}

                  {/* attendance プラグイン: CSVエクスポート許可ロール選択UI */}
                  {plugin.name === 'attendance' && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: '#555' }}>
                        CSVエクスポート許可ロール
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {ALL_ROLES.map(role => {
                          const currentPerms: string[] = Array.isArray(localConfigs[plugin.name]?.export_permission)
                            ? (localConfigs[plugin.name].export_permission as string[])
                            : ['owner', 'manager'];
                          const checked = currentPerms.includes(role.value);
                          return (
                            <button
                              key={role.value}
                              data-testid={`export-permission-role-${role.value}`}
                              onClick={() => {
                                const next = checked
                                  ? currentPerms.filter(r => r !== role.value)
                                  : [...currentPerms, role.value];
                                updateLocalConfig(plugin.name, 'export_permission', next);
                              }}
                              style={{
                                padding: '6px 14px',
                                borderRadius: 4,
                                border: `1px solid ${checked ? '#2563eb' : '#d4d9df'}`,
                                background: checked ? '#eff6ff' : '#fff',
                                color: checked ? '#2563eb' : '#888',
                                fontWeight: checked ? 600 : 400,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              {role.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {plugin.settingsSchema.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: '#555' }}>
                        詳細設定
                      </div>
                      {plugin.settingsSchema.map(field => renderField(plugin.name, field))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <button
                      onClick={() => saveSettings(plugin.name)}
                      disabled={savingConfig === plugin.name}
                      style={primaryButtonStyle}
                      data-testid={`plugin-save-button-${plugin.name}`}
                    >
                      {savingConfig === plugin.name ? '保存中...' : '保存'}
                    </button>
                    {configMsg[plugin.name] && (
                      <span
                        data-testid={`plugin-config-msg-${plugin.name}`}
                        style={{
                          fontSize: '0.85rem',
                          color: configMsg[plugin.name].startsWith('エラー') ? '#c53030' : '#22c55e',
                        }}
                      >
                        {configMsg[plugin.name]}
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
        })}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d4d9df',
  borderRadius: 6,
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  background: '#fff',
};

const sectionCardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #d4d9df',
  padding: 20,
};

const accountGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 14,
};

const metaGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 12,
  marginTop: 18,
};

const metaCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 8,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#64748b',
};

const metaValueStyle: React.CSSProperties = {
  fontSize: '0.76rem',
  lineHeight: 1.5,
  color: '#0f172a',
  wordBreak: 'break-all',
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '8px 10px',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#475569',
  marginBottom: 6,
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 999,
  background: '#eff6ff',
  color: '#2563eb',
  fontSize: '0.78rem',
  fontWeight: 600,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: '#fff',
  color: '#334155',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: '0.82rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const inlineCodeStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #dbe2ea',
  background: '#f8fafc',
  fontSize: '0.82rem',
};

// プラグイン固有 extras レンダラー。新規プラグインで追加 UI が必要になったら
// ここへ登録するだけで PluginSettingsPage 本体の render を変更せずに済む。
const PLUGIN_EXTRAS: Record<string, PluginExtraRenderer> = {
  switchbot: (ctx) => (
    <div style={{ marginBottom: 16, padding: '14px', background: '#fff7ed', borderRadius: 8, border: '1px solid #fed7aa' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: '#92400e' }}>デバイス確認</div>
      <div style={{ fontSize: '0.8rem', color: '#78350f', marginBottom: 10 }}>
        APIトークン・シークレットを保存後、デバイス一覧を取得できます。
      </div>
      <button
        style={{ ...primaryButtonStyle, background: '#ea580c' }}
        onClick={ctx.fetchSwitchBotDevices}
        disabled={ctx.loadingDevices}
      >
        {ctx.loadingDevices ? '取得中...' : '🌡️ デバイス一覧を取得'}
      </button>
      {ctx.switchbotDevices.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ctx.switchbotDevices.map((d) => (
            <div key={d.deviceId} style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 12px', fontSize: '0.82rem' }}>
              <span style={{ fontWeight: 600 }}>{d.deviceName || d.deviceId}</span>
              <span style={{ color: '#888', marginLeft: 8 }}>{d.deviceType}</span>
              <code style={{ marginLeft: 8, fontSize: '0.75rem', color: '#555' }}>{d.deviceId}</code>
            </div>
          ))}
          <div style={{ fontSize: '0.78rem', color: '#78350f', marginTop: 4 }}>
            デバイスIDをコピーしてHACCP項目に割り当てるには、キオスクの設定でマッピングを行ってください。
          </div>
        </div>
      )}
    </div>
  ),
  kiosk: (ctx) => (
    <div style={{ marginBottom: 16, padding: '14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12, color: '#555' }}>キオスク設定</div>

      <div style={{ marginBottom: 12 }}>
        <div style={metaLabelStyle}>キオスクURL（タブレットでブックマーク）</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <code style={{ ...metaValueStyle, flex: 1, fontSize: '0.75rem' }}>{ctx.kioskUrl}</code>
          <button onClick={() => ctx.copyText(ctx.kioskUrl, 'キオスクURL')} style={secondaryButtonStyle}>コピー</button>
        </div>
      </div>

      <div>
        <div style={metaLabelStyle}>キオスクPIN（4〜8桁の数字）</div>
        {!ctx.editingKioskPin ? (
          <button
            onClick={() => { ctx.setEditingKioskPin(true); ctx.setKioskPinDraft(''); }}
            style={{ ...secondaryButtonStyle, marginTop: 6 }}
            data-testid="kiosk-pin-edit-button"
          >
            PINを設定・変更
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d*"
              value={ctx.kioskPinDraft}
              onChange={e => ctx.setKioskPinDraft(e.target.value.replace(/\D/g, ''))}
              placeholder="例: 1234"
              maxLength={8}
              style={{ ...inputStyle, width: 140 }}
              autoFocus
              data-testid="kiosk-pin-setting-input"
            />
            <button
              onClick={ctx.saveKioskPin}
              style={primaryButtonStyle}
              disabled={ctx.savingKioskPin || !/^\d{4,8}$/.test(ctx.kioskPinDraft)}
              data-testid="kiosk-pin-save-button"
            >
              {ctx.savingKioskPin ? '設定中...' : '設定'}
            </button>
            <button
              onClick={() => { ctx.setEditingKioskPin(false); ctx.setKioskPinDraft(''); }}
              style={secondaryButtonStyle}
              disabled={ctx.savingKioskPin}
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  ),
};
