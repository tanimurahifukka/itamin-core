/**
 * A01 今日の出勤ボード
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';
import { Badge } from '../../../components/atoms/Badge';
import type { AdminTodayStaff } from '../../../types/api';
import { Loading } from '../../../components/atoms/Loading';

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
  if (currentStatus === 'not_clocked_in') return <span className="text-text-subtle">—</span>;

  const items: React.ReactElement[] = [];
  items.push(
    <span key="in" className={`inline-block whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold ${clockIn ? 'bg-success-bg text-success-fg' : 'bg-error-bg text-error-fg'}`}>
      出勤 {clockIn ? '済' : '未'}
    </span>
  );
  if (currentStatus === 'completed') {
    items.push(
      <span key="out" className={`inline-block whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold ${clockOut ? 'bg-success-bg text-success-fg' : 'bg-error-bg text-error-fg'}`}>
        退勤 {clockOut ? '済' : '未'}
      </span>
    );
  }
  return <div className="flex flex-wrap gap-1">{items}</div>;
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
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [storeId, statusFilter, search]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  const statuses = ['', 'not_clocked_in', 'working', 'on_break', 'completed'];

  return (
    <div className="p-4">
      <h2>今日の出勤ボード {data?.businessDate && <span className="text-sm font-normal text-[#6b7280]">({data.businessDate})</span>}</h2>

      <div className="mb-3 flex flex-wrap gap-2">
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
        <Loading />
      ) : (
        <table className="table w-full border-collapse text-sm">
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
                <td className="font-medium">{s.staffName}</td>
                <td>
                  <Badge variant={s.currentStatus}>
                    {STATUS_LABELS[s.currentStatus] || s.currentStatus}
                  </Badge>
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
              <tr><td colSpan={8} className="p-4 text-center text-text-subtle">スタッフがいません</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
