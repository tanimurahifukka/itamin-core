/**
 * S05 アカウント / 連携状態画面
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { Badge } from '../../components/atoms/Badge';
import { Loading } from '../../components/atoms/Loading';

interface LineInfo {
  displayName?: string;
  status?: string;
  linkedAt?: string;
}

interface UserProfile {
  name?: string;
}

export default function AccountPage() {
  const { user, signOut, selectedStore } = useAuth();
  const [lineInfo, setLineInfo] = useState<LineInfo | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinVisible, setPinVisible] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

  useEffect(() => {
    api.getLineMe()
      .then(res => {
        setLineInfo(res.lineLink);
        setProfile(res.profile);
      })
      .catch(() => { console.error('[AccountPage] fetch failed'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedStore?.id) return;
    setPinLoading(true);
    setPinError('');
    api.getMyStaffPin(selectedStore.id)
      .then(res => setPin(res.pin))
      .catch((e: unknown) => setPinError(e instanceof Error ? e.message : 'PIN の取得に失敗しました'))
      .finally(() => setPinLoading(false));
  }, [selectedStore?.id]);

  const handleCopyPin = () => {
    if (!pin) return;
    navigator.clipboard.writeText(pin).then(() => {
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    });
  };

  if (loading) return <Loading />;

  return (
    <div className="max-w-[600px] p-4">
      <h2>アカウント / 連携状態</h2>

      <div className="mb-4 rounded-lg bg-surface p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] [&>h3]:mb-2 [&>h3]:text-sm [&>h3]:text-sumi-600">
        <h3>ITAMIN アカウント</h3>
        <div className="flex justify-between border-b border-sumi-100 py-1.5">
          <span className="text-sm text-sumi-600">表示名</span>
          <span>{profile?.name || user?.user_metadata?.full_name || '—'}</span>
        </div>
        <div className="flex justify-between border-b border-sumi-100 py-1.5">
          <span className="text-sm text-sumi-600">メール</span>
          <span>{user?.email || '—'}</span>
        </div>
      </div>

      <div className="mb-4 rounded-lg bg-surface p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] [&>h3]:mb-2 [&>h3]:text-sm [&>h3]:text-sumi-600">
        <h3>NFC 打刻 / チェック PIN</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: -4, marginBottom: 10 }}>
          店舗入口の NFC タグをかざして打刻するとき、またはNFCチェックのときに使う 4 桁 PIN です。
          他人に知られないように管理してください。
        </p>
        {pinLoading ? (
          <div className="flex justify-between border-b border-sumi-100 py-1.5">
            <span>読み込み中...</span>
          </div>
        ) : pinError ? (
          <div className="flex justify-between border-b border-sumi-100 py-1.5" style={{ color: '#b91c1c' }}>
            {pinError}
          </div>
        ) : pin ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              background: '#f1f5f9',
              borderRadius: 10,
            }}
          >
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '0.4em',
                color: '#0f172a',
                flex: 1,
                textAlign: 'center',
              }}
            >
              {pinVisible ? pin : '••••'}
            </div>
            <button
              className="button"
              onClick={() => setPinVisible(v => !v)}
              style={{ padding: '8px 12px', fontSize: 13 }}
            >
              {pinVisible ? '隠す' : '表示'}
            </button>
            <button
              className="button button-primary"
              onClick={handleCopyPin}
              style={{ padding: '8px 12px', fontSize: 13 }}
            >
              {pinCopied ? 'コピー済み' : 'コピー'}
            </button>
          </div>
        ) : (
          <div className="text-sm text-text-subtle">
            PIN が未発行です。管理者にお問い合わせください。
          </div>
        )}
      </div>

      <div className="mb-4 rounded-lg bg-surface p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] [&>h3]:mb-2 [&>h3]:text-sm [&>h3]:text-sumi-600">
        <h3>LINE連携</h3>
        {lineInfo ? (
          <>
            <div className="flex justify-between border-b border-sumi-100 py-1.5">
              <span className="text-sm text-sumi-600">LINE表示名</span>
              <span>{lineInfo.displayName || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-sumi-100 py-1.5">
              <span className="text-sm text-sumi-600">連携状態</span>
              <Badge variant={lineInfo.status || 'inactive'}>
                {lineInfo.status === 'active' ? '連携済み' : '無効'}
              </Badge>
            </div>
            <div className="flex justify-between border-b border-sumi-100 py-1.5">
              <span className="text-sm text-sumi-600">連携日時</span>
              <span>{lineInfo.linkedAt ? new Date(lineInfo.linkedAt).toLocaleString('ja-JP') : '—'}</span>
            </div>
          </>
        ) : (
          <div className="text-sm text-text-subtle">
            LINE未連携です。管理者から連携コードを受け取ってください。
          </div>
        )}
      </div>

      <div className="mt-6">
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
