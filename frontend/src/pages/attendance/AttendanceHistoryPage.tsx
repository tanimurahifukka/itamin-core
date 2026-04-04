/**
 * S03 勤怠履歴一覧
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';

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
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000 - breakMin;
  return `${Math.floor(diff / 60)}h ${Math.round(diff % 60)}m`;
}

interface Props {
  onNavigate: (page: string, data?: any) => void;
}

export default function AttendanceHistoryPage({ onNavigate }: Props) {
  const { selectedStore } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const storeId = selectedStore?.id;

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    const m = `${year}-${String(month).padStart(2, '0')}`;
    api.getAttendanceHistory(storeId, m)
      .then(res => setRecords(res.records || []))
      .catch(() => setRecords([]))
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
    <div className="attendance-history">
      <h2>勤怠履歴</h2>

      <div className="attendance-month-nav">
        <button className="button" onClick={prevMonth} data-testid="prev-month-button">◀</button>
        <span className="attendance-month-label">{year}年{month}月</span>
        <button className="button" onClick={nextMonth} data-testid="next-month-button">▶</button>
      </div>

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : records.length === 0 ? (
        <div className="attendance-empty">この月の記録はありません</div>
      ) : (
        <div className="attendance-record-list">
          {records.map((r: any) => (
            <div key={r.id} className="attendance-record-card" data-testid="attendance-record-card">
              <div className="attendance-record-date">{r.businessDate}</div>
              <div className="attendance-record-times">
                <span>{formatTime(r.clockInAt)}</span>
                <span> 〜 </span>
                <span>{formatTime(r.clockOutAt)}</span>
              </div>
              <div className="attendance-record-detail">
                <span>休憩 {r.breakMinutes}分</span>
                <span>実働 {calcHours(r.clockInAt, r.clockOutAt, r.breakMinutes)}</span>
              </div>
              <div className="attendance-record-status">
                <span className={`badge badge-${r.status}`}>
                  {r.correctionStatus === 'pending' ? '申請中' : STATUS_LABELS[r.status] || r.status}
                </span>
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
