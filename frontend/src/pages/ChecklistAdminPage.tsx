/**
 * チェックリスト管理画面（オーナー/マネージャー用）
 * 既存のレガシーチェックリスト設定に加えてテンプレート管理を提供
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  checkApi,
  CheckItem,
  CheckTiming,
  ChecklistTemplate,
  ChecklistTemplateItem,
  ChecklistTemplateLayer,
  MergedChecklistItem,
  ShiftChecklistMapping,
  ShiftType,
} from '../api/checkApi';

type AdminTab = 'legacy' | 'templates' | 'shift_map';

const SHIFT_OPTIONS: Array<{ value: ShiftType; label: string }> = [
  { value: 'early', label: '早番' },
  { value: 'mid', label: '中番' },
  { value: 'late', label: '遅番' },
];

const TEMPLATE_LAYER_LABEL: Record<ChecklistTemplateLayer, string> = {
  base: '基本',
  shift: 'シフト別',
};

const TIMING_LABEL: Record<CheckTiming, string> = {
  clock_in: '出勤',
  clock_out: '退勤',
};

const emptyTemplateItem = (): ChecklistTemplateItem => ({ label: '', category: '' });

const createDefaultHaccpTemplates = (): Array<{
  name: string;
  layer: ChecklistTemplateLayer;
  timing: CheckTiming;
  items: ChecklistTemplateItem[];
}> => [
  {
    name: 'HACCP基本 出勤前確認',
    layer: 'base',
    timing: 'clock_in',
    items: [
      { label: '手洗い・消毒を実施した', category: '衛生' },
      { label: '制服・帽子・身だしなみを確認した', category: '衛生' },
      { label: '体調不良や傷の有無を確認した', category: '健康' },
      { label: '冷蔵庫・冷凍庫の温度を確認した', category: '設備' },
    ],
  },
  {
    name: 'HACCP基本 退勤前確認',
    layer: 'base',
    timing: 'clock_out',
    items: [
      { label: '使用機器の洗浄・消毒を完了した', category: '衛生' },
      { label: '原材料の保管状態を確認した', category: '保管' },
      { label: 'ゴミ処理・排水口清掃を完了した', category: '清掃' },
      { label: '温度記録・異常報告を確認した', category: '記録' },
    ],
  },
  {
    name: '早番 仕込み確認',
    layer: 'shift',
    timing: 'clock_in',
    items: [
      { label: '納品食材の状態と期限を確認した', category: '受入' },
      { label: '当日仕込み量と在庫を確認した', category: '仕込み' },
    ],
  },
  {
    name: '遅番 締め作業確認',
    layer: 'shift',
    timing: 'clock_out',
    items: [
      { label: '残数・廃棄量を記録した', category: '記録' },
      { label: '厨房施錠前の火元確認を完了した', category: '防災' },
    ],
  },
];

function TemplateEditor({
  form,
  setForm,
  onSubmit,
  onCancel,
  saving,
  submitLabel,
}: {
  form: {
    id: string | null;
    name: string;
    layer: ChecklistTemplateLayer;
    timing: CheckTiming;
    items: ChecklistTemplateItem[];
  };
  setForm: Dispatch<SetStateAction<{
    id: string | null;
    name: string;
    layer: ChecklistTemplateLayer;
    timing: CheckTiming;
    items: ChecklistTemplateItem[];
  }>>;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const updateItem = (index: number, patch: Partial<ChecklistTemplateItem>) => {
    setForm(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      )),
    }));
  };

  const addItem = () => {
    setForm(current => ({ ...current, items: [...current.items, emptyTemplateItem()] }));
  };

  const removeItem = (index: number) => {
    setForm(current => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setForm(current => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.items.length) {
        return current;
      }
      const nextItems = [...current.items];
      [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];
      return { ...current, items: nextItems };
    });
  };

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: 16,
      background: '#fafafa',
      marginBottom: 20,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr',
        gap: 12,
        marginBottom: 12,
      }}>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm(current => ({ ...current, name: e.target.value }))}
          placeholder="テンプレート名"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
          }}
        />
        <select
          value={form.layer}
          onChange={(e) => setForm(current => ({ ...current, layer: e.target.value as ChecklistTemplateLayer }))}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            background: '#fff',
          }}
        >
          <option value="base">基本</option>
          <option value="shift">シフト別</option>
        </select>
        <select
          value={form.timing}
          onChange={(e) => setForm(current => ({ ...current, timing: e.target.value as CheckTiming }))}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            background: '#fff',
          }}
        >
          <option value="clock_in">出勤</option>
          <option value="clock_out">退勤</option>
        </select>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: '0.95rem' }}>項目</strong>
        <button
          type="button"
          onClick={addItem}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          項目を追加
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {form.items.map((item, index) => (
          <div
            key={`${index}-${item.label}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '44px 2fr 1fr auto',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <div style={{
              textAlign: 'center',
              color: '#6b7280',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}>
              {index + 1}
            </div>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(index, { label: e.target.value })}
              placeholder="チェック項目"
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: '0.92rem',
                background: '#fff',
              }}
            />
            <input
              type="text"
              value={item.category || ''}
              onChange={(e) => updateItem(index, { category: e.target.value })}
              placeholder="カテゴリ"
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: '0.92rem',
                background: '#fff',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                style={miniActionButton(index === 0)}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, 1)}
                disabled={index === form.items.length - 1}
                style={miniActionButton(index === form.items.length - 1)}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeItem(index)}
                style={{
                  ...miniActionButton(false),
                  color: '#dc2626',
                  borderColor: '#fecaca',
                }}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: '#0f3460',
            color: '#fff',
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? '保存中...' : submitLabel}
        </button>
      </div>
    </div>
  );
}

function miniActionButton(disabled: boolean): CSSProperties {
  return {
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    background: '#fff',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  };
}

export default function ChecklistAdminPage() {
  const { selectedStore } = useAuth();

  const [adminTab, setAdminTab] = useState<AdminTab>('legacy');

  const [timing, setTiming] = useState<CheckTiming>('clock_in');
  const [items, setItems] = useState<CheckItem[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'checkbox' | 'text'>('checkbox');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingType, setEditingType] = useState<'checkbox' | 'text'>('checkbox');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateMessage, setTemplateMessage] = useState('');
  const [templateForm, setTemplateForm] = useState<{
    id: string | null;
    name: string;
    layer: ChecklistTemplateLayer;
    timing: CheckTiming;
    items: ChecklistTemplateItem[];
  }>({
    id: null,
    name: '',
    layer: 'base',
    timing: 'clock_in',
    items: [emptyTemplateItem()],
  });

  const [shiftMappings, setShiftMappings] = useState<Record<ShiftType, string[]>>({
    early: [],
    mid: [],
    late: [],
  });
  const [shiftMapLoading, setShiftMapLoading] = useState(false);
  const [shiftMapSaving, setShiftMapSaving] = useState(false);
  const [shiftMapMessage, setShiftMapMessage] = useState('');
  const [previewShiftType, setPreviewShiftType] = useState<ShiftType>('early');
  const [previewTiming, setPreviewTiming] = useState<CheckTiming>('clock_in');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTemplates, setPreviewTemplates] = useState<ChecklistTemplate[]>([]);
  const [previewItems, setPreviewItems] = useState<MergedChecklistItem[]>([]);

  const shiftTemplates = useMemo(
    () => templates.filter((template) => template.layer === 'shift'),
    [templates],
  );

  const resetTemplateForm = () => {
    setTemplateForm({
      id: null,
      name: '',
      layer: 'base',
      timing: 'clock_in',
      items: [emptyTemplateItem()],
    });
  };

  const loadChecklist = () => {
    if (!selectedStore) return;
    checkApi.getChecklist(selectedStore.id, timing)
      .then((data) => setItems(data.checklist.items))
      .catch(() => {});
  };

  const loadTemplates = async () => {
    if (!selectedStore) return;
    setTemplatesLoading(true);
    try {
      const data = await checkApi.getTemplates(selectedStore.id);
      setTemplates(data.templates);
    } catch (e: any) {
      setTemplateMessage(`エラー: ${e.message}`);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const loadShiftMap = async () => {
    if (!selectedStore) return;
    setShiftMapLoading(true);
    try {
      const data = await checkApi.getShiftMap(selectedStore.id);
      const nextMappings: Record<ShiftType, string[]> = { early: [], mid: [], late: [] };
      data.mappings.forEach((mapping: ShiftChecklistMapping) => {
        if (mapping.shift_type in nextMappings) {
          nextMappings[mapping.shift_type as ShiftType].push(mapping.template_id);
        }
      });
      setShiftMappings(nextMappings);
    } catch (e: any) {
      setShiftMapMessage(`エラー: ${e.message}`);
    } finally {
      setShiftMapLoading(false);
    }
  };

  const loadPreview = async (storeId: string, shiftType: ShiftType, nextTiming: CheckTiming) => {
    setPreviewLoading(true);
    try {
      const data = await checkApi.getTemplatesForShift(storeId, shiftType, nextTiming);
      setPreviewTemplates(data.templates);
      setPreviewItems(data.items);
    } catch (e: any) {
      setPreviewTemplates([]);
      setPreviewItems([]);
      setShiftMapMessage(`エラー: ${e.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    loadChecklist();
  }, [selectedStore, timing]);

  useEffect(() => {
    if (!selectedStore) return;
    setTemplateMessage('');
    setShiftMapMessage('');
    resetTemplateForm();
    loadTemplates();
    loadShiftMap();
  }, [selectedStore]);

  useEffect(() => {
    if (!selectedStore) return;
    loadPreview(selectedStore.id, previewShiftType, previewTiming);
  }, [selectedStore, previewShiftType, previewTiming]);

  const addItem = () => {
    if (!newLabel.trim()) return;
    const newItem: CheckItem = {
      id: `custom-${Date.now()}`,
      label: newLabel.trim(),
      order: items.length + 1,
      required: true,
      type: newType,
    };
    setItems([...items, newItem]);
    setNewLabel('');
    setNewType('checkbox');
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditingLabel('');
      setEditingType('checkbox');
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const updated = [...items];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    updated.forEach((item, i) => { item.order = i + 1; });
    setItems(updated);
  };

  const startEdit = (item: CheckItem) => {
    setEditingId(item.id);
    setEditingLabel(item.label);
    setEditingType(item.type || 'checkbox');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingLabel('');
    setEditingType('checkbox');
  };

  const saveEdit = () => {
    if (!editingId || !editingLabel.trim()) return;
    setItems(current => current.map(item => (
      item.id === editingId
        ? { ...item, label: editingLabel.trim(), type: editingType }
        : item
    )));
    cancelEdit();
  };

  const handleSave = async () => {
    if (!selectedStore || saving) return;
    setSaving(true);
    setMessage('');
    try {
      await checkApi.updateChecklist(selectedStore.id, timing, items);
      setMessage('保存しました');
      setTimeout(() => setMessage(''), 2000);
    } catch (e: any) {
      setMessage(`エラー: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    if (!selectedStore) return;
    window.open(checkApi.getCsvUrl(selectedStore.id), '_blank');
  };

  const handleTemplateSubmit = async () => {
    if (!selectedStore || templateSaving) return;
    const normalizedItems = templateForm.items
      .map((item) => ({
        label: item.label.trim(),
        category: item.category?.trim() || undefined,
      }))
      .filter((item) => item.label);

    if (!templateForm.name.trim()) {
      setTemplateMessage('エラー: テンプレート名を入力してください');
      return;
    }

    if (normalizedItems.length === 0) {
      setTemplateMessage('エラー: 項目を1件以上入力してください');
      return;
    }

    setTemplateSaving(true);
    setTemplateMessage('');
    try {
      if (templateForm.id) {
        await checkApi.updateTemplate(selectedStore.id, templateForm.id, {
          name: templateForm.name.trim(),
          layer: templateForm.layer,
          timing: templateForm.timing,
          items: normalizedItems,
        });
        setTemplateMessage('テンプレートを更新しました');
      } else {
        await checkApi.createTemplate(selectedStore.id, {
          name: templateForm.name.trim(),
          layer: templateForm.layer,
          timing: templateForm.timing,
          items: normalizedItems,
          sort_order: templates.length,
        });
        setTemplateMessage('テンプレートを作成しました');
      }
      resetTemplateForm();
      await loadTemplates();
      if (selectedStore) {
        await loadPreview(selectedStore.id, previewShiftType, previewTiming);
      }
    } catch (e: any) {
      setTemplateMessage(`エラー: ${e.message}`);
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleEditTemplate = (template: ChecklistTemplate) => {
    setAdminTab('templates');
    setTemplateMessage('');
    setTemplateForm({
      id: template.id,
      name: template.name,
      layer: template.layer,
      timing: template.timing,
      items: template.items.length > 0
        ? template.items.map((item) => ({ label: item.label, category: item.category || '' }))
        : [emptyTemplateItem()],
    });
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!selectedStore || !window.confirm('このテンプレートを削除しますか？')) return;
    setTemplateMessage('');
    try {
      await checkApi.deleteTemplate(selectedStore.id, templateId);
      setTemplateMessage('テンプレートを削除しました');
      setShiftMappings(current => ({
        early: current.early.filter(id => id !== templateId),
        mid: current.mid.filter(id => id !== templateId),
        late: current.late.filter(id => id !== templateId),
      }));
      if (templateForm.id === templateId) {
        resetTemplateForm();
      }
      await loadTemplates();
      await loadShiftMap();
      await loadPreview(selectedStore.id, previewShiftType, previewTiming);
    } catch (e: any) {
      setTemplateMessage(`エラー: ${e.message}`);
    }
  };

  const handleSuggestDefaults = async () => {
    if (!selectedStore || templateSaving) return;
    setTemplateSaving(true);
    setTemplateMessage('');
    try {
      const defaults = createDefaultHaccpTemplates();
      for (let index = 0; index < defaults.length; index += 1) {
        const template = defaults[index];
        await checkApi.createTemplate(selectedStore.id, {
          ...template,
          sort_order: templates.length + index,
        });
      }
      setTemplateMessage('HACCPデフォルトテンプレートを追加しました');
      await loadTemplates();
      await loadPreview(selectedStore.id, previewShiftType, previewTiming);
    } catch (e: any) {
      setTemplateMessage(`エラー: ${e.message}`);
    } finally {
      setTemplateSaving(false);
    }
  };

  const toggleShiftMapping = (shiftType: ShiftType, templateId: string) => {
    setShiftMappings(current => {
      const exists = current[shiftType].includes(templateId);
      return {
        ...current,
        [shiftType]: exists
          ? current[shiftType].filter(id => id !== templateId)
          : [...current[shiftType], templateId],
      };
    });
  };

  const handleSaveShiftMappings = async () => {
    if (!selectedStore || shiftMapSaving) return;
    setShiftMapSaving(true);
    setShiftMapMessage('');
    try {
      const mappings = Object.entries(shiftMappings).flatMap(([shiftType, templateIds]) => (
        templateIds.map((templateId) => ({
          shift_type: shiftType as ShiftType,
          template_id: templateId,
        }))
      ));
      await checkApi.updateShiftMap(selectedStore.id, mappings);
      setShiftMapMessage('シフト紐付けを保存しました');
      await loadShiftMap();
      await loadPreview(selectedStore.id, previewShiftType, previewTiming);
    } catch (e: any) {
      setShiftMapMessage(`エラー: ${e.message}`);
    } finally {
      setShiftMapSaving(false);
    }
  };

  return (
    <div className="main-content">
      <div className="checklist-admin">
        <div className="admin-header">
          <h3>チェックリスト管理</h3>
          <button className="csv-export-btn" onClick={handleExportCsv}>
            HACCP記録CSV出力
          </button>
        </div>

        <div className="timing-tabs" style={{ marginBottom: 24 }}>
          <button
            className={`timing-tab ${adminTab === 'legacy' ? 'active' : ''}`}
            onClick={() => setAdminTab('legacy')}
          >
            従来設定
          </button>
          <button
            className={`timing-tab ${adminTab === 'templates' ? 'active' : ''}`}
            onClick={() => setAdminTab('templates')}
          >
            テンプレート管理
          </button>
          <button
            className={`timing-tab ${adminTab === 'shift_map' ? 'active' : ''}`}
            onClick={() => setAdminTab('shift_map')}
          >
            シフト紐付け
          </button>
        </div>

        {adminTab === 'legacy' && (
          <>
            <div className="timing-tabs">
              <button
                className={`timing-tab ${timing === 'clock_in' ? 'active' : ''}`}
                onClick={() => setTiming('clock_in')}
              >
                出勤チェック
              </button>
              <button
                className={`timing-tab ${timing === 'clock_out' ? 'active' : ''}`}
                onClick={() => setTiming('clock_out')}
              >
                退勤チェック
              </button>
            </div>

            <div className="admin-items">
              {items.map((item, index) => (
                <div key={item.id} className="admin-item">
                  <span className="item-order">{index + 1}</span>
                  {editingId === item.id ? (
                    <div className="item-edit-form">
                      <div className="item-edit-type-selector">
                        <button
                          type="button"
                          className={`type-toggle ${editingType === 'checkbox' ? 'active' : ''}`}
                          onClick={() => setEditingType('checkbox')}
                        >
                          チェック項目
                        </button>
                        <button
                          type="button"
                          className={`type-toggle ${editingType === 'text' ? 'active' : ''}`}
                          onClick={() => setEditingType('text')}
                        >
                          記入項目
                        </button>
                      </div>
                      <input
                        type="text"
                        className="item-edit-input"
                        value={editingLabel}
                        onChange={e => setEditingLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            saveEdit();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEdit();
                          }
                        }}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <span className="item-label">
                      {item.label}
                      {item.type === 'text' && (
                        <span className="item-type-badge text">記入</span>
                      )}
                    </span>
                  )}
                  <div className="item-actions">
                    {editingId === item.id ? (
                      <>
                        <button type="button" onClick={saveEdit}>保存</button>
                        <button type="button" onClick={cancelEdit}>取消</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(item)}>編集</button>
                        <button type="button" onClick={() => moveItem(index, -1)} disabled={index === 0}>↑</button>
                        <button type="button" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>↓</button>
                        <button type="button" className="delete-btn" onClick={() => removeItem(item.id)}>×</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="add-item-form">
              <div className="add-item-type-selector">
                <button
                  type="button"
                  className={`type-toggle ${newType === 'checkbox' ? 'active' : ''}`}
                  onClick={() => setNewType('checkbox')}
                >
                  チェック項目
                </button>
                <button
                  type="button"
                  className={`type-toggle ${newType === 'text' ? 'active' : ''}`}
                  onClick={() => setNewType('text')}
                >
                  記入項目
                </button>
              </div>
              <div className="add-item-row">
                <input
                  type="text"
                  placeholder={newType === 'text' ? '例: 冷蔵庫の温度（℃）' : '新しいチェック項目を入力'}
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addItem();
                    }
                  }}
                />
                <button type="button" onClick={addItem}>追加</button>
              </div>
            </div>

            <div className="save-row">
              {message && (
                <span className={message.startsWith('エラー') ? 'error-msg' : 'success-msg'}>
                  {message}
                </span>
              )}
              <button className="save-btn" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '変更を保存'}
              </button>
            </div>
          </>
        )}

        {adminTab === 'templates' && (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
              padding: 14,
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>HACCPデフォルトテンプレート提案</div>
                <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                  初期セットとして基本テンプレートとシフト別テンプレートを追加します。
                </div>
              </div>
              <button
                type="button"
                onClick={handleSuggestDefaults}
                disabled={templateSaving}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  borderRadius: 8,
                  background: '#e94560',
                  color: '#fff',
                  cursor: templateSaving ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: templateSaving ? 0.7 : 1,
                }}
              >
                {templateSaving ? '追加中...' : 'デフォルトを提案'}
              </button>
            </div>

            <TemplateEditor
              form={templateForm}
              setForm={setTemplateForm}
              onSubmit={handleTemplateSubmit}
              onCancel={resetTemplateForm}
              saving={templateSaving}
              submitLabel={templateForm.id ? '更新する' : '作成する'}
            />

            {templateMessage && (
              <div style={{
                marginBottom: 16,
                color: templateMessage.startsWith('エラー') ? '#b91c1c' : '#166534',
                fontWeight: 500,
              }}>
                {templateMessage}
              </div>
            )}

            <div style={{ fontWeight: 600, marginBottom: 12 }}>テンプレート一覧</div>
            {templatesLoading ? (
              <div className="loading">読み込み中...</div>
            ) : templates.length === 0 ? (
              <div style={{
                padding: 18,
                border: '1px dashed #cbd5e1',
                borderRadius: 10,
                color: '#64748b',
                background: '#fff',
              }}>
                テンプレートはまだありません。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {templates.map((template) => (
                  <div
                    key={template.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 100px 1fr 100px auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '14px 16px',
                      background: '#fff',
                      borderRadius: 10,
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#475569' }}>
                      {TEMPLATE_LAYER_LABEL[template.layer]}
                    </span>
                    <span style={{ color: '#475569' }}>{TIMING_LABEL[template.timing]}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{template.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 2 }}>
                        {template.items.slice(0, 3).map((item) => item.label).join(' / ')}
                        {template.items.length > 3 ? ' ...' : ''}
                      </div>
                    </div>
                    <span style={{ color: '#475569' }}>{template.items.length}項目</span>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => handleEditTemplate(template)} style={miniActionButton(false)}>
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(template.id)}
                        style={{
                          ...miniActionButton(false),
                          color: '#dc2626',
                          borderColor: '#fecaca',
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {adminTab === 'shift_map' && (
          <>
            <div style={{
              padding: 14,
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              marginBottom: 18,
              color: '#475569',
              fontSize: '0.92rem',
            }}>
              基本テンプレートは出勤・退勤ごとに自動適用されます。ここではシフト別テンプレートのみ紐付けます。
            </div>

            {shiftMapMessage && (
              <div style={{
                marginBottom: 14,
                color: shiftMapMessage.startsWith('エラー') ? '#b91c1c' : '#166534',
                fontWeight: 500,
              }}>
                {shiftMapMessage}
              </div>
            )}

            {shiftMapLoading ? (
              <div className="loading">読み込み中...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
                {SHIFT_OPTIONS.map((shift) => (
                  <div
                    key={shift.value}
                    style={{
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      padding: 16,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>{shift.label}</div>
                    {shiftTemplates.length === 0 ? (
                      <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>シフト別テンプレートがありません。</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {shiftTemplates.map((template) => {
                          const checked = shiftMappings[shift.value].includes(template.id);
                          return (
                            <label
                              key={`${shift.value}-${template.id}`}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleShiftMapping(shift.value, template.id)}
                                style={{ marginTop: 3 }}
                              />
                              <span>
                                <span style={{ display: 'block', fontWeight: 600 }}>{template.name}</span>
                                <span style={{ display: 'block', fontSize: '0.84rem', color: '#6b7280' }}>
                                  {TIMING_LABEL[template.timing]} / {template.items.length}項目
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="save-row" style={{ marginBottom: 24 }}>
              <span style={{ color: '#64748b', fontSize: '0.9rem' }}>シフト紐付けを変更したら保存してください。</span>
              <button className="save-btn" onClick={handleSaveShiftMappings} disabled={shiftMapSaving}>
                {shiftMapSaving ? '保存中...' : '紐付けを保存'}
              </button>
            </div>

            <div style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: 18,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700 }}>結合チェックリストプレビュー</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={previewShiftType}
                    onChange={(e) => setPreviewShiftType(e.target.value as ShiftType)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      background: '#fff',
                    }}
                  >
                    {SHIFT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select
                    value={previewTiming}
                    onChange={(e) => setPreviewTiming(e.target.value as CheckTiming)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      background: '#fff',
                    }}
                  >
                    <option value="clock_in">出勤</option>
                    <option value="clock_out">退勤</option>
                  </select>
                </div>
              </div>

              {previewLoading ? (
                <div className="loading">読み込み中...</div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '280px 1fr',
                  gap: 16,
                  alignItems: 'start',
                }}>
                  <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: 16,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 10 }}>適用テンプレート</div>
                    {previewTemplates.length === 0 ? (
                      <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>適用テンプレートはありません。</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {previewTemplates.map((template) => (
                          <div key={template.id} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>{template.name}</div>
                            <div style={{ fontSize: '0.84rem', color: '#6b7280', marginTop: 2 }}>
                              {TEMPLATE_LAYER_LABEL[template.layer]} / {TIMING_LABEL[template.timing]}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: 16,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 10 }}>結合後の項目</div>
                    {previewItems.length === 0 ? (
                      <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>プレビュー対象の項目はありません。</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {previewItems.map((item, index) => (
                          <div
                            key={`${item.template_id}-${index}-${item.label}`}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              padding: '10px 12px',
                              borderRadius: 8,
                              background: '#f8fafc',
                              border: '1px solid #eef2f7',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600 }}>{index + 1}. {item.label}</div>
                              {item.category && (
                                <div style={{ fontSize: '0.84rem', color: '#6b7280', marginTop: 2 }}>
                                  カテゴリ: {item.category}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#64748b', textAlign: 'right' }}>
                              <div>{item.template_name}</div>
                              <div>{TEMPLATE_LAYER_LABEL[item.layer]}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
