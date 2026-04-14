import { useState } from 'react';
import { ErrorMessage } from '../components/atoms/ErrorMessage';

interface Props {
  changePassword: (newPassword: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

export default function PasswordChangePage({ changePassword, signOut }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordMatch = password === confirmPassword && password.length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordMatch) return;
    setError('');
    setLoading(true);
    try {
      const result = await changePassword(password);
      if (result.error) setError(result.error);
    } finally {
      setLoading(false);
    }
  };

  // login-page は styles.css から削除済のため、Tailwind で同等スタイルを指定する。
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white">
      <h1 className="mb-2 text-5xl tracking-[6px]">
        ITA<span className="text-[#e94560]">MIN</span>
      </h1>

      <div className="invite-card">
        <div className="invite-card-icon">🔑</div>
        <h2 className="invite-card-title">パスワードを変更してください</h2>
        <p className="invite-card-desc">
          セキュリティのため、初期パスワードから<br />
          自分だけのパスワードに変更してください。
        </p>

        <form onSubmit={handleSubmit} className="invite-form">
          <div className="invite-field">
            <label className="invite-label">新しいパスワード（6文字以上）</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
              minLength={6}
              required
              className="invite-input"
              autoFocus
            />
          </div>

          <div className="invite-field">
            <label className="invite-label">パスワード（確認）</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••"
              minLength={6}
              required
              className={`invite-input ${confirmPassword && !passwordMatch ? 'invite-input-error' : ''}`}
            />
            {confirmPassword && !passwordMatch && (
              <span className="invite-field-error">パスワードが一致しません</span>
            )}
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <button
            className={`invite-submit ${passwordMatch ? '' : 'disabled'}`}
            type="submit"
            disabled={!passwordMatch || loading}
          >
            {loading ? '変更中...' : 'パスワードを変更する'}
          </button>
        </form>

        <button
          type="button"
          className="toggle-auth mt-4 cursor-pointer bg-transparent text-sm text-white/70 underline hover:text-white"
          onClick={signOut}
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
