/**
 * LINEシフト確認ページ（Supabase Auth不要）
 * 今週〜来週の自分のシフトを表示する。
 */
import { useState, useEffect, useCallback } from 'react';

interface Props {
  lineUserId: string;
  storeId: string;
  displayName?: string;
  pictureUrl?: string;
}

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  status: string;
  note: string;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  published: '確定',
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_LABELS[d.getDay()]})`;
}

export default function LineShiftPage({ lineUserId, storeId, displayName }: Props) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [, setStartDate] = useState('');
  const [, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await lineStaffApi('/shifts', { lineUserId, storeId });
      setShifts(res.shifts);
      setStartDate(res.startDate);
      setEndDate(res.endDate);
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setError(err.body?.error || err.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [lineUserId, storeId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="attendance-home"><p style={{ color: '#ef4444' }}>{error}</p></div>;

  // 今週と来週に分ける
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const nextMondayStr = nextMonday.toISOString().split('T')[0];

  const thisWeek = shifts.filter(s => s.date < nextMondayStr);
  const nextWeek = shifts.filter(s => s.date >= nextMondayStr);

  const renderShiftList = (items: Shift[], label: string) => (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>{label}</h3>
      {items.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>シフトなし</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map(s => (
            <li key={s.id} style={{
              padding: '10px 12px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: s.date === today ? '#eff6ff' : 'transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{formatDate(s.date)}</span>
                <span style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  backgroundColor: s.status === 'published' ? '#dcfce7' : '#f3f4f6',
                  color: s.status === 'published' ? '#166534' : '#6b7280',
                }}>{STATUS_LABELS[s.status] || s.status}</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {s.startTime} - {s.endTime}
                {s.breakMinutes > 0 && <span style={{ color: '#9ca3af', marginLeft: 8 }}>休憩{s.breakMinutes}分</span>}
              </div>
              {s.note && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="attendance-home" data-testid="line-shift-page">
      <h2 style={{ textAlign: 'center', marginBottom: 16 }}>
        {displayName ? `${displayName}さんの` : ''}シフト確認
      </h2>

      {renderShiftList(thisWeek, '今週')}
      {renderShiftList(nextWeek, '来週')}

      <button
        className="button button-primary"
        onClick={load}
        data-testid="shift-reload-button"
        style={{ marginTop: 12, width: '100%' }}
      >
        更新
      </button>
    </div>
  );
}
