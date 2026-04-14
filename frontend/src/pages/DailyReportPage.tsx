import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/molecules/Toast';
import type { DailyReport, DailyReportSummary, MenuItem, DailyReportItem, InventoryItem } from '../types/api';
import { todayJST } from '../lib/dateUtils';

type InputMode = 'manual' | 'menu';

const WEATHER_OPTIONS = ['晴れ', '曇り', '雨', '雪'];

export default function DailyReportPage() {
  const { selectedStore } = useAuth();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [summary, setSummary] = useState<DailyReportSummary>({ totalSales: 0, totalCustomers: 0, avgCustomers: 0, reportCount: 0 });
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // 入力フォーム
  const [formDate, setFormDate] = useState(todayJST());
  const [formSales, setFormSales] = useState('');
  const [formCustomers, setFormCustomers] = useState('');
  const [formWeather, setFormWeather] = useState('晴れ');
  const [formMemo, setFormMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<DailyReportItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 商品別入力
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // 在庫
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryUpdates, setInventoryUpdates] = useState<Record<string, string>>({});

  const loadData = useCallback(() => {
    if (!selectedStore) return;
    // The backend returns { reports, summary } but the API client type only declares { reports }.
    // Cast to include the summary field which is present at runtime.
    api.getDailyReports(selectedStore.id, year, month)
      .then((data: { reports: DailyReport[]; summary?: DailyReportSummary }) => {
        setReports(data.reports);
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, [selectedStore, year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  // メニュー商品 + 在庫を読み込み
  useEffect(() => {
    if (!selectedStore) return;
    api.getMenuItems(selectedStore.id, true)
      .then(data => setMenuItems(data.items || []))
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
    api.getInventory(selectedStore.id)
      .then(data => setInventoryItems(data.items || []))
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, [selectedStore]);

  // 日付が変わったら既存のレコードをロード
  useEffect(() => {
    if (!selectedStore || !formDate) return;
    api.getDailyReport(selectedStore.id, formDate)
      .then(data => {
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
        // 明細がある場合はquantitiesにセット
        const q: Record<string, number> = {};
        if (data.items && data.items.length > 0) {
          data.items.forEach((item: DailyReportItem) => {
            q[item.menuItemId] = item.quantity;
          });
          setInputMode('menu');
        }
        setQuantities(q);
      })
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, [selectedStore, formDate]);

  const menuTotal = Object.entries(quantities).reduce((sum, [id, qty]) => {
    const item = menuItems.find(m => m.id === id);
    return sum + (item ? item.price * qty : 0);
  }, 0);

  const setQty = (itemId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [itemId]: next };
    });
  };

  const handleSave = async () => {
    if (!selectedStore || saving) return;
    setSaving(true);
    try {
      const items = inputMode === 'menu'
        ? Object.entries(quantities)
            .filter(([, qty]) => qty > 0)
            .map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
        : undefined;

      await api.saveDailyReport(selectedStore.id, {
        date: formDate,
        sales: inputMode === 'menu' ? menuTotal : (Number(formSales) || 0),
        customerCount: Number(formCustomers) || 0,
        weather: formWeather,
        memo: formMemo,
        items,
      });
      // 在庫更新（変更があるもののみ）
      const invUpdates = Object.entries(inventoryUpdates).filter(([, val]) => val !== '');
      for (const [itemId, val] of invUpdates) {
        try {
          await api.updateInventoryItem(selectedStore.id, itemId, { quantity: Number(val) || 0 });
        } catch {}
      }
      if (invUpdates.length > 0) {
        api.getInventory(selectedStore.id)
          .then(data => setInventoryItems(data.items || []))
          .catch(() => { showToast('読み込みに失敗しました', 'error'); });
        setInventoryUpdates({});
      }

      showToast('保存しました', 'success');
      loadData();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
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
        <div className="daily-report-form-grid">
          <div>
            <label className="form-label">日付</label>
            <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="form-input" />
          </div>
          {inputMode === 'manual' && (
            <div>
              <label className="form-label">売上（円）</label>
              <input type="number" placeholder="0" value={formSales} onChange={e => setFormSales(e.target.value)} className="form-input" />
            </div>
          )}
          <div>
            <label className="form-label">来客数</label>
            <input type="number" placeholder="0" value={formCustomers} onChange={e => setFormCustomers(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="form-label">天気</label>
            <select value={formWeather} onChange={e => setFormWeather(e.target.value)} className="form-input">
              {WEATHER_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>
        {/* 入力モード切替 */}
        {menuItems.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => setInputMode('manual')}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d4d9df', background: inputMode === 'manual' ? '#2563eb' : 'white', color: inputMode === 'manual' ? 'white' : '#333', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}
            >
              手入力
            </button>
            <button
              onClick={() => setInputMode('menu')}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d4d9df', background: inputMode === 'menu' ? '#2563eb' : 'white', color: inputMode === 'menu' ? 'white' : '#333', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}
            >
              商品別入力
            </button>
          </div>
        )}

        {/* 商品別入力 */}
        {inputMode === 'menu' && menuItems.length > 0 && (
          <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            {Object.entries(
              menuItems.reduce<Record<string, MenuItem[]>>((acc, m) => {
                const cat = m.category || 'その他';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(m);
                return acc;
              }, {})
            ).map(([cat, catItems]) => (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{cat}</div>
                {catItems.map(m => {
                  const qty = quantities[m.id] || 0;
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eef2f7' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.name}</span>
                        <span style={{ color: '#888', fontSize: '0.8rem', marginLeft: 8 }}>¥{m.price.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => setQty(m.id, -1)} disabled={qty === 0} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #d4d9df', background: 'white', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>-</button>
                        <span style={{ width: 28, textAlign: 'center', fontWeight: 600 }}>{qty}</span>
                        <button onClick={() => setQty(m.id, 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #d4d9df', background: 'white', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>+</button>
                        {qty > 0 && <span style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600, marginLeft: 4, minWidth: 60, textAlign: 'right' }}>¥{(m.price * qty).toLocaleString()}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, fontWeight: 700, fontSize: '1.05rem' }}>
              合計: ¥{menuTotal.toLocaleString()}
            </div>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <label className="form-label">メモ</label>
          <input type="text" placeholder="一言メモ" value={formMemo} onChange={e => setFormMemo(e.target.value)} className="form-input" />
        </div>

        {/* 在庫チェック */}
        {inventoryItems.length > 0 && (
          <div style={{ marginTop: 10, padding: 12, background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: 8 }}>在庫残量チェック</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {inventoryItems.map((inv) => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: '0.85rem', flex: 1 }}>
                    {inv.name}
                    {inv.unit && <span style={{ color: '#888', marginLeft: 4 }}>({inv.unit})</span>}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#888', minWidth: 40, textAlign: 'right' }}>現:{inv.quantity ?? 0}</span>
                  <input
                    type="number"
                    placeholder={String(inv.quantity ?? 0)}
                    value={inventoryUpdates[inv.id] ?? ''}
                    onChange={e => setInventoryUpdates(prev => ({ ...prev, [inv.id]: e.target.value }))}
                    style={{ width: 60, padding: '4px 8px', border: '1px solid #d4d9df', borderRadius: 4, fontSize: '0.85rem', textAlign: 'right' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button onClick={handleSave} disabled={saving} className="form-save-btn">
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
          <div className="daily-report-list">
            {reports.map(r => {
              const isExpanded = expandedDate === r.date;
              return (
                <div key={r.id} className="daily-report-card">
                  <div
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedDate(null);
                        setDetailItems([]);
                      } else {
                        setExpandedDate(r.date);
                        setDetailLoading(true);
                        api.getDailyReport(selectedStore!.id, r.date)
                          .then(data => {
                            setDetailItems(data.items || []);
                          })
                          .catch(() => setDetailItems([]))
                          .finally(() => setDetailLoading(false));
                      }
                    }}
                  >
                    <div className="daily-report-card-header">
                      <span className="daily-report-date">
                        {new Date(r.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="daily-report-weather">{r.weather}</span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    <div className="daily-report-card-body">
                      <span className="daily-report-stat">¥{Number(r.sales).toLocaleString()}</span>
                      <span className="daily-report-stat">{r.customerCount}人</span>
                      {r.createdByName && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{r.createdByName}</span>}
                    </div>
                    {r.memo && <div className="daily-report-memo">{r.memo}</div>}
                  </div>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 8 }}>
                      {detailLoading ? (
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>読み込み中...</div>
                      ) : detailItems.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>品目別データなし（手入力）</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {detailItems.map((item, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                              <span>{item.menuItemName} × {item.quantity}</span>
                              <span style={{ fontWeight: 500 }}>¥{Number(item.subtotal).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setFormDate(r.date); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        style={{ marginTop: 8, padding: '6px 14px', fontSize: '0.8rem', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        編集
                      </button>
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
