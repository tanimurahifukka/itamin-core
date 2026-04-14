/**
 * S03 勤怠履歴一覧
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { Badge } from '../../components/atoms/Badge';
import type { AttendanceHistoryRecord } from '../../types/api';
import { Loading } from '../../components/atoms/Loading';
import { MonthNavigation } from '../../components/molecules/MonthNavigation';

type AttendanceRecord = AttendanceHistoryRecord;

const STATUS_LABELS: Record<string, string> = {
  working: '勤務中',
  on_break: '休憩中',
  completed: '確定',
  needs_review: '要確認',
  cancelled: '取消',
};

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function calcHours(clockIn: string, clockOut: string | null, breakMin: number) {
  if (!clockOut) return '—';
  const diff = Math.max(0, (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000 - breakMin);
  return `${Math.floor(diff / 60)}h ${Math.round(diff % 60)}m`;
}

interface Props {
  onNavigate: (page: string, data?: { record?: AttendanceRecord }) => void;
}

export default function AttendanceHistoryPage({ onNavigate }: Props) {
  const { selectedStore } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const storeId = selectedStore?.id;

  const loadHistory = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const m = `${year}-${String(month).padStart(2, '0')}`;
    try {
      const res = await api.getAttendanceHistory(storeId, m);
      setRecords(res.records || []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, year, month]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  return (
    <div className="p-4">
      <h2>勤怠履歴</h2>

      <MonthNavigation
        align="center"
        label={`${year}年${month}月`}
        onPrev={prevMonth}
        onNext={nextMonth}
        prevTestId="prev-month-button"
        nextTestId="next-month-button"
      />

      {loading ? (
        <Loading />
      ) : records.length === 0 ? (
        <div className="p-8 text-center text-text-subtle">この月の記録はありません</div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-surface px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]" data-testid="attendance-record-card">
              <div className="min-w-[100px] font-semibold">{r.businessDate}</div>
              <div className="tabular-nums">
                <span>{formatTime(r.clockInAt)}</span>
                <span> 〜 </span>
                <span>{formatTime(r.clockOutAt)}</span>
              </div>
              <div className="text-[13px] text-sumi-600">
                <span>休憩 {r.breakMinutes}分</span>
                <span>実働 {calcHours(r.clockInAt, r.clockOutAt, r.breakMinutes)}</span>
              </div>
              <div>
                <Badge variant={r.status}>
                  {r.correctionStatus === 'pending' ? '申請中' : STATUS_LABELS[r.status] || r.status}
                </Badge>
              </div>
              <button
                className="button button-small"
                onClick={() => onNavigate('correction', { record: r })}
                data-testid="correction-link-button"
              >
                修正申請
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
