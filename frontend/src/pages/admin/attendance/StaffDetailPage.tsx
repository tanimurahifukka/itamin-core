/**
 * A03 スタッフ勤怠詳細
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';

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
  userId: string;
  onBack: () => void;
}

export default function StaffDetailPage({ userId, onBack }: Props) {
  const { selectedStore } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editNote, setEditNote] = useState('');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const storeId = selectedStore?.id;

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    const m = `${year}-${String(month).padStart(2, '0')}`;
    api.getAdminStaffAttendance(storeId, userId, m)
      .then(res => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [storeId, userId, year, month]);

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditClockIn(r.clockInAt ? new Date(r.clockInAt).toISOString().slice(0, 16) : '');
    setEditClockOut(r.clockOutAt ? new Date(r.clockOutAt).toISOString().slice(0, 16) : '');
    setEditNote(r.note || '');
  };

  const saveEdit = async (recordId: string) => {
    if (!storeId) return;
    try {
      await api.adminUpdateRecord(storeId, recordId, {
        clockInAt: editClockIn || undefined,
        clockOutAt: editClockOut || undefined,
        note: editNote || undefined,
      });
      setEditingId(null);
      load();
    } catch (e: any) {
      alert(e.body?.error || 'エラーが発生しました');
    }
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  if (loading) return <div className="loading">読み込み中...</div>;

  return (
    <div className="admin-staff-detail">
      <button className="button" onClick={onBack} data-testid="back-button">← 戻る</button>

      <h2>{data?.staff?.name || 'スタッフ'} の勤怠詳細</h2>

      <div className="attendance-month-nav">
        <button className="button" onClick={prevMonth}>◀</button>
        <span className="attendance-month-label">{year}年{month}月</span>
        <button className="button" onClick={nextMonth}>▶</button>
      </div>

      <table className="table admin-attendance-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>出勤</th>
            <th>退勤</th>
            <th>休憩</th>
            <th>実働</th>
            <th>状態</th>
            <th>備考</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {(data?.records || []).map((r: any) => (
            <tr key={r.id} data-testid="staff-detail-row">
              {editingId === r.id ? (
                <>
                  <td>{r.businessDate}</td>
                  <td><input type="datetime-local" className="form-input form-input-sm" value={editClockIn} onChange={e => setEditClockIn(e.target.value)} data-testid="edit-clockin-input" /></td>
                  <td><input type="datetime-local" className="form-input form-input-sm" value={editClockOut} onChange={e => setEditClockOut(e.target.value)} data-testid="edit-clockout-input" /></td>
                  <td>{r.breakMinutes}分</td>
                  <td>—</td>
                  <td>{r.status}</td>
                  <td><input className="form-input form-input-sm" value={editNote} onChange={e => setEditNote(e.target.value)} data-testid="edit-note-input" /></td>
                  <td>
                    <button className="button button-small button-primary" onClick={() => saveEdit(r.id)} data-testid="save-edit-button">保存</button>
                    <button className="button button-small" onClick={() => setEditingId(null)}>取消</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{r.businessDate}</td>
                  <td>{formatTime(r.clockInAt)}</td>
                  <td>{formatTime(r.clockOutAt)}</td>
                  <td>{r.breakMinutes}分</td>
                  <td>{calcHours(r.clockInAt, r.clockOutAt, r.breakMinutes)}</td>
                  <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                  <td>{r.note || ''}</td>
                  <td>
                    <button className="button button-small" onClick={() => startEdit(r)} data-testid="edit-record-button">編集</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {(!data?.records || data.records.length === 0) && (
            <tr><td colSpan={8} className="admin-empty">データなし</td></tr>
          )}
        </tbody>
      </table>

      {/* 修正申請一覧 */}
      {data?.corrections && data.corrections.length > 0 && (
        <div className="admin-corrections-section">
          <h3>修正申請</h3>
          {data.corrections.map((c: any) => (
            <div key={c.id} className="admin-correction-card">
              <span>{c.requested_business_date}</span>
              <span className={`badge badge-${c.status}`}>{c.status}</span>
              <span>{c.request_type}</span>
              <span>{c.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
