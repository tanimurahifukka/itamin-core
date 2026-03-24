import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  cost: number;
  note: string | null;
  status: string;
  lastCheckedAt: string | null;
}

const STATUS_OPTIONS = [
  { value: '適正', color: '#22c55e', bg: '#f0fdf4' },
  { value: '発注検討', color: '#f59e0b', bg: '#fffbeb' },
  { value: '発注済', color: '#2563eb', bg: '#eff6ff' },
  { value: '入荷待ち', color: '#8b5cf6', bg: '#f5f3ff' },
  { value: '在庫切れ', color: '#dc2626', bg: '#fef2f2' },
];

export default function InventoryPage() {
  const { selectedStore } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string>('');
  const [editingValue, setEditingValue] = useState<string>('');

  // 新規追加フォーム
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState('個');
  const [newQuantity, setNewQuantity] = useState('0');
  const [newMinQuantity, setNewMinQuantity] = useState('0');
  const [newCost, setNewCost] = useState('0');
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);

  const loadItems = () => {
    if (!selectedStore) return;
    const category = activeCategory || undefined;
    api.getInventory(selectedStore.id, category)
      .then(data => setItems(data.items))
      .catch(() => {});
  };

  useEffect(() => { loadItems(); }, [selectedStore, activeCategory]);

  // カテゴリ一覧はフィルタなし全件から算出
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const loadCategories = () => {
    if (!selectedStore) return;
    api.getInventory(selectedStore.id)
      .then(data => {
        const cats = Array.from(new Set((data.items as InventoryItem[]).map(i => i.category).filter(Boolean)));
        setAllCategories(cats);
      })
      .catch(() => {});
  };
  useEffect(() => { loadCategories(); }, [selectedStore]);

  const categories = allCategories;

  const handleAdd = async () => {
    if (!selectedStore || !newName.trim() || adding) return;
    setAdding(true);
    try {
      await api.addInventoryItem(selectedStore.id, {
        name: newName.trim(),
        category: newCategory.trim(),
        unit: newUnit.trim() || '個',
        quantity: Number(newQuantity) || 0,
        minQuantity: Number(newMinQuantity) || 0,
        cost: Number(newCost) || 0,
        note: newNote.trim() || undefined,
      });
      setNewName('');
      setNewCategory('');
      setNewUnit('個');
      setNewQuantity('0');
      setNewMinQuantity('0');
      setNewCost('0');
      setNewNote('');
      showToast('商品を追加しました', 'success');
      loadItems();
      loadCategories();
    } catch (e: any) {
      showToast(e.message || '追加に失敗しました', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!selectedStore) return;
    if (!confirm(`「${item.name}」を削除しますか？`)) return;
    try {
      await api.deleteInventoryItem(selectedStore.id, item.id);
      showToast('削除しました', 'info');
      loadItems();
      loadCategories();
    } catch (e: any) {
      showToast(e.message || '削除に失敗しました', 'error');
    }
  };

  const startEdit = (item: InventoryItem, field: string) => {
    setEditingId(item.id);
    setEditingField(field);
    setEditingValue(String((item as any)[field] ?? ''));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingField('');
    setEditingValue('');
  };

  const saveEdit = async () => {
    if (!selectedStore || !editingId) return;
    const numericFields = ['quantity', 'minQuantity', 'cost'];
    const value = numericFields.includes(editingField)
      ? Number(editingValue) || 0
      : editingValue;

    try {
      await api.updateInventoryItem(selectedStore.id, editingId, { [editingField]: value });
      showToast('更新しました', 'success');
      cancelEdit();
      loadItems();
    } catch (e: any) {
      showToast(e.message || '更新に失敗しました', 'error');
    }
  };

  // サマリー計算
  const displayItems = items;
  const totalItems = displayItems.length;
  const lowStockCount = displayItems.filter(i => Number(i.quantity) < Number(i.minQuantity) && Number(i.minQuantity) > 0).length;
  const totalValue = displayItems.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.cost)), 0);

  const renderEditableCell = (item: InventoryItem, field: string, displayValue: string) => {
    if (editingId === item.id && editingField === field) {
      return (
        <input
          type={['quantity', 'minQuantity', 'cost'].includes(field) ? 'number' : 'text'}
          className="item-edit-input"
          value={editingValue}
          onChange={e => setEditingValue(e.target.value)}
          onBlur={saveEdit}
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
          style={{ width: '100%', padding: '4px 8px', border: '1px solid #2563eb', borderRadius: 4, fontSize: 'inherit', fontFamily: 'inherit' }}
        />
      );
    }
    return (
      <span
        onClick={() => startEdit(item, field)}
        style={{ cursor: 'pointer', borderBottom: '1px dashed #cbd5e1' }}
        title="クリックして編集"
      >
        {displayValue}
      </span>
    );
  };

  const isLowStock = (item: InventoryItem) =>
    Number(item.minQuantity) > 0 && Number(item.quantity) < Number(item.minQuantity);

  return (
    <div className="main-content">
      {/* サマリーカード */}
      <div className="today-summary">
        <div className="summary-card">
          <div className="summary-number">{totalItems}</div>
          <div className="summary-label">商品数</div>
        </div>
        <div className="summary-card" style={lowStockCount > 0 ? { background: '#fef2f2' } : {}}>
          <div className="summary-number" style={lowStockCount > 0 ? { color: '#dc2626' } : {}}>{lowStockCount}</div>
          <div className="summary-label">在庫不足</div>
        </div>
        <div className="summary-card">
          <div className="summary-number" style={{ fontSize: '1.2rem' }}>¥{totalValue.toLocaleString()}</div>
          <div className="summary-label">在庫総額</div>
        </div>
      </div>

      {/* 新規追加フォーム */}
      <div className="records-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>商品追加</h3>
        <div className="inventory-add-row1">
          <input
            type="text"
            placeholder="商品名 *"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
          />
          <input
            type="text"
            placeholder="カテゴリ"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
          />
          <input
            type="text"
            placeholder="単位"
            value={newUnit}
            onChange={e => setNewUnit(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
          />
        </div>
        <div className="inventory-add-row2">
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>数量</label>
            <input
              type="number"
              value={newQuantity}
              onChange={e => setNewQuantity(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>最低数量</label>
            <input
              type="number"
              value={newMinQuantity}
              onChange={e => setNewMinQuantity(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>原価</label>
            <input
              type="number"
              value={newCost}
              onChange={e => setNewCost(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>備考</label>
            <input
              type="text"
              placeholder="備考"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: '0.9rem', height: 38 }}
          >
            {adding ? '追加中...' : '追加'}
          </button>
        </div>
      </div>

      {/* カテゴリフィルタ */}
      {categories.length > 0 && (
        <div className="timing-tabs" style={{ marginBottom: 16 }}>
          <button
            className={`timing-tab ${activeCategory === '' ? 'active' : ''}`}
            onClick={() => setActiveCategory('')}
          >
            すべて
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`timing-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 在庫テーブル */}
      <div className="records-section">
        <h3 style={{ marginBottom: 12 }}>在庫一覧</h3>
        {displayItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p className="empty-state-text">在庫データがありません</p>
            <p className="empty-state-hint">上のフォームから商品を追加してください</p>
          </div>
        ) : (
          <div className="inventory-table-wrap">
          <table className="records-table">
            <thead>
              <tr>
                <th>商品名</th>
                <th>カテゴリ</th>
                <th>数量</th>
                <th>単位</th>
                <th>最低数量</th>
                <th>原価</th>
                <th>状態</th>
                <th>最終確認</th>
                <th>備考</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map(item => (
                <tr key={item.id} style={isLowStock(item) ? { background: '#fef2f2' } : {}}>
                  <td>{renderEditableCell(item, 'name', item.name)}</td>
                  <td>{renderEditableCell(item, 'category', item.category || '—')}</td>
                  <td style={isLowStock(item) ? { color: '#dc2626', fontWeight: 700 } : {}}>
                    {renderEditableCell(item, 'quantity', String(item.quantity))}
                  </td>
                  <td>{renderEditableCell(item, 'unit', item.unit)}</td>
                  <td>{renderEditableCell(item, 'minQuantity', String(item.minQuantity))}</td>
                  <td>{renderEditableCell(item, 'cost', `¥${Number(item.cost).toLocaleString()}`)}</td>
                  <td>
                    <select
                      value={item.status || '適正'}
                      onChange={async (e) => {
                        if (!selectedStore) return;
                        try {
                          await api.updateInventoryItem(selectedStore.id, item.id, { status: e.target.value });
                          loadItems();
                        } catch {}
                      }}
                      className="inventory-status-select"
                      style={{
                        background: STATUS_OPTIONS.find(s => s.value === item.status)?.bg || '#fff',
                        color: STATUS_OPTIONS.find(s => s.value === item.status)?.color || '#555',
                      }}
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.value}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#888', whiteSpace: 'nowrap' }}>
                    {item.lastCheckedAt
                      ? new Date(item.lastCheckedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                  <td>{renderEditableCell(item, 'note', item.note || '—')}</td>
                  <td>
                    <button
                      className="delete-btn"
                      onClick={() => handleDelete(item)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', padding: '4px 8px' }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
