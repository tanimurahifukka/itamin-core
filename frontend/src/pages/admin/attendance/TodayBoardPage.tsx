/**
 * A01 今日の出勤ボード
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';

const STATUS_LABELS: Record<string, string> = {
  not_clocked_in: '未出勤',
  working: '勤務中',
  on_break: '休憩中',
  completed: '退勤済み',
};

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  onSelectStaff: (userId: string) => void;
}

export default function TodayBoardPage({ onSelectStaff }: Props) {
  const { selectedStore } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const storeId = selectedStore?.id;

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    api.getAdminAttendanceToday(storeId, statusFilter || undefined, search || undefined)
      .then(res => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [storeId, statusFilter, search]);

  const statuses = ['', 'not_clocked_in', 'working', 'on_break', 'completed'];

  return (
    <div className="admin-today-board">
      <h2>今日の出勤ボード {data?.businessDate && <span className="admin-date">({data.businessDate})</span>}</h2>

      <div className="admin-filters">
        <select
          className="form-input"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          data-testid="status-filter-select"
        >
          <option value="">全ステータス</option>
          {statuses.filter(Boolean).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <input
          className="form-input"
          placeholder="スタッフ名で検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="staff-search-input"
        />
      </div>

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : (
        <table className="table admin-attendance-table">
          <thead>
            <tr>
              <th>スタッフ</th>
              <th>状態</th>
              <th>予定シフト</th>
              <th>出勤</th>
              <th>退勤</th>
              <th>休憩</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(data?.staff || []).map((s: any) => (
              <tr key={s.userId} data-testid="today-board-row">
                <td className="admin-staff-name">{s.staffName}</td>
                <td>
                  <span className={`badge badge-${s.currentStatus}`}>
                    {STATUS_LABELS[s.currentStatus] || s.currentStatus}
                  </span>
                </td>
                <td>{s.shift ? `${s.shift.startTime}〜${s.shift.endTime}` : '—'}</td>
                <td>{formatTime(s.clockInAt)}</td>
                <td>{formatTime(s.clockOutAt)}</td>
                <td>{s.breakMinutes}分</td>
                <td>
                  <button
                    className="button button-small"
                    onClick={() => onSelectStaff(s.userId)}
                    data-testid="view-detail-button"
                  >
                    詳細
                  </button>
                </td>
              </tr>
            ))}
            {(!data?.staff || data.staff.length === 0) && (
              <tr><td colSpan={7} className="admin-empty">スタッフがいません</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
