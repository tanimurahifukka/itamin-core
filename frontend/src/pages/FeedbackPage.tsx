import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/molecules/Toast';
import type { FeedbackItem } from '../types/api';
import { todayJST } from '../lib/dateUtils';
import { EmptyState } from '../components/molecules/EmptyState';
import { SummaryCard } from '../components/molecules/SummaryCard';

const TYPE_OPTIONS = [
  { value: 'praise', label: 'お褒め', color: '#22c55e', bg: '#f0fdf4' },
  { value: 'complaint', label: 'クレーム', color: '#dc2626', bg: '#fef2f2' },
  { value: 'suggestion', label: '改善要望', color: '#2563eb', bg: '#eff6ff' },
];

const STATUS_OPTIONS = ['未対応', '対応中', '完了'];

export default function FeedbackPage() {
  const { selectedStore } = useAuth();
  const [allItems, setAllItems] = useState<FeedbackItem[]>([]);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  // 追加フォーム
  const [newDate, setNewDate] = useState(todayJST());
  const [newType, setNewType] = useState('suggestion');
  const [newContent, setNewContent] = useState('');
  const [newResponse, setNewResponse] = useState('');
  const [adding, setAdding] = useState(false);

  // 対応記録編集
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editResponse, setEditResponse] = useState('');

  const loadData = useCallback(() => {
    if (!selectedStore) return;
    api.getFeedback(selectedStore.id, filterStatus || undefined, filterType || undefined)
      .then((data) => setItems(data.items))
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, [selectedStore, filterStatus, filterType]);

  const loadAllItems = useCallback(() => {
    if (!selectedStore) return;
    api.getFeedback(selectedStore.id)
      .then((data) => setAllItems(data.items))
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, [selectedStore]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadAllItems(); }, [loadAllItems]);

  const handleAdd = async () => {
    if (!selectedStore || !newContent.trim() || adding) return;
    setAdding(true);
    try {
      await api.addFeedback(selectedStore.id, {
        date: newDate,
        type: newType,
        content: newContent.trim(),
        response: newResponse,
      });
      setNewContent('');
      setNewResponse('');
      showToast('追加しました', 'success');
      loadData();
      loadAllItems();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '追加に失敗しました', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (item: FeedbackItem, newStatus: string) => {
    if (!selectedStore) return;
    try {
      await api.updateFeedback(selectedStore.id, item.id, { status: newStatus });
      loadData();
      loadAllItems();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '更新に失敗しました', 'error');
    }
  };

  const handleSaveResponse = async (itemId: string) => {
    if (!selectedStore) return;
    try {
      await api.updateFeedback(selectedStore.id, itemId, { response: editResponse });
      showToast('対応記録を更新しました', 'success');
      setEditingId(null);
      loadData();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '更新に失敗しました', 'error');
    }
  };

  const handleDelete = async (item: FeedbackItem) => {
    if (!selectedStore) return;
    if (!confirm('この記録を削除しますか？')) return;
    try {
      await api.deleteFeedback(selectedStore.id, item.id);
      showToast('削除しました', 'info');
      loadData();
      loadAllItems();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    }
  };

  const getTypeInfo = (type: string) => TYPE_OPTIONS.find(t => t.value === type) || TYPE_OPTIONS[2];

  return (
    <div className="main-content">
      {/* サマリー */}
      <div className="mb-4 grid grid-cols-3 gap-3 max-md:gap-2">
        <SummaryCard value={allItems.length} label="総件数" />
        <SummaryCard
          value={allItems.filter(i => i.status === '未対応').length}
          label="未対応"
          valueClassName="text-[#dc2626]"
        />
        <SummaryCard
          value={allItems.filter(i => i.status === '対応中').length}
          label="対応中"
          valueClassName="text-[#f59e0b]"
        />
        <SummaryCard
          value={allItems.filter(i => i.status === '完了').length}
          label="完了"
          valueClassName="text-[#22c55e]"
        />
      </div>

      {/* 追加フォーム */}
      <div className="mt-5 rounded-xl bg-surface p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] max-md:p-4" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>新規追加</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 120px 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>日付</label>
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>種別</label>
            <select
              value={newType}
              onChange={e => setNewType(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            >
              {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>内容 *</label>
            <input
              type="text"
              placeholder="お客様の声の内容"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>対応メモ（任意）</label>
            <input
              type="text"
              placeholder="初期対応の記録"
              value={newResponse}
              onChange={e => setNewResponse(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !newContent.trim()}
            style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: '0.9rem', height: 38 }}
          >
            {adding ? '追加中...' : '追加'}
          </button>
        </div>
      </div>

      {/* フィルタ */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div className="mb-5 flex gap-2">
          <button className={`flex-1 cursor-pointer rounded-lg border-2 border-border-light bg-surface px-2.5 py-2.5 text-center text-[0.95rem] font-sans transition-colors ${filterStatus === '' ? 'border-[#e94560] font-medium text-[#e94560]' : ''}`} onClick={() => setFilterStatus('')}>すべて</button>
          {STATUS_OPTIONS.map(s => (
            <button key={s} className={`flex-1 cursor-pointer rounded-lg border-2 border-border-light bg-surface px-2.5 py-2.5 text-center text-[0.95rem] font-sans transition-colors ${filterStatus === s ? 'border-[#e94560] font-medium text-[#e94560]' : ''}`} onClick={() => setFilterStatus(s)}>{s}</button>
          ))}
        </div>
        <div className="mb-5 flex gap-2">
          <button className={`flex-1 cursor-pointer rounded-lg border-2 border-border-light bg-surface px-2.5 py-2.5 text-center text-[0.95rem] font-sans transition-colors ${filterType === '' ? 'border-[#e94560] font-medium text-[#e94560]' : ''}`} onClick={() => setFilterType('')}>全種別</button>
          {TYPE_OPTIONS.map(t => (
            <button key={t.value} className={`flex-1 cursor-pointer rounded-lg border-2 border-border-light bg-surface px-2.5 py-2.5 text-center text-[0.95rem] font-sans transition-colors ${filterType === t.value ? 'border-[#e94560] font-medium text-[#e94560]' : ''}`} onClick={() => setFilterType(t.value)}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* 一覧 */}
      <div className="mt-5 rounded-xl bg-surface p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] max-md:p-4">
        <h3 style={{ marginBottom: 12 }}>一覧</h3>
        {items.length === 0 ? (
          <EmptyState icon="📣" text="データがありません" hint="上のフォームからお客様の声を追加してください" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(item => {
              const typeInfo = getTypeInfo(item.type);
              return (
                <div key={item.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, borderLeft: `4px solid ${typeInfo.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600, background: typeInfo.bg, color: typeInfo.color }}>
                        {typeInfo.label}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#888' }}>
                        {new Date(item.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <select
                        value={item.status}
                        onChange={e => handleStatusChange(item, e.target.value)}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #d4d9df',
                          borderRadius: 4,
                          fontSize: '0.8rem',
                          fontFamily: 'inherit',
                          color: item.status === '未対応' ? '#dc2626' : item.status === '対応中' ? '#f59e0b' : '#22c55e',
                          fontWeight: 600,
                        }}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button
                        onClick={() => handleDelete(item)}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', padding: '4px 8px' }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <p style={{ marginBottom: 8, fontSize: '0.95rem' }}>{item.content}</p>
                  {editingId === item.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={editResponse}
                        onChange={e => setEditResponse(e.target.value)}
                        placeholder="対応記録"
                        style={{ flex: 1, padding: '6px 10px', border: '1px solid #d4d9df', borderRadius: 4, fontFamily: 'inherit', fontSize: '0.85rem' }}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveResponse(item.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button
                        onClick={() => handleSaveResponse(item.id)}
                        style={{ padding: '6px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{ padding: '6px 12px', border: '1px solid #d4d9df', borderRadius: 4, background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{ fontSize: '0.85rem', color: '#666', cursor: 'pointer', borderBottom: '1px dashed #cbd5e1', display: 'inline-block' }}
                      onClick={() => { setEditingId(item.id); setEditResponse(item.response || ''); }}
                    >
                      {item.response || 'クリックして対応記録を入力'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
