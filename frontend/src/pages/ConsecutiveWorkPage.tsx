import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import type { StaffConsecutiveInfo } from '../types/api';
import { EmptyState } from '../components/molecules/EmptyState';
import { SummaryCard } from '../components/molecules/SummaryCard';

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
    <div className="w-full min-w-0 max-w-[960px] flex-1 px-8 py-7 max-md:px-3.5 max-md:py-4">
      {/* サマリー */}
      <div className="mb-4 grid grid-cols-3 gap-3 max-md:gap-2">
        <SummaryCard value={staffStatus.length} label="対象スタッフ" />
        <SummaryCard
          value={dangerCount}
          label="危険（6日以上）"
          className={dangerCount > 0 ? 'bg-[#fef2f2]' : undefined}
          valueClassName={dangerCount > 0 ? 'text-[#dc2626]' : undefined}
        />
        <SummaryCard
          value={warningCount}
          label="注意（5日）"
          className={warningCount > 0 ? 'bg-[#fffbeb]' : undefined}
          valueClassName={warningCount > 0 ? 'text-[#f59e0b]' : undefined}
        />
      </div>

      {/* 一覧 */}
      <div className="mt-5 rounded-xl bg-surface p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] max-md:p-4">
        <h3 style={{ marginBottom: 12 }}>スタッフ別連勤日数</h3>
        <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: 12 }}>
          今日から遡って連続出勤日数を表示しています
        </p>
        {staffStatus.length === 0 ? (
          <EmptyState icon="📊" text="スタッフデータがありません" />
        ) : (
          <table className="records-table w-full border-collapse">
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
