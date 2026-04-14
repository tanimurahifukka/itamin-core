/**
 * S04 修正申請画面
 */
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { todayJST } from '../../lib/dateUtils';
import { Alert } from '../../components/atoms/Alert';

const REQUEST_TYPES = [
  { value: 'clock_in_missing', label: '出勤漏れ' },
  { value: 'clock_out_missing', label: '退勤漏れ' },
  { value: 'time_correction', label: '時間修正' },
  { value: 'break_correction', label: '休憩修正' },
  { value: 'session_add', label: 'セッション追加' },
];

interface CorrectionRecord {
  id?: string;
  businessDate?: string;
  clockInAt?: string;
  clockOutAt?: string;
}

interface Props {
  record?: CorrectionRecord;
  onSubmitted: () => void;
}

export default function CorrectionRequestPage({ record, onSubmitted }: Props) {
  const { selectedStore } = useAuth();
  const [requestType, setRequestType] = useState(REQUEST_TYPES[0].value);
  const [businessDate, setBusinessDate] = useState(record?.businessDate || todayJST());
  const [clockInAt, setClockInAt] = useState('');
  const [clockOutAt, setClockOutAt] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { setError('理由は必須です'); return; }
    if (!selectedStore) return;
    setLoading(true);
    setError('');

    try {
      await api.createCorrection(selectedStore.id, {
        attendanceRecordId: record?.id || null,
        requestedBusinessDate: businessDate,
        requestType,
        beforeSnapshot: record ? {
          clockInAt: record.clockInAt,
          clockOutAt: record.clockOutAt,
        } : {},
        afterSnapshot: {
          clockInAt: clockInAt || undefined,
          clockOutAt: clockOutAt || undefined,
        },
        reason: reason.trim(),
      });
      setSuccess(true);
    } catch (err: unknown) {
      const e = err as { body?: { error?: string }; message?: string };
      setError(e.body?.error || e.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-[600px] p-4">
        <Alert variant="success">修正申請を送信しました。管理者の承認をお待ちください。</Alert>
        <button className="button button-primary" onClick={onSubmitted} data-testid="back-to-home-button">
          ホームに戻る
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[600px] p-4">
      <h2>修正を申請する</h2>

      <form onSubmit={handleSubmit} className="[&_.form-group]:mb-3">
        <div className="form-group">
          <label className="form-label">対象日</label>
          <input
            className="form-input"
            type="date"
            value={businessDate}
            onChange={e => setBusinessDate(e.target.value)}
            data-testid="correction-date-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">申請種別</label>
          <select
            className="form-input"
            value={requestType}
            onChange={e => setRequestType(e.target.value)}
            data-testid="correction-type-select"
          >
            {REQUEST_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">修正後の出勤時刻</label>
          <input
            className="form-input"
            type="time"
            value={clockInAt}
            onChange={e => setClockInAt(e.target.value)}
            data-testid="correction-clockin-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">修正後の退勤時刻</label>
          <input
            className="form-input"
            type="time"
            value={clockOutAt}
            onChange={e => setClockOutAt(e.target.value)}
            data-testid="correction-clockout-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">理由（必須）</label>
          <textarea
            className="form-input"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="修正理由を記入してください"
            data-testid="correction-reason-input"
          />
        </div>

        {error && <Alert variant="error" data-testid="correction-error">{error}</Alert>}

        <button
          type="submit"
          className="button button-primary"
          disabled={loading || !reason.trim()}
          data-testid="correction-submit-button"
        >
          {loading ? '送信中...' : '修正を申請する'}
        </button>
      </form>
    </div>
  );
}
