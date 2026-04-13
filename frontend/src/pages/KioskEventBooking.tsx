/**
 * KioskEventBooking — イベントカード一覧 → 動的フォーム → 確認画面
 * Google Forms 風に form_schema に従ってフォームを動的レンダリングする。
 */
import { useCallback, useEffect, useState } from 'react';
import { kioskApi } from '../api/kioskClient';
import type { AvailableEvent, EventFormField } from '../api/kioskClient';

interface Props {
  storeId: string;
}

type Step = 'events' | 'form' | 'done';

interface BookingResult {
  id: string;
  confirmation_code: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function remainingColor(remaining: number, capacity: number): string {
  if (remaining <= 0) return '#dc2626';
  const ratio = remaining / capacity;
  if (ratio < 0.2) return '#dc2626';
  if (ratio < 0.5) return '#f59e0b';
  return '#10b981';
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EventCard({
  event,
  onSelect,
}: {
  event: AvailableEvent;
  onSelect: (e: AvailableEvent) => void;
}) {
  const full = event.remaining <= 0;
  const color = remainingColor(event.remaining, event.capacity);

  return (
    <div style={s.card}>
      {/* Header area with color accent */}
      <div style={{ ...s.cardAccent, background: full ? '#94a3b8' : '#4f8ef7' }} />

      <div style={s.cardBody}>
        <div style={s.cardTitle}>{event.title}</div>

        <div style={s.cardDate}>
          {formatEventDate(event.starts_at)} {formatEventTime(event.starts_at)} 〜 {formatEventTime(event.ends_at)}
        </div>

        <div style={s.cardMeta}>
          {event.price != null && event.price > 0 ? (
            <span style={s.cardPrice}>&yen;{event.price.toLocaleString()}</span>
          ) : (
            <span style={{ ...s.cardPrice, color: '#10b981' }}>無料</span>
          )}
          <span style={{ ...s.remainBadge, background: `${color}18`, color }}>
            {full ? '満席' : `残り${event.remaining}席`}
          </span>
        </div>

        {event.description && (
          <div style={s.cardDesc}>{event.description}</div>
        )}

        <button
          style={{ ...s.bookBtn, ...(full ? s.bookBtnDisabled : {}) }}
          disabled={full}
          onClick={() => onSelect(event)}
        >
          {full ? '満席' : '予約する'}
        </button>
      </div>
    </div>
  );
}

function DynamicFormField({
  field,
  value,
  onChange,
}: {
  field: EventFormField;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  const common: React.CSSProperties = { ...s.input };

  switch (field.type) {
    case 'text':
      return (
        <input
          style={common}
          type="text"
          value={String(value ?? '')}
          placeholder={field.placeholder || ''}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      );
    case 'number':
      return (
        <input
          style={common}
          type="number"
          value={value === '' || value === undefined ? '' : Number(value)}
          placeholder={field.placeholder || ''}
          onChange={(e) => onChange(field.key, e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
    case 'textarea':
      return (
        <textarea
          style={{ ...common, minHeight: 72, resize: 'vertical' }}
          value={String(value ?? '')}
          placeholder={field.placeholder || ''}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      );
    case 'select':
      return (
        <select
          style={common}
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          <option value="">選択してください</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'checkbox':
      return (
        <label style={s.checkboxLabel}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(field.key, e.target.checked)}
            style={s.checkbox}
          />
          {field.placeholder || field.label}
        </label>
      );
    default:
      return null;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function KioskEventBooking({ storeId }: Props) {
  const [step, setStep] = useState<Step>('events');
  const [events, setEvents] = useState<AvailableEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<AvailableEvent | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [result, setResult] = useState<BookingResult | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await kioskApi.getAvailableEvents(storeId);
      setEvents(res.events || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '読み込みエラー');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleSelect = (ev: AvailableEvent) => {
    setSelected(ev);
    // Initialize responses with defaults
    const init: Record<string, unknown> = {};
    for (const f of ev.form_schema || []) {
      if (f.type === 'checkbox') init[f.key] = false;
      else if (f.type === 'number') init[f.key] = '';
      else init[f.key] = '';
    }
    setResponses(init);
    setSubmitError(null);
    setStep('form');
  };

  const handleFieldChange = (key: string, val: unknown) => {
    setResponses((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async () => {
    if (!selected) return;
    const schema = selected.form_schema || [];

    // Validate required fields
    for (const field of schema) {
      if (field.required) {
        const val = responses[field.key];
        if (val === undefined || val === null || val === '' || val === false) {
          setSubmitError(`「${field.label}」は必須です`);
          return;
        }
      }
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await kioskApi.bookEvent(storeId, selected.id, { responses });
      setResult(res.reservation);
      setStep('done');
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : '予約に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelected(null);
    setResponses({});
    setResult(null);
    setSubmitError(null);
    setStep('events');
    loadEvents();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // Step: events
  if (step === 'events') {
    return (
      <div>
        <div style={s.header}>
          <span style={s.headerTitle}>イベント予約</span>
        </div>

        {loading && (
          <div style={s.center}>読み込み中...</div>
        )}
        {!loading && error && (
          <div style={{ ...s.center, color: '#dc2626' }}>{error}</div>
        )}
        {!loading && !error && events.length === 0 && (
          <div style={s.center}>現在予約可能なイベントはありません</div>
        )}
        {!loading && !error && events.length > 0 && (
          <div style={s.cardGrid}>
            {events.map((ev) => (
              <EventCard key={ev.id} event={ev} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Step: form
  if (step === 'form' && selected) {
    const schema = selected.form_schema || [];
    const hasFields = schema.length > 0;

    return (
      <div>
        <div style={s.header}>
          <button style={s.backBtn} onClick={handleReset}>← 戻る</button>
          <span style={s.headerTitle}>予約登録</span>
        </div>

        {/* Selected event summary */}
        <div style={s.eventSummary}>
          <div style={s.summaryTitle}>{selected.title}</div>
          <div style={s.summaryMeta}>
            {formatEventDate(selected.starts_at)} {formatEventTime(selected.starts_at)} 〜 {formatEventTime(selected.ends_at)}
            {selected.price != null && selected.price > 0 && ` / ¥${selected.price.toLocaleString()}`}
          </div>
        </div>

        {/* Dynamic form */}
        <div style={s.formCard}>
          {!hasFields && (
            <div style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>
              このイベントは入力項目がありません
            </div>
          )}
          {schema.map((field) => (
            <div key={field.key} style={s.fieldRow}>
              {field.type !== 'checkbox' && (
                <label style={s.fieldLabel}>
                  {field.label}
                  {field.required && <span style={s.required}> *</span>}
                </label>
              )}
              <DynamicFormField
                field={field}
                value={responses[field.key]}
                onChange={handleFieldChange}
              />
            </div>
          ))}

          {submitError && (
            <div style={s.errorMsg}>{submitError}</div>
          )}

          <div style={s.formActions}>
            <button style={s.cancelBtn} onClick={handleReset} disabled={submitting}>
              キャンセル
            </button>
            <button style={s.submitBtn} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '登録中...' : '予約する'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step: done
  if (step === 'done' && result) {
    return (
      <div>
        <div style={s.doneCard}>
          <div style={s.doneCheck}>&#10003;</div>
          <div style={s.doneTitle}>予約を受け付けました</div>

          <div style={s.codeLabel}>確認コード</div>
          <div style={s.codeValue}>{result.confirmation_code}</div>

          {selected && (
            <div style={s.doneMeta}>
              <div>{selected.title}</div>
              <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                {formatEventDate(result.starts_at)} {formatEventTime(result.starts_at)} 〜 {formatEventTime(result.ends_at)}
              </div>
              <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                {result.party_size}名
              </div>
            </div>
          )}

          <button style={s.doneBtn} onClick={handleReset}>
            完了
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#222',
  },
  center: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: '40px 0',
    fontSize: 14,
  },

  // Card grid
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 14,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  cardAccent: {
    height: 6,
    borderRadius: '14px 14px 0 0',
  },
  cardBody: {
    padding: '16px 18px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#0f172a',
  },
  cardDate: {
    fontSize: 13,
    color: '#475569',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: 700,
    color: '#0f172a',
  },
  remainBadge: {
    fontSize: 12,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#64748b',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    lineHeight: '1.4',
  },
  bookBtn: {
    marginTop: 'auto',
    padding: '10px 0',
    background: '#4f8ef7',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
  bookBtnDisabled: {
    background: '#cbd5e1',
    cursor: 'not-allowed',
  },

  // Form step
  backBtn: {
    background: 'none',
    border: '1px solid #d0d7e2',
    borderRadius: 7,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#555',
    fontFamily: 'sans-serif',
  },
  eventSummary: {
    background: '#f0f4ff',
    borderRadius: 10,
    padding: '14px 18px',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 4,
  },
  summaryMeta: {
    fontSize: 13,
    color: '#475569',
  },
  formCard: {
    background: '#fff',
    borderRadius: 12,
    padding: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  fieldRow: {
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#333',
  },
  required: {
    color: '#dc2626',
  },
  input: {
    fontSize: 14,
    padding: '10px 12px',
    border: '1px solid #d0d7e2',
    borderRadius: 8,
    color: '#222',
    background: '#fafbfc',
    outline: 'none',
    fontFamily: 'sans-serif',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    color: '#333',
    cursor: 'pointer',
    padding: '4px 0',
  },
  checkbox: {
    width: 18,
    height: 18,
    cursor: 'pointer',
  },
  errorMsg: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
  },
  formActions: {
    display: 'flex',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    padding: '12px 0',
    background: '#f1f5f9',
    color: '#555',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
  submitBtn: {
    flex: 2,
    padding: '12px 0',
    background: '#4f8ef7',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },

  // Done step
  doneCard: {
    background: '#fff',
    borderRadius: 14,
    padding: '40px 24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    textAlign: 'center',
    maxWidth: 420,
    margin: '20px auto',
  },
  doneCheck: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#e6f4ea',
    color: '#2e7d32',
    fontSize: 28,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  doneTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 3,
    color: '#0f172a',
    fontFamily: 'monospace',
    marginBottom: 20,
  },
  doneMeta: {
    fontSize: 15,
    color: '#333',
    marginBottom: 24,
  },
  doneBtn: {
    padding: '12px 40px',
    background: '#4f8ef7',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
};
