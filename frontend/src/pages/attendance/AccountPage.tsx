/**
 * S05 アカウント / 連携状態画面
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';

interface LineInfo {
  displayName?: string;
  status?: string;
  linkedAt?: string;
}

interface UserProfile {
  name?: string;
}

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const [lineInfo, setLineInfo] = useState<LineInfo | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLineMe()
      .then(res => {
        setLineInfo(res.lineLink);
        setProfile(res.profile);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">読み込み中...</div>;

  return (
    <div className="attendance-account">
      <h2>アカウント / 連携状態</h2>

      <div className="attendance-account-section">
        <h3>ITAMIN アカウント</h3>
        <div className="attendance-account-row">
          <span className="attendance-account-label">表示名</span>
          <span>{profile?.name || user?.user_metadata?.full_name || '—'}</span>
        </div>
        <div className="attendance-account-row">
          <span className="attendance-account-label">メール</span>
          <span>{user?.email || '—'}</span>
        </div>
      </div>

      <div className="attendance-account-section">
        <h3>LINE連携</h3>
        {lineInfo ? (
          <>
            <div className="attendance-account-row">
              <span className="attendance-account-label">LINE表示名</span>
              <span>{lineInfo.displayName || '—'}</span>
            </div>
            <div className="attendance-account-row">
              <span className="attendance-account-label">連携状態</span>
              <span className={`badge badge-${lineInfo.status}`}>
                {lineInfo.status === 'active' ? '連携済み' : '無効'}
              </span>
            </div>
            <div className="attendance-account-row">
              <span className="attendance-account-label">連携日時</span>
              <span>{lineInfo.linkedAt ? new Date(lineInfo.linkedAt).toLocaleString('ja-JP') : '—'}</span>
            </div>
          </>
        ) : (
          <div className="attendance-account-unlinked">
            LINE未連携です。管理者から連携コードを受け取ってください。
          </div>
        )}
      </div>

      <div className="attendance-account-actions">
        <button
          className="button button-danger"
          onClick={signOut}
          data-testid="logout-button"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
