import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/atoms/Button';
import { Input } from '../components/atoms/Input';
import { ErrorMessage } from '../components/atoms/ErrorMessage';

// ログイン画面のテーマ（背景グラデーション・白文字・#e94560 ボタン）は
// アプリ本体のデザイン言語と異なるため、ここではアプリ共通の
// `--color-primary` ではなく画面固有の配色をローカル変数として持つ。
const LOGIN_BG =
  'flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white';
const LOGIN_INPUT =
  'rounded-lg border-0 px-4 py-3.5 text-base text-text placeholder:text-text-subtle';
const LOGIN_BTN_OVERRIDE = 'w-full bg-[#e94560] hover:bg-[#d53c55] text-white';
const TOGGLE_LINK =
  'mt-4 bg-transparent text-sm text-white/70 underline hover:text-white cursor-pointer';

export default function LoginPage() {
  const { signIn, signUp, completeInvitedSignUp } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const isInvite = searchParams.get('invite') === '1';
  const joinStoreId = searchParams.get('join') || '';
  const invitedEmail = searchParams.get('email') || '';
  const invitedName = searchParams.get('name') || '';
  const invitedStoreName = searchParams.get('storeName') || '';

  // リンク共有登録フロー（招待トークン必須）
  if (joinStoreId) {
    const inviteToken = searchParams.get('token') || '';
    return <JoinStorePage storeId={joinStoreId} inviteToken={inviteToken} />;
  }

  // 招待フロー → 専用画面
  if (isInvite) {
    return (
      <InviteRegisterPage
        email={invitedEmail}
        defaultName={invitedName}
        storeName={invitedStoreName}
        onComplete={completeInvitedSignUp}
      />
    );
  }

  return <NormalLoginPage signIn={signIn} signUp={signUp} />;
}

// ============================================================
// 通常ログイン / 新規事業所登録
// ============================================================
function NormalLoginPage({ signIn, signUp }: {
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string, storeName: string) => Promise<{ error?: string }>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = isSignUp
        ? await signUp(email, password, name, storeName)
        : await signIn(email, password);
      if (result.error) setError(result.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={LOGIN_BG}>
      <h1 className="mb-2 text-5xl tracking-[6px]">
        ITA<span className="text-[#e94560]">MIN</span>
      </h1>
      <p className="mb-12 text-lg opacity-80">痛みを取って、人を育てる。</p>

      <form
        onSubmit={handleSubmit}
        className="login-form flex w-full max-w-[320px] flex-col gap-3"
      >
        {isSignUp && (
          <>
            <Input
              type="text"
              placeholder="お名前"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className={LOGIN_INPUT}
            />
            <Input
              type="text"
              placeholder="事業所名（例：カフェsofe）"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              required
              className={LOGIN_INPUT}
            />
          </>
        )}
        <Input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className={LOGIN_INPUT}
        />
        <Input
          type="password"
          placeholder="パスワード（8文字以上）"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={8}
          required
          className={LOGIN_INPUT}
        />

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <Button
          type="submit"
          disabled={loading}
          size="lg"
          className={`login-btn ${LOGIN_BTN_OVERRIDE}`}
        >
          {loading ? '...' : isSignUp ? '事業所を登録する' : 'ログイン'}
        </Button>
      </form>

      <button
        type="button"
        className={`toggle-auth ${TOGGLE_LINK}`}
        onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
      >
        {isSignUp ? 'ログインはこちら' : '事業所登録はこちら'}
      </button>
    </div>
  );
}

// ============================================================
// 招待専用 登録画面
// ============================================================
function InviteRegisterPage({ email, defaultName, storeName, onComplete }: {
  email: string;
  defaultName: string;
  storeName: string;
  onComplete: (email: string, password: string, name: string) => Promise<{ error?: string }>;
}) {
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordMatch = password === confirmPassword && password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordMatch) {
      setError('パスワードが一致しません');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await onComplete(email, password, name);
      if (result.error) setError(result.error);
    } finally {
      setLoading(false);
    }
  };

  // invite-* 系クラスは本PRでは移行対象外のため既存クラスを維持する。
  // 外側コンテナは .login-page を廃止し Tailwind で再現する。
  return (
    <div className={`${LOGIN_BG} invite-page`}>
      <h1 className="mb-2 text-5xl tracking-[6px]">
        ITA<span className="text-[#e94560]">MIN</span>
      </h1>

      <div className="invite-card">
        <div className="invite-card-icon">🎉</div>
        <h2 className="invite-card-title">スタッフ登録</h2>
        <p className="invite-card-desc">
          <strong>{storeName}</strong> に招待されました。<br />
          以下の情報を入力して登録を完了してください。
        </p>

        <div className="invite-store-badge">
          <span className="invite-store-icon">🏠</span>
          {storeName}
        </div>

        <form onSubmit={handleSubmit} className="invite-form">
          <div className="invite-field">
            <label className="invite-label">メールアドレス</label>
            <input
              type="email"
              value={email}
              readOnly
              className="invite-input invite-input-readonly"
            />
          </div>

          <div className="invite-field">
            <label className="invite-label">お名前</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="山田 太郎"
              required
              className="invite-input"
            />
          </div>

          <div className="invite-field">
            <label className="invite-label">パスワード（8文字以上）</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              className="invite-input"
            />
          </div>

          <div className="invite-field">
            <label className="invite-label">パスワード（確認）</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
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
            {loading ? '登録中...' : '登録を完了する'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// リンク共有スタッフ登録画面
// ============================================================
function JoinStorePage({ storeId, inviteToken }: { storeId: string; inviteToken: string }) {
  const [storeName, setStoreName] = useState('');
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeError, setStoreError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!inviteToken) {
      setStoreError('招待URLが不正です。オーナーから招待URLを受け取ってください。');
      setStoreLoading(false);
      return;
    }
    fetch(`/api/stores/${storeId}/info`)
      .then(r => r.json())
      .then(data => {
        if (data.store) {
          setStoreName(data.store.name);
        } else {
          setStoreError('事業所が見つかりません');
        }
      })
      .catch(() => setStoreError('読み込みに失敗しました'))
      .finally(() => setStoreLoading(false));
  }, [storeId, inviteToken]);

  const passwordMatch = password === confirmPassword && password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordMatch) { setError('パスワードが一致しないか、8文字未満です'); return; }
    if (!inviteToken) { setError('招待トークンがありません'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/stores/${storeId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, inviteToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登録に失敗しました');
      } else {
        setSuccess(data.message || '登録しました。ログインしてください。');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  if (storeLoading) {
    return <div className={LOGIN_BG}><div className="loading">読み込み中...</div></div>;
  }

  if (storeError) {
    return (
      <div className={LOGIN_BG}>
        <h1 className="mb-2 text-5xl tracking-[6px]">
          ITA<span className="text-[#e94560]">MIN</span>
        </h1>
        <ErrorMessage className="mt-5">{storeError}</ErrorMessage>
        <button
          type="button"
          className={`toggle-auth ${TOGGLE_LINK}`}
          onClick={() => { window.location.href = '/'; }}
        >
          ログインページへ
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className={LOGIN_BG}>
        <h1 className="mb-2 text-5xl tracking-[6px]">
          ITA<span className="text-[#e94560]">MIN</span>
        </h1>
        <div className="invite-card">
          <div className="invite-card-icon">✅</div>
          <h2 className="invite-card-title">登録完了</h2>
          <p className="invite-card-desc">{success}</p>
          <Button
            size="lg"
            className={`login-btn mt-4 ${LOGIN_BTN_OVERRIDE}`}
            onClick={() => { window.location.href = '/'; }}
          >
            ログインする
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${LOGIN_BG} invite-page`}>
      <h1 className="mb-2 text-5xl tracking-[6px]">
        ITA<span className="text-[#e94560]">MIN</span>
      </h1>

      <div className="invite-card">
        <div className="invite-card-icon">👋</div>
        <h2 className="invite-card-title">スタッフ登録</h2>
        <p className="invite-card-desc">
          <strong>{storeName}</strong> のスタッフとして登録します。
        </p>

        <div className="invite-store-badge">
          <span className="invite-store-icon">🏠</span>
          {storeName}
        </div>

        <form onSubmit={handleSubmit} className="invite-form">
          <div className="invite-field">
            <label className="invite-label">お名前</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className="invite-input" placeholder="谷村 太郎" />
          </div>
          <div className="invite-field">
            <label className="invite-label">メールアドレス</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="invite-input" placeholder="you@example.com" />
          </div>
          <div className="invite-field">
            <label className="invite-label">パスワード（8文字以上）</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required className="invite-input" />
          </div>
          <div className="invite-field">
            <label className="invite-label">パスワード（確認）</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={8} required className="invite-input" />
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <button className={`invite-submit ${passwordMatch ? 'active' : ''}`} type="submit" disabled={loading || !passwordMatch}>
            {loading ? '登録中...' : '登録する'}
          </button>
        </form>

        <button
          type="button"
          className={`toggle-auth ${TOGGLE_LINK}`}
          onClick={() => { window.location.href = '/'; }}
        >
          既にアカウントをお持ちの方はこちら
        </button>
      </div>
    </div>
  );
}
