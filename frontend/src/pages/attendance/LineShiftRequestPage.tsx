/**
 * LINEシフト希望ページ（Supabase Auth不要）
 * 自分のシフト希望を閲覧・登録する。
 */
import { useState, useEffect } from 'react';

interface Props {
  lineUserId: string;
  storeId: string;
  displayName?: string;
  pictureUrl?: string;
}

interface ShiftRequest {
  id: string;
  date: string;
  requestType: 'available' | 'unavailable' | 'preferred';
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const TYPE_LABELS: Record<string, string> = {
  available: '出勤可',
  unavailable: '出勤不可',
  preferred: '希望',
};
const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  available: { bg: '#dcfce7', color: '#166534' },
  unavailable: { bg: '#fee2e2', color: '#991b1b' },
  preferred: { bg: '#dbeafe', color: '#1e40af' },
};

async function lineStaffApi(path: string, body: Record<string, any>) {
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

export default function LineShiftRequestPage({ lineUserId, storeId, displayName }: Props) {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [error, setError] = useState('');

  // フォーム
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<string>('available');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formNote, setFormNote] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await lineStaffApi('/shift-requests', { lineUserId, storeId });
      setRequests(res.requests);
    } catch (e: any) {
      setError(e.body?.error || e.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = async () => {
    if (!formDate) {
      setToast({ msg: '日付を選択してください', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await lineStaffApi('/shift-requests/save', {
        lineUserId, storeId,
        date: formDate,
        requestType: formType,
        startTime: formStartTime || null,
        endTime: formEndTime || null,
        note: formNote || null,
      });
      setToast({ msg: '保存しました', type: 'success' });
      setFormDate('');
      setFormStartTime('');
      setFormEndTime('');
      setFormNote('');
      await load();
    } catch (e: any) {
      setToast({ msg: e.body?.error || e.message || 'エラー', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="attendance-home"><p style={{ color: '#ef4444' }}>{error}</p></div>;

  return (
    <div className="attendance-home" data-testid="line-shift-request-page">
      {toast && (
        <div className={`attendance-toast ${toast.type}`} data-testid="shift-request-toast">
          {toast.msg}
        </div>
      )}

      <h2 style={{ textAlign: 'center', marginBottom: 16 }}>シフト希望</h2>

      {/* 登録フォーム */}
      <div style={{ marginBottom: 20, padding: 12, backgroundColor: '#f9fafb', borderRadius: 8 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>希望を登録</h3>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>日付</label>
          <input
            type="date"
            className="form-input"
            value={formDate}
            onChange={e => setFormDate(e.target.value)}
            data-testid="shift-request-date-input"
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>区分</label>
          <select
            className="form-input"
            value={formType}
            onChange={e => setFormType(e.target.value)}
            data-testid="shift-request-type-select"
          >
            <option value="available">出勤可</option>
            <option value="unavailable">出勤不可</option>
            <option value="preferred">希望</option>
          </select>
        </div>
        {formType !== 'unavailable' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>開始</label>
              <input
                type="time"
                className="form-input"
                value={formStartTime}
                onChange={e => setFormStartTime(e.target.value)}
                data-testid="shift-request-start-time-input"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>終了</label>
              <input
                type="time"
                className="form-input"
                value={formEndTime}
                onChange={e => setFormEndTime(e.target.value)}
                data-testid="shift-request-end-time-input"
              />
            </div>
          </div>
        )}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>メモ</label>
          <input
            type="text"
            className="form-input"
            value={formNote}
            onChange={e => setFormNote(e.target.value)}
            placeholder="任意"
            data-testid="shift-request-note-input"
          />
        </div>
        <button
          className="button button-primary"
          onClick={handleSave}
          disabled={saving}
          data-testid="shift-request-save-button"
          style={{ width: '100%' }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* 一覧 */}
      <h3 style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>登録済みの希望</h3>
      {requests.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>希望はまだ登録されていません</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {requests.map(r => {
            const tc = TYPE_COLORS[r.requestType] || { bg: '#f3f4f6', color: '#374151' };
            return (
              <li key={r.id} style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{formatDate(r.date)}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    backgroundColor: tc.bg, color: tc.color,
                  }}>{TYPE_LABELS[r.requestType] || r.requestType}</span>
                </div>
                {(r.startTime || r.endTime) && (
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {r.startTime || '--:--'} - {r.endTime || '--:--'}
                  </div>
                )}
                {r.note && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{r.note}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
