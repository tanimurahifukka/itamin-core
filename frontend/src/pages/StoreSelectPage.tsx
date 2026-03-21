import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  staff: 'スタッフ',
};

export default function StoreSelectPage() {
  const { stores, selectStore, refreshStores } = useAuth();
  const [newStoreName, setNewStoreName] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newStoreName.trim()) return;
    try {
      await api.createStore(newStoreName.trim());
      setNewStoreName('');
      await refreshStores();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="store-selector">
      <h2>店舗を選択してください</h2>

      {stores.length > 0 ? (
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
        <p style={{ color: '#888', marginBottom: 24 }}>まだ店舗がありません</p>
      )}

      <div className="create-store">
        <h3 style={{ marginBottom: 12 }}>新しい店舗を作成</h3>
        {error && <div className="error-msg">{error}</div>}
        <input
          type="text"
          placeholder="店舗名（例：sofe）"
          value={newStoreName}
          onChange={e => setNewStoreName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate}>店舗を作成</button>
      </div>
    </div>
  );
}
