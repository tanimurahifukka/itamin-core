import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';

interface DailyReport {
  id: string;
  date: string;
  sales: number;
  customerCount: number;
  weather: string;
  memo: string;
}

interface Summary {
  totalSales: number;
  totalCustomers: number;
  avgCustomers: number;
  reportCount: number;
}

const WEATHER_OPTIONS = ['晴れ', '曇り', '雨', '雪'];

export default function DailyReportPage() {
  const { selectedStore } = useAuth();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalSales: 0, totalCustomers: 0, avgCustomers: 0, reportCount: 0 });
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // 入力フォーム
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formSales, setFormSales] = useState('');
  const [formCustomers, setFormCustomers] = useState('');
  const [formWeather, setFormWeather] = useState('晴れ');
  const [formMemo, setFormMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    if (!selectedStore) return;
    api.getDailyReports(selectedStore.id, year, month)
      .then((data: any) => {
        setReports(data.reports);
        setSummary(data.summary);
      })
      .catch(() => {});
  };

  useEffect(() => { loadData(); }, [selectedStore, year, month]);

  // 日付が変わったら既存のレコードをロード
  useEffect(() => {
    if (!selectedStore || !formDate) return;
    api.getDailyReport(selectedStore.id, formDate)
      .then((data: any) => {
        if (data.report) {
          setFormSales(String(data.report.sales || ''));
          setFormCustomers(String(data.report.customerCount || ''));
          setFormWeather(data.report.weather || '晴れ');
          setFormMemo(data.report.memo || '');
        } else {
          setFormSales('');
          setFormCustomers('');
          setFormWeather('晴れ');
          setFormMemo('');
        }
      })
      .catch(() => {});
  }, [selectedStore, formDate]);

  const handleSave = async () => {
    if (!selectedStore || saving) return;
    setSaving(true);
    try {
      await api.saveDailyReport(selectedStore.id, {
        date: formDate,
        sales: Number(formSales) || 0,
        customerCount: Number(formCustomers) || 0,
        weather: formWeather,
        memo: formMemo,
      });
      showToast('保存しました', 'success');
      loadData();
    } catch (e: any) {
      showToast(e.message || '保存に失敗しました', 'error');
    } finally {
      setSaving(false);
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
      {/* 入力フォーム */}
      <div className="records-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>日報入力</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 120px', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>日付</label>
            <input
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>売上（円）</label>
            <input
              type="number"
              placeholder="0"
              value={formSales}
              onChange={e => setFormSales(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>来客数</label>
            <input
              type="number"
              placeholder="0"
              value={formCustomers}
              onChange={e => setFormCustomers(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>天気</label>
            <select
              value={formWeather}
              onChange={e => setFormWeather(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            >
              {WEATHER_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: '#666', marginBottom: 2, display: 'block' }}>メモ</label>
            <input
              type="text"
              placeholder="一言メモ"
              value={formMemo}
              onChange={e => setFormMemo(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: '0.9rem', height: 38 }}
          >
            {saving ? '保存中...' : '保存'}
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
          <div className="summary-number" style={{ fontSize: '1.2rem' }}>¥{summary.totalSales.toLocaleString()}</div>
          <div className="summary-label">売上合計</div>
        </div>
        <div className="summary-card">
          <div className="summary-number">{summary.totalCustomers}</div>
          <div className="summary-label">来客合計</div>
        </div>
        <div className="summary-card">
          <div className="summary-number">{summary.avgCustomers}</div>
          <div className="summary-label">平均来客数</div>
        </div>
        <div className="summary-card">
          <div className="summary-number">{summary.reportCount}</div>
          <div className="summary-label">記録日数</div>
        </div>
      </div>

      {/* 一覧 */}
      <div className="records-section">
        <h3 style={{ marginBottom: 12 }}>日報一覧</h3>
        {reports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <p className="empty-state-text">この月の日報はありません</p>
            <p className="empty-state-hint">上のフォームから日報を入力してください</p>
          </div>
        ) : (
          <table className="records-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>売上</th>
                <th>来客数</th>
                <th>天気</th>
                <th>メモ</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setFormDate(r.date)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}</td>
                  <td>¥{Number(r.sales).toLocaleString()}</td>
                  <td>{r.customerCount}人</td>
                  <td>{r.weather}</td>
                  <td style={{ fontSize: '0.85rem', color: '#666' }}>{r.memo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
