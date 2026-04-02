import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { supabase } from '../api/supabase';
import { showToast } from '../components/Toast';

interface Notice {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  pinned: boolean;
  imageUrls: string[];
  commentCount: number;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
}

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

function linkifyText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', wordBreak: 'break-all' }}>
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function NoticePage() {
  const { selectedStore, user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // 編集
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // コメント
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentPosting, setCommentPosting] = useState(false);

  const isAdmin = selectedStore && ['owner', 'manager'].includes(selectedStore.role);

  const loadData = () => {
    if (!selectedStore) return;
    api.getNotices(selectedStore.id)
      .then((data: any) => setNotices(data.notices))
      .catch(() => {});
  };

  useEffect(() => { loadData(); }, [selectedStore]);

  // コメント読み込み
  const loadComments = async (noticeId: string) => {
    if (!selectedStore) return;
    try {
      const data = await api.getNoticeComments(selectedStore.id, noticeId);
      setComments(prev => ({ ...prev, [noticeId]: data.comments }));
    } catch {}
  };

  const handlePost = async () => {
    if (!selectedStore || !newTitle.trim() || posting) return;
    setPosting(true);
    try {
      const result = await api.postNotice(selectedStore.id, { title: newTitle.trim(), body: newBody });
      const noticeId = result.notice?.id;

      if (noticeId && selectedFiles.length > 0) {
        const imageUrls: string[] = [];
        for (const file of selectedFiles) {
          const ext = file.name.split('.').pop() || 'jpg';
          const path = `${selectedStore.id}/${noticeId}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from('notice-images')
            .upload(path, file);
          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from('notice-images')
              .getPublicUrl(path);
            imageUrls.push(urlData.publicUrl);
          }
        }
        if (imageUrls.length > 0) {
          await api.updateNoticeImages(selectedStore.id, noticeId, imageUrls);
        }
      }

      setNewTitle('');
      setNewBody('');
      setSelectedFiles([]);
      showToast('投稿しました', 'success');
      loadData();
    } catch (e: any) {
      showToast(e.message || '投稿に失敗しました', 'error');
    } finally {
      setPosting(false);
    }
  };

  const handleRead = async (noticeId: string) => {
    if (!selectedStore) return;
    try {
      await api.markNoticeRead(selectedStore.id, noticeId);
      loadData();
    } catch {}
  };

  const handleTogglePin = async (notice: Notice) => {
    if (!selectedStore) return;
    try {
      await api.toggleNoticePin(selectedStore.id, notice.id, !notice.pinned);
      showToast(notice.pinned ? 'ピン留め解除' : 'ピン留めしました', 'info');
      loadData();
    } catch {}
  };

  const handleDelete = async (notice: Notice) => {
    if (!selectedStore) return;
    if (!confirm(`「${notice.title}」を削除しますか？`)) return;
    try {
      await api.deleteNotice(selectedStore.id, notice.id);
      showToast('削除しました', 'info');
      loadData();
    } catch (e: any) {
      showToast(e.message || '削除に失敗しました', 'error');
    }
  };

  // 編集開始
  const startEdit = (notice: Notice) => {
    setEditingId(notice.id);
    setEditTitle(notice.title);
    setEditBody(notice.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditBody('');
  };

  const handleEditSave = async () => {
    if (!selectedStore || !editingId || editSaving) return;
    setEditSaving(true);
    try {
      await api.editNotice(selectedStore.id, editingId, {
        title: editTitle.trim(),
        body: editBody,
      });
      showToast('更新しました', 'success');
      cancelEdit();
      loadData();
    } catch (e: any) {
      showToast(e.message || '更新に失敗しました', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  // コメント投稿
  const handlePostComment = async (noticeId: string) => {
    if (!selectedStore || commentPosting) return;
    const text = (commentText[noticeId] || '').trim();
    if (!text) return;
    setCommentPosting(true);
    try {
      await api.postNoticeComment(selectedStore.id, noticeId, text);
      setCommentText(prev => ({ ...prev, [noticeId]: '' }));
      await loadComments(noticeId);
      loadData(); // コメント数更新
    } catch (e: any) {
      showToast(e.message || 'コメント投稿に失敗しました', 'error');
    } finally {
      setCommentPosting(false);
    }
  };

  // コメント削除
  const handleDeleteComment = async (noticeId: string, commentId: string) => {
    if (!selectedStore) return;
    try {
      await api.deleteNoticeComment(selectedStore.id, noticeId, commentId);
      await loadComments(noticeId);
      loadData();
    } catch {}
  };

  const toggleExpand = (noticeId: string) => {
    if (expandedId === noticeId) {
      setExpandedId(null);
    } else {
      setExpandedId(noticeId);
      const notice = notices.find(n => n.id === noticeId);
      if (notice && !notice.isRead) {
        handleRead(noticeId);
      }
      // コメントも読み込み
      if (!comments[noticeId]) {
        loadComments(noticeId);
      }
    }
  };

  const canEdit = (notice: Notice) => {
    return notice.authorId === user?.id || isAdmin;
  };

  const unreadCount = notices.filter(n => !n.isRead).length;

  return (
    <div className="main-content">
      {/* サマリー */}
      <div className="today-summary">
        <div className="summary-card">
          <div className="summary-number">{notices.length}</div>
          <div className="summary-label">投稿数</div>
        </div>
        <div className="summary-card" style={unreadCount > 0 ? { background: '#eff6ff' } : {}}>
          <div className="summary-number" style={unreadCount > 0 ? { color: '#2563eb' } : {}}>{unreadCount}</div>
          <div className="summary-label">未読</div>
        </div>
      </div>

      {/* 投稿フォーム */}
      <div className="records-section" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>新規投稿</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            placeholder="タイトル *"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            data-testid="notice-title-input"
            style={{ padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
          />
          <textarea
            placeholder="本文（任意）"
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
            rows={3}
            data-testid="notice-body-input"
            style={{ padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical' }}
          />
          <div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #d4d9df', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', color: '#555' }}>
              📷 画像を添付
              <input
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files || []).slice(0, 5);
                  setSelectedFiles(files);
                  e.target.value = '';
                }}
              />
            </label>
            <span style={{ fontSize: '0.8rem', color: '#888', marginLeft: 8 }}>最大5枚</span>
          </div>
          {selectedFiles.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selectedFiles.map((f, i) => (
                <div key={i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 6, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                  <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handlePost}
              disabled={posting || !newTitle.trim()}
              data-testid="notice-post-btn"
              style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit', fontSize: '0.9rem' }}
            >
              {posting ? '投稿中...' : '投稿'}
            </button>
          </div>
        </div>
      </div>

      {/* 投稿一覧 */}
      <div className="records-section">
        <h3 style={{ marginBottom: 12 }}>投稿一覧</h3>
        {notices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <p className="empty-state-text">投稿がありません</p>
            <p className="empty-state-hint">上のフォームから投稿してください</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notices.map(n => (
              <div
                key={n.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 12,
                  background: n.isRead ? 'white' : '#f0f7ff',
                  borderLeft: n.pinned ? '4px solid #f59e0b' : '4px solid transparent',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => toggleExpand(n.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!n.isRead && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', display: 'inline-block' }} />
                    )}
                    {n.pinned && <span style={{ fontSize: '0.8rem' }}>📌</span>}
                    <span style={{ fontWeight: 600 }}>{n.title}</span>
                    {n.imageUrls && n.imageUrls.length > 0 && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>📷{n.imageUrls.length}</span>}
                    {n.commentCount > 0 && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>💬{n.commentCount}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#888', flexShrink: 0 }}>
                    <span>{n.authorName}</span>
                    <span>{new Date(n.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                {/* 展開ビュー */}
                {expandedId === n.id && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                    {/* 編集モード */}
                    {editingId === n.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          data-testid="edit-notice-title"
                          style={{ padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600 }}
                        />
                        <textarea
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          rows={4}
                          data-testid="edit-notice-body"
                          style={{ padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            onClick={cancelEdit}
                            style={{ padding: '6px 12px', border: '1px solid #d4d9df', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}
                          >
                            キャンセル
                          </button>
                          <button
                            onClick={handleEditSave}
                            disabled={editSaving || !editTitle.trim()}
                            data-testid="save-notice-edit-btn"
                            style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit' }}
                          >
                            {editSaving ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: '#444', marginBottom: 8, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {n.body ? linkifyText(n.body) : '（本文なし）'}
                      </p>
                    )}

                    {/* 画像 */}
                    {n.imageUrls && n.imageUrls.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        {n.imageUrls.map((url: string, i: number) => (
                          <img
                            key={i}
                            src={url}
                            alt=""
                            onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }}
                            style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer' }}
                          />
                        ))}
                      </div>
                    )}

                    {/* アクションボタン */}
                    {editingId !== n.id && (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 8 }}>
                        {canEdit(n) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit(n); }}
                            data-testid={`edit-notice-btn-${n.id}`}
                            style={{ padding: '4px 8px', border: '1px solid #d4d9df', borderRadius: 4, background: 'white', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}
                          >
                            編集
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(n); }}
                          style={{ padding: '4px 8px', border: '1px solid #d4d9df', borderRadius: 4, background: 'white', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}
                        >
                          {n.pinned ? 'ピン解除' : 'ピン留め'}
                        </button>
                        {(canEdit(n) || isAdmin) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(n); }}
                            style={{ padding: '4px 8px', border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}
                          >
                            削除
                          </button>
                        )}
                      </div>
                    )}

                    {/* スレッド（コメント） */}
                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                        返信 {comments[n.id]?.length ? `(${comments[n.id].length})` : ''}
                      </div>

                      {/* コメント一覧 */}
                      {(comments[n.id] || []).map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8, paddingLeft: 8, borderLeft: '2px solid #e5e7eb' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151' }}>{c.authorName}</span>
                              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                {new Date(c.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {(c.authorId === user?.id || isAdmin) && (
                                <button
                                  onClick={() => handleDeleteComment(n.id, c.id)}
                                  style={{ padding: 0, border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.75rem' }}
                                >
                                  削除
                                </button>
                              )}
                            </div>
                            <p style={{ fontSize: '0.85rem', color: '#444', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {linkifyText(c.body)}
                            </p>
                          </div>
                        </div>
                      ))}

                      {/* コメント入力 */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                        <input
                          type="text"
                          placeholder="返信を入力..."
                          value={commentText[n.id] || ''}
                          onChange={e => setCommentText(prev => ({ ...prev, [n.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(n.id); } }}
                          data-testid={`comment-input-${n.id}`}
                          style={{ flex: 1, padding: '6px 10px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.85rem' }}
                        />
                        <button
                          onClick={() => handlePostComment(n.id)}
                          disabled={commentPosting || !(commentText[n.id] || '').trim()}
                          data-testid={`comment-post-btn-${n.id}`}
                          style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          送信
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ライトボックス */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20, cursor: 'pointer',
          }}
        >
          <img
            src={lightboxUrl}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
