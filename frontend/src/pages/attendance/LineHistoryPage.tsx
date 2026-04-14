/**
 * LINE勤怠履歴ページ（Supabase Auth不要）
 * 月別の自分の勤怠履歴を閲覧する。
 */
import { useState, useEffect, useCallback } from 'react';
import { Loading } from '../../components/atoms/Loading';

interface Props {
  lineUserId: string;
  storeId: string;
  displayName?: string;
  pictureUrl?: string;
}

interface AttendanceRecord {
  id: string;
  businessDate: string;
  status: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  breakMinutes: number;
}

interface Summary {
  totalDays: number;
  totalHours: number;
  totalMinutes: number;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const STATUS_LABELS: Record<string, string> = {
  working: '勤務中',
  on_break: '休憩中',
  completed: '退勤済み',
};

async function lineStaffApi(path: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/line-staff${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, body: data, message: data.error || data.message };
  return data;
}

function formatTime(iso: string | null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_LABELS[d.getDay()]})`;
}

function calcWorkedTime(clockIn: string | null, clockOut: string | null, breakMin: number): string {
  if (!clockIn || !clockOut) return '-';
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  const totalMin = Math.round(ms / 60000) - breakMin;
  if (totalMin <= 0) return '0:00';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export default function LineHistoryPage({ lineUserId, storeId, displayName }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalDays: 0, totalHours: 0, totalMinutes: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await lineStaffApi('/history', { lineUserId, storeId, year, month });
      setRecords(res.records);
      setSummary(res.summary);
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setError(err.body?.error || err.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [lineUserId, storeId, year, month]);

  useEffect(() => { load(); }, [load]);

  const goMonth = (delta: number) => {
    let y = year;
    let m = month + delta;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setYear(y);
    setMonth(m);
  };

  return (
    <div className="attendance-home" data-testid="line-history-page">
      <h2 style={{ textAlign: 'center', marginBottom: 16 }}>
        {displayName ? `${displayName}さんの` : ''}勤怠履歴
      </h2>

      {/* 月切り替え */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          className="button"
          onClick={() => goMonth(-1)}
          data-testid="history-prev-month-button"
        >
          &lt;
        </button>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{year}年{month}月</span>
        <button
          className="button"
          onClick={() => goMonth(1)}
          data-testid="history-next-month-button"
        >
          &gt;
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <p style={{ color: '#ef4444' }}>{error}</p>
      ) : (
        <>
          {/* サマリー */}
          <div style={{
            display: 'flex', justifyContent: 'space-around', padding: 12,
            backgroundColor: '#f0f9ff', borderRadius: 8, marginBottom: 16,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>出勤日数</div>
              <div style={{ fontSize: 20, fontWeight: 700 }} data-testid="history-total-days">{summary.totalDays}日</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>合計時間</div>
              <div style={{ fontSize: 20, fontWeight: 700 }} data-testid="history-total-hours">{summary.totalHours}h</div>
            </div>
          </div>

          {/* 一覧 */}
          {records.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center' }}>記録がありません</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {records.map(r => (
                <li key={r.id} style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{formatDate(r.businessDate)}</span>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4,
                      backgroundColor: r.status === 'completed' ? '#dcfce7' : '#fef9c3',
                      color: r.status === 'completed' ? '#166534' : '#854d0e',
                    }}>{STATUS_LABELS[r.status] || r.status}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{formatTime(r.clockInAt)} - {formatTime(r.clockOutAt)}</span>
                    <span style={{ color: '#6b7280' }}>
                      実働 {calcWorkedTime(r.clockInAt, r.clockOutAt, r.breakMinutes)}
                      {r.breakMinutes > 0 && ` / 休憩 ${r.breakMinutes}分`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
