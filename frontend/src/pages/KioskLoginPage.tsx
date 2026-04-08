import { useState } from 'react';
import { kioskApi, saveKioskSession } from '../api/kioskClient';

interface Props {
  storeId: string;
  onLogin: (storeId: string, storeName: string) => void;
}

export default function KioskLoginPage({ storeId, onLogin }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await kioskApi.login(storeId, pin);
      saveKioskSession(res.token, res.storeId, res.storeName);
      onLogin(res.storeId, res.storeName);
    } catch (err: any) {
      setError(err.message || 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>ITA<span style={{ color: '#4f8ef7' }}>MIN</span></div>
        <p style={styles.subtitle}>店舗キオスクモード</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
          <input
            type="password"
            inputMode="numeric"
            pattern="\d*"
            placeholder="PINを入力"
            value={pin}
            onChange={e => setPin(e.target.value)}
            style={styles.pinInput}
            autoFocus
            maxLength={8}
            data-testid="kiosk-pin-input"
          />
          <button
            type="submit"
            disabled={loading || pin.length < 4}
            style={styles.button}
            data-testid="kiosk-login-button"
          >
            {loading ? '...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f0f4ff',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '48px 40px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
    textAlign: 'center',
    width: 320,
  },
  logo: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    color: '#666',
    fontSize: 14,
    marginBottom: 32,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  error: {
    background: '#fff0f0',
    color: '#d32f2f',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
  },
  pinInput: {
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    padding: '14px',
    border: '2px solid #ddd',
    borderRadius: 8,
    outline: 'none',
  },
  button: {
    padding: '14px',
    fontSize: 16,
    fontWeight: 700,
    background: '#4f8ef7',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
