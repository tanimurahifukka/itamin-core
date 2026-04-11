import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

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
    <div className="login-page">
      <h1>ITA<span>MIN</span></h1>
      <p className="tagline">痛みを取って、人を育てる。</p>

      <form onSubmit={handleSubmit} className="login-form">
        {isSignUp && (
          <>
            <input
              type="text"
              placeholder="お名前"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="事業所名（例：カフェsofe）"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              required
            />
          </>
        )}
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="パスワード（6文字以上）"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={6}
          required
        />

        {error && <div className="error-msg">{error}</div>}

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? '...' : isSignUp ? '事業所を登録する' : 'ログイン'}
        </button>
      </form>

      <button
        className="toggle-auth"
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

  const passwordMatch = password === confirmPassword && password.length >= 6;

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

  return (
    <div className="login-page invite-page">
      <h1>ITA<span>MIN</span></h1>

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
            <label className="invite-label">パスワード（6文字以上）</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
              minLength={6}
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
              placeholder="••••••"
              minLength={6}
              required
              className={`invite-input ${confirmPassword && !passwordMatch ? 'invite-input-error' : ''}`}
            />
            {confirmPassword && !passwordMatch && (
              <span className="invite-field-error">パスワードが一致しません</span>
            )}
          </div>

          {error && <div className="error-msg">{error}</div>}

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
    return <div className="login-page"><div className="loading">読み込み中...</div></div>;
  }

  if (storeError) {
    return (
      <div className="login-page">
        <h1>ITA<span>MIN</span></h1>
        <div className="error-msg" style={{ marginTop: 20 }}>{storeError}</div>
        <button className="toggle-auth" onClick={() => { window.location.href = '/'; }}>
          ログインページへ
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-page">
        <h1>ITA<span>MIN</span></h1>
        <div className="invite-card">
          <div className="invite-card-icon">✅</div>
          <h2 className="invite-card-title">登録完了</h2>
          <p className="invite-card-desc">{success}</p>
          <button
            className="login-btn"
            style={{ marginTop: 16 }}
            onClick={() => { window.location.href = '/'; }}
          >
            ログインする
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page invite-page">
      <h1>ITA<span>MIN</span></h1>

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
            <label className="invite-label">パスワード（6文字以上）</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required className="invite-input" />
          </div>
          <div className="invite-field">
            <label className="invite-label">パスワード（確認）</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={6} required className="invite-input" />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <button className={`invite-submit ${passwordMatch ? 'active' : ''}`} type="submit" disabled={loading || !passwordMatch}>
            {loading ? '登録中...' : '登録する'}
          </button>
        </form>

        <button className="toggle-auth" onClick={() => { window.location.href = '/'; }}>
          既にアカウントをお持ちの方はこちら
        </button>
      </div>
    </div>
  );
}
