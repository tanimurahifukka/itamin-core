/**
 * Kiosk reservation page — calendar view with monthly overview,
 * day-level reservation list with status actions, and event management.
 */
import { useCallback, useEffect, useState } from 'react';
import { kioskApi } from '../api/kioskClient';
import type { EventFormField } from '../api/kioskClient';
import KioskEventBooking from './KioskEventBooking';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Reservation {
  id: string;
  reservation_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  confirmation_code: string;
  metadata: Record<string, unknown>;
  resource_ref: string | null;
}

interface KioskEvent {
  id: string;
  store_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  price: number | null;
  image_url: string | null;
  status: string;
  sort_order: number;
  form_schema: EventFormField[];
}

interface DayData {
  count: number;
  types: string[];
}

interface EventFormState {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  capacity: string;
  price: string;
  status: string;
  form_schema: EventFormField[];
}

interface Props {
  storeId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  table: 'テーブル',
  timeslot: '時間帯',
  school: 'スクール',
  event: 'イベント',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '確認待ち',
  confirmed: '確定',
  seated: '来店中',
  completed: '完了',
  no_show: '未来店',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#16a34a',
  seated: '#0ea5e9',
  completed: '#94a3b8',
  no_show: '#dc2626',
};

const TYPE_COLOR: Record<string, string> = {
  table: '#4f8ef7',
  timeslot: '#8b5cf6',
  school: '#f59e0b',
  event: '#10b981',
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const EVENT_STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  published: '公開中',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}

function formatDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

function formatEventDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getDominantType(types: string[]): string {
  return types[0] || 'table';
}

const EMPTY_FORM: EventFormState = {
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  capacity: '',
  price: '',
  status: 'draft',
  form_schema: [],
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'テキスト',
  number: '数値',
  select: '選択肢',
  textarea: 'テキストエリア',
  checkbox: 'チェックボックス',
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 4,
      background: `${STATUS_COLOR[status] || '#94a3b8'}18`,
      color: STATUS_COLOR[status] || '#94a3b8',
      fontWeight: 600,
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function StatusActionButtons({
  reservation,
  onUpdate,
}: {
  reservation: Reservation;
  onUpdate: (id: string, status: string) => void;
}) {
  const { status } = reservation;
  const buttons: { label: string; nextStatus: string; color: string }[] = [];

  if (status === 'pending') {
    buttons.push({ label: '確定', nextStatus: 'confirmed', color: '#16a34a' });
  }
  if (status === 'confirmed') {
    buttons.push({ label: '来店', nextStatus: 'seated', color: '#0ea5e9' });
  }
  if (status === 'seated') {
    buttons.push({ label: '完了', nextStatus: 'completed', color: '#94a3b8' });
  }
  if (['pending', 'confirmed', 'seated'].includes(status)) {
    buttons.push({ label: '未来店', nextStatus: 'no_show', color: '#dc2626' });
  }

  if (buttons.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {buttons.map(b => (
        <button
          key={b.nextStatus}
          onClick={() => onUpdate(reservation.id, b.nextStatus)}
          style={{
            fontSize: 13,
            padding: '8px 14px',
            borderRadius: 6,
            border: `1px solid ${b.color}`,
            background: `${b.color}12`,
            color: b.color,
            cursor: 'pointer',
            fontWeight: 600,
            fontFamily: 'sans-serif',
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function CalendarGrid({
  year,
  month,
  today,
  selectedDay,
  dayData,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  onToday,
}: {
  year: number;
  month: number;
  today: string;
  selectedDay: string | null;
  dayData: Record<string, DayData>;
  onSelectDay: (d: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstDay.getDay(); // 0=Sun

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const mo = String(month).padStart(2, '0');
    const da = String(d).padStart(2, '0');
    cells.push(`${year}-${mo}-${da}`);
  }
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={s.calendarWrap}>
      {/* Header */}
      <div style={s.calendarHeader}>
        <button style={s.navBtn} onClick={onPrevMonth}>‹</button>
        <span style={s.calendarTitle}>{year}年{month}月</span>
        <button style={s.navBtn} onClick={onNextMonth}>›</button>
        <button style={s.todayBtn} onClick={onToday}>今月</button>
      </div>

      {/* Weekday row */}
      <div style={s.weekdayRow}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{ ...s.weekdayCell, color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#666' }}>
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={s.dayGrid}>
        {cells.map((dateStr, idx) => {
          if (!dateStr) {
            return <div key={`empty-${idx}`} style={s.emptyCell} />;
          }
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDay;
          const data = dayData[dateStr];
          const dayNum = parseInt(dateStr.split('-')[2], 10);
          const weekday = (idx % 7);

          return (
            <div
              key={dateStr}
              onClick={() => onSelectDay(dateStr)}
              style={{
                ...s.dayCell,
                background: isSelected ? '#4f8ef7' : isToday ? '#e8f0fe' : '#fff',
                color: isSelected ? '#fff' : weekday === 0 ? '#ef4444' : weekday === 6 ? '#3b82f6' : '#222',
                border: isToday && !isSelected ? '2px solid #4f8ef7' : '1px solid #e8ecf4',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 400 }}>{dayNum}</span>
              {data && data.count > 0 && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 10,
                  background: isSelected
                    ? 'rgba(255,255,255,0.3)'
                    : `${TYPE_COLOR[getDominantType(data.types)] || '#4f8ef7'}22`,
                  color: isSelected
                    ? '#fff'
                    : TYPE_COLOR[getDominantType(data.types)] || '#4f8ef7',
                  marginTop: 2,
                }}>
                  {data.count}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Event Form Modal ─────────────────────────────────────────────────────────

function FormSchemaBuilder({
  schema,
  onChange,
}: {
  schema: EventFormField[];
  onChange: (schema: EventFormField[]) => void;
}) {
  const addField = () => {
    const key = `field_${Date.now()}`;
    onChange([...schema, { key, label: '', type: 'text', required: false }]);
  };

  const updateField = (idx: number, patch: Partial<EventFormField>) => {
    const next = schema.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange(next);
  };

  const removeField = (idx: number) => {
    onChange(schema.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 10, borderTop: '1px solid #e8ecf4', paddingTop: 14 }}>
        予約フォーム設定
      </div>
      {schema.length === 0 && (
        <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
          フィールドがありません。追加ボタンで項目を追加してください。
        </div>
      )}
      {schema.map((field, idx) => (
        <div key={field.key} style={s.schemaFieldCard}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 120 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>ラベル</div>
              <input
                style={s.input}
                value={field.label}
                onChange={e => updateField(idx, { label: e.target.value })}
                placeholder="例: お名前"
              />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>タイプ</div>
              <select
                style={s.input}
                value={field.type}
                onChange={e => {
                  const type = e.target.value as EventFormField['type'];
                  const patch: Partial<EventFormField> = { type };
                  if (type === 'select' && !field.options) patch.options = [];
                  updateField(idx, patch);
                }}
              >
                {Object.entries(FIELD_TYPE_LABELS).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 18 }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={e => updateField(idx, { required: e.target.checked })}
                />
                必須
              </label>
              <button
                type="button"
                style={s.schemaRemoveBtn}
                onClick={() => removeField(idx)}
              >
                ✕
              </button>
            </div>
          </div>
          {field.type === 'select' && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>選択肢（カンマ区切り）</div>
              <input
                style={s.input}
                value={(field.options || []).join(', ')}
                onChange={e => {
                  const opts = e.target.value.split(',').map(o => o.trim()).filter(Boolean);
                  updateField(idx, { options: opts });
                }}
                placeholder="例: A, B, C"
              />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        style={s.schemaAddBtn}
        onClick={addField}
      >
        + フィールド追加
      </button>
    </div>
  );
}

function EventFormModal({
  initial,
  onSave,
  onClose,
  saving,
}: {
  initial: EventFormState;
  onSave: (form: EventFormState) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<EventFormState>(initial);

  const set = (field: keyof EventFormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div style={s.modalOverlay}>
      <div style={s.modalBox}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>{initial.title ? 'イベント編集' : 'イベント作成'}</span>
          <button style={s.iconBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={s.formRow}>
            <label style={s.label}>タイトル <span style={s.required}>*</span></label>
            <input
              style={s.input}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              required
              placeholder="イベントタイトル"
            />
          </div>
          <div style={s.formRow}>
            <label style={s.label}>説明</label>
            <textarea
              style={{ ...s.input, minHeight: 72, resize: 'vertical' }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="説明文（任意）"
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ ...s.formRow, flex: 1 }}>
              <label style={s.label}>開始日時 <span style={s.required}>*</span></label>
              <input
                style={s.input}
                type="datetime-local"
                value={form.starts_at}
                onChange={e => set('starts_at', e.target.value)}
                required
              />
            </div>
            <div style={{ ...s.formRow, flex: 1 }}>
              <label style={s.label}>終了日時 <span style={s.required}>*</span></label>
              <input
                style={s.input}
                type="datetime-local"
                value={form.ends_at}
                onChange={e => set('ends_at', e.target.value)}
                required
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ ...s.formRow, flex: 1 }}>
              <label style={s.label}>定員 <span style={s.required}>*</span></label>
              <input
                style={s.input}
                type="number"
                min={1}
                value={form.capacity}
                onChange={e => set('capacity', e.target.value)}
                required
                placeholder="例: 20"
              />
            </div>
            <div style={{ ...s.formRow, flex: 1 }}>
              <label style={s.label}>参加費（円）</label>
              <input
                style={s.input}
                type="number"
                min={0}
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div style={s.formRow}>
            <label style={s.label}>ステータス</label>
            <select style={s.input} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="draft">下書き</option>
              <option value="published">公開中</option>
            </select>
          </div>

          {/* Form schema builder */}
          <FormSchemaBuilder
            schema={form.form_schema}
            onChange={(schema) => setForm(prev => ({ ...prev, form_schema: schema }))}
          />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" style={s.cancelBtn} onClick={onClose} disabled={saving}>キャンセル</button>
            <button type="submit" style={s.primaryBtn} disabled={saving}>
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KioskReservations({ storeId }: Props) {
  const todayStr = toDateStr(new Date());
  const [nowDate, setNowDate] = useState(new Date());

  // Refresh nowDate every 60s for isPast checks on long-running kiosk
  useEffect(() => {
    const id = setInterval(() => setNowDate(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Tab state
  const [tab, setTab] = useState<'calendar' | 'events' | 'event-booking'>('calendar');

  // Calendar state
  const [calYear, setCalYear] = useState(nowDate.getFullYear());
  const [calMonth, setCalMonth] = useState(nowDate.getMonth() + 1);
  const [monthlyData, setMonthlyData] = useState<Record<string, DayData>>({});
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // Day reservation state
  const [selectedDay, setSelectedDay] = useState<string | null>(todayStr);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [resLoading, setResLoading] = useState(false);
  const [resError, setResError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Events state
  const [events, setEvents] = useState<KioskEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<KioskEvent | null>(null);
  const [eventFormSaving, setEventFormSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toast message
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showMsg = (text: string, type: 'success' | 'error') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadMonthly = useCallback(async (y: number, m: number) => {
    setMonthlyLoading(true);
    try {
      const res = await kioskApi.getReservationsMonthly(storeId, y, m);
      setMonthlyData(res.days || {});
    } catch {
      setMonthlyData({});
    } finally {
      setMonthlyLoading(false);
    }
  }, [storeId]);

  const loadDayReservations = useCallback(async (dateStr: string) => {
    setResLoading(true);
    setResError(null);
    try {
      const res = await kioskApi.getReservations(storeId, dateStr);
      setReservations(res.reservations || []);
    } catch (err: unknown) {
      setResError(err instanceof Error ? err.message : '読み込みエラー');
      setReservations([]);
    } finally {
      setResLoading(false);
    }
  }, [storeId]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(null);
    try {
      const res = await kioskApi.getEvents(storeId);
      setEvents(res.events || []);
    } catch (err: unknown) {
      setEventsError(err instanceof Error ? err.message : '読み込みエラー');
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [storeId]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    loadMonthly(calYear, calMonth);
  }, [calYear, calMonth, loadMonthly]);

  useEffect(() => {
    if (selectedDay) loadDayReservations(selectedDay);
  }, [selectedDay, loadDayReservations]);

  useEffect(() => {
    if (tab === 'events') loadEvents();
    setDeleteConfirmId(null);
  }, [tab, loadEvents]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectDay = (dateStr: string) => {
    setSelectedDay(dateStr);
  };

  const handlePrevMonth = () => {
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); }
    else setCalMonth(m => m - 1);
  };

  const handleNextMonth = () => {
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); }
    else setCalMonth(m => m + 1);
  };

  const handleToday = () => {
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth() + 1);
    setSelectedDay(todayStr);
  };

  const handleUpdateStatus = async (reservationId: string, newStatus: string) => {
    setUpdatingId(reservationId);
    try {
      await kioskApi.updateReservationStatus(storeId, reservationId, newStatus);
      setReservations(prev =>
        prev.map(r => r.id === reservationId ? { ...r, status: newStatus } : r)
      );
      loadMonthly(calYear, calMonth);
      showMsg('ステータスを更新しました', 'success');
    } catch {
      showMsg('ステータスの更新に失敗しました', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenCreateEvent = () => {
    setEditingEvent(null);
    setShowEventModal(true);
  };

  const handleOpenEditEvent = (ev: KioskEvent) => {
    setEditingEvent(ev);
    setShowEventModal(true);
  };

  const handleSaveEvent = async (form: EventFormState) => {
    setEventFormSaving(true);
    try {
      const startsDate = new Date(form.starts_at);
      const endsDate = new Date(form.ends_at);
      if (isNaN(startsDate.getTime()) || isNaN(endsDate.getTime())) {
        showMsg('開始日時・終了日時を正しく入力してください', 'error');
        setEventFormSaving(false);
        return;
      }
      if (endsDate <= startsDate) {
        showMsg('終了日時は開始日時より後にしてください', 'error');
        setEventFormSaving(false);
        return;
      }
      const cap = parseInt(form.capacity, 10);
      if (isNaN(cap) || cap < 1) {
        showMsg('定員は1以上を入力してください', 'error');
        setEventFormSaving(false);
        return;
      }
      const payload = {
        title: form.title,
        description: form.description || null,
        starts_at: startsDate.toISOString(),
        ends_at: endsDate.toISOString(),
        capacity: cap,
        price: form.price ? parseFloat(form.price) : null,
        status: form.status,
        form_schema: form.form_schema,
      };
      if (editingEvent) {
        await kioskApi.updateEvent(storeId, editingEvent.id, payload);
      } else {
        await kioskApi.createEvent(storeId, payload);
      }
      setShowEventModal(false);
      setEditingEvent(null);
      loadEvents();
      showMsg(editingEvent ? 'イベントを更新しました' : 'イベントを作成しました', 'success');
    } catch (e) {
      showMsg(e instanceof Error ? e.message : 'イベントの保存に失敗しました', 'error');
    } finally {
      setEventFormSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setDeletingId(eventId);
    try {
      await kioskApi.deleteEvent(storeId, eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setDeleteConfirmId(null);
      showMsg('イベントを削除しました', 'success');
    } catch {
      showMsg('イベントの削除に失敗しました', 'error');
      setDeleteConfirmId(null);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const initialFormForEdit = editingEvent
    ? {
        title: editingEvent.title,
        description: editingEvent.description || '',
        starts_at: formatDateTimeLocal(editingEvent.starts_at),
        ends_at: formatDateTimeLocal(editingEvent.ends_at),
        capacity: String(editingEvent.capacity),
        price: editingEvent.price != null ? String(editingEvent.price) : '',
        status: editingEvent.status,
        form_schema: editingEvent.form_schema || [],
      }
    : EMPTY_FORM;

  return (
    <div style={{ fontFamily: 'sans-serif', position: 'relative' }}>
      {msg && (
        <div style={{
          position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          background: msg.type === 'success' ? '#e6f4ea' : '#fff0f0',
          color: msg.type === 'success' ? '#2e7d32' : '#d32f2f',
          padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        }}>
          {msg.text}
        </div>
      )}
      {/* Tab bar */}
      <div style={s.tabBar}>
        <button
          style={{ ...s.tabBtn, ...(tab === 'calendar' ? s.tabBtnActive : {}) }}
          onClick={() => setTab('calendar')}
        >
          カレンダー
        </button>
        <button
          style={{ ...s.tabBtn, ...(tab === 'event-booking' ? s.tabBtnActive : {}) }}
          onClick={() => setTab('event-booking')}
        >
          イベント予約
        </button>
        <button
          style={{ ...s.tabBtn, ...(tab === 'events' ? s.tabBtnActive : {}) }}
          onClick={() => setTab('events')}
        >
          イベント管理
        </button>
      </div>

      {/* ── Calendar Tab ─────────────────────────────────────────────────── */}
      {tab === 'calendar' && (
        <div>
          <CalendarGrid
            year={calYear}
            month={calMonth}
            today={todayStr}
            selectedDay={selectedDay}
            dayData={monthlyData}
            onSelectDay={handleSelectDay}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            onToday={handleToday}
          />
          {monthlyLoading && (
            <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginBottom: 8 }}>カレンダー更新中...</div>
          )}

          {/* Day reservation list */}
          {selectedDay && (
            <div style={{ marginTop: 20 }}>
              <div style={s.dayHeader}>
                <span style={s.dayHeaderTitle}>{formatDateLabel(selectedDay)}</span>
                {selectedDay === todayStr && <span style={s.todayBadge}>今日</span>}
                {!resLoading && (
                  <span style={s.countBadge}>{reservations.length}件</span>
                )}
              </div>

              {resLoading && (
                <div style={{ textAlign: 'center', color: '#999', padding: 32, fontSize: 14 }}>読み込み中...</div>
              )}
              {!resLoading && resError && (
                <div style={{ textAlign: 'center', color: '#dc2626', padding: 20, fontSize: 13 }}>{resError}</div>
              )}
              {!resLoading && !resError && reservations.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0', fontSize: 14 }}>
                  この日の予約はありません
                </div>
              )}
              {!resLoading && !resError && reservations.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reservations.map(r => {
                    const isPast = new Date(r.ends_at) < nowDate;
                    const isUpdating = updatingId === r.id;
                    return (
                      <div
                        key={r.id}
                        style={{
                          background: isPast ? '#f8fafc' : '#fff',
                          borderRadius: 10,
                          padding: '14px 16px',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                          borderLeft: `4px solid ${STATUS_COLOR[r.status] || '#94a3b8'}`,
                          opacity: isPast ? 0.65 : isUpdating ? 0.7 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          {/* Time */}
                          <div style={{ minWidth: 68, textAlign: 'center', paddingTop: 2 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#222' }}>
                              {formatTime(r.starts_at)}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              〜{formatTime(r.ends_at)}
                            </div>
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                                {r.customer_name}
                              </span>
                              <span style={{ fontSize: 13, color: '#475569' }}>{r.party_size}名</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                              <StatusBadge status={r.status} />
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                {TYPE_LABEL[r.reservation_type] || r.reservation_type}
                              </span>
                              <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                                {r.confirmation_code}
                              </span>
                            </div>
                            {r.notes && (
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.notes}
                              </div>
                            )}
                            {r.customer_phone && (
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                {r.customer_phone}
                              </div>
                            )}
                            <StatusActionButtons reservation={r} onUpdate={handleUpdateStatus} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Event Booking Tab ────────────────────────────────────────────── */}
      {tab === 'event-booking' && (
        <KioskEventBooking storeId={storeId} />
      )}

      {/* ── Events Tab ───────────────────────────────────────────────────── */}
      {tab === 'events' && (
        <div>
          <div style={s.eventListHeader}>
            <span style={s.sectionTitle}>イベント一覧</span>
            <button style={s.primaryBtn} onClick={handleOpenCreateEvent}>＋ 新規作成</button>
          </div>

          {eventsLoading && (
            <div style={{ textAlign: 'center', color: '#999', padding: 40, fontSize: 14 }}>読み込み中...</div>
          )}
          {!eventsLoading && eventsError && (
            <div style={{ textAlign: 'center', color: '#dc2626', padding: 20, fontSize: 13 }}>{eventsError}</div>
          )}
          {!eventsLoading && !eventsError && events.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', fontSize: 14 }}>
              イベントがありません。「新規作成」から追加してください。
            </div>
          )}
          {!eventsLoading && !eventsError && events.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map(ev => (
                <div
                  key={ev.id}
                  style={s.eventCard}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{ev.title}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        padding: '1px 7px', borderRadius: 4,
                        background: ev.status === 'published' ? '#10b98118' : '#94a3b818',
                        color: ev.status === 'published' ? '#10b981' : '#94a3b8',
                      }}>
                        {EVENT_STATUS_LABEL[ev.status] || ev.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 2 }}>
                      {formatEventDateTime(ev.starts_at)} 〜 {formatEventDateTime(ev.ends_at)}
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b' }}>
                      <span>定員: {ev.capacity}名</span>
                      {ev.price != null && <span>参加費: {ev.price.toLocaleString()}円</span>}
                    </div>
                    {ev.description && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', marginLeft: 12 }}>
                    <button
                      style={s.editBtn}
                      onClick={() => handleOpenEditEvent(ev)}
                    >
                      編集
                    </button>
                    {deleteConfirmId === ev.id ? (
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button
                          style={{ ...s.dangerBtn, fontSize: 11 }}
                          onClick={() => handleDeleteEvent(ev.id)}
                          disabled={deletingId === ev.id}
                        >
                          {deletingId === ev.id ? '削除中' : '削除確認'}
                        </button>
                        <button
                          style={{ ...s.cancelBtn, fontSize: 11, padding: '4px 8px' }}
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          戻る
                        </button>
                      </div>
                    ) : (
                      <button
                        style={{ ...s.dangerBtnOutline }}
                        onClick={() => setDeleteConfirmId(ev.id)}
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Event Form Modal ─────────────────────────────────────────────── */}
      {showEventModal && (
        <EventFormModal
          initial={initialFormForEdit}
          onSave={handleSaveEvent}
          onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
          saving={eventFormSaving}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  // Tabs
  tabBar: {
    display: 'flex',
    gap: 0,
    marginBottom: 20,
    borderBottom: '2px solid #e8ecf4',
  },
  tabBtn: {
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    color: '#888',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -2,
    fontFamily: 'sans-serif',
  },
  tabBtnActive: {
    color: '#4f8ef7',
    borderBottom: '2px solid #4f8ef7',
  },

  // Calendar
  calendarWrap: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '16px',
    marginBottom: 8,
  },
  calendarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#222',
    flex: 1,
    textAlign: 'center',
  },
  navBtn: {
    background: '#fff',
    border: '1px solid #d0d7e2',
    borderRadius: 6,
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: 18,
    color: '#555',
    fontFamily: 'sans-serif',
  },
  todayBtn: {
    background: '#f0f4ff',
    border: '1px solid #c7d4f0',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#4f8ef7',
    fontFamily: 'sans-serif',
  },
  weekdayRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    marginBottom: 4,
  },
  weekdayCell: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 0',
  },
  dayGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 3,
  },
  dayCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 8,
    cursor: 'pointer',
    padding: '4px 2px',
    transition: 'background 0.1s',
  },
  emptyCell: {
    minHeight: 52,
    borderRadius: 8,
    background: 'transparent',
  },

  // Day header
  dayHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dayHeaderTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#333',
  },
  todayBadge: {
    background: '#4f8ef7',
    color: '#fff',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 11,
    fontWeight: 600,
  },
  countBadge: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: 600,
  },

  // Events tab
  eventListHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#333',
  },
  eventCard: {
    display: 'flex',
    alignItems: 'flex-start',
    background: '#fff',
    borderRadius: 10,
    padding: '14px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1px solid #e8ecf4',
  },

  // Buttons
  primaryBtn: {
    background: '#4f8ef7',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
  cancelBtn: {
    background: '#fff',
    color: '#555',
    border: '1px solid #d0d7e2',
    borderRadius: 7,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
  editBtn: {
    background: '#f0f4ff',
    color: '#4f8ef7',
    border: '1px solid #c7d4f0',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
  dangerBtn: {
    background: '#c0392b',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
  dangerBtnOutline: {
    background: '#fff',
    color: '#c0392b',
    border: '1px solid #c0392b',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 18,
    padding: '0 4px',
    fontFamily: 'sans-serif',
  },

  // Modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalBox: {
    background: '#fff',
    borderRadius: 14,
    padding: '24px',
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#222',
  },

  // Form
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#555',
  },
  required: {
    color: '#dc2626',
  },
  input: {
    fontSize: 14,
    padding: '8px 10px',
    border: '1px solid #d0d7e2',
    borderRadius: 7,
    color: '#222',
    background: '#fafbfc',
    outline: 'none',
    fontFamily: 'sans-serif',
    width: '100%',
    boxSizing: 'border-box',
  },

  // Form schema builder
  schemaFieldCard: {
    background: '#f8fafc',
    border: '1px solid #e8ecf4',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 8,
  },
  schemaRemoveBtn: {
    background: 'none',
    border: '1px solid #e0b0b0',
    color: '#c0392b',
    borderRadius: 5,
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'sans-serif',
  },
  schemaAddBtn: {
    background: '#f0f4ff',
    color: '#4f8ef7',
    border: '1px dashed #c7d4f0',
    borderRadius: 8,
    padding: '8px 0',
    width: '100%',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'sans-serif',
  },
};
