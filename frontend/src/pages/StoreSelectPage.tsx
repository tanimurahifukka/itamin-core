import { useAuth } from '../contexts/AuthContext';

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  full_time: '正社員',
  part_time: 'アルバイト',
};

export default function StoreSelectPage() {
  const { stores, selectStore } = useAuth();

  return (
    <div className="store-selector">
      <h2>事業所を選択してください</h2>

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
        <p style={{ color: '#888' }}>所属する事業所がありません</p>
      )}
    </div>
  );
}
