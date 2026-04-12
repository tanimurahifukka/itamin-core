/**
 * 公開時間帯予約ページ
 * URL: /r/:slug/timeslot
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type {
  PublicReservationSummary,
  PublicStoreInfo,
  PublicTimeslotAvailability,
} from '../../types/api';
import {
  cardStyle,
  inputStyle,
  FieldRow,
  Centered,
  StoreHeader,
  formatTime,
} from './_ui';

type Step = 'loading' | 'select' | 'form' | 'done' | 'error';

export default function PublicTimeslotBookingPage() {
  const slug = useMemo(() => {
    const m = window.location.pathname.match(/^\/r\/([^/]+)\/timeslot/);
    return m ? m[1] : '';
  }, []);

  const [step, setStep] = useState<Step>('loading');
  const [store, setStore] = useState<PublicStoreInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [date, setDate] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }));
  const [slots, setSlots] = useState<PublicTimeslotAvailability[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsReason, setSlotsReason] = useState('');
  const [selected, setSelected] = useState<PublicTimeslotAvailability | null>(null);

  const [partySize, setPartySize] = useState(2);
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
    api
      .getPublicStoreBySlug(slug)
      .then((res) => {
        if (!res.available.includes('reservation_timeslot')) {
          setErrorMsg('この店舗は時間帯予約を受け付けていません');
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

  const loadSlots = useCallback(async () => {
    if (!store) return;
    setSlotsLoading(true);
    setSlotsReason('');
    try {
      const res = await api.getPublicTimeslotAvailability(slug, date);
      setSlots(res.slots);
      setSlotsReason(res.reason || '');
    } catch (e) {
      setSlots([]);
      setSlotsReason(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, store, date]);

  useEffect(() => { if (store) loadSlots(); }, [store, loadSlots]);

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await api.createPublicTimeslotReservation(slug, {
        timeslot_id: selected.id,
        date,
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
              {new Date(result.starts_at).toLocaleString('ja-JP')} 〜 {formatTime(result.ends_at)}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{result.party_size}名</div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
              確認メールをお送りしました。来店時にこの確認コードをお知らせください。
            </p>
          </div>
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 20 }}>
      <StoreHeader store={store} />

      {step === 'select' && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px' }}>時間帯を選ぶ</h3>
          <FieldRow label="日付">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </FieldRow>
          <FieldRow label="人数">
            <input type="number" min={1} max={30} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} style={inputStyle} />
          </FieldRow>

          {slotsLoading && <div style={{ color: '#94a3b8', padding: 12 }}>空き状況を確認中…</div>}
          {slotsReason && <div style={{ color: '#ef4444', padding: 12 }}>{slotsReason}</div>}

          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {slots.map((s) => {
              const full = s.remaining < partySize;
              return (
                <button
                  key={s.id}
                  disabled={full}
                  onClick={() => { setSelected(s); setStep('form'); }}
                  style={{
                    padding: 12,
                    background: full ? '#f1f5f9' : 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    cursor: full ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity: full ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {formatTime(s.starts_at)}〜{formatTime(s.ends_at)} / 残り {s.remaining}名
                    {s.price != null && ` / ¥${s.price.toLocaleString()}`}
                  </div>
                  {s.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.description}</div>}
                </button>
              );
            })}
            {!slotsLoading && slots.length === 0 && !slotsReason && (
              <div style={{ color: '#94a3b8', padding: 12 }}>この日は受付枠がありません</div>
            )}
          </div>
        </div>
      )}

      {step === 'form' && selected && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px' }}>お客様情報</h3>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            {selected.name} / {new Date(date + 'T' + selected.starts_at.slice(11, 16)).toLocaleString('ja-JP')} / {partySize}名
          </div>
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
            <button onClick={() => setStep('select')} style={{ flex: 1, padding: 12, background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
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
