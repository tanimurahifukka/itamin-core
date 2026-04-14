import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import type { StaffOvertimeInfo } from '../types/api';
import { EmptyState } from '../components/molecules/EmptyState';
import { SummaryCard } from '../components/molecules/SummaryCard';

type StaffOvertime = StaffOvertimeInfo;

export default function OvertimeAlertPage() {
  const { selectedStore } = useAuth();
  const [staffOvertime, setStaffOvertime] = useState<StaffOvertime[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('overtime_settings');
    try { return saved ? JSON.parse(saved) : { monthlyLimitHours: 45, dailyLimitHours: 10, warningThresholdPercent: 80 }; }
    catch { return { monthlyLimitHours: 45, dailyLimitHours: 10, warningThresholdPercent: 80 }; }
  });
  const [showSettingsForm, setShowSettingsForm] = useState(false);

  useEffect(() => { localStorage.setItem('overtime_settings', JSON.stringify(settings)); }, [settings]);

  const loadData = useCallback(() => {
    if (!selectedStore) return;
    api.getOvertimeAlert(selectedStore.id, year, month)
      .then((data) => {
        setStaffOvertime(data.staffOvertime ?? []);
      })
      .catch(() => { console.error('[OvertimeAlertPage] fetch failed'); });
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
        <button
          onClick={() => setShowSettingsForm(v => !v)}
          style={{ marginLeft: 'auto', padding: '4px 12px', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          上限設定
        </button>
      </div>

      {/* 上限設定フォーム */}
      {showSettingsForm && (
        <div style={{ background: '#fff', border: '1px solid #d4d9df', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: 12 }}>残業上限設定</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.85rem', color: '#555' }}>
              月間上限（時間）
              <input
                type="number"
                min={1}
                max={300}
                value={settings.monthlyLimitHours}
                onChange={e => setSettings((prev: typeof settings) => ({ ...prev, monthlyLimitHours: Number(e.target.value) || 45 }))}
                style={{ marginLeft: 8, width: 70, padding: '4px 8px', border: '1px solid #d4d9df', borderRadius: 4, fontSize: '0.9rem' }}
              />
            </label>
          </div>
        </div>
      )}

      {/* サマリー */}
      <div className="mb-4 grid grid-cols-3 gap-3 max-md:gap-2">
        <SummaryCard value={staffOvertime.length} label="対象スタッフ" />
        <SummaryCard
          value={exceededCount}
          label="上限超過"
          className={exceededCount > 0 ? 'bg-[#fef2f2]' : undefined}
          valueClassName={exceededCount > 0 ? 'text-[#dc2626]' : undefined}
        />
        <SummaryCard
          value={warningCount}
          label="注意（80%超）"
          className={warningCount > 0 ? 'bg-[#fffbeb]' : undefined}
          valueClassName={warningCount > 0 ? 'text-[#f59e0b]' : undefined}
        />
        <SummaryCard value={`${settings.monthlyLimitHours}h`} label="月間上限" />
      </div>

      {/* 一覧テーブル */}
      <div className="records-section">
        <h3 style={{ marginBottom: 12 }}>スタッフ別残業時間</h3>
        {staffOvertime.length === 0 ? (
          <EmptyState icon="⏰" text="今月の打刻データがありません" />
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
