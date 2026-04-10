import { useEffect, useState, useCallback } from 'react';

/**
 * 公開ページ: NFC タグから開かれる清掃チェック入力画面
 * - 認証なし (Supabase セッション不要)
 * - ?loc=<uuid> で location を特定
 * - PIN 入力 → 6 項目チェック → 送信
 */

interface TemplateItem {
  id: string;
  item_key: string;
  label: string;
  item_type: string;
  required: boolean;
  options?: { choices?: string[]; labels?: Record<string, string> };
}

interface LocationInfo {
  location: { id: string; name: string; slug: string };
  store: { id: string; name: string };
  template: { id: string; name: string; description?: string; items: TemplateItem[] };
}

type AnswerValue = boolean | string;

async function nfcFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/nfc${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({ error: 'Request failed' }));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return body as T;
}

export default function NfcCleanPage() {
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('loc') || '';

  const [info, setInfo] = useState<LocationInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [pin, setPin] = useState('');
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ staffName: string | null } | null>(null);
  const [submitErr, setSubmitErr] = useState<string>('');

  const reset = useCallback(() => {
    setPin('');
    setAnswers({});
    setSuccess(null);
    setSubmitErr('');
  }, []);

  useEffect(() => {
    if (!locationId) {
      setLoadErr('無効なタグです (loc パラメータがありません)');
      setLoading(false);
      return;
    }
    nfcFetch<LocationInfo>(`/location/${locationId}`)
      .then((data) => {
        setInfo(data);
        // 初期値
        const init: Record<string, AnswerValue> = {};
        for (const it of data.template.items) {
          if (it.item_type === 'checkbox') init[it.id] = false;
          else init[it.id] = '';
        }
        setAnswers(init);
      })
      .catch((e) => {
        setLoadErr(e instanceof Error ? e.message : '読み込みに失敗しました');
      })
      .finally(() => setLoading(false));
  }, [locationId]);

  // 送信成功後、3秒で自動リセット
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => {
      reset();
    }, 3000);
    return () => clearTimeout(t);
  }, [success, reset]);

  const handleSubmit = async () => {
    if (!info) return;
    if (!/^\d{4}$/.test(pin)) {
      setSubmitErr('PIN は4桁の数字で入力してください');
      return;
    }
    // 必須チェック
    for (const item of info.template.items) {
      if (!item.required) continue;
      const v = answers[item.id];
      if (item.item_type === 'checkbox' && !v) {
        setSubmitErr(`「${item.label}」をチェックしてください`);
        return;
      }
      if (item.item_type !== 'checkbox' && (v === '' || v == null)) {
        setSubmitErr(`「${item.label}」を入力してください`);
        return;
      }
    }

    setSubmitErr('');
    setSubmitting(true);
    try {
      const items = info.template.items.map((item) => ({
        template_item_id: item.id,
        item_key: item.item_key,
        bool_value: item.item_type === 'checkbox' ? Boolean(answers[item.id]) : null,
        text_value: item.item_type === 'text' ? String(answers[item.id] || '') || null : null,
        select_value: item.item_type === 'select' ? String(answers[item.id] || '') || null : null,
        numeric_value: null,
      }));
      const result = await nfcFetch<{ ok: boolean; staffName: string | null }>(`/submit`, {
        method: 'POST',
        body: JSON.stringify({ locationId, pin, items }),
      });
      setSuccess({ staffName: result.staffName });
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={styles.page}><div style={styles.centerMsg}>読み込み中...</div></div>;
  }
  if (loadErr || !info) {
    return (
      <div style={styles.page}>
        <div style={styles.errorCard}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>アクセスできません</div>
          <div style={{ color: '#64748b' }}>{loadErr || '情報が取得できませんでした'}</div>
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
            記録しました
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

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.storeName}>{info.store.name}</div>
          <div style={styles.locationName}>📍 {info.location.name}</div>
          <div style={styles.templateName}>{info.template.name}</div>
        </div>

        {/* PIN */}
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
          />
        </div>

        {/* 項目 */}
        <div style={styles.section}>
          {info.template.items.map((item) => (
            <div key={item.id} style={styles.item}>
              <div style={styles.itemLabel}>
                {item.label}
                {item.required && <span style={{ color: '#dc2626' }}> *</span>}
              </div>
              {item.item_type === 'checkbox' && (
                <div style={styles.toggleRow}>
                  <button
                    style={{
                      ...styles.toggleBtn,
                      ...(answers[item.id] === true ? styles.toggleBtnActiveOk : {}),
                    }}
                    onClick={() => setAnswers((a) => ({ ...a, [item.id]: true }))}
                  >
                    OK
                  </button>
                  <button
                    style={{
                      ...styles.toggleBtn,
                      ...(answers[item.id] === false && answers[item.id] !== undefined ? styles.toggleBtnActiveNg : {}),
                    }}
                    onClick={() => setAnswers((a) => ({ ...a, [item.id]: false }))}
                  >
                    NG
                  </button>
                </div>
              )}
              {item.item_type === 'select' && item.options?.choices && (
                <div style={styles.toggleRow}>
                  {item.options.choices.map((choice) => {
                    const label = item.options?.labels?.[choice] || choice;
                    const isActive = answers[item.id] === choice;
                    return (
                      <button
                        key={choice}
                        style={{
                          ...styles.toggleBtn,
                          ...(isActive ? styles.toggleBtnActiveOk : {}),
                        }}
                        onClick={() => setAnswers((a) => ({ ...a, [item.id]: choice }))}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {item.item_type === 'text' && (
                <textarea
                  value={String(answers[item.id] || '')}
                  onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
                  style={styles.textarea}
                  rows={2}
                  placeholder="特記事項があれば入力 (任意)"
                />
              )}
            </div>
          ))}
        </div>

        {submitErr && <div style={styles.errorMsg}>{submitErr}</div>}

        <button
          style={{ ...styles.submitBtn, ...(submitting ? { opacity: 0.6 } : {}) }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? '送信中...' : '送信する'}
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
  section: { marginBottom: 20 },
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
  item: {
    padding: '14px 12px',
    marginBottom: 10,
    background: '#f8fafc',
    borderRadius: 10,
    border: '1px solid #e2e8f0',
  },
  itemLabel: { fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 10 },
  toggleRow: { display: 'flex', gap: 8 },
  toggleBtn: {
    flex: 1,
    minHeight: 48,
    padding: '12px 8px',
    background: '#fff',
    border: '2px solid #cbd5e1',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    color: '#64748b',
    cursor: 'pointer',
  },
  toggleBtnActiveOk: { background: '#22c55e', borderColor: '#22c55e', color: '#fff' },
  toggleBtnActiveNg: { background: '#ef4444', borderColor: '#ef4444', color: '#fff' },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    resize: 'vertical',
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
  errorMsg: {
    padding: '10px 12px',
    marginBottom: 12,
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  centerMsg: { textAlign: 'center', color: '#64748b', padding: 40 },
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
