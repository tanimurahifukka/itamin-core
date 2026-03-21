import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
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
      if (isSignUp) {
        const result = await signUp(email, password, name, storeName);
        if (result.error) setError(result.error);
      } else {
        const result = await signIn(email, password);
        if (result.error) setError(result.error);
      }
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
