import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  leader: 'リーダー',
  full_time: '正社員',
  part_time: 'アルバイト',
};

type Mode = 'select' | 'create' | 'join';

export default function StoreSelectPage() {
  const { stores, selectStore, refreshStores, storesLoading } = useAuth();
  const [mode, setMode] = useState<Mode>('select');

  // Create store form
  const [storeName, setStoreName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [creating, setCreating] = useState(false);

  // Join store form
  const [storeId, setStoreId] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [joining, setJoining] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isOwner = stores.some(s => s.role === 'owner');

  const handleCreateStore = async () => {
    if (!storeName.trim() || creating) return;
    setCreating(true);
    setError('');
    setMessage('');
    try {
      const result = await api.createStore(storeName.trim(), storeAddress.trim() || undefined);
      await refreshStores();
      setMessage(`${result.store.name} を作成しました`);
      setStoreName('');
      setStoreAddress('');
      setMode('select');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '店舗の作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinStore = async () => {
    if (!storeId.trim() || !inviteToken.trim() || joining) return;
    setJoining(true);
    setError('');
    setMessage('');
    try {
      const result = await api.joinStoreByToken(storeId.trim(), inviteToken.trim());
      await refreshStores();
      setMessage(result.message);
      setStoreId('');
      setInviteToken('');
      setMode('select');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '参加に失敗しました');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="store-selector">
      <h2>事業所を選択してください</h2>

      {message && <p style={{ color: '#16a34a', marginBottom: 16 }}>{message}</p>}
      {error && <p style={{ color: '#dc2626', marginBottom: 16 }}>{error}</p>}

      {mode === 'select' && (
        <>
          {storesLoading ? (
            <div className="loading">読み込み中...</div>
          ) : stores.length > 0 ? (
            <div className="store-list">
              {stores.map(store => (
                <div
                  key={store.id}
                  className="store-card"
                  onClick={() => selectStore(store)}
                >
                  <h3>{store.name}</h3>
                  <span className="role">{roleLabels[store.role] || store.role}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#888' }}>所属する事業所がありません</p>
          )}

          <div style={{ maxWidth: 400, margin: '24px auto 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isOwner && (
              <button
                className="store-action-btn"
                onClick={() => { setMode('create'); setError(''); setMessage(''); }}
              >
                + 店舗を追加
              </button>
            )}
            <button
              className="store-action-btn secondary"
              onClick={() => { setMode('join'); setError(''); setMessage(''); }}
            >
              招待コードで参加
            </button>
          </div>
        </>
      )}

      {mode === 'create' && (
        <div className="create-store">
          <h3 style={{ marginBottom: 16 }}>新しい店舗を追加</h3>
          <input
            type="text"
            placeholder="店舗名（必須）"
            value={storeName}
            onChange={e => setStoreName(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="住所（任意）"
            value={storeAddress}
            onChange={e => setStoreAddress(e.target.value)}
          />
          <button onClick={handleCreateStore} disabled={!storeName.trim() || creating}>
            {creating ? '作成中...' : '作成'}
          </button>
          <button
            onClick={() => { setMode('select'); setError(''); }}
            style={{ marginTop: 8, background: '#6b7280' }}
          >
            戻る
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="create-store">
          <h3 style={{ marginBottom: 16 }}>招待コードで参加</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 12 }}>
            オーナーから受け取った事業所IDと招待コードを入力してください
          </p>
          <input
            type="text"
            placeholder="事業所ID"
            value={storeId}
            onChange={e => setStoreId(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="招待コード"
            value={inviteToken}
            onChange={e => setInviteToken(e.target.value)}
          />
          <button onClick={handleJoinStore} disabled={!storeId.trim() || !inviteToken.trim() || joining}>
            {joining ? '参加中...' : '参加'}
          </button>
          <button
            onClick={() => { setMode('select'); setError(''); }}
            style={{ marginTop: 8, background: '#6b7280' }}
          >
            戻る
          </button>
        </div>
      )}
    </div>
  );
}
