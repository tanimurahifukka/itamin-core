import { useEffect, useState, useCallback } from 'react';

/**
 * 公開ページ: NFC タグから開かれる打刻画面
 * - 認証なし (Supabase セッション不要)
 * - ?store=<uuid> で店舗を特定
 * - 4桁 PIN 入力 → 現在状態を取得 → 出勤/休憩/退勤ボタンを出し分け
 * - 記録は `attendance_records` に source='nfc' で書き込まれる
 */

type CurrentStatus = 'not_clocked_in' | 'working' | 'on_break' | 'completed';

interface ResolveResponse {
  store: { id: string; name: string };
  staff: { staffId: string; userName: string | null };
  businessDate: string;
  currentStatus: CurrentStatus;
  activeSession: unknown;
  completedSessions: unknown[];
}

interface ActionResponse {
  recordId: string;
  status: string;
  effectiveAt: string;
  staffName: string | null;
  message: string;
}

async function nfcPunchFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/nfc/punch${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'Request failed' }));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data as T;
}

function genKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function NfcPunchPage() {
  const params = new URLSearchParams(window.location.search);
  const storeId = params.get('store') || '';

  const [pin, setPin] = useState('');
  const [resolved, setResolved] = useState<ResolveResponse | null>(null);
  const [resolveErr, setResolveErr] = useState('');
  const [resolving, setResolving] = useState(false);

  const [acting, setActing] = useState(false);
  const [actionErr, setActionErr] = useState('');
  const [success, setSuccess] = useState<{ message: string; staffName: string | null } | null>(null);

  const reset = useCallback(() => {
    setPin('');
    setResolved(null);
    setResolveErr('');
    setActionErr('');
    setSuccess(null);
  }, []);

  // 成功後 3 秒で自動リセット
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => reset(), 3000);
    return () => clearTimeout(t);
  }, [success, reset]);

  const handleResolve = async () => {
    if (!storeId) {
      setResolveErr('無効なタグです (store パラメータがありません)');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setResolveErr('PIN は4桁の数字で入力してください');
      return;
    }
    setResolveErr('');
    setResolving(true);
    try {
      const data = await nfcPunchFetch<ResolveResponse>('/resolve', { storeId, pin });
      setResolved(data);
    } catch (e) {
      setResolveErr(e instanceof Error ? e.message : 'PIN 照合に失敗しました');
    } finally {
      setResolving(false);
    }
  };

  const runAction = async (path: '/clock-in' | '/break-start' | '/break-end' | '/clock-out') => {
    if (!resolved) return;
    setActionErr('');
    setActing(true);
    try {
      const result = await nfcPunchFetch<ActionResponse>(path, {
        storeId,
        pin,
        idempotencyKey: genKey(),
      });
      setSuccess({ message: result.message, staffName: result.staffName ?? resolved.staff.userName });
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : '操作に失敗しました');
    } finally {
      setActing(false);
    }
  };

  if (!storeId) {
    return (
      <div style={styles.page}>
        <div style={styles.errorCard}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>アクセスできません</div>
          <div style={{ color: '#64748b' }}>無効なタグです (store パラメータがありません)</div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={styles.page}>
        <div style={styles.successCard}>
          <div style={{ fontSize: 72, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
            {success.message}
          </div>
          {success.staffName && (
            <div style={{ color: '#475569', marginBottom: 16 }}>
              {success.staffName} さん、お疲れさまです
            </div>
          )}
          <div style={{ color: '#94a3b8', fontSize: 13 }}>3秒後に自動的にリセットされます</div>
        </div>
      </div>
    );
  }

  // PIN 未照合: PIN 入力フェーズ
  if (!resolved) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.locationName}>🕐 打刻</div>
            <div style={styles.templateName}>NFC タグから打刻します</div>
          </div>

          <div style={styles.section}>
            <label style={styles.label}>PIN (4桁)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={styles.pinInput}
              placeholder="••••"
              autoFocus
            />
          </div>

          {resolveErr && <div style={styles.errorMsg}>{resolveErr}</div>}

          <button
            style={{ ...styles.submitBtn, ...(resolving ? { opacity: 0.6 } : {}) }}
            onClick={handleResolve}
            disabled={resolving || pin.length !== 4}
          >
            {resolving ? '照合中...' : '次へ'}
          </button>
        </div>
      </div>
    );
  }

  // PIN 照合済み: アクションフェーズ
  const status = resolved.currentStatus;
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.storeName}>{resolved.store.name}</div>
          <div style={styles.locationName}>
            {resolved.staff.userName ? `${resolved.staff.userName} さん` : 'スタッフ'}
          </div>
          <div style={styles.templateName}>
            {status === 'not_clocked_in' && '本日まだ出勤していません'}
            {status === 'working' && '勤務中'}
            {status === 'on_break' && '休憩中'}
            {status === 'completed' && '本日の勤務は完了しています'}
          </div>
        </div>

        {actionErr && <div style={styles.errorMsg}>{actionErr}</div>}

        <div style={styles.section}>
          {status === 'not_clocked_in' && (
            <button
              style={{ ...styles.actionBtn, background: '#2563eb' }}
              onClick={() => runAction('/clock-in')}
              disabled={acting}
            >
              {acting ? '処理中...' : '🏃 出勤する'}
            </button>
          )}

          {status === 'working' && (
            <>
              <button
                style={{ ...styles.actionBtn, background: '#f59e0b' }}
                onClick={() => runAction('/break-start')}
                disabled={acting}
              >
                ☕ 休憩を開始
              </button>
              <button
                style={{ ...styles.actionBtn, background: '#ef4444', marginTop: 12 }}
                onClick={() => runAction('/clock-out')}
                disabled={acting}
              >
                🏁 退勤する
              </button>
            </>
          )}

          {status === 'on_break' && (
            <>
              <button
                style={{ ...styles.actionBtn, background: '#22c55e' }}
                onClick={() => runAction('/break-end')}
                disabled={acting}
              >
                🔄 休憩を終了
              </button>
              <button
                style={{ ...styles.actionBtn, background: '#ef4444', marginTop: 12 }}
                onClick={() => runAction('/clock-out')}
                disabled={acting}
              >
                🏁 退勤する
              </button>
            </>
          )}

          {status === 'completed' && (
            <button
              style={{ ...styles.actionBtn, background: '#2563eb' }}
              onClick={() => runAction('/clock-in')}
              disabled={acting}
            >
              🏃 再度出勤する
            </button>
          )}
        </div>

        <button style={styles.cancelBtn} onClick={reset} disabled={acting}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f1f5f9',
    padding: '16px 12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    maxWidth: 420,
    margin: '0 auto',
    background: '#fff',
    borderRadius: 12,
    padding: '20px 18px',
    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
  },
  header: { textAlign: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' },
  storeName: { fontSize: 13, color: '#64748b', fontWeight: 600 },
  locationName: { fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '4px 0' },
  templateName: { fontSize: 14, color: '#475569' },
  section: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 },
  pinInput: {
    width: '100%',
    padding: '16px 12px',
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: '0.5em',
    border: '2px solid #cbd5e1',
    borderRadius: 10,
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  },
  submitBtn: {
    width: '100%',
    minHeight: 56,
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
  },
  actionBtn: {
    width: '100%',
    minHeight: 64,
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 19,
    fontWeight: 700,
    cursor: 'pointer',
  },
  cancelBtn: {
    width: '100%',
    marginTop: 16,
    padding: '12px',
    background: 'transparent',
    color: '#64748b',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
  },
  errorMsg: {
    padding: '10px 12px',
    marginBottom: 12,
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  errorCard: {
    maxWidth: 360,
    margin: '80px auto 0',
    background: '#fff',
    padding: 32,
    borderRadius: 12,
    textAlign: 'center',
  },
  successCard: {
    maxWidth: 360,
    margin: '80px auto 0',
    background: '#fff',
    padding: '40px 24px',
    borderRadius: 12,
    textAlign: 'center',
    boxShadow: '0 8px 28px rgba(34, 197, 94, 0.18)',
  },
};
