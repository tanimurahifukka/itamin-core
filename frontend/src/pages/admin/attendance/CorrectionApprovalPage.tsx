/**
 * A04 修正申請承認画面
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';
import { Badge } from '../../../components/atoms/Badge';
import type { AttendanceCorrection } from '../../../types/api';
import { Loading } from '../../../components/atoms/Loading';

type CorrectionItem = AttendanceCorrection;

const STATUS_LABELS: Record<string, string> = {
  pending: '申請中',
  approved: '承認済み',
  rejected: '却下',
  cancelled: '取消',
};

function formatSnapshot(snap: Record<string, unknown> | undefined): string {
  if (!snap) return '—';
  const parts: string[] = [];
  if (snap.clockIn) parts.push(`出勤: ${new Date(snap.clockIn as string).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
  if (snap.clockOut) parts.push(`退勤: ${new Date(snap.clockOut as string).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
  if (snap.breakMinutes != null) parts.push(`休憩: ${snap.breakMinutes}分`);
  return parts.length ? parts.join(' / ') : JSON.stringify(snap);
}

export default function CorrectionApprovalPage() {
  const { selectedStore } = useAuth();
  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const storeId = selectedStore?.id;

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await api.getAdminCorrections(storeId);
      setCorrections(res.corrections || []);
    } catch {
      setCorrections([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    if (!storeId) return;
    try {
      await api.approveCorrection(storeId, id, comment);
      setActionId(null);
      setComment('');
      load();
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      alert(err.body?.error || 'エラーが発生しました');
    }
  };

  const handleReject = async (id: string) => {
    if (!storeId) return;
    try {
      await api.rejectCorrection(storeId, id, comment);
      setActionId(null);
      setComment('');
      load();
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      alert(err.body?.error || 'エラーが発生しました');
    }
  };

  return (
    <div className="p-4">
      <h2>修正申請承認</h2>

      {loading ? (
        <Loading />
      ) : corrections.length === 0 ? (
        <div className="p-4 text-center text-text-subtle">申請はありません</div>
      ) : (
        <div className="flex flex-col gap-3">
          {corrections.map((c) => (
            <div key={c.id} className="rounded-lg bg-surface p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]" data-testid="correction-item">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">{c.user?.name || c.user_id}</span>
                <Badge variant={c.status}>{STATUS_LABELS[c.status]}</Badge>
              </div>
              <div className="mb-3 text-sm text-sumi-600 [&>div]:mb-1">
                <div><strong>対象日:</strong> {c.requested_business_date}</div>
                <div><strong>種別:</strong> {c.request_type}</div>
                <div><strong>理由:</strong> {c.reason}</div>
                {c.before_snapshot && Object.keys(c.before_snapshot).length > 0 && (
                  <div><strong>修正前:</strong> {formatSnapshot(c.before_snapshot)}</div>
                )}
                {c.after_snapshot && Object.keys(c.after_snapshot).length > 0 && (
                  <div><strong>修正後:</strong> {formatSnapshot(c.after_snapshot)}</div>
                )}
                {c.review_comment && (
                  <div><strong>レビューコメント:</strong> {c.review_comment}</div>
                )}
              </div>

              {c.status === 'pending' && (
                <div className="border-t border-sumi-100 pt-3">
                  {actionId === c.id ? (
                    <div className="flex flex-col gap-2">
                      <input
                        className="box-border w-full rounded-md border border-border px-3 py-2 text-[0.9rem] font-sans"
                        placeholder="コメント（任意）"
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        data-testid="review-comment-input"
                      />
                      <div className="flex gap-2">
                        <button
                          className="button button-primary"
                          onClick={() => handleApprove(c.id)}
                          data-testid="approve-button"
                        >
                          承認する
                        </button>
                        <button
                          className="button button-danger"
                          onClick={() => handleReject(c.id)}
                          data-testid="reject-button"
                        >
                          却下する
                        </button>
                        <button className="button" onClick={() => { setActionId(null); setComment(''); }}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="button button-primary"
                      onClick={() => { setActionId(c.id); setComment(''); }}
                      data-testid="review-button"
                    >
                      レビューする
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
