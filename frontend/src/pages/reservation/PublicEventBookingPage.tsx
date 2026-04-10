/**
 * 公開イベント予約ページ
 * URL: /r/:slug/event
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type {
  PublicEventAvailability,
  PublicReservationSummary,
  PublicStoreInfo,
} from '../../types/api';
import {
  cardStyle,
  inputStyle,
  FieldRow,
  Centered,
  StoreHeader,
  formatDateTime,
} from './_ui';

type Step = 'loading' | 'events' | 'form' | 'done' | 'error';

export default function PublicEventBookingPage() {
  const slug = useMemo(() => {
    const m = window.location.pathname.match(/^\/r\/([^/]+)\/event/);
    return m ? m[1] : '';
  }, []);

  const [step, setStep] = useState<Step>('loading');
  const [store, setStore] = useState<PublicStoreInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [events, setEvents] = useState<PublicEventAvailability[]>([]);
  const [selected, setSelected] = useState<PublicEventAvailability | null>(null);

  const [partySize, setPartySize] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PublicReservationSummary | null>(null);

  useEffect(() => {
    if (!slug) {
      setErrorMsg('URL が正しくありません');
      setStep('error');
      return;
    }
    (async () => {
      try {
        const s = await api.getPublicStoreBySlug(slug);
        if (!s.available.includes('reservation_event')) {
          setErrorMsg('この店舗はイベント予約を受け付けていません');
          setStep('error');
          return;
        }
        setStore(s.store);
        const e = await api.getPublicEvents(slug);
        setEvents(e.events);
        setStep('events');
      } catch {
        setErrorMsg('店舗が見つかりません');
        setStep('error');
      }
    })();
  }, [slug]);

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await api.createPublicEventReservation(slug, {
        event_id: selected.id,
        party_size: partySize,
        customer_name: name,
        customer_phone: phone || undefined,
        customer_email: email,
        notes: notes || undefined,
      });
      setResult(res.reservation);
      setStep('done');
    } catch (e) {
      alert(e instanceof Error ? e.message : '予約に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'loading') return <Centered>読み込み中…</Centered>;
  if (step === 'error') return <Centered>{errorMsg}</Centered>;
  if (!store) return <Centered>店舗情報がありません</Centered>;

  if (step === 'done' && result) {
    return (
      <Centered>
        <div>
          <h2>予約を受け付けました</h2>
          <div style={{ ...cardStyle, marginTop: 16, textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>確認コード</div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>{result.confirmation_code}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 12 }}>
              {formatDateTime(result.starts_at)} / {result.party_size}名
            </div>
          </div>
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 20 }}>
      <StoreHeader store={store} />

      {step === 'events' && (
        <div>
          <h3>イベントを選ぶ</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {events.length === 0 && <Centered>公開中のイベントがありません</Centered>}
            {events.map((e) => {
              const full = e.remaining < 1;
              return (
                <button
                  key={e.id}
                  disabled={full}
                  onClick={() => { setSelected(e); setStep('form'); }}
                  style={{
                    ...cardStyle,
                    textAlign: 'left',
                    border: '1px solid #e2e8f0',
                    cursor: full ? 'not-allowed' : 'pointer',
                    opacity: full ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{e.title}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    {formatDateTime(e.starts_at)} 〜 {formatDateTime(e.ends_at)}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    残り {e.remaining}名
                    {e.price != null && ` / ¥${e.price.toLocaleString()}`}
                  </div>
                  {e.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{e.description}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 'form' && selected && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px' }}>お客様情報</h3>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            {selected.title} / {formatDateTime(selected.starts_at)}
          </div>
          <FieldRow label="人数">
            <input type="number" min={1} max={selected.remaining} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} style={inputStyle} />
          </FieldRow>
          <FieldRow label="お名前 *">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </FieldRow>
          <FieldRow label="メールアドレス *">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </FieldRow>
          <FieldRow label="電話番号">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          </FieldRow>
          <FieldRow label="備考">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} />
          </FieldRow>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setStep('events')} style={{ flex: 1, padding: 12, background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              戻る
            </button>
            <button
              disabled={submitting || !name || !email}
              onClick={submit}
              style={{ flex: 2, padding: 12, background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              {submitting ? '送信中…' : '予約する'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
