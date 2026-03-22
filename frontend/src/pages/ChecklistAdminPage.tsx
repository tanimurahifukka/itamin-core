/**
 * チェックリスト管理画面（オーナー/マネージャー用）
 * 出勤用・退勤用チェック項目のカスタム設定
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { checkApi, CheckItem } from '../api/checkApi';

type Timing = 'clock_in' | 'clock_out';

export default function ChecklistAdminPage() {
  const { selectedStore } = useAuth();
  const [timing, setTiming] = useState<Timing>('clock_in');
  const [items, setItems] = useState<CheckItem[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'checkbox' | 'text'>('checkbox');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingType, setEditingType] = useState<'checkbox' | 'text'>('checkbox');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadChecklist = () => {
    if (!selectedStore) return;
    checkApi.getChecklist(selectedStore.id, timing)
      .then(data => setItems(data.checklist.items))
      .catch(() => {});
  };

  useEffect(() => { loadChecklist(); }, [selectedStore, timing]);

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

  return (
    <div className="main-content">
      <div className="checklist-admin">
        <div className="admin-header">
          <h3>チェックリスト管理</h3>
          <button className="csv-export-btn" onClick={handleExportCsv}>
            HACCP記録CSV出力
          </button>
        </div>

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
      </div>
    </div>
  );
}
