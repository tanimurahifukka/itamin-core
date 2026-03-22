import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';

interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  receiptNote: string;
}

interface ExpenseSummary {
  totalAmount: number;
  categorySummary: Record<string, number>;
  count: number;
}

const CATEGORIES = ['仕入れ', '消耗品', '光熱費', '家賃', '人件費', '広告費', '修繕費', 'その他'];

export default function ExpensePage() {
  const { selectedStore } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary>({ totalAmount: 0, categorySummary: {}, count: 0 });
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [filterCategory, setFilterCategory] = useState('');

  // 追加フォーム
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newCategory, setNewCategory] = useState('仕入れ');
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newReceiptNote, setNewReceiptNote] = useState('');
  const [adding, setAdding] = useState(false);

  const loadData = () => {
    if (!selectedStore) return;
    api.getExpenses(selectedStore.id, year, month, filterCategory || undefined)
      .then((data: any) => {
        setExpenses(data.expenses);
        setSummary(data.summary);
      })
      .catch(() => {});
  };

  useEffect(() => { loadData(); }, [selectedStore, year, month, filterCategory]);

  const handleAdd = async () => {
    if (!selectedStore || !newDescription.trim() || !newAmount || adding) return;
    setAdding(true);
    try {
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
      loadData();
    } catch (e: any) {
      showToast(e.message || '追加に失敗しました', 'error');
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
    } catch (e: any) {
      showToast(e.message || '削除に失敗しました', 'error');
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
      {/* 追加フォーム */}
      <div className="records-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>経費追加</h3>
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
          <button
            onClick={handleAdd}
            disabled={adding || !newDescription.trim() || !newAmount}
            style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: '0.9rem', height: 38 }}
          >
            {adding ? '追加中...' : '追加'}
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
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</td>
                  <td>{e.category}</td>
                  <td>{e.description}</td>
                  <td style={{ fontWeight: 600 }}>¥{Number(e.amount).toLocaleString()}</td>
                  <td style={{ fontSize: '0.85rem', color: '#666' }}>{e.receiptNote || '—'}</td>
                  <td>
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
