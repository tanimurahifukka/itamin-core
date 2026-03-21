import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  staff: 'スタッフ',
};

export default function StaffPage() {
  const { selectedStore } = useAuth();
  const [staffList, setStaffList] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadStaff = () => {
    if (!selectedStore) return;
    api.getStoreStaff(selectedStore.id)
      .then(data => setStaffList(data.staff))
      .catch(() => {});
  };

  useEffect(() => { loadStaff(); }, [selectedStore]);

  const handleAdd = async () => {
    if (!selectedStore || !name.trim() || !email.trim()) return;
    setError('');
    setSuccess('');
    try {
      const result = await api.addStaff(selectedStore.id, name.trim(), email.trim());
      setName('');
      setEmail('');
      if (result.invited) {
        setSuccess(`${name} さんに招待メールを送信しました`);
      } else {
        setSuccess(`${name} さんを追加しました`);
        loadStaff();
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="main-content">
      <div className="staff-section">
        <h3 style={{ marginBottom: 16 }}>スタッフ一覧</h3>

        {staffList.map((s: any) => (
          <div key={s.id} className="staff-item">
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#666', flexShrink: 0 }}>
              {(s.userName || s.email || '?')[0].toUpperCase()}
            </div>
            <div className="info">
              <div style={{ fontWeight: 500 }}>{s.userName || s.email}</div>
              <div style={{ fontSize: '0.85rem', color: '#888' }}>{s.email}</div>
            </div>
            <span className={`role-badge ${s.role}`}>
              {roleLabels[s.role] || s.role}
            </span>
          </div>
        ))}

        <div style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
          <h4 style={{ marginBottom: 8 }}>スタッフを招待</h4>
          {error && <div className="error-msg">{error}</div>}
          {success && <div style={{ color: '#22c55e', fontSize: '0.9rem', marginBottom: 8 }}>{success}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              placeholder="名前"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ padding: '10px 14px', border: '2px solid #e0e0e0', borderRadius: 8 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                style={{ flex: 1, padding: '10px 14px', border: '2px solid #e0e0e0', borderRadius: 8 }}
              />
              <button
                onClick={handleAdd}
                style={{ padding: '10px 20px', background: '#e94560', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
              >
                招待
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#999', marginTop: 6 }}>
            招待メールが届きます。パスワードを設定するだけで利用開始できます。
          </p>
        </div>
      </div>
    </div>
  );
}
