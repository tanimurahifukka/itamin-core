import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';
import type { MenuItem } from '../types/api';

const CATEGORIES = ['ドリンク', 'フード', '物販', 'その他'];

export default function MenuPage() {
  const { selectedStore } = useAuth();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);

  // フォーム
  const [name, setName] = useState('');
  const [category, setCategory] = useState('ドリンク');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(() => {
    if (!selectedStore) return;
    const active = showInactive ? undefined : true;
    api.getMenuItems(selectedStore.id, active)
      .then((data) => setItems(data.items))
      .catch(() => {});
  }, [selectedStore, showInactive]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const resetForm = () => {
    setName('');
    setCategory('ドリンク');
    setPrice('');
    setEditing(null);
  };

  const startEdit = (item: MenuItem) => {
    setEditing(item);
    setName(item.name);
    setCategory(item.category || 'ドリンク');
    setPrice(String(item.price));
  };

  const handleSave = async () => {
    if (!selectedStore || !name.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await api.updateMenuItem(selectedStore.id, editing.id, {
          name: name.trim(),
          category,
          price: Number(price) || 0,
        });
        showToast('更新しました', 'success');
      } else {
        await api.createMenuItem(selectedStore.id, {
          name: name.trim(),
          category,
          price: Number(price) || 0,
          display_order: items.length,
        });
        showToast('追加しました', 'success');
      }
      resetForm();
      loadItems();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    if (!selectedStore || !confirm(`「${item.name}」を販売終了にしますか？`)) return;
    try {
      await api.deleteMenuItem(selectedStore.id, item.id);
      showToast('販売終了にしました', 'info');
      loadItems();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '操作に失敗しました', 'error');
    }
  };

  const handleReactivate = async (item: MenuItem) => {
    if (!selectedStore) return;
    try {
      await api.updateMenuItem(selectedStore.id, item.id, { is_active: true });
      showToast('再販売にしました', 'success');
      loadItems();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '操作に失敗しました', 'error');
    }
  };

  // カテゴリでグループ化
  const grouped = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category || 'その他';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="main-content">
      {/* 追加/編集フォーム */}
      <div className="records-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>{editing ? '商品を編集' : '商品を追加'}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="商品名 *"
              value={name}
              onChange={e => setName(e.target.value)}
              className="form-input"
              style={{ flex: 2, minWidth: 150 }}
            />
            <select value={category} onChange={e => setCategory(e.target.value)} className="form-input" style={{ flex: 1, minWidth: 100 }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="number"
              placeholder="価格（円）"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="form-input"
              style={{ flex: 1, minWidth: 100 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {editing && (
              <button onClick={resetForm} style={{ padding: '8px 16px', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
                キャンセル
              </button>
            )}
            <button onClick={handleSave} disabled={saving || !name.trim()} className="form-save-btn">
              {saving ? '保存中...' : editing ? '更新' : '追加'}
            </button>
          </div>
        </div>
      </div>

      {/* フィルタ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3>商品一覧</h3>
        <label style={{ fontSize: '0.85rem', color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          販売終了も表示
        </label>
      </div>

      {/* 商品一覧 */}
      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">☕</div>
          <p className="empty-state-text">商品がありません</p>
          <p className="empty-state-hint">上のフォームから商品を追加してください</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', marginBottom: 8, padding: '4px 0', borderBottom: '1px solid #e5e7eb' }}>
              {cat}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {catItems.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: item.isActive ? 'white' : '#f8f8f8',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    opacity: item.isActive ? 1 : 0.6,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{item.name}</span>
                    {!item.isActive && <span style={{ fontSize: '0.75rem', color: '#dc2626', marginLeft: 8 }}>販売終了</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 500 }}>¥{item.price.toLocaleString()}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEdit(item)} style={{ padding: '4px 8px', border: '1px solid #d4d9df', borderRadius: 4, background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                        編集
                      </button>
                      {item.isActive ? (
                        <button onClick={() => handleDelete(item)} style={{ padding: '4px 8px', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>
                          終了
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(item)} style={{ padding: '4px 8px', border: '1px solid #22c55e', borderRadius: 4, background: 'white', color: '#22c55e', cursor: 'pointer', fontSize: '0.8rem' }}>
                          再販売
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
