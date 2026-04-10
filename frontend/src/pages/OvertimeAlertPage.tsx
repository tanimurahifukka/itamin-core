import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import type { StaffOvertimeInfo } from '../types/api';

type StaffOvertime = StaffOvertimeInfo;

export default function OvertimeAlertPage() {
  const { selectedStore } = useAuth();
  const [staffOvertime, setStaffOvertime] = useState<StaffOvertime[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [settings] = useState({ monthlyLimitHours: 45, standardHoursPerDay: 8 });

  const loadData = useCallback(() => {
    if (!selectedStore) return;
    api.getOvertimeAlert(selectedStore.id, year, month)
      .then((data) => {
        setStaffOvertime(data.staff);
      })
      .catch(() => {});
  }, [selectedStore, year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  const exceededCount = staffOvertime.filter(s => s.exceeded).length;
  const warningCount = staffOvertime.filter(s => s.warning && !s.exceeded).length;

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
      {/* 月選択 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => changeMonth(-1)} style={{ padding: '4px 12px', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer' }}>◀</button>
        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{year}年{month}月</span>
        <button onClick={() => changeMonth(1)} style={{ padding: '4px 12px', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer' }}>▶</button>
      </div>

      {/* サマリー */}
      <div className="today-summary">
        <div className="summary-card">
          <div className="summary-number">{staffOvertime.length}</div>
          <div className="summary-label">対象スタッフ</div>
        </div>
        <div className="summary-card" style={exceededCount > 0 ? { background: '#fef2f2' } : {}}>
          <div className="summary-number" style={exceededCount > 0 ? { color: '#dc2626' } : {}}>{exceededCount}</div>
          <div className="summary-label">上限超過</div>
        </div>
        <div className="summary-card" style={warningCount > 0 ? { background: '#fffbeb' } : {}}>
          <div className="summary-number" style={warningCount > 0 ? { color: '#f59e0b' } : {}}>{warningCount}</div>
          <div className="summary-label">注意（80%超）</div>
        </div>
        <div className="summary-card">
          <div className="summary-number">{settings.monthlyLimitHours}h</div>
          <div className="summary-label">月間上限</div>
        </div>
      </div>

      {/* 一覧テーブル */}
      <div className="records-section">
        <h3 style={{ marginBottom: 12 }}>スタッフ別残業時間</h3>
        {staffOvertime.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏰</div>
            <p className="empty-state-text">今月の打刻データがありません</p>
          </div>
        ) : (
          <table className="records-table">
            <thead>
              <tr>
                <th>スタッフ名</th>
                <th>出勤日数</th>
                <th>総労働時間</th>
                <th>残業時間</th>
                <th>上限</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {staffOvertime.map(s => (
                <tr
                  key={s.userId}
                  style={s.exceeded ? { background: '#fef2f2' } : s.warning ? { background: '#fffbeb' } : {}}
                >
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td>{s.totalDays}日</td>
                  <td>{s.totalWorkHours}h</td>
                  <td style={{
                    fontWeight: 700,
                    color: s.exceeded ? '#dc2626' : s.warning ? '#f59e0b' : '#333',
                  }}>
                    {s.overtimeHours}h
                  </td>
                  <td>{s.limitHours}h</td>
                  <td>
                    {s.exceeded ? (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>超過</span>
                    ) : s.warning ? (
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>注意</span>
                    ) : (
                      <span style={{ color: '#22c55e' }}>正常</span>
                    )}
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
