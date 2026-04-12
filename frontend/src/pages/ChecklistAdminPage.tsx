/**
 * チェックリスト管理画面 v2（HACCP 対応）
 * タブ: 店舗チェック | テンプレート管理 | 割当管理
 */
import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  checkApi,
  CheckTiming,
  CheckScope,
  CheckLayer,
  CheckItemType,
  TrackingMode,
  ChecklistTemplate,
  TemplateItem,
  SystemTemplate,
  Assignment,
} from '../api/checkApi';
import { api } from '../api/client';
import StoreChecklistPage from './StoreChecklistPage';

interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
}

// ── 定数ラベル ────────────────────────────────────────────────────────────────

const TIMING_LABEL: Record<CheckTiming, string> = {
  clock_in:      '出勤',
  clock_out:     '退勤',
  store_opening: '開店前',
  store_daily:   '日中巡回',
  store_closing: '閉店前',
  ad_hoc:        '随時',
};

const SCOPE_LABEL: Record<CheckScope, string> = { personal: '個人', store: '店舗' };
const LAYER_LABEL: Record<CheckLayer, string>  = { base: '基本', shift: 'シフト別' };

const ITEM_TYPE_LABEL: Record<CheckItemType, string> = {
  checkbox: 'チェックボックス',
  numeric:  '数値入力',
  text:     'テキスト入力',
  photo:    '写真',
  select:   '選択肢',
};

const TRACKING_LABEL: Record<TrackingMode, string> = {
  submission_only:  '提出のみ',
  measurement_only: '時系列測定のみ',
  both:             '提出 + 時系列測定',
};

type AdminTab = 'store_check' | 'templates' | 'assignments';

// ── ユーティリティ ────────────────────────────────────────────────────────────

function miniBtn(disabled = false): CSSProperties {
  return {
    padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db',
    background: '#fff', cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1, fontSize: '0.82rem',
  };
}

// ── 項目エディタフォームの型 ───────────────────────────────────────────────────

interface ItemForm {
  id: string | null;
  label: string;
  item_key: string;
  item_type: CheckItemType;
  required: boolean;
  min_value: string;
  max_value: string;
  unit: string;
  is_ccp: boolean;
  tracking_mode: TrackingMode;
  deviation_action: string;
  sort_order: number;
  switchbot_device_id: string;
}

function emptyItemForm(): ItemForm {
  return {
    id: null, label: '', item_key: '', item_type: 'checkbox',
    required: true, min_value: '', max_value: '', unit: '',
    is_ccp: false, tracking_mode: 'submission_only', deviation_action: '', sort_order: 0,
    switchbot_device_id: '',
  };
}

// ── テンプレートエディタ ──────────────────────────────────────────────────────

interface TemplateFormState {
  id: string | null;
  name: string;
  timing: CheckTiming;
  scope: CheckScope;
  layer: CheckLayer;
  description: string;
}

function emptyTemplateForm(): TemplateFormState {
  return { id: null, name: '', timing: 'clock_in', scope: 'personal', layer: 'base', description: '' };
}

// ── テンプレート管理タブ ──────────────────────────────────────────────────────

function TemplatesTab({ storeId }: { storeId: string }) {
  const [scopeTab, setScopeTab]     = useState<CheckScope>('personal');
  const [templates, setTemplates]   = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading]       = useState(false);
  const [message, setMessage]       = useState('');
  const [form, setForm]             = useState<TemplateFormState>(emptyTemplateForm());
  const [saving, setSaving]         = useState(false);
  const [editItems, setEditItems]   = useState<TemplateItem[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<ChecklistTemplate | null>(null);
  const [itemForm, setItemForm]     = useState<ItemForm>(emptyItemForm());
  const [itemSaving, setItemSaving] = useState(false);

  const [systemTemplates, setSystemTemplates] = useState<SystemTemplate[]>([]);
  const [fromSystemLoading, setFromSystemLoading] = useState(false);
  const [switchbotDevices, setSwitchbotDevices] = useState<SwitchBotDevice[]>([]);
  const [showCreateFlow, setShowCreateFlow] = useState<'closed' | 'step1' | 'step2'>('closed');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await checkApi.getTemplates(storeId, { scope: scopeTab });
      setTemplates(data.templates);
    } catch (e: unknown) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [storeId, scopeTab]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    checkApi.getSystemTemplates('cafe').then(d => setSystemTemplates(d.system_templates)).catch(() => {});
  }, []);

  // SwitchBot 連携が設定済みの店舗では device 一覧を取得する。失敗しても UI は崩さない。
  useEffect(() => {
    api.getSwitchBotDevices(storeId)
      .then((d: { devices: SwitchBotDevice[] }) => setSwitchbotDevices(d.devices || []))
      .catch(() => setSwitchbotDevices([]));
  }, [storeId]);

  const handleCreate = async () => {
    if (!form.name.trim()) { setMessage('エラー: テンプレート名を入力してください'); return; }
    setSaving(true); setMessage('');
    try {
      if (form.id) {
        await checkApi.updateTemplate(storeId, form.id, {
          name: form.name, timing: form.timing, scope: form.scope, layer: form.layer,
          description: form.description || undefined,
        });
        setMessage('テンプレートを更新しました');
      } else {
        await checkApi.createTemplate(storeId, {
          name: form.name, timing: form.timing, scope: form.scope, layer: form.layer,
          description: form.description || undefined,
        });
        setMessage('テンプレートを作成しました');
      }
      setForm(emptyTemplateForm());
      setShowCreateFlow('closed');
      await load();
    } catch (e: unknown) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFromSystem = async (sysId: string) => {
    setFromSystemLoading(true); setMessage('');
    try {
      await checkApi.fromSystemTemplate(storeId, sysId);
      setMessage('システムテンプレートからコピーしました');
      setShowCreateFlow('closed');
      await load();
    } catch (e: unknown) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFromSystemLoading(false);
    }
  };

  const closeCreateFlow = () => {
    setForm(emptyTemplateForm());
    setShowCreateFlow('closed');
  };

  const templateFormFields = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input
          type="text" value={form.name} placeholder="テンプレート名"
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}
        />
        <select value={form.timing} onChange={e => setForm(p => ({ ...p, timing: e.target.value as CheckTiming }))}
          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
          {(Object.keys(TIMING_LABEL) as CheckTiming[]).map(t => (
            <option key={t} value={t}>{TIMING_LABEL[t]}</option>
          ))}
        </select>
        <select value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value as CheckScope }))}
          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
          <option value="personal">個人</option>
          <option value="store">店舗</option>
        </select>
        <select value={form.layer} onChange={e => setForm(p => ({ ...p, layer: e.target.value as CheckLayer }))}
          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
          <option value="base">基本</option>
          <option value="shift">シフト別</option>
        </select>
      </div>
      <input
        type="text" value={form.description} placeholder="説明（任意）"
        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', marginBottom: 8, boxSizing: 'border-box' }}
      />
    </>
  );

  const handleDelete = async (tplId: string) => {
    if (!window.confirm('このテンプレートを削除しますか？')) return;
    try {
      await checkApi.deleteTemplate(storeId, tplId);
      setMessage('削除しました');
      if (selectedTpl?.id === tplId) { setSelectedTpl(null); setEditItems([]); }
      await load();
    } catch (e: unknown) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const openTemplateItems = async (tpl: ChecklistTemplate) => {
    setSelectedTpl(tpl);
    setItemForm(emptyItemForm());
    try {
      const data = await checkApi.getTemplate(storeId, tpl.id);
      setEditItems(data.template.items ?? []);
    } catch (e: unknown) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleAddItem = async () => {
    if (!selectedTpl || !itemForm.label.trim()) return;
    setItemSaving(true);
    try {
      await checkApi.addItem(storeId, selectedTpl.id, {
        label: itemForm.label,
        item_key: itemForm.item_key || undefined,
        item_type: itemForm.item_type,
        required: itemForm.required,
        min_value: itemForm.min_value ? parseFloat(itemForm.min_value) : null,
        max_value: itemForm.max_value ? parseFloat(itemForm.max_value) : null,
        unit: itemForm.unit || null,
        is_ccp: itemForm.is_ccp,
        tracking_mode: itemForm.tracking_mode,
        deviation_action: itemForm.deviation_action || null,
        sort_order: itemForm.sort_order,
        switchbot_device_id: itemForm.switchbot_device_id || null,
      });
      setItemForm(emptyItemForm());
      await openTemplateItems(selectedTpl);
    } catch (e: unknown) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!selectedTpl || !window.confirm('この項目を削除しますか？')) return;
    try {
      await checkApi.deleteItem(storeId, itemId);
      await openTemplateItems(selectedTpl);
    } catch (e: unknown) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const filteredSysTemplates = systemTemplates.filter(s => s.scope === scopeTab);

  return (
    <div>
      {/* scope タブ */}
      <div className="timing-tabs" style={{ marginBottom: 20 }}>
        {(['personal', 'store'] as CheckScope[]).map(sc => (
          <button
            key={sc}
            className={`timing-tab ${scopeTab === sc ? 'active' : ''}`}
            onClick={() => { setScopeTab(sc); setSelectedTpl(null); setEditItems([]); }}
          >
            {SCOPE_LABEL[sc]}チェック
          </button>
        ))}
      </div>

      {/* 業種テンプレートから作成 */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          業種テンプレートから作成
          <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>
            （推奨：ゼロから作らず、まずここに該当テンプレがないか確認してください）
          </span>
        </div>
        {systemTemplates.length === 0 ? (
          <div style={{ padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '0.88rem' }}>
            業種テンプレートが登録されていません。管理者にお問い合わせください。
          </div>
        ) : filteredSysTemplates.length === 0 ? (
          <div style={{ padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '0.88rem' }}>
            この{SCOPE_LABEL[scopeTab]}チェック用の業種テンプレートはありません。上のタブで他のスコープも確認してみてください。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredSysTemplates.map(sys => (
              <div key={sys.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{sys.name}</span>
                  <span style={{ marginLeft: 8, fontSize: '0.78rem', color: '#64748b' }}>
                    {TIMING_LABEL[sys.timing]} / {LAYER_LABEL[sys.layer]} / {sys.items.length}項目
                  </span>
                </div>
                <button
                  onClick={() => handleFromSystem(sys.id)}
                  disabled={fromSystemLoading}
                  style={{ ...miniBtn(fromSystemLoading), background: '#0f3460', color: '#fff', border: 'none' }}
                >
                  コピーして作成
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {message && (
        <div style={{ marginBottom: 12, color: message.startsWith('エラー') ? '#b91c1c' : '#166534', fontWeight: 500 }}>
          {message}
        </div>
      )}

      {(() => {
        if (form.id) {
          return (
            <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fafafa' }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>テンプレート編集</div>
              {templateFormFields}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setForm(emptyTemplateForm())} style={miniBtn()}>キャンセル</button>
                <button
                  onClick={handleCreate} disabled={saving}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0f3460', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? '保存中...' : '更新する'}
                </button>
              </div>
            </div>
          );
        }

        if (showCreateFlow === 'closed') {
          return (
            <div style={{ marginBottom: 20 }}>
              <button
                onClick={() => setShowCreateFlow('step1')}
                style={{ padding: '10px 18px', borderRadius: 8, border: '2px dashed #94a3b8', background: '#f8fafc', color: '#0f3460', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem', width: '100%' }}
              >
                ＋ 新規追加
              </button>
            </div>
          );
        }

        if (showCreateFlow === 'step1') {
          return (
            <div style={{ marginBottom: 20, padding: 16, borderRadius: 10, border: '2px solid #0f3460', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f3460' }}>
                  ステップ1: 業種テンプレートを選択
                </div>
                <button
                  onClick={closeCreateFlow}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '2px 6px' }}
                >&times;</button>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 12 }}>
                まず業種テンプレートを確認してください。該当するものがあれば「コピーして作成」で効率的に作成できます。
              </div>
              {filteredSysTemplates.length === 0 ? (
                <div style={{ padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '0.88rem', marginBottom: 12 }}>
                  この{SCOPE_LABEL[scopeTab]}チェック用の業種テンプレートはありません。
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {filteredSysTemplates.map(sys => (
                    <div key={sys.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>{sys.name}</span>
                        <span style={{ marginLeft: 8, fontSize: '0.78rem', color: '#64748b' }}>
                          {TIMING_LABEL[sys.timing]} / {LAYER_LABEL[sys.layer]} / {sys.items.length}項目
                        </span>
                      </div>
                      <button
                        onClick={() => handleFromSystem(sys.id)}
                        disabled={fromSystemLoading}
                        style={{ ...miniBtn(fromSystemLoading), background: '#0f3460', color: '#fff', border: 'none' }}
                      >
                        コピーして作成
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, textAlign: 'center' }}>
                <button
                  onClick={() => setShowCreateFlow('step2')}
                  style={{ background: 'none', border: 'none', color: '#0f3460', cursor: 'pointer', fontSize: '0.88rem', textDecoration: 'underline' }}
                >
                  該当テンプレートがない場合 → カスタムで作成
                </button>
              </div>
            </div>
          );
        }

        return (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, border: '2px solid #0f3460', background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 600 }}>ステップ2: カスタムテンプレートを作成</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => setShowCreateFlow('step1')}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline' }}
                >
                  ← 業種テンプレートに戻る
                </button>
                <button
                  onClick={closeCreateFlow}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '2px 6px' }}
                >&times;</button>
              </div>
            </div>
            {templateFormFields}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={closeCreateFlow} style={miniBtn()}>キャンセル</button>
              <button
                onClick={handleCreate} disabled={saving}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0f3460', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? '保存中...' : '作成する'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* テンプレート一覧 */}
      {loading ? <div className="loading">読み込み中...</div> : templates.length === 0 ? (
        <div style={{ padding: 18, border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b' }}>
          テンプレートがありません。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map(tpl => (
            <div key={tpl.id}>
              <div style={{ padding: '12px 14px', background: '#fff', borderRadius: 10, border: `1px solid ${selectedTpl?.id === tpl.id ? '#0f3460' : '#e5e7eb'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', padding: '2px 7px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>
                      {TIMING_LABEL[tpl.timing]}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '2px 7px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                      {LAYER_LABEL[tpl.layer]}
                    </span>
                    <span style={{ fontWeight: 700 }}>{tpl.name}</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>v{tpl.version}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openTemplateItems(tpl)} style={miniBtn()}>項目編集</button>
                    <button onClick={() => setForm({ id: tpl.id, name: tpl.name, timing: tpl.timing, scope: tpl.scope, layer: tpl.layer, description: tpl.description ?? '' })} style={miniBtn()}>編集</button>
                    <button onClick={() => handleDelete(tpl.id)} style={{ ...miniBtn(), color: '#dc2626', borderColor: '#fecaca' }}>削除</button>
                  </div>
                </div>
              </div>

              {/* 項目エディタ（選択時のみ表示）*/}
              {selectedTpl?.id === tpl.id && (
                <div style={{ margin: '4px 0 8px 16px', padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 600, marginBottom: 10 }}>項目一覧</div>
                  {editItems.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 10 }}>項目がありません</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {editItems.map((item, idx) => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                          <div>
                            <span style={{ fontWeight: 500 }}>{idx + 1}. {item.label}</span>
                            {item.is_ccp && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#dc2626', fontWeight: 700 }}>CCP</span>}
                            <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#64748b' }}>
                              {ITEM_TYPE_LABEL[item.item_type]}
                              {item.min_value != null && ` | min: ${item.min_value}`}
                              {item.max_value != null && ` | max: ${item.max_value}`}
                              {item.unit && ` ${item.unit}`}
                              {' | '}{TRACKING_LABEL[item.tracking_mode]}
                            </span>
                          </div>
                          <button onClick={() => handleDeleteItem(item.id)} style={{ ...miniBtn(), color: '#dc2626', borderColor: '#fecaca' }}>削除</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 新規項目追加 */}
                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem' }}>項目を追加</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
                    <input type="text" placeholder="項目ラベル *" value={itemForm.label}
                      onChange={e => setItemForm(p => ({ ...p, label: e.target.value }))}
                      style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db' }} />
                    <input type="text" placeholder="item_key（省略可）" value={itemForm.item_key}
                      onChange={e => setItemForm(p => ({ ...p, item_key: e.target.value }))}
                      style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db' }} />
                    <select value={itemForm.item_type}
                      onChange={e => setItemForm(p => ({ ...p, item_type: e.target.value as CheckItemType }))}
                      style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
                      {(Object.keys(ITEM_TYPE_LABEL) as CheckItemType[]).map(t => (
                        <option key={t} value={t}>{ITEM_TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
                    <input type="number" placeholder="最小値" value={itemForm.min_value}
                      onChange={e => setItemForm(p => ({ ...p, min_value: e.target.value }))}
                      style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db' }} />
                    <input type="number" placeholder="最大値" value={itemForm.max_value}
                      onChange={e => setItemForm(p => ({ ...p, max_value: e.target.value }))}
                      style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db' }} />
                    <input type="text" placeholder="単位（°C等）" value={itemForm.unit}
                      onChange={e => setItemForm(p => ({ ...p, unit: e.target.value }))}
                      style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db' }} />
                    <select value={itemForm.tracking_mode}
                      onChange={e => setItemForm(p => ({ ...p, tracking_mode: e.target.value as TrackingMode }))}
                      style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
                      {(Object.keys(TRACKING_LABEL) as TrackingMode[]).map(t => (
                        <option key={t} value={t}>{TRACKING_LABEL[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <input type="text" placeholder="逸脱時アクション（CCP の場合は必須）" value={itemForm.deviation_action}
                      onChange={e => setItemForm(p => ({ ...p, deviation_action: e.target.value }))}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                  </div>
                  {itemForm.item_type === 'numeric' && switchbotDevices.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#475569', marginBottom: 4 }}>
                        SwitchBot 温度計と連携（任意）
                      </label>
                      <select
                        value={itemForm.switchbot_device_id}
                        onChange={e => setItemForm(p => ({ ...p, switchbot_device_id: e.target.value }))}
                        style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', boxSizing: 'border-box' }}
                      >
                        <option value="">手動入力のみ</option>
                        {switchbotDevices.map(d => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.deviceName} ({d.deviceType})
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                        選択するとcron実行時に自動で測定値が登録されます
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={itemForm.required} onChange={e => setItemForm(p => ({ ...p, required: e.target.checked }))} />
                      必須
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={itemForm.is_ccp} onChange={e => setItemForm(p => ({ ...p, is_ccp: e.target.checked }))} />
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>CCP（重要管理点）</span>
                    </label>
                  </div>
                  <button
                    onClick={handleAddItem} disabled={!itemForm.label.trim() || itemSaving}
                    style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#0f3460', color: '#fff', cursor: 'pointer', fontSize: '0.9rem' }}
                  >
                    {itemSaving ? '追加中...' : '項目を追加'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 割当管理タブ ──────────────────────────────────────────────────────────────

function AssignmentsTab({ storeId }: { storeId: string }) {
  const [, setAssignments]   = useState<Assignment[]>([]);
  const [templates, setTemplates]       = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [message, setMessage]           = useState('');

  // 編集用: timing×scope→template_ids のマップ
  type MapKey = `${CheckTiming}:${CheckScope}`;
  const [mappingMap, setMappingMap] = useState<Partial<Record<MapKey, string[]>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aData, tData] = await Promise.all([
        checkApi.getAssignments(storeId),
        checkApi.getTemplates(storeId),
      ]);
      setAssignments(aData.assignments);
      setTemplates(tData.templates);

      // マップ初期化
      const map: Partial<Record<MapKey, string[]>> = {};
      for (const a of aData.assignments) {
        const key = `${a.timing}:${a.scope}` as MapKey;
        if (!map[key]) map[key] = [];
        map[key].push(a.template_id);
      }
      setMappingMap(map);
    } catch (e: unknown) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (timing: CheckTiming, scope: CheckScope, templateId: string) => {
    const key = `${timing}:${scope}` as MapKey;
    setMappingMap(prev => {
      const list = prev[key] || [];
      const exists = list.includes(templateId);
      return { ...prev, [key]: exists ? list.filter(id => id !== templateId) : [...list, templateId] };
    });
  };

  const handleSave = async () => {
    setSaving(true); setMessage('');
    try {
      const mappings: Array<{ timing: CheckTiming; scope: CheckScope; template_id: string }> = [];
      for (const [key, ids] of Object.entries(mappingMap)) {
        if (!ids) continue;
        const [timing, scope] = key.split(':') as [CheckTiming, CheckScope];
        for (const id of ids) {
          mappings.push({ timing, scope, template_id: id });
        }
      }
      await checkApi.updateAssignments(storeId, mappings);
      setMessage('割当を保存しました');
      await load();
    } catch (e: unknown) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const timingGroups = (Object.keys(TIMING_LABEL) as CheckTiming[]);
  const scopes       = (['personal', 'store'] as CheckScope[]);

  return (
    <div>
      {message && (
        <div style={{ marginBottom: 12, color: message.startsWith('エラー') ? '#b91c1c' : '#166534', fontWeight: 500 }}>
          {message}
        </div>
      )}
      {loading ? <div className="loading">読み込み中...</div> : (
        <>
          <div style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
            タイミング × スコープごとに適用するテンプレートを選択してください。<br />
            割当がない場合はフォールバックとして is_active な基本テンプレートが使われます。
          </div>

          {timingGroups.map(timing => (
            <div key={timing} style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, padding: '8px 12px', background: '#f1f5f9', borderRadius: 6 }}>
                {TIMING_LABEL[timing]}
              </div>
              {scopes.map(scope => {
                const key = `${timing}:${scope}` as MapKey;
                const selected = mappingMap[key] || [];
                const applicable = templates.filter(t =>
                  t.timing === timing && t.scope === scope && t.is_active
                );
                if (applicable.length === 0) return null;
                return (
                  <div key={scope} style={{ marginLeft: 12, marginBottom: 12 }}>
                    <div style={{ fontWeight: 500, marginBottom: 6, fontSize: '0.9rem', color: '#475569' }}>
                      {SCOPE_LABEL[scope]}チェック
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 8 }}>
                      {applicable.map(tpl => (
                        <label key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selected.includes(tpl.id)}
                            onChange={() => toggle(timing, scope, tpl.id)}
                          />
                          <span>
                            {tpl.name}
                            <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#64748b' }}>
                              {LAYER_LABEL[tpl.layer]} v{tpl.version}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              onClick={handleSave} disabled={saving}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#0f3460', color: '#fff', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? '保存中...' : '割当を保存'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export default function ChecklistAdminPage() {
  const { selectedStore } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('store_check');

  const isManager = ['owner', 'manager', 'leader'].includes(selectedStore?.role ?? '');

  if (!selectedStore) {
    return <div className="main-content"><p>店舗を選択してください</p></div>;
  }

  return (
    <div className="main-content">
      <div className="checklist-admin">
        <div className="admin-header">
          <h3>チェックリスト</h3>
        </div>

        {/* タブ */}
        <div className="timing-tabs" style={{ marginBottom: 24 }}>
          <button
            className={`timing-tab ${activeTab === 'store_check' ? 'active' : ''}`}
            onClick={() => setActiveTab('store_check')}
          >
            今日の店舗チェック
          </button>
          {isManager && (
            <>
              <button
                className={`timing-tab ${activeTab === 'templates' ? 'active' : ''}`}
                onClick={() => setActiveTab('templates')}
              >
                テンプレート管理
              </button>
              <button
                className={`timing-tab ${activeTab === 'assignments' ? 'active' : ''}`}
                onClick={() => setActiveTab('assignments')}
              >
                割当管理
              </button>
            </>
          )}
        </div>

        {activeTab === 'store_check' && <StoreChecklistPage />}
        {activeTab === 'templates' && isManager && <TemplatesTab storeId={selectedStore.id} />}
        {activeTab === 'assignments' && isManager && <AssignmentsTab storeId={selectedStore.id} />}
      </div>
    </div>
  );
}
