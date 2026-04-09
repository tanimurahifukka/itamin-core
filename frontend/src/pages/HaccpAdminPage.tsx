import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';

const TIMINGS = [
  { key: 'store_opening', label: '開店前' },
  { key: 'store_daily',   label: '営業中' },
  { key: 'store_closing', label: '閉店後' },
  { key: 'clock_in',      label: '出勤時' },
  { key: 'clock_out',     label: '退勤時' },
  { key: 'ad_hoc',        label: '随時' },
];

const ITEM_TYPES = [
  { key: 'checkbox', label: 'チェックボックス' },
  { key: 'numeric',  label: '数値入力' },
  { key: 'text',     label: 'テキスト' },
  { key: 'select',   label: '選択肢' },
];

interface TemplateItem {
  id: string;
  label: string;
  item_type: string;
  required: boolean;
  min_value?: number | null;
  max_value?: number | null;
  unit?: string | null;
  options?: any;
  sort_order: number;
}

interface Template {
  id: string;
  name: string;
  timing: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  items: TemplateItem[];
}

interface SystemTemplate {
  id: string;
  name: string;
  timing: string;
  description?: string | null;
  items: { label: string; item_type: string }[];
}

const EMPTY_NEW_TPL = { name: '', timing: 'store_opening', description: '' };
const EMPTY_NEW_ITEM = { label: '', item_type: 'checkbox', required: true, min_value: '', max_value: '', unit: '', options: '' };

export default function HaccpAdminPage() {
  const { selectedStore } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [timingFilter, setTimingFilter] = useState('store_opening');
  const [selected, setSelected] = useState<Template | null>(null);
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newTpl, setNewTpl] = useState(EMPTY_NEW_TPL);
  const [creatingTpl, setCreatingTpl] = useState(false);
  const [editingTpl, setEditingTpl] = useState<{ name: string; timing: string; description: string } | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [deletingTpl, setDeletingTpl] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_NEW_ITEM);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemDraft, setEditItemDraft] = useState<any>({});
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (!selectedStore) return;
    if (showLoading) setLoading(true);
    try {
      const [tplRes, sysRes] = await Promise.all([
        api.getHaccpTemplates(selectedStore.id),
        api.getHaccpSystemTemplates(selectedStore.id),
      ]);
      setTemplates(tplRes.templates || []);
      setSystemTemplates(sysRes.templates || []);
      setSelected(prev => prev ? (tplRes.templates || []).find((t: Template) => t.id === prev.id) || null : null);
    } catch (e: any) {
      showToast(e.message || '読み込みに失敗しました', 'error');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [selectedStore]);

  useEffect(() => { load(true); }, [load]);

  const filteredTemplates = templates.filter(t => t.timing === timingFilter);

  // ── テンプレート作成
  const handleCreateTpl = async () => {
    if (!selectedStore || !newTpl.name || !newTpl.timing) return;
    setCreatingTpl(true);
    try {
      const res = await api.createHaccpTemplate(selectedStore.id, {
        name: newTpl.name.trim(),
        timing: newTpl.timing,
        description: newTpl.description.trim() || undefined,
      });
      showToast('テンプレートを作成しました', 'success');
      setShowNewTpl(false);
      setNewTpl(EMPTY_NEW_TPL);
      await load();
      setSelected(res.template);
    } catch (e: any) {
      showToast(e.message || '作成に失敗しました', 'error');
    } finally {
      setCreatingTpl(false);
    }
  };

  // ── テンプレート更新
  const handleSaveTpl = async () => {
    if (!selectedStore || !selected || !editingTpl) return;
    setSavingTpl(true);
    try {
      await api.updateHaccpTemplate(selectedStore.id, selected.id, {
        name: editingTpl.name.trim(),
        timing: editingTpl.timing,
        description: editingTpl.description.trim() || null,
      });
      showToast('更新しました', 'success');
      setEditingTpl(null);
      await load();
    } catch (e: any) {
      showToast(e.message || '更新に失敗しました', 'error');
    } finally {
      setSavingTpl(false);
    }
  };

  // ── テンプレート削除
  const handleDeleteTpl = async () => {
    if (!selectedStore || !selected) return;
    if (!window.confirm(`「${selected.name}」を削除しますか？\n含まれるすべての項目も削除されます。`)) return;
    setDeletingTpl(true);
    try {
      await api.deleteHaccpTemplate(selectedStore.id, selected.id);
      showToast('テンプレートを削除しました', 'success');
      setSelected(null);
      setEditingTpl(null);
      await load();
    } catch (e: any) {
      showToast(e.message || '削除に失敗しました', 'error');
    } finally {
      setDeletingTpl(false);
    }
  };

  // ── アイテム追加
  const handleAddItem = async () => {
    if (!selectedStore || !selected || !newItem.label || !newItem.item_type) return;
    setAddingItem(true);
    try {
      const opts = newItem.options ? newItem.options.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      await api.addHaccpItem(selectedStore.id, selected.id, {
        label: newItem.label.trim(),
        item_type: newItem.item_type,
        required: newItem.required,
        min_value: newItem.min_value !== '' ? Number(newItem.min_value) : null,
        max_value: newItem.max_value !== '' ? Number(newItem.max_value) : null,
        unit: newItem.unit.trim() || null,
        options: opts.length > 0 ? opts : null,
      });
      showToast('項目を追加しました', 'success');
      setShowNewItem(false);
      setNewItem(EMPTY_NEW_ITEM);
      await load();
    } catch (e: any) {
      showToast(e.message || '追加に失敗しました', 'error');
    } finally {
      setAddingItem(false);
    }
  };

  // ── アイテム更新
  const handleSaveItem = async (itemId: string) => {
    if (!selectedStore || !selected) return;
    setSavingItem(true);
    try {
      const opts = editItemDraft.options
        ? typeof editItemDraft.options === 'string'
          ? editItemDraft.options.split(',').map((s: string) => s.trim()).filter(Boolean)
          : editItemDraft.options
        : null;
      await api.updateHaccpItem(selectedStore.id, selected.id, itemId, {
        label: editItemDraft.label?.trim(),
        item_type: editItemDraft.item_type,
        required: editItemDraft.required,
        min_value: editItemDraft.min_value !== '' && editItemDraft.min_value != null ? Number(editItemDraft.min_value) : null,
        max_value: editItemDraft.max_value !== '' && editItemDraft.max_value != null ? Number(editItemDraft.max_value) : null,
        unit: editItemDraft.unit?.trim() || null,
        options: opts,
      });
      showToast('項目を更新しました', 'success');
      setEditingItem(null);
      await load();
    } catch (e: any) {
      showToast(e.message || '更新に失敗しました', 'error');
    } finally {
      setSavingItem(false);
    }
  };

  // ── アイテム削除
  const handleDeleteItem = async (itemId: string, label: string) => {
    if (!selectedStore || !selected) return;
    if (!window.confirm(`「${label}」を削除しますか？`)) return;
    setDeletingItem(itemId);
    try {
      await api.deleteHaccpItem(selectedStore.id, selected.id, itemId);
      showToast('項目を削除しました', 'success');
      await load();
    } catch (e: any) {
      showToast(e.message || '削除に失敗しました', 'error');
    } finally {
      setDeletingItem(null);
    }
  };

  // ── システムテンプレートからインポート
  const handleImport = async (sysId: string) => {
    if (!selectedStore) return;
    setImporting(sysId);
    try {
      const res = await api.importHaccpSystemTemplate(selectedStore.id, sysId);
      showToast('テンプレートをインポートしました', 'success');
      setShowImport(false);
      await load();
      setTimingFilter(res.template.timing);
      setSelected(res.template);
    } catch (e: any) {
      showToast(e.message || 'インポートに失敗しました', 'error');
    } finally {
      setImporting(null);
    }
  };

  // ── アクティブ切り替え
  const handleToggleActive = async (tpl: Template) => {
    if (!selectedStore) return;
    try {
      await api.updateHaccpTemplate(selectedStore.id, tpl.id, { is_active: !tpl.is_active });
      await load();
    } catch (e: any) {
      showToast(e.message || '更新に失敗しました', 'error');
    }
  };

  const startEditItem = (item: TemplateItem) => {
    const opts = Array.isArray(item.options)
      ? item.options.join(', ')
      : (item.options ? JSON.stringify(item.options) : '');
    setEditingItem(item.id);
    setEditItemDraft({
      label: item.label,
      item_type: item.item_type,
      required: item.required,
      min_value: item.min_value ?? '',
      max_value: item.max_value ?? '',
      unit: item.unit ?? '',
      options: opts,
    });
  };

  if (loading) return <div className="main-content"><div style={{ color: '#999', padding: 32 }}>読み込み中...</div></div>;

  return (
    <div className="main-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>HACCPテンプレート管理</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn.secondary} onClick={() => { setShowImport(!showImport); setShowNewTpl(false); }}>
            システムから追加
          </button>
          <button style={btn.primary} onClick={() => { setShowNewTpl(!showNewTpl); setShowImport(false); }}>
            ＋ 新規作成
          </button>
        </div>
      </div>
      <p style={{ color: '#888', marginBottom: 20, fontSize: '0.85rem' }}>
        キオスクで使用するHACCPチェックリストのテンプレートを管理します
      </p>

      {/* システムテンプレートインポートパネル */}
      {showImport && (
        <div style={panel}>
          <div style={panelTitle}>システムテンプレートから追加（カフェ向けプリセット）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {systemTemplates.map(st => (
              <div key={st.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{st.name}</div>
                  <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 2 }}>
                    {TIMINGS.find(t => t.key === st.timing)?.label} · {st.items.length}項目
                    {st.description && ` · ${st.description}`}
                  </div>
                </div>
                <button
                  style={btn.primary}
                  onClick={() => handleImport(st.id)}
                  disabled={importing === st.id}
                >
                  {importing === st.id ? '追加中...' : '追加'}
                </button>
              </div>
            ))}
            {systemTemplates.length === 0 && <div style={{ color: '#aaa', fontSize: '0.85rem' }}>システムテンプレートがありません</div>}
          </div>
        </div>
      )}

      {/* 新規テンプレート作成フォーム */}
      {showNewTpl && (
        <div style={panel}>
          <div style={panelTitle}>新規テンプレート</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <div style={fieldLabel}>テンプレート名 *</div>
              <input style={input} value={newTpl.name} onChange={e => setNewTpl(p => ({ ...p, name: e.target.value }))} placeholder="例: 開店前温度確認" />
            </div>
            <div>
              <div style={fieldLabel}>タイミング *</div>
              <select style={input} value={newTpl.timing} onChange={e => setNewTpl(p => ({ ...p, timing: e.target.value }))}>
                {TIMINGS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={fieldLabel}>説明（任意）</div>
              <input style={input} value={newTpl.description} onChange={e => setNewTpl(p => ({ ...p, description: e.target.value }))} placeholder="例: 開店前の温度管理チェック" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={btn.primary} onClick={handleCreateTpl} disabled={creatingTpl || !newTpl.name}>
              {creatingTpl ? '作成中...' : '作成'}
            </button>
            <button style={btn.ghost} onClick={() => { setShowNewTpl(false); setNewTpl(EMPTY_NEW_TPL); }}>キャンセル</button>
          </div>
        </div>
      )}

      {/* タイミングタブ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TIMINGS.map(t => {
          const count = templates.filter(tp => tp.timing === t.key).length;
          return (
            <button
              key={t.key}
              style={{ ...btn.tab, ...(timingFilter === t.key ? btn.tabActive : {}) }}
              onClick={() => { setTimingFilter(t.key); setSelected(null); setEditingTpl(null); }}
            >
              {t.label}
              {count > 0 && <span style={countBadge}>{count}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* テンプレート一覧 */}
        <div style={{ flex: '0 0 280px' }}>
          {filteredTemplates.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: '0.85rem', padding: '20px 0' }}>
              このタイミングのテンプレートはありません
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredTemplates.map(tpl => (
                <div
                  key={tpl.id}
                  style={{
                    background: selected?.id === tpl.id ? '#eff6ff' : '#fff',
                    border: `1px solid ${selected?.id === tpl.id ? '#2563eb' : '#d4d9df'}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    cursor: 'pointer',
                  }}
                  onClick={() => { setSelected(tpl); setEditingTpl(null); setShowNewItem(false); }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{tpl.name}</div>
                    <button
                      style={{ ...btn.ghost, padding: '2px 8px', fontSize: '0.75rem', marginLeft: 6 }}
                      onClick={e => { e.stopPropagation(); handleToggleActive(tpl); }}
                    >
                      {tpl.is_active ? '有効' : '無効'}
                    </button>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 4 }}>
                    {tpl.items.length}項目
                    {tpl.description && ` · ${tpl.description}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* テンプレート詳細・編集 */}
        {selected && (
          <div style={{ flex: 1, background: '#fff', border: '1px solid #d4d9df', borderRadius: 8, padding: 20 }}>
            {/* ヘッダー */}
            {editingTpl ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={fieldLabel}>テンプレート名</div>
                    <input style={input} value={editingTpl.name} onChange={e => setEditingTpl(p => p ? { ...p, name: e.target.value } : p)} />
                  </div>
                  <div>
                    <div style={fieldLabel}>タイミング</div>
                    <select style={input} value={editingTpl.timing} onChange={e => setEditingTpl(p => p ? { ...p, timing: e.target.value } : p)}>
                      {TIMINGS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={fieldLabel}>説明</div>
                    <input style={input} value={editingTpl.description} onChange={e => setEditingTpl(p => p ? { ...p, description: e.target.value } : p)} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btn.primary} onClick={handleSaveTpl} disabled={savingTpl}>{savingTpl ? '保存中...' : '保存'}</button>
                  <button style={btn.ghost} onClick={() => setEditingTpl(null)}>キャンセル</button>
                  <button style={{ ...btn.danger, marginLeft: 'auto' }} onClick={handleDeleteTpl} disabled={deletingTpl}>{deletingTpl ? '削除中...' : '削除'}</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{selected.name}</div>
                  <div style={{ fontSize: '0.82rem', color: '#888', marginTop: 2 }}>
                    {TIMINGS.find(t => t.key === selected.timing)?.label}
                    {selected.description && ` · ${selected.description}`}
                    {' · '}<span style={{ color: selected.is_active ? '#22c55e' : '#aaa' }}>{selected.is_active ? '有効' : '無効'}</span>
                  </div>
                </div>
                <button style={btn.secondary} onClick={() => setEditingTpl({ name: selected.name, timing: selected.timing, description: selected.description || '' })}>
                  編集
                </button>
              </div>
            )}

            <div style={{ borderTop: '1px solid #e8edf3', paddingTop: 16, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#555' }}>チェック項目 ({selected.items.length})</div>
                <button style={btn.primary} onClick={() => setShowNewItem(!showNewItem)}>＋ 項目追加</button>
              </div>

              {/* 新規項目追加フォーム */}
              {showNewItem && (
                <div style={{ ...panel, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={fieldLabel}>項目名 *</div>
                      <input style={input} value={newItem.label} onChange={e => setNewItem(p => ({ ...p, label: e.target.value }))} placeholder="例: 冷蔵庫温度（°C）" />
                    </div>
                    <div>
                      <div style={fieldLabel}>種別 *</div>
                      <select style={input} value={newItem.item_type} onChange={e => setNewItem(p => ({ ...p, item_type: e.target.value }))}>
                        {ITEM_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                      <input type="checkbox" checked={newItem.required} onChange={e => setNewItem(p => ({ ...p, required: e.target.checked }))} id="req-new" />
                      <label htmlFor="req-new" style={{ fontSize: '0.88rem' }}>必須</label>
                    </div>
                    {newItem.item_type === 'numeric' && (<>
                      <div>
                        <div style={fieldLabel}>最小値</div>
                        <input style={input} type="number" step="0.1" value={newItem.min_value} onChange={e => setNewItem(p => ({ ...p, min_value: e.target.value }))} />
                      </div>
                      <div>
                        <div style={fieldLabel}>最大値</div>
                        <input style={input} type="number" step="0.1" value={newItem.max_value} onChange={e => setNewItem(p => ({ ...p, max_value: e.target.value }))} />
                      </div>
                      <div>
                        <div style={fieldLabel}>単位</div>
                        <input style={input} value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))} placeholder="例: °C" />
                      </div>
                    </>)}
                    {newItem.item_type === 'select' && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={fieldLabel}>選択肢（カンマ区切り）</div>
                        <input style={input} value={newItem.options} onChange={e => setNewItem(p => ({ ...p, options: e.target.value }))} placeholder="例: 良,不良,確認中" />
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button style={btn.primary} onClick={handleAddItem} disabled={addingItem || !newItem.label}>{addingItem ? '追加中...' : '追加'}</button>
                    <button style={btn.ghost} onClick={() => { setShowNewItem(false); setNewItem(EMPTY_NEW_ITEM); }}>キャンセル</button>
                  </div>
                </div>
              )}

              {/* 項目一覧 */}
              {selected.items.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: '0.85rem', padding: '12px 0' }}>項目がありません。「項目追加」から追加してください。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selected.items.map((item, idx) => (
                    <div key={item.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                      {editingItem === item.id ? (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <div style={fieldLabel}>項目名</div>
                              <input style={input} value={editItemDraft.label || ''} onChange={e => setEditItemDraft((p: any) => ({ ...p, label: e.target.value }))} />
                            </div>
                            <div>
                              <div style={fieldLabel}>種別</div>
                              <select style={input} value={editItemDraft.item_type} onChange={e => setEditItemDraft((p: any) => ({ ...p, item_type: e.target.value }))}>
                                {ITEM_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                              </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                              <input type="checkbox" checked={!!editItemDraft.required} onChange={e => setEditItemDraft((p: any) => ({ ...p, required: e.target.checked }))} id={`req-${item.id}`} />
                              <label htmlFor={`req-${item.id}`} style={{ fontSize: '0.88rem' }}>必須</label>
                            </div>
                            {editItemDraft.item_type === 'numeric' && (<>
                              <div>
                                <div style={fieldLabel}>最小値</div>
                                <input style={input} type="number" step="0.1" value={editItemDraft.min_value ?? ''} onChange={e => setEditItemDraft((p: any) => ({ ...p, min_value: e.target.value }))} />
                              </div>
                              <div>
                                <div style={fieldLabel}>最大値</div>
                                <input style={input} type="number" step="0.1" value={editItemDraft.max_value ?? ''} onChange={e => setEditItemDraft((p: any) => ({ ...p, max_value: e.target.value }))} />
                              </div>
                              <div>
                                <div style={fieldLabel}>単位</div>
                                <input style={input} value={editItemDraft.unit ?? ''} onChange={e => setEditItemDraft((p: any) => ({ ...p, unit: e.target.value }))} />
                              </div>
                            </>)}
                            {editItemDraft.item_type === 'select' && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <div style={fieldLabel}>選択肢（カンマ区切り）</div>
                                <input style={input} value={editItemDraft.options ?? ''} onChange={e => setEditItemDraft((p: any) => ({ ...p, options: e.target.value }))} />
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button style={btn.primary} onClick={() => handleSaveItem(item.id)} disabled={savingItem}>{savingItem ? '保存中...' : '保存'}</button>
                            <button style={btn.ghost} onClick={() => setEditingItem(null)}>キャンセル</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: '#aaa', fontSize: '0.78rem', minWidth: 20 }}>{idx + 1}</span>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.label}</span>
                            {item.required && <span style={{ color: '#ef5350', marginLeft: 4, fontSize: '0.78rem' }}>必須</span>}
                            <span style={{ color: '#888', fontSize: '0.78rem', marginLeft: 8 }}>
                              {ITEM_TYPES.find(t => t.key === item.item_type)?.label}
                              {item.unit && ` (${item.unit})`}
                              {item.min_value != null && item.max_value != null && ` [${item.min_value}〜${item.max_value}]`}
                            </span>
                          </div>
                          <button style={{ ...btn.ghost, padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => startEditItem(item)}>編集</button>
                          <button
                            style={{ ...btn.danger, padding: '3px 10px', fontSize: '0.78rem' }}
                            onClick={() => handleDeleteItem(item.id, item.label)}
                            disabled={deletingItem === item.id}
                          >
                            {deletingItem === item.id ? '...' : '削除'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const btn = {
  primary: { padding: '7px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  secondary: { padding: '7px 16px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  ghost: { padding: '7px 14px', background: 'transparent', color: '#555', border: '1px solid #d4d9df', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  danger: { padding: '7px 14px', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' } as React.CSSProperties,
  tab: { padding: '6px 16px', background: '#fff', color: '#555', border: '1px solid #d4d9df', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 } as React.CSSProperties,
  tabActive: { background: '#eff6ff', color: '#2563eb', borderColor: '#2563eb', fontWeight: 600 } as React.CSSProperties,
};

const panel: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginBottom: 20 };
const panelTitle: React.CSSProperties = { fontWeight: 600, fontSize: '0.88rem', color: '#475569' };
const fieldLabel: React.CSSProperties = { fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: 4 };
const input: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #d4d9df', borderRadius: 6, fontSize: '0.88rem', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' };
const countBadge: React.CSSProperties = { background: '#2563eb', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: '0.72rem', fontWeight: 700 };
