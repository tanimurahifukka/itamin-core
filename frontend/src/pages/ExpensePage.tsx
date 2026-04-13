import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';
import type { ExpenseSummary } from '../types/api';
import { todayJST } from '../lib/dateUtils';

// Local Expense omits server-only fields (storeId, createdBy, createdAt)
interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  receiptNote?: string;
}

const CATEGORIES = ['仕入れ', '消耗品', '光熱費', '家賃', '人件費', '広告費', '修繕費', 'その他'];

export default function ExpensePage() {
  const { selectedStore } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary>({ totalAmount: 0, categorySummary: {}, count: 0 });
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [filterCategory, setFilterCategory] = useState('');

  // 追加/編集フォーム
  const [newDate, setNewDate] = useState(todayJST());
  const [newCategory, setNewCategory] = useState('仕入れ');
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newReceiptNote, setNewReceiptNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!selectedStore) return;
    api.getExpenses(selectedStore.id, year, month, filterCategory || undefined)
      .then((data) => {
        setExpenses(data.expenses ?? []);
        setSummary(data.summary ?? { totalAmount: 0, categorySummary: {}, count: 0 });
      })
      .catch(() => { console.error('[ExpensePage] fetch failed'); });
  }, [selectedStore, year, month, filterCategory]);

  useEffect(() => { loadData(); }, [loadData]);

  const startEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setNewDate(expense.date);
    setNewCategory(expense.category);
    setNewDescription(expense.description);
    setNewAmount(String(expense.amount));
    setNewReceiptNote(expense.receiptNote || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewDate(todayJST());
    setNewCategory('仕入れ');
    setNewDescription('');
    setNewAmount('');
    setNewReceiptNote('');
  };

  const handleAdd = async () => {
    if (!selectedStore || !newDescription.trim() || !newAmount || adding) return;
    setAdding(true);
    try {
      if (editingId) {
        await api.updateExpense(selectedStore.id, editingId, {
          date: newDate,
          category: newCategory,
          description: newDescription.trim(),
          amount: Number(newAmount),
          receiptNote: newReceiptNote,
        });
        showToast('経費を更新しました', 'success');
        cancelEdit();
      } else {
        await api.addExpense(selectedStore.id, {
          date: newDate,
          category: newCategory,
          description: newDescription.trim(),
          amount: Number(newAmount),
          receiptNote: newReceiptNote,
        });
        setNewDescription('');
        setNewAmount('');
        setNewReceiptNote('');
        showToast('経費を追加しました', 'success');
      }
      loadData();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : (editingId ? '更新に失敗しました' : '追加に失敗しました'), 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (expense: Expense) => {
    if (!selectedStore) return;
    if (!confirm(`「${expense.description}」を削除しますか？`)) return;
    try {
      await api.deleteExpense(selectedStore.id, expense.id);
      showToast('削除しました', 'info');
      loadData();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    }
  };

  const changeMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) { newMonth = 1; newYear++; }
    if (newMonth < 1) { newMonth = 12; newYear--; }
    setYear(newYear);
    setMonth(newMonth);
  };

  return (
    <div className="main-content">
      {/* 追加/編集フォーム */}
      <div className="records-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>{editingId ? '経費編集' : '経費追加'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 120px 1fr 120px', gap: 8, marginBottom: 8 }}>
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
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>カテゴリ</label>
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>内容 *</label>
            <input
              type="text"
              placeholder="内容"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>金額（円）</label>
            <input
              type="number"
              placeholder="0"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>領収書メモ</label>
            <input
              type="text"
              placeholder="領収書の番号や備考"
              value={newReceiptNote}
              onChange={e => setNewReceiptNote(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          {editingId && (
            <button
              onClick={cancelEdit}
              style={{ padding: '8px 16px', background: 'white', color: '#555', border: '1px solid #d4d9df', borderRadius: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: '0.9rem', height: 38 }}
            >
              キャンセル
            </button>
          )}
          <button
            onClick={handleAdd}
            disabled={adding || !newDescription.trim() || !newAmount}
            style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: '0.9rem', height: 38 }}
          >
            {adding ? (editingId ? '更新中...' : '追加中...') : (editingId ? '更新' : '追加')}
          </button>
        </div>
      </div>

      {/* 月選択 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => changeMonth(-1)} style={{ padding: '4px 12px', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer' }}>◀</button>
        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{year}年{month}月</span>
        <button onClick={() => changeMonth(1)} style={{ padding: '4px 12px', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer' }}>▶</button>
      </div>

      {/* 月次サマリー */}
      <div className="today-summary">
        <div className="summary-card">
          <div className="summary-number" style={{ fontSize: '1.2rem' }}>¥{summary.totalAmount.toLocaleString()}</div>
          <div className="summary-label">合計金額</div>
        </div>
        <div className="summary-card">
          <div className="summary-number">{summary.count}</div>
          <div className="summary-label">件数</div>
        </div>
      </div>

      {/* カテゴリ別サマリー */}
      {Object.keys(summary.categorySummary).length > 0 && (
        <div className="records-section" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>カテゴリ別合計</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {Object.entries(summary.categorySummary).map(([cat, amount]) => (
              <div key={cat} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>{cat}</div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>¥{Number(amount).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* カテゴリフィルタ */}
      <div className="timing-tabs" style={{ marginBottom: 16 }}>
        <button
          className={`timing-tab ${filterCategory === '' ? 'active' : ''}`}
          onClick={() => setFilterCategory('')}
        >
          すべて
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`timing-tab ${filterCategory === cat ? 'active' : ''}`}
            onClick={() => setFilterCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 経費一覧 */}
      <div className="records-section">
        <h3 style={{ marginBottom: 12 }}>経費一覧</h3>
        {expenses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <p className="empty-state-text">この月の経費データはありません</p>
            <p className="empty-state-hint">上のフォームから経費を追加してください</p>
          </div>
        ) : (
          <table className="records-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>カテゴリ</th>
                <th>内容</th>
                <th>金額</th>
                <th>領収書メモ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id} style={editingId === e.id ? { background: '#eff6ff' } : {}}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</td>
                  <td>{e.category}</td>
                  <td>{e.description}</td>
                  <td style={{ fontWeight: 600 }}>¥{Number(e.amount).toLocaleString()}</td>
                  <td style={{ fontSize: '0.85rem', color: '#666' }}>{e.receiptNote || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => startEdit(e)}
                      style={{ background: 'none', border: '1px solid #d4d9df', color: '#555', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 8px', borderRadius: 4, marginRight: 4 }}
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(e)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', padding: '4px 8px' }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
