/**
 * Kiosk reservation list — shows today's reservations for the store.
 * Read-only view; staff can see upcoming reservations at a glance.
 */
import { useCallback, useEffect, useState } from 'react';
import { kioskApi } from '../api/kioskClient';

interface Reservation {
  id: string;
  reservation_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  confirmation_code: string;
  metadata: Record<string, unknown>;
  resource_ref: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  table: 'テーブル',
  timeslot: '時間帯',
  school: 'スクール',
  event: 'イベント',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '確認待ち',
  confirmed: '確定',
  seated: '来店中',
  completed: '完了',
  no_show: '未来店',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#16a34a',
  seated: '#0ea5e9',
  completed: '#94a3b8',
  no_show: '#dc2626',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

interface Props {
  storeId: string;
}

export default function KioskReservations({ storeId }: Props) {
  const today = toDateStr(new Date());
  const [date, setDate] = useState(today);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d?: string) => {
    setLoading(true);
    try {
      const res = await kioskApi.getReservations(storeId, d || date);
      setReservations(res.reservations);
    } catch {
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, date]);

  useEffect(() => { load(); }, [load]);

  const handleDateChange = (d: string) => {
    setDate(d);
    load(d);
  };

  const isToday = date === today;

  // Group by time (hourly buckets)
  const now = new Date();

  return (
    <div>
      {/* Date navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#333', margin: 0 }}>予約一覧</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <button style={s.dateNavBtn} onClick={() => handleDateChange(addDays(date, -1))}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#222' }}>
            {formatDateLabel(date)}
            {isToday && <span style={s.todayBadge}>今日</span>}
          </span>
          <button style={s.dateNavBtn} onClick={() => handleDateChange(addDays(date, 1))}>›</button>
          {!isToday && (
            <button style={s.todayBtn} onClick={() => handleDateChange(today)}>今日</button>
          )}
        </div>
        <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>
          {reservations.length}件
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>読み込み中...</div>}

      {!loading && reservations.length === 0 && (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', fontSize: 14 }}>
          この日の予約はありません
        </div>
      )}

      {!loading && reservations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reservations.map(r => {
            const isPast = new Date(r.ends_at) < now;
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: isPast ? '#f8fafc' : '#fff',
                  borderRadius: 10,
                  padding: '14px 16px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  borderLeft: `4px solid ${STATUS_COLOR[r.status] || '#94a3b8'}`,
                  opacity: isPast ? 0.6 : 1,
                  gap: 12,
                }}
              >
                {/* Time */}
                <div style={{ minWidth: 70, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#222' }}>
                    {formatTime(r.starts_at)}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    〜{formatTime(r.ends_at)}
                  </div>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                      {r.customer_name}
                    </span>
                    <span style={{ fontSize: 13, color: '#475569' }}>
                      {r.party_size}名
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11,
                      padding: '1px 8px',
                      borderRadius: 4,
                      background: `${STATUS_COLOR[r.status] || '#94a3b8'}18`,
                      color: STATUS_COLOR[r.status] || '#94a3b8',
                      fontWeight: 600,
                    }}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {TYPE_LABEL[r.reservation_type] || r.reservation_type}
                    </span>
                    <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                      {r.confirmation_code}
                    </span>
                  </div>
                  {r.notes && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.notes}
                    </div>
                  )}
                </div>

                {/* Phone */}
                {r.customer_phone && (
                  <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {r.customer_phone}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  dateNavBtn: { background: '#fff', border: '1px solid #d0d7e2', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 18, color: '#555' },
  todayBadge: { marginLeft: 6, background: '#4f8ef7', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11 },
  todayBtn: { background: '#f0f4ff', border: '1px solid #c7d4f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#4f8ef7' },
};
