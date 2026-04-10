/**
 * 公開スクール予約ページ
 * URL: /r/:slug/school
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type {
  PublicReservationSummary,
  PublicSchoolSessionAvailability,
  PublicStoreInfo,
  ReservationSchool,
} from '../../types/api';
import {
  cardStyle,
  inputStyle,
  FieldRow,
  Centered,
  StoreHeader,
  formatDateTime,
} from './_ui';

type Step = 'loading' | 'courses' | 'sessions' | 'form' | 'done' | 'error';

export default function PublicSchoolBookingPage() {
  const slug = useMemo(() => {
    const m = window.location.pathname.match(/^\/r\/([^/]+)\/school/);
    return m ? m[1] : '';
  }, []);

  const [step, setStep] = useState<Step>('loading');
  const [store, setStore] = useState<PublicStoreInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [courses, setCourses] = useState<ReservationSchool[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<ReservationSchool | null>(null);
  const [sessions, setSessions] = useState<PublicSchoolSessionAvailability[]>([]);
  const [selectedSession, setSelectedSession] = useState<PublicSchoolSessionAvailability | null>(null);

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
        if (!s.available.includes('reservation_school')) {
          setErrorMsg('この店舗はスクール予約を受け付けていません');
          setStep('error');
          return;
        }
        setStore(s.store);
        const c = await api.getPublicSchoolCourses(slug);
        setCourses(c.courses);
        setStep('courses');
      } catch {
        setErrorMsg('店舗が見つかりません');
        setStep('error');
      }
    })();
  }, [slug]);

  const pickCourse = async (course: ReservationSchool) => {
    setSelectedCourse(course);
    setStep('loading');
    try {
      const r = await api.getPublicSchoolSessions(slug, course.id);
      setSessions(r.sessions);
      setStep('sessions');
    } catch {
      setStep('error');
      setErrorMsg('セッション取得に失敗しました');
    }
  };

  const submit = async () => {
    if (!selectedSession) return;
    setSubmitting(true);
    try {
      const res = await api.createPublicSchoolReservation(slug, {
        session_id: selectedSession.id,
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
          <h2>お申込を受け付けました</h2>
          <div style={{ ...cardStyle, marginTop: 16, textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>確認コード</div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>{result.confirmation_code}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 12 }}>
              {formatDateTime(result.starts_at)} / {result.party_size}名
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
              確認メールをお送りしました。
            </p>
          </div>
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 20 }}>
      <StoreHeader store={store} />

      {step === 'courses' && (
        <div>
          <h3>コースを選ぶ</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {courses.length === 0 && <Centered>公開中のコースがありません</Centered>}
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => pickCourse(c)}
                style={{ ...cardStyle, textAlign: 'left', border: '1px solid #e2e8f0', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                {c.instructor && <div style={{ fontSize: 12, color: '#64748b' }}>講師: {c.instructor}</div>}
                {c.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{c.description}</div>}
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  定員 {c.capacity}名
                  {c.price != null && ` / ¥${c.price.toLocaleString()}`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'sessions' && selectedCourse && (
        <div>
          <button onClick={() => setStep('courses')} style={{ marginBottom: 12, padding: '6px 12px', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            ← 戻る
          </button>
          <h3>{selectedCourse.name} / 日程を選ぶ</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {sessions.length === 0 && <Centered>開催予定のセッションがありません</Centered>}
            {sessions.map((s) => {
              const full = s.remaining < 1;
              return (
                <button
                  key={s.id}
                  disabled={full}
                  onClick={() => { setSelectedSession(s); setStep('form'); }}
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
                  <div style={{ fontWeight: 600 }}>{formatDateTime(s.starts_at)}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>残り {s.remaining}名</div>
                  {s.note && <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.note}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 'form' && selectedSession && selectedCourse && (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px' }}>お申込情報</h3>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            {selectedCourse.name} / {formatDateTime(selectedSession.starts_at)}
          </div>
          <FieldRow label="人数">
            <input type="number" min={1} max={selectedSession.remaining} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} style={inputStyle} />
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
            <button onClick={() => setStep('sessions')} style={{ flex: 1, padding: 12, background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              戻る
            </button>
            <button
              disabled={submitting || !name || !email}
              onClick={submit}
              style={{ flex: 2, padding: 12, background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              {submitting ? '送信中…' : '申し込む'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
