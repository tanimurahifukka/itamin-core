import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import type { StaffConsecutiveInfo } from '../types/api';
import { EmptyState } from '../components/molecules/EmptyState';

type StaffStatus = StaffConsecutiveInfo;

export default function ConsecutiveWorkPage() {
  const { selectedStore } = useAuth();
  const [staffStatus, setStaffStatus] = useState<StaffStatus[]>([]);

  const loadData = useCallback(() => {
    if (!selectedStore) return;
    api.getConsecutiveWork(selectedStore.id)
      .then((data) => setStaffStatus(data.staffStatus ?? []))
      .catch(() => { console.error('[ConsecutiveWorkPage] fetch failed'); });
  }, [selectedStore]);

  useEffect(() => { loadData(); }, [loadData]);

  const dangerCount = staffStatus.filter(s => s.level === 'danger').length;
  const warningCount = staffStatus.filter(s => s.level === 'warning').length;

  return (
    <div className="main-content">
      {/* サマリー */}
      <div className="today-summary">
        <div className="summary-card">
          <div className="summary-number">{staffStatus.length}</div>
          <div className="summary-label">対象スタッフ</div>
        </div>
        <div className="summary-card" style={dangerCount > 0 ? { background: '#fef2f2' } : {}}>
          <div className="summary-number" style={dangerCount > 0 ? { color: '#dc2626' } : {}}>{dangerCount}</div>
          <div className="summary-label">危険（6日以上）</div>
        </div>
        <div className="summary-card" style={warningCount > 0 ? { background: '#fffbeb' } : {}}>
          <div className="summary-number" style={warningCount > 0 ? { color: '#f59e0b' } : {}}>{warningCount}</div>
          <div className="summary-label">注意（5日）</div>
        </div>
      </div>

      {/* 一覧 */}
      <div className="records-section">
        <h3 style={{ marginBottom: 12 }}>スタッフ別連勤日数</h3>
        <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: 12 }}>
          今日から遡って連続出勤日数を表示しています
        </p>
        {staffStatus.length === 0 ? (
          <EmptyState icon="📊" text="スタッフデータがありません" />
        ) : (
          <table className="records-table">
            <thead>
              <tr>
                <th>スタッフ名</th>
                <th>連勤日数</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {staffStatus.map(s => (
                <tr
                  key={s.userId}
                  style={s.level === 'danger' ? { background: '#fef2f2' } : s.level === 'warning' ? { background: '#fffbeb' } : {}}
                >
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td style={{
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: s.level === 'danger' ? '#dc2626' : s.level === 'warning' ? '#f59e0b' : '#333',
                  }}>
                    {s.consecutiveDays}日
                  </td>
                  <td>
                    {s.level === 'danger' ? (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>危険</span>
                    ) : s.level === 'warning' ? (
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
