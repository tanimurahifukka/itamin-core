import { useState } from 'react';
import { kioskApi, saveKioskSession } from '../api/kioskClient';
import { Button } from '../components/atoms/Button';

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f4ff]">
      <div className="w-80 rounded-2xl bg-surface px-10 py-12 text-center shadow-[0_4px_24px_rgba(0,0,0,0.1)]">
        <div className="mb-2 text-[32px] font-extrabold tracking-[2px]">
          ITA<span className="text-[#4f8ef7]">MIN</span>
        </div>
        <p className="mb-8 text-sm text-text-muted">店舗キオスクモード</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-error-bg px-3.5 py-2.5 text-sm text-error-fg">
              {error}
            </div>
          )}
          <input
            type="password"
            inputMode="numeric"
            pattern="\d*"
            placeholder="PINを入力"
            value={pin}
            onChange={e => setPin(e.target.value)}
            className="rounded-lg border-2 border-border-light px-3.5 py-3.5 text-2xl tracking-[8px] text-center outline-none focus:border-fill-primary"
            autoFocus
            maxLength={8}
            data-testid="kiosk-pin-input"
          />
          <Button
            type="submit"
            disabled={loading || pin.length < 4}
            size="lg"
            fullWidth
            className="bg-[#4f8ef7] hover:bg-fill-primary-hover"
            data-testid="kiosk-login-button"
          >
            {loading ? '...' : 'ログイン'}
          </Button>
        </form>
      </div>
    </div>
  );
}
