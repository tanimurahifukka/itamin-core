import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

type ViewMode = 'daily' | 'monthly';

export default function DashboardPage() {
  const { selectedStore } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // 日別データ取得
  useEffect(() => {
    if (!selectedStore) return;
    api.getDailyRecords(selectedStore.id, date)
      .then(data => setRecords(data.records))
      .catch(() => {});
  }, [selectedStore, date]);

  // 月別データ取得
  useEffect(() => {
    if (!selectedStore || viewMode !== 'monthly') return;
    api.getMonthlyRecords(selectedStore.id, year, month)
      .then(data => setMonthlyData(data))
      .catch(() => setMonthlyData(null));
  }, [selectedStore, viewMode, year, month]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  const calcHours = (record: any) => {
    if (!record.clockOut) return null;
    const diff = (new Date(record.clockOut).getTime() - new Date(record.clockIn).getTime()) / 3600000;
    return diff - (record.breakMinutes || 0) / 60;
  };

  const calcHoursStr = (record: any) => {
    const h = calcHours(record);
    if (h === null) return '勤務中';
    return `${h.toFixed(1)}h`;
  };

  // 今日のサマリー計算
  const isToday = date === new Date().toISOString().split('T')[0];
  const working = records.filter(r => !r.clockOut);
  const finished = records.filter(r => r.clockOut);
  const totalHoursToday = finished.reduce((sum, r) => sum + (calcHours(r) || 0), 0);

  const handlePrevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const handleNextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  return (
    <>
      {/* ビュー切替タブ */}
      <div className="view-mode-tabs">
        <button
          className={`view-mode-tab ${viewMode === 'daily' ? 'active' : ''}`}
          onClick={() => setViewMode('daily')}
        >
          日別
        </button>
        <button
          className={`view-mode-tab ${viewMode === 'monthly' ? 'active' : ''}`}
          onClick={() => setViewMode('monthly')}
        >
          月別集計
        </button>
      </div>

      {viewMode === 'daily' ? (
        <>
          {/* 今日のサマリーカード */}
          {isToday && records.length > 0 && (
            <div className="today-summary">
              <div className="summary-card working">
                <div className="summary-number">{working.length}</div>
                <div className="summary-label">勤務中</div>
              </div>
              <div className="summary-card finished">
                <div className="summary-number">{finished.length}</div>
                <div className="summary-label">退勤済み</div>
              </div>
              <div className="summary-card hours">
                <div className="summary-number">{totalHoursToday.toFixed(1)}</div>
                <div className="summary-label">合計時間</div>
              </div>
            </div>
          )}

          {/* 日別タイムカード */}
          <div className="records-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>日別タイムカード</h3>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="date-picker"
              />
            </div>

            {records.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <p className="empty-state-text">
                  {isToday ? 'まだ出勤記録がありません' : 'この日の記録はありません'}
                </p>
                <p className="empty-state-hint">
                  {isToday ? 'スタッフが出勤すると自動的に表示されます' : '日付を変更して別の日の記録を確認できます'}
                </p>
              </div>
            ) : (
              <table className="records-table">
                <thead>
                  <tr>
                    <th>スタッフ</th>
                    <th>出勤</th>
                    <th>退勤</th>
                    <th>休憩</th>
                    <th>実働</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r: any) => (
                    <tr key={r.id} className={!r.clockOut ? 'row-working' : ''}>
                      <td>
                        <span className="staff-name-cell">{r.staffName || '—'}</span>
                        {!r.clockOut && <span className="status-dot" title="勤務中" />}
                      </td>
                      <td>{formatTime(r.clockIn)}</td>
                      <td>{r.clockOut ? formatTime(r.clockOut) : '—'}</td>
                      <td>{r.breakMinutes}分</td>
                      <td className={!r.clockOut ? 'text-working' : ''}>
                        {calcHoursStr(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        /* 月別集計ビュー */
        <div className="records-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3>月別集計</h3>
            <div className="month-nav">
              <button className="month-nav-btn" onClick={handlePrevMonth}>&lt;</button>
              <span className="month-nav-label">{year}年{month}月</span>
              <button className="month-nav-btn" onClick={handleNextMonth}>&gt;</button>
            </div>
          </div>

          {monthlyData?.summary && monthlyData.summary.length > 0 ? (
            <>
            <table className="records-table">
              <thead>
                <tr>
                  <th>スタッフ</th>
                  <th>出勤日数</th>
                  <th>合計時間</th>
                  <th>平均/日</th>
                  <th>時給</th>
                  <th>概算給与</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.summary.map((s: any, i: number) => (
                  <tr key={i}>
                    <td>{s.staffName || '—'}</td>
                    <td>{s.workDays ?? s.totalDays ?? '—'}日</td>
                    <td>{s.totalWorkHours != null ? `${Number(s.totalWorkHours).toFixed(1)}h` : '—'}</td>
                    <td>
                      {s.totalWorkHours != null && (s.workDays || s.totalDays)
                        ? `${(Number(s.totalWorkHours) / (s.workDays || s.totalDays || 1)).toFixed(1)}h`
                        : '—'}
                    </td>
                    <td>{s.hourlyWage ? `¥${Number(s.hourlyWage).toLocaleString()}` : '—'}</td>
                    <td style={{ fontWeight: 600 }}>
                      {s.estimatedSalary != null ? `¥${Number(s.estimatedSalary).toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 700, background: '#f9fafb' }}>
                  <td>合計</td>
                  <td>—</td>
                  <td>
                    {monthlyData.summary.reduce((sum: number, s: any) => sum + (Number(s.totalWorkHours) || 0), 0).toFixed(1)}h
                  </td>
                  <td>—</td>
                  <td>—</td>
                  <td style={{ color: '#2563eb' }}>
                    ¥{monthlyData.summary.reduce((sum: number, s: any) => sum + (Number(s.estimatedSalary) || 0), 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <p className="empty-state-text">この月の集計データがありません</p>
              <p className="empty-state-hint">月を変更して別の期間を確認できます</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
