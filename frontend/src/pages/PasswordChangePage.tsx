import { useState } from 'react';
import { ErrorMessage } from '../components/atoms/ErrorMessage';

interface Props {
  changePassword: (newPassword: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

// 旧 .invite-* の置き換え（LoginPage.tsx と同じ定数）
const CARD =
  'w-full max-w-[400px] rounded-2xl bg-surface p-8 text-text shadow-[0_4px_24px_rgba(0,0,0,0.15)]';
const CARD_ICON = 'mb-2 text-center text-[2.5rem]';
const CARD_TITLE = 'mb-2 text-center text-[1.3rem] font-bold';
const CARD_DESC = 'mb-4 text-center text-[0.9rem] leading-[1.7] text-text-muted';
const FORM = 'flex flex-col gap-4';
const FIELD = 'flex flex-col gap-1';
const LABEL = 'text-[0.8rem] font-semibold text-text-muted';
const INPUT =
  'rounded-lg border-2 border-border-light px-3.5 py-3 text-[0.95rem] text-text font-sans transition-colors focus:border-primary focus:outline-none';
const INPUT_ERROR = 'border-red-700';
const FIELD_ERROR = 'text-[0.8rem] text-red-700';
const SUBMIT =
  'mt-2 cursor-pointer rounded-[10px] border-none bg-primary px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-text-disabled disabled:opacity-70';

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white">
      <h1 className="mb-2 text-5xl tracking-[6px]">
        ITA<span className="text-magenta-500">MIN</span>
      </h1>

      <div className={CARD}>
        <div className={CARD_ICON}>🔑</div>
        <h2 className={CARD_TITLE}>パスワードを変更してください</h2>
        <p className={CARD_DESC}>
          セキュリティのため、初期パスワードから<br />
          自分だけのパスワードに変更してください。
        </p>

        <form onSubmit={handleSubmit} className={FORM}>
          <div className={FIELD}>
            <label className={LABEL}>新しいパスワード（6文字以上）</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
              minLength={6}
              required
              className={INPUT}
              autoFocus
            />
          </div>

          <div className={FIELD}>
            <label className={LABEL}>パスワード（確認）</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••"
              minLength={6}
              required
              className={`${INPUT} ${confirmPassword && !passwordMatch ? INPUT_ERROR : ''}`}
            />
            {confirmPassword && !passwordMatch && (
              <span className={FIELD_ERROR}>パスワードが一致しません</span>
            )}
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <button
            className={SUBMIT}
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
