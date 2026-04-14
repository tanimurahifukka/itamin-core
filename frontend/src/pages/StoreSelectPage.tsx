import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Loading } from '../components/atoms/Loading';

// 旧 .store-selector / .store-list / .store-card / .create-store /
// .store-action-btn + .secondary を Tailwind に移植。
const SELECTOR = 'px-5 py-[60px] text-center';
const TITLE = 'mb-6 text-[1.3rem]';
const STORE_LIST = 'mx-auto flex max-w-[400px] flex-col gap-3';
const STORE_CARD =
  'cursor-pointer rounded-xl border-2 border-border-light bg-surface p-5 text-left transition-all hover:border-[#e94560] hover:shadow-[0_2px_12px_rgba(233,69,96,0.1)]';
const STORE_NAME = 'mb-1 text-[1.1rem]';
const STORE_ROLE = 'text-[0.85rem] text-text-subtle';
const CREATE_CONTAINER = 'mx-auto mt-6 max-w-[400px]';
const CREATE_INPUT =
  'mb-2 w-full rounded-lg border-2 border-border-light px-4 py-3 text-base';
const CREATE_BTN =
  'w-full cursor-pointer rounded-lg border-none bg-[#e94560] px-4 py-3 text-base font-medium text-white transition-colors hover:bg-[#d13a54] disabled:cursor-not-allowed disabled:opacity-50';
const STORE_ACTION_BTN =
  'w-full cursor-pointer rounded-lg border-none bg-[#e94560] px-4 py-3 text-base font-medium text-white transition-colors hover:bg-[#d13a54]';
const STORE_ACTION_SECONDARY =
  'w-full cursor-pointer rounded-lg border-2 border-border-light bg-surface px-4 py-3 text-base font-medium text-[#374151] transition-colors hover:border-[#e94560] hover:text-[#e94560]';

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
    <div className={SELECTOR}>
      <h2 className={TITLE}>事業所を選択してください</h2>

      {message && <p style={{ color: '#16a34a', marginBottom: 16 }}>{message}</p>}
      {error && <p style={{ color: '#dc2626', marginBottom: 16 }}>{error}</p>}

      {mode === 'select' && (
        <>
          {storesLoading ? (
            <Loading />
          ) : stores.length > 0 ? (
            <div className={STORE_LIST}>
              {stores.map(store => (
                <div
                  key={store.id}
                  className={STORE_CARD}
                  onClick={() => selectStore(store)}
                >
                  <h3 className={STORE_NAME}>{store.name}</h3>
                  <span className={STORE_ROLE}>{roleLabels[store.role] || store.role}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#888' }}>所属する事業所がありません</p>
          )}

          <div style={{ maxWidth: 400, margin: '24px auto 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isOwner && (
              <button
                type="button"
                className={STORE_ACTION_BTN}
                onClick={() => { setMode('create'); setError(''); setMessage(''); }}
              >
                + 店舗を追加
              </button>
            )}
            <button
              type="button"
              className={STORE_ACTION_SECONDARY}
              onClick={() => { setMode('join'); setError(''); setMessage(''); }}
            >
              招待コードで参加
            </button>
          </div>
        </>
      )}

      {mode === 'create' && (
        <div className={CREATE_CONTAINER}>
          <h3 style={{ marginBottom: 16 }}>新しい店舗を追加</h3>
          <input
            type="text"
            placeholder="店舗名（必須）"
            value={storeName}
            onChange={e => setStoreName(e.target.value)}
            autoFocus
            className={CREATE_INPUT}
          />
          <input
            type="text"
            placeholder="住所（任意）"
            value={storeAddress}
            onChange={e => setStoreAddress(e.target.value)}
            className={CREATE_INPUT}
          />
          <button type="button" onClick={handleCreateStore} disabled={!storeName.trim() || creating} className={CREATE_BTN}>
            {creating ? '作成中...' : '作成'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('select'); setError(''); }}
            className={CREATE_BTN}
            style={{ marginTop: 8, background: '#6b7280' }}
          >
            戻る
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className={CREATE_CONTAINER}>
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
            className={CREATE_INPUT}
          />
          <input
            type="text"
            placeholder="招待コード"
            value={inviteToken}
            onChange={e => setInviteToken(e.target.value)}
            className={CREATE_INPUT}
          />
          <button type="button" onClick={handleJoinStore} disabled={!storeId.trim() || !inviteToken.trim() || joining} className={CREATE_BTN}>
            {joining ? '参加中...' : '参加'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('select'); setError(''); }}
            className={CREATE_BTN}
            style={{ marginTop: 8, background: '#6b7280' }}
          >
            戻る
          </button>
        </div>
      )}
    </div>
  );
}
