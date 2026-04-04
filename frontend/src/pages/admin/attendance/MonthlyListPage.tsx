/**
 * A02 月次勤怠一覧
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';

interface Props {
  onSelectStaff: (userId: string) => void;
}

export default function MonthlyListPage({ onSelectStaff }: Props) {
  const { selectedStore } = useAuth();
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const storeId = selectedStore?.id;

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    const m = `${year}-${String(month).padStart(2, '0')}`;
    api.getAdminAttendanceMonthly(storeId, m)
      .then(res => setSummary(res.summary || []))
      .catch(() => setSummary([]))
      .finally(() => setLoading(false));
  }, [storeId, year, month]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  return (
    <div className="admin-monthly-list">
      <h2>月次勤怠一覧</h2>

      <div className="attendance-month-nav">
        <button className="button" onClick={prevMonth} data-testid="prev-month-button">◀</button>
        <span className="attendance-month-label">{year}年{month}月</span>
        <button className="button" onClick={nextMonth} data-testid="next-month-button">▶</button>
      </div>

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : (
        <table className="table admin-attendance-table">
          <thead>
            <tr>
              <th>スタッフ</th>
              <th>出勤日数</th>
              <th>総労働時間</th>
              <th>総休憩</th>
              <th>修正申請</th>
              <th>概算給与</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s: any) => (
              <tr key={s.userId} data-testid="monthly-row">
                <td>{s.staffName}</td>
                <td>{s.workDays}日</td>
                <td>{s.totalWorkHours}h</td>
                <td>{s.totalBreakMinutes}分</td>
                <td>{s.correctionCount > 0 ? <span className="badge badge-pending">{s.correctionCount}件</span> : '—'}</td>
                <td>¥{s.estimatedSalary.toLocaleString()}</td>
                <td>
                  <button
                    className="button button-small"
                    onClick={() => onSelectStaff(s.userId)}
                    data-testid="view-staff-detail-button"
                  >
                    詳細
                  </button>
                </td>
              </tr>
            ))}
            {summary.length === 0 && (
              <tr><td colSpan={7} className="admin-empty">データなし</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
