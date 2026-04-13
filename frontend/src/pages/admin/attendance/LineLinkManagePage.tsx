/**
 * A05 LINE 連携コード発行 / 連携状態画面
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { api } from '../../../api/client';
import type { LineLink } from '../../../types/api';

type StaffLineLinkItem = LineLink;

export default function LineLinkManagePage() {
  const { selectedStore } = useAuth();
  const [staff, setStaff] = useState<StaffLineLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuingFor, setIssuingFor] = useState<string | null>(null);

  const storeId = selectedStore?.id;

  const load = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    api.adminGetLineLinks(storeId)
      .then(res => setStaff(res.staff || []))
      .catch(() => setStaff([]))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const handleIssueCode = async (userId: string) => {
    if (!storeId) return;
    setIssuingFor(userId);
    try {
      await api.adminIssueLinkToken(storeId, userId);
      load();
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      alert(err.body?.error || 'エラーが発生しました');
    } finally {
      setIssuingFor(null);
    }
  };

  return (
    <div className="admin-line-links">
      <h2>LINE 連携管理</h2>

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : (
        <table className="table admin-attendance-table">
          <thead>
            <tr>
              <th>スタッフ</th>
              <th>役割</th>
              <th>LINE連携</th>
              <th>LINE名</th>
              <th>連携日</th>
              <th>連携コード</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.userId} data-testid="line-link-row">
                <td>{s.staffName}</td>
                <td>{s.role}</td>
                <td>
                  {s.lineLink ? (
                    <span className="badge badge-active">連携済み</span>
                  ) : (
                    <span className="badge badge-inactive">未連携</span>
                  )}
                </td>
                <td>{s.lineLink?.displayName || '—'}</td>
                <td>{s.lineLink?.linkedAt ? new Date(s.lineLink.linkedAt).toLocaleDateString('ja-JP') : '—'}</td>
                <td>
                  {s.activeToken ? (
                    <div className="admin-link-code">
                      <code data-testid="link-code-display">{s.activeToken.code}</code>
                      <small>期限: {new Date(s.activeToken.expiresAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                  ) : '—'}
                </td>
                <td>
                  {!s.lineLink && (
                    <button
                      className="button button-small button-primary"
                      onClick={() => handleIssueCode(s.userId)}
                      disabled={issuingFor === s.userId}
                      data-testid="issue-code-button"
                    >
                      {issuingFor === s.userId ? '発行中...' : 'コード発行'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr><td colSpan={7} className="admin-empty">スタッフがいません</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
