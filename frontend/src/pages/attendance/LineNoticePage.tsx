/**
 * LINE連絡ノートページ（Supabase Auth不要）
 * 店舗のお知らせを閲覧・既読マークする。
 */
import { useState, useEffect, useCallback } from 'react';

interface Props {
  lineUserId: string;
  storeId: string;
  displayName?: string;
  pictureUrl?: string;
}

interface Notice {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  authorName: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
}

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

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export default function LineNoticePage({ lineUserId, storeId }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await lineStaffApi('/notices', { lineUserId, storeId });
      setNotices(res.notices);
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setError(err.body?.error || err.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [lineUserId, storeId]);

  useEffect(() => { load(); }, [load]);

  const handleExpand = async (noticeId: string) => {
    if (expanded === noticeId) {
      setExpanded(null);
      return;
    }
    setExpanded(noticeId);

    // 既読マーク
    const notice = notices.find(n => n.id === noticeId);
    if (notice && !notice.isRead) {
      try {
        await lineStaffApi('/notices/read', { lineUserId, storeId, noticeId });
        setNotices(prev => prev.map(n =>
          n.id === noticeId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        ));
      } catch {
        // 既読失敗は無視
      }
    }
  };

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="attendance-home"><p style={{ color: '#ef4444' }}>{error}</p></div>;

  const unreadCount = notices.filter(n => !n.isRead).length;

  return (
    <div className="attendance-home" data-testid="line-notice-page">
      <h2 style={{ textAlign: 'center', marginBottom: 8 }}>連絡ノート</h2>
      {unreadCount > 0 && (
        <div style={{ textAlign: 'center', marginBottom: 12, color: '#dc2626', fontSize: 13 }}>
          未読 {unreadCount}件
        </div>
      )}

      {notices.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center' }}>お知らせはありません</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {notices.map(n => (
            <li key={n.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <div
                style={{
                  padding: '12px',
                  cursor: 'pointer',
                  backgroundColor: !n.isRead ? '#eff6ff' : 'transparent',
                }}
                onClick={() => handleExpand(n.id)}
                data-testid={`notice-item-${n.id}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {n.pinned && <span style={{ color: '#f59e0b', fontSize: 14 }}>&#128204;</span>}
                  {!n.isRead && <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                    backgroundColor: '#3b82f6', flexShrink: 0,
                  }} />}
                  <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{n.title}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                    {expanded === n.id ? '▲' : '▼'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                  {n.authorName} - {formatDateTime(n.createdAt)}
                </div>
              </div>
              {expanded === n.id && (
                <div style={{
                  padding: '0 12px 12px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }} data-testid={`notice-body-${n.id}`}>
                  {n.body || '（本文なし）'}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        className="button button-primary"
        onClick={load}
        data-testid="notice-reload-button"
        style={{ marginTop: 16, width: '100%' }}
      >
        更新
      </button>
    </div>
  );
}
