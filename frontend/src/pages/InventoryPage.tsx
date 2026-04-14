import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/molecules/Toast';
import type { InventoryItem } from '../types/api';
import { EmptyState } from '../components/molecules/EmptyState';
import { SummaryCard } from '../components/molecules/SummaryCard';

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

  const loadItems = useCallback(() => {
    if (!selectedStore) return;
    const category = activeCategory || undefined;
    api.getInventory(selectedStore.id, category)
      .then(data => setItems(data.items))
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, [selectedStore, activeCategory]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // カテゴリ一覧はフィルタなし全件から算出
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const loadCategories = useCallback(() => {
    if (!selectedStore) return;
    api.getInventory(selectedStore.id)
      .then(data => {
        const cats = Array.from(new Set(data.items.map(i => i.category).filter((c): c is string => Boolean(c))));
        setAllCategories(cats);
      })
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, [selectedStore]);
  useEffect(() => { loadCategories(); }, [loadCategories]);

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
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '追加に失敗しました', 'error');
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
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    }
  };

  const startEdit = (item: InventoryItem, field: string) => {
    setEditingId(item.id);
    setEditingField(field);
    setEditingValue(String(item[field as keyof InventoryItem] ?? ''));
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
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '更新に失敗しました', 'error');
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
          className="w-full rounded-md border border-border px-3 py-2.5 text-[0.9rem] font-sans focus:border-primary focus:outline-none"
          value={editingValue}
          onChange={e => setEditingValue(e.target.value)}
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
    <div className="w-full min-w-0 max-w-[960px] flex-1 px-8 py-7 max-md:px-3.5 max-md:py-4">
      {/* サマリーカード */}
      <div className="mb-4 grid grid-cols-3 gap-3 max-md:gap-2">
        <SummaryCard value={totalItems} label="商品数" />
        <SummaryCard
          value={lowStockCount}
          label="在庫不足"
          className={lowStockCount > 0 ? 'bg-error-bg' : undefined}
          valueClassName={lowStockCount > 0 ? 'text-red-700' : undefined}
        />
        <SummaryCard
          value={`¥${totalValue.toLocaleString()}`}
          label="在庫総額"
          valueClassName="text-[1.2rem]"
        />
      </div>

      {/* 新規追加フォーム */}
      <div className="mt-5 rounded-xl bg-surface p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] max-md:p-4" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>商品追加</h3>
        <div className="mb-2 grid gap-2 [grid-template-columns:1fr_1fr_80px] max-md:[grid-template-columns:1fr]">
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
        <div className="grid items-end gap-2 [grid-template-columns:1fr_1fr_1fr_1fr_auto] max-md:[grid-template-columns:1fr_1fr] [&>*:last-child]:max-md:col-span-full">
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
        <div className="mb-5 flex gap-2" style={{ marginBottom: 16 }}>
          <button
            className={`flex-1 cursor-pointer rounded-lg border-2 border-border-light bg-surface px-2.5 py-2.5 text-center text-[0.95rem] font-sans transition-colors ${activeCategory === '' ? 'border-magenta-500 font-medium text-magenta-500' : ''}`}
            onClick={() => setActiveCategory('')}
          >
            すべて
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`flex-1 cursor-pointer rounded-lg border-2 border-border-light bg-surface px-2.5 py-2.5 text-center text-[0.95rem] font-sans transition-colors ${activeCategory === cat ? 'border-magenta-500 font-medium text-magenta-500' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 在庫テーブル */}
      <div className="mt-5 rounded-xl bg-surface p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] max-md:p-4">
        <h3 style={{ marginBottom: 12 }}>在庫一覧</h3>
        {displayItems.length === 0 ? (
          <EmptyState icon="📦" text="在庫データがありません" hint="上のフォームから商品を追加してください" />
        ) : (
          <div className="touch-pan-x overflow-x-auto max-md:-mx-4 max-md:px-4">
          <table className="w-full border-collapse [&_th]:px-3 [&_th]:py-2.5 [&_th]:border-b [&_th]:border-sumi-300 [&_th]:text-left [&_th]:text-[0.85rem] [&_th]:font-medium [&_th]:text-text-description [&_td]:px-3 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-sumi-300 [&_td]:text-left max-md:[&_th]:px-1.5 max-md:[&_th]:py-2 max-md:[&_th]:text-[0.85rem] max-md:[&_td]:px-1.5 max-md:[&_td]:py-2 max-md:[&_td]:text-[0.85rem]">
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
                  <td>{renderEditableCell(item, 'unit', item.unit ?? '')}</td>
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
                      className="cursor-pointer appearance-none rounded-md border border-border px-2 py-1 text-[0.78rem] font-semibold font-sans"
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
