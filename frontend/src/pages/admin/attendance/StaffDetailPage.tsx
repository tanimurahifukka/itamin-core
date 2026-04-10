/**
 * A03 スタッフ勤怠詳細
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';

interface AttendanceRecord {
  id: string;
  businessDate: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  breakMinutes: number;
  status: string;
  note?: string;
}

interface CorrectionItem {
  id: string;
  requested_business_date: string;
  status: string;
  request_type: string;
  reason: string;
}

interface StaffDetailData {
  staff?: { name: string };
  records?: AttendanceRecord[];
  corrections?: CorrectionItem[];
}

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
  const [data, setData] = useState<StaffDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editNote, setEditNote] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isOwner = selectedStore?.role === 'owner';
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const storeId = selectedStore?.id;

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const m = `${year}-${String(month).padStart(2, '0')}`;
    try {
      const res = await api.getAdminStaffAttendance(storeId, userId, m);
      setData(res as unknown as StaffDetailData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [storeId, userId, year, month]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (r: AttendanceRecord) => {
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
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      alert(err.body?.error || 'エラーが発生しました');
    }
  };

  const confirmDelete = async () => {
    if (deleting) return;
    if (!storeId || !deleteTarget) return;
    setDeleting(true);
    try {
      await api.adminDeleteRecord(storeId, deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      alert(err.body?.error || '削除に失敗しました');
    } finally {
      setDeleting(false);
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
          {(data?.records || []).map((r) => (
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
                  <td>{r.clockInAt ? calcHours(r.clockInAt, r.clockOutAt, r.breakMinutes) : '—'}</td>
                  <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                  <td>{r.note || ''}</td>
                  <td>
                    <button className="button button-small" onClick={() => startEdit(r)} data-testid="edit-record-button">編集</button>
                    {isOwner && (
                      <button className="button button-small button-danger" onClick={() => setDeleteTarget(r)} data-testid="delete-record-button">削除</button>
                    )}
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

      {/* 削除確認ダイアログ */}
      {deleteTarget && (
        <div className="modal-overlay" data-testid="delete-confirm-modal">
          <div className="modal">
            <h3>勤怠レコード削除</h3>
            <p>以下のレコードを削除しますか？この操作は取り消せません。</p>
            <table className="table">
              <tbody>
                <tr><td>日付</td><td>{deleteTarget.businessDate}</td></tr>
                <tr><td>出勤</td><td>{formatTime(deleteTarget.clockInAt)}</td></tr>
                <tr><td>退勤</td><td>{formatTime(deleteTarget.clockOutAt)}</td></tr>
                <tr><td>状態</td><td>{deleteTarget.status}</td></tr>
              </tbody>
            </table>
            <div className="modal-actions">
              <button className="button button-danger" onClick={confirmDelete} disabled={deleting} data-testid="confirm-delete-button">{deleting ? '削除中...' : '削除する'}</button>
              <button className="button" onClick={() => setDeleteTarget(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* 修正申請一覧 */}
      {data?.corrections && data.corrections.length > 0 && (
        <div className="admin-corrections-section">
          <h3>修正申請</h3>
          {data.corrections.map((c) => (
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
