/**
 * A01 今日の出勤ボード
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';
interface AdminTodayStaff {
  userId: string;
  staffId: string;
  staffName: string;
  staffPicture?: string;
  role: string;
  currentStatus: string;
  clockInAt?: string;
  clockOutAt?: string;
  breakMinutes?: number;
  shift?: { startTime: string; endTime: string };
  checklist?: { clockIn?: boolean; clockOut?: boolean };
}

const STATUS_LABELS: Record<string, string> = {
  not_clocked_in: '未出勤',
  working: '勤務中',
  on_break: '休憩中',
  completed: '退勤済み',
};

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function ChecklistBadge({ currentStatus, clockIn, clockOut }: {
  currentStatus: string;
  clockIn?: boolean;
  clockOut?: boolean;
}) {
  if (currentStatus === 'not_clocked_in') return <span className="checklist-na">—</span>;

  const items: React.ReactElement[] = [];
  items.push(
    <span key="in" className={`checklist-chip ${clockIn ? 'done' : 'missing'}`}>
      出勤 {clockIn ? '済' : '未'}
    </span>
  );
  if (currentStatus === 'completed') {
    items.push(
      <span key="out" className={`checklist-chip ${clockOut ? 'done' : 'missing'}`}>
        退勤 {clockOut ? '済' : '未'}
      </span>
    );
  }
  return <div className="checklist-badges">{items}</div>;
}

interface Props {
  onSelectStaff: (userId: string) => void;
}

export default function TodayBoardPage({ onSelectStaff }: Props) {
  const { selectedStore } = useAuth();
  const [data, setData] = useState<{ businessDate?: string; staff?: AdminTodayStaff[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const storeId = selectedStore?.id;

  const loadBoard = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await api.getAdminAttendanceToday(storeId, statusFilter || undefined, search || undefined);
      setData(res as unknown as { businessDate?: string; staff?: AdminTodayStaff[] });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [storeId, statusFilter, search]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

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
              <th>チェックリスト</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(data?.staff || []).map((s) => (
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
                <td>{s.breakMinutes ?? 0}分</td>
                <td data-testid="checklist-status">
                  <ChecklistBadge
                    currentStatus={s.currentStatus}
                    clockIn={s.checklist?.clockIn}
                    clockOut={s.checklist?.clockOut}
                  />
                </td>
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
              <tr><td colSpan={8} className="admin-empty">スタッフがいません</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
