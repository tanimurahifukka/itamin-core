/**
 * 公開テーブル予約ページ
 *
 * URL: /r/:slug/table
 * 認証不要。slug から店舗を引いて、日時 → 人数 → 顧客情報の 3 ステップで予約を確定する。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type {
  AvailabilitySlot,
  PublicReservationSummary,
  PublicStoreInfo,
} from '../../types/api';

type Step = 'loading' | 'select' | 'form' | 'done' | 'error';

export default function PublicTableBookingPage() {
  const slug = useMemo(() => {
    const m = window.location.pathname.match(/^\/r\/([^/]+)\/table/);
    return m ? m[1] : '';
  }, []);

  const [step, setStep] = useState<Step>('loading');
  const [store, setStore] = useState<PublicStoreInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsReason, setSlotsReason] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [result, setResult] = useState<PublicReservationSummary | null>(null);

  // 店舗解決
  useEffect(() => {
    if (!slug) {
      setErrorMsg('URL が正しくありません');
      setStep('error');
      return;
    }
    api
      .getPublicStoreBySlug(slug)
      .then((res) => {
        if (!res.available.includes('reservation_table')) {
          setErrorMsg('この店舗はテーブル予約を受け付けていません');
          setStep('error');
          return;
        }
        setStore(res.store);
        setStep('select');
      })
      .catch(() => {
        setErrorMsg('店舗が見つかりません');
        setStep('error');
      });
  }, [slug]);

  // 空き枠取得
  const loadSlots = useCallback(async () => {
    if (!store) return;
    setSlotsLoading(true);
    setSlotsReason('');
    try {
      const res = await api.getPublicTableAvailability(slug, date, partySize);
      setSlots(res.slots);
      setSlotsReason(res.reason || '');
    } catch (e) {
      setSlots([]);
      setSlotsReason(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, date, partySize, store]);

  useEffect(() => {
    if (step === 'select') loadSlots();
  }, [loadSlots, step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    try {
      const res = await api.createPublicTableReservation(slug, {
        starts_at: selectedSlot,
        party_size: partySize,
        customer_name: name,
        customer_phone: phone || undefined,
        customer_email: email,
        notes: notes || undefined,
      });
      setResult(res.reservation);
      setStep('done');
    } catch (err) {
      alert(err instanceof Error ? err.message : '予約に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'loading') {
    return <Centered>読み込み中…</Centered>;
  }
  if (step === 'error') {
    return <Centered>{errorMsg}</Centered>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 20 }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <header style={{ marginBottom: 20, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{store?.name}</h1>
          {store?.address && <div style={{ fontSize: 12, color: '#64748b' }}>{store.address}</div>}
          {store?.phone && <div style={{ fontSize: 12, color: '#64748b' }}>☎ {store.phone}</div>}
        </header>

        {step === 'select' && (
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>ご予約日時を選ぶ</h2>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <label style={{ flex: 1 }}>
                <div style={labelStyle}>日付</div>
                <input type="date" value={date} min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ flex: 1 }}>
                <div style={labelStyle}>人数</div>
                <select value={partySize} onChange={(e) => setPartySize(parseInt(e.target.value))} style={inputStyle}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}名</option>
                  ))}
                </select>
              </label>
            </div>

            {slotsLoading ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>空き確認中…</div>
            ) : slots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                {slotsReason || '空きがありません'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {slots.map((s) => {
                  const t = new Date(s.starts_at);
                  const label = t.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <button
                      key={s.starts_at}
                      onClick={() => { setSelectedSlot(s.starts_at); setStep('form'); }}
                      style={{
                        padding: '14px 0', background: 'white',
                        border: '1px solid #cbd5e1', borderRadius: 8,
                        fontSize: 15, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 'form' && selectedSlot && (
          <form onSubmit={handleSubmit} style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>お客様情報</h2>

            <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <div><strong>{new Date(selectedSlot).toLocaleString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</strong></div>
              <div>{partySize}名</div>
              <button type="button" onClick={() => setStep('select')}
                style={{ background: 'none', border: 'none', color: '#0ea5e9', fontSize: 12, cursor: 'pointer', padding: 0, marginTop: 4 }}>
                ← 別の時間を選ぶ
              </button>
            </div>

            <FieldRow label="お名前 *">
              <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
            </FieldRow>
            <FieldRow label="メールアドレス *">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
            </FieldRow>
            <FieldRow label="電話番号">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            </FieldRow>
            <FieldRow label="ご要望">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </FieldRow>

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', padding: 14, marginTop: 12,
                background: '#0ea5e9', color: 'white', border: 'none',
                borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {submitting ? '送信中…' : 'この内容で予約する'}
            </button>
          </form>
        )}

        {step === 'done' && result && (
          <div style={cardStyle}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 48 }}>✓</div>
              <h2 style={{ margin: '8px 0 4px' }}>ご予約ありがとうございます</h2>
              <div style={{ fontSize: 13, color: '#64748b' }}>確認メールを送信しました</div>
            </div>

            <div style={{ padding: 16, background: '#f1f5f9', borderRadius: 8, marginBottom: 16 }}>
              <div style={labelStyle}>日時</div>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>
                {new Date(result.starts_at).toLocaleString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={labelStyle}>人数</div>
              <div style={{ marginBottom: 10 }}>{result.party_size}名</div>
              <div style={labelStyle}>確認コード</div>
              <div style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: '0.1em', fontWeight: 700 }}>
                {result.confirmation_code}
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              ご変更・キャンセルの際はこのコードとご登録メールアドレスをお控えください。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// UI helpers
// ============================================================
const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  marginBottom: 4,
};

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: '#64748b', padding: 20, textAlign: 'center',
    }}>
      {children}
    </div>
  );
}
