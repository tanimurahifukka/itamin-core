/**
 * Kiosk reservation page — single-page layout with calendar, event management,
 * and participant tracking all on one screen.
 */
import { useCallback, useEffect, useState } from 'react';
import { kioskApi } from '../api/kioskClient';
import type { EventFormField } from '../api/kioskClient';

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

interface DayItem {
  id: string;
  name: string;
  type: string;
  time: string;
  isEvent?: boolean;
  children?: { id: string; name: string }[];
}

interface DayData {
  count: number;
  types: string[];
  items: DayItem[];
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
  pending: '未来店',
  confirmed: '未来店',
  seated: '来店',
  completed: '来店',
  no_show: '未来店',
  cancelled: 'キャンセル',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#f59e0b',
  seated: '#16a34a',
  completed: '#16a34a',
  no_show: '#f59e0b',
  cancelled: '#dc2626',
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

function getDominantType(types: string[]): string {
  return types[0] || 'table';
}

function eventMatchesDate(ev: KioskEvent, dateStr: string): boolean {
  const d = new Date(ev.starts_at);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const evDate = jst.toISOString().split('T')[0];
  return evDate === dateStr;
}

function formatJstTime(iso: string): string {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
}

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

  // Not yet visited → mark as visited
  if (['pending', 'confirmed', 'no_show'].includes(status)) {
    buttons.push({ label: '来店', nextStatus: 'seated', color: '#16a34a' });
  }
  // Visited → revert to not visited
  if (['seated', 'completed'].includes(status)) {
    buttons.push({ label: '未来店に戻す', nextStatus: 'confirmed', color: '#f59e0b' });
  }
  // Cancel (from any non-cancelled status)
  if (status !== 'cancelled') {
    buttons.push({ label: 'キャンセル', nextStatus: 'cancelled', color: '#dc2626' });
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
  events,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  onToday,
  onEventClick,
  onReservationClick,
}: {
  year: number;
  month: number;
  today: string;
  selectedDay: string | null;
  dayData: Record<string, DayData>;
  events: KioskEvent[];
  onSelectDay: (d: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onEventClick: (event: KioskEvent) => void;
  onReservationClick: (dateStr: string, reservationId: string) => void;
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

          const items = data?.items || [];
          // Count total visible rows (event + its children count as 1 + N)
          let visibleRows = 0;
          const maxRows = 3;
          const visibleItems: DayItem[] = [];
          let totalRows = 0;
          for (const item of items) {
            const childCount = item.children?.length || 0;
            const rowsNeeded = 1 + childCount;
            totalRows += rowsNeeded;
            if (visibleRows + rowsNeeded <= maxRows) {
              visibleItems.push(item);
              visibleRows += rowsNeeded;
            } else if (visibleRows < maxRows) {
              // Partially show: event title only, truncate children
              visibleItems.push({ ...item, children: item.children?.slice(0, maxRows - visibleRows - 1) });
              visibleRows = maxRows;
            }
          }
          const extraCount = totalRows - visibleRows;

          return (
            <div
              key={dateStr}
              onClick={() => onSelectDay(dateStr)}
              style={{
                ...s.dayCell,
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                padding: '2px',
                minHeight: 72,
                background: isSelected ? '#4f8ef7' : isToday ? '#e8f0fe' : '#fff',
                color: isSelected ? '#fff' : weekday === 0 ? '#ef4444' : weekday === 6 ? '#3b82f6' : '#222',
                border: isToday && !isSelected ? '2px solid #4f8ef7' : '1px solid #e8ecf4',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1px 3px', marginBottom: 1 }}>
                <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 400 }}>{dayNum}</span>
                {data && data.count > 0 && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: 10,
                    background: isSelected
                      ? 'rgba(255,255,255,0.3)'
                      : `${TYPE_COLOR[getDominantType(data.types)] || '#4f8ef7'}22`,
                    color: isSelected
                      ? '#fff'
                      : TYPE_COLOR[getDominantType(data.types)] || '#4f8ef7',
                  }}>
                    {data.count}
                  </span>
                )}
              </div>
              {visibleItems.map(item => {
                const dotColor = item.isEvent ? '#10b981' : TYPE_COLOR[item.type] || '#4f8ef7';
                const bgColor = isSelected ? 'rgba(255,255,255,0.18)' : `${dotColor}18`;
                const textColor = isSelected ? '#fff' : dotColor;
                return (
                  <div key={item.id}>
                    {/* Parent item row */}
                    <div
                      onClick={e => {
                        e.stopPropagation();
                        if (item.isEvent) {
                          const ev = events.find(ev => ev.id === item.id);
                          if (ev) onEventClick(ev);
                        } else {
                          onReservationClick(dateStr, item.id);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        fontSize: 10,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                        borderRadius: 3,
                        padding: '1px 3px',
                        marginBottom: 0,
                        background: bgColor,
                        color: textColor,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ flexShrink: 0, fontSize: 8 }}>●</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.time} {item.name}
                      </span>
                    </div>
                    {/* Nested children (event reservations) */}
                    {item.children && item.children.length > 0 && item.children.map(child => (
                      <div
                        key={child.id}
                        onClick={e => {
                          e.stopPropagation();
                          onReservationClick(dateStr, child.id);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: 9,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '100%',
                          borderRadius: 2,
                          padding: '0px 3px 0px 10px',
                          marginBottom: 0,
                          background: isSelected ? 'rgba(255,255,255,0.10)' : `${dotColor}0a`,
                          color: isSelected ? 'rgba(255,255,255,0.85)' : '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ flexShrink: 0, fontSize: 7 }}>└</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {child.name}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {extraCount > 0 && (
                <div style={{
                  fontSize: 9,
                  color: isSelected ? 'rgba(255,255,255,0.8)' : '#94a3b8',
                  padding: '0 3px',
                }}>
                  +{extraCount}件
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inline Event Form ────────────────────────────────────────────────────────

interface InlineEventFormProps {
  selectedDay: string;
  initial?: {
    title: string;
    startTime: string;
    endTime: string;
    capacity: string;
    price: string;
    status: string;
  };
  saving: boolean;
  onSave: (data: { title: string; startTime: string; endTime: string; capacity: string; price: string; status: string }) => void;
  onCancel: () => void;
}

function InlineEventForm({ selectedDay, initial, saving, onSave, onCancel }: InlineEventFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startTime, setStartTime] = useState(initial?.startTime ?? '');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '');
  const [capacity, setCapacity] = useState(initial?.capacity ?? '');
  const [price, setPrice] = useState(initial?.price ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'draft');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, startTime, endTime, capacity, price, status });
  };

  return (
    <form onSubmit={handleSubmit} style={s.inlineForm}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
        {selectedDay} のイベントを{initial ? '編集' : '作成'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 160px' }}>
          <div style={s.fieldLabel}>イベント名 <span style={s.required}>*</span></div>
          <input
            style={s.input}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例: キッズ体験"
            required
          />
        </div>
        <div style={{ flex: '1 1 100px' }}>
          <div style={s.fieldLabel}>開始時間 <span style={s.required}>*</span></div>
          <input
            style={s.input}
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            required
          />
        </div>
        <div style={{ flex: '1 1 100px' }}>
          <div style={s.fieldLabel}>終了時間 <span style={s.required}>*</span></div>
          <input
            style={s.input}
            type="time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            required
          />
        </div>
        <div style={{ flex: '1 1 80px' }}>
          <div style={s.fieldLabel}>定員 <span style={s.required}>*</span></div>
          <input
            style={s.input}
            type="number"
            min={1}
            value={capacity}
            onChange={e => setCapacity(e.target.value)}
            placeholder="例: 20"
            required
          />
        </div>
        <div style={{ flex: '1 1 90px' }}>
          <div style={s.fieldLabel}>参加費（円）</div>
          <input
            style={s.input}
            type="number"
            min={0}
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="0"
          />
        </div>
        <div style={{ flex: '1 1 90px' }}>
          <div style={s.fieldLabel}>ステータス</div>
          <select style={s.input} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="draft">下書き</option>
            <option value="published">公開中</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 1 }}>
          <button type="submit" style={s.primaryBtn} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
          <button type="button" style={s.cancelBtn} onClick={onCancel} disabled={saving}>
            キャンセル
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Inline Participant Form ──────────────────────────────────────────────────

interface InlineParticipantFormProps {
  event: KioskEvent;
  responses: Record<string, unknown>;
  booking: boolean;
  onChangeResponse: (key: string, value: unknown) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function InlineParticipantForm({
  event,
  responses,
  booking,
  onChangeResponse,
  onSubmit,
  onCancel,
}: InlineParticipantFormProps) {
  const schema = event.form_schema && event.form_schema.length > 0
    ? event.form_schema
    : [
        { key: 'name', label: '名前', type: 'text' as const, required: true },
        { key: 'party_size', label: '人数', type: 'number' as const, required: true },
      ];

  return (
    <div style={s.participantForm}>
      <div style={{ fontSize: 12, color: '#475569', fontWeight: 600, marginBottom: 8 }}>参加者追加</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {schema.map(field => (
          <div key={field.key} style={{ flex: '1 1 120px' }}>
            <div style={s.fieldLabel}>
              {field.label}
              {field.required && <span style={s.required}> *</span>}
            </div>
            {field.type === 'select' ? (
              <select
                style={s.input}
                value={String(responses[field.key] ?? '')}
                onChange={e => onChangeResponse(field.key, e.target.value)}
              >
                <option value="">選択...</option>
                {(field.options || []).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                style={{ ...s.input, minHeight: 60, resize: 'vertical' }}
                value={String(responses[field.key] ?? '')}
                onChange={e => onChangeResponse(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            ) : field.type === 'checkbox' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(responses[field.key])}
                  onChange={e => onChangeResponse(field.key, e.target.checked)}
                />
                {field.label}
              </label>
            ) : (
              <input
                style={s.input}
                type={field.type === 'number' ? 'number' : 'text'}
                value={String(responses[field.key] ?? '')}
                onChange={e => onChangeResponse(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                placeholder={field.placeholder}
              />
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, paddingBottom: 1 }}>
          <button
            style={s.primaryBtn}
            onClick={onSubmit}
            disabled={booking}
          >
            {booking ? '追加中...' : '追加'}
          </button>
          <button style={s.cancelBtn} onClick={onCancel} disabled={booking}>
            キャンセル
          </button>
        </div>
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

  // Inline event form state
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<KioskEvent | null>(null);
  const [eventFormSaving, setEventFormSaving] = useState(false);

  // Inline participant form state
  const [addingParticipantEventId, setAddingParticipantEventId] = useState<string | null>(null);
  const [participantResponses, setParticipantResponses] = useState<Record<string, unknown>>({});
  const [bookingEvent, setBookingEvent] = useState(false);

  // Delete confirmation state
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
    loadEvents();
  }, [loadEvents]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectDay = (dateStr: string) => {
    setSelectedDay(dateStr);
    setCreatingEvent(false);
    setEditingEvent(null);
    setAddingParticipantEventId(null);
    setParticipantResponses({});
    setDeleteConfirmId(null);
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

  const handleCalendarEventClick = (ev: KioskEvent) => {
    // Clicking an event in the calendar → scroll to the day section (just select the day)
    const d = new Date(ev.starts_at);
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const evDate = jst.toISOString().split('T')[0];
    setSelectedDay(evDate);
  };

  const handleCalendarReservationClick = (dateStr: string) => {
    setSelectedDay(dateStr);
  };

  const handleSaveEvent = async (data: {
    title: string; startTime: string; endTime: string;
    capacity: string; price: string; status: string;
  }) => {
    if (!selectedDay) return;
    const title = data.title.trim();
    if (!title) { showMsg('タイトルを入力してください', 'error'); return; }
    if (!data.startTime || !data.endTime) { showMsg('開始時間・終了時間を入力してください', 'error'); return; }

    const starts_at = `${selectedDay}T${data.startTime}:00+09:00`;
    const ends_at = `${selectedDay}T${data.endTime}:00+09:00`;

    if (new Date(ends_at) <= new Date(starts_at)) {
      showMsg('終了時間は開始時間より後にしてください', 'error');
      return;
    }

    const cap = parseInt(data.capacity, 10);
    if (isNaN(cap) || cap < 1) { showMsg('定員は1以上を入力してください', 'error'); return; }

    const parsedPrice = data.price === '' ? null : Number(data.price);
    if (parsedPrice != null && (!Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedPrice))) {
      showMsg('参加費は0以上の整数で入力してください', 'error');
      return;
    }

    // Default form schema: name + party_size
    const defaultSchema: EventFormField[] = [
      { key: 'name', label: '名前', type: 'text', required: true },
      { key: 'party_size', label: '人数', type: 'number', required: true },
    ];

    setEventFormSaving(true);
    try {
      const payload = {
        title,
        description: null,
        starts_at,
        ends_at,
        capacity: cap,
        price: parsedPrice,
        status: data.status,
        form_schema: editingEvent?.form_schema && editingEvent.form_schema.length > 0
          ? editingEvent.form_schema
          : defaultSchema,
      };

      if (editingEvent) {
        await kioskApi.updateEvent(storeId, editingEvent.id, payload);
        showMsg('イベントを更新しました', 'success');
      } else {
        await kioskApi.createEvent(storeId, payload);
        showMsg('イベントを作成しました', 'success');
      }

      setCreatingEvent(false);
      setEditingEvent(null);
      await Promise.all([
        loadEvents(),
        loadMonthly(calYear, calMonth),
      ]);
    } catch (e) {
      showMsg(e instanceof Error ? e.message : 'イベントの保存に失敗しました', 'error');
    } finally {
      setEventFormSaving(false);
    }
  };

  const handleToggleEventStatus = async (ev: KioskEvent) => {
    const newStatus = ev.status === 'published' ? 'draft' : 'published';
    try {
      await kioskApi.updateEvent(storeId, ev.id, { status: newStatus });
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, status: newStatus } : e));
      showMsg(newStatus === 'published' ? 'イベントを公開しました' : 'イベントを下書きに戻しました', 'success');
    } catch {
      showMsg('ステータスの更新に失敗しました', 'error');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setDeletingId(eventId);
    try {
      await kioskApi.deleteEvent(storeId, eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setDeleteConfirmId(null);
      showMsg('イベントを削除しました', 'success');
      loadMonthly(calYear, calMonth);
    } catch {
      showMsg('イベントの削除に失敗しました', 'error');
      setDeleteConfirmId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBookParticipant = async (eventId: string) => {
    setBookingEvent(true);
    try {
      await kioskApi.bookEvent(storeId, eventId, { responses: participantResponses });
      setAddingParticipantEventId(null);
      setParticipantResponses({});
      showMsg('参加者を追加しました', 'success');
      if (selectedDay) {
        await loadDayReservations(selectedDay);
        await loadMonthly(calYear, calMonth);
      }
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '参加者の追加に失敗しました', 'error');
    } finally {
      setBookingEvent(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const dayEvents = selectedDay
    ? events.filter(ev => eventMatchesDate(ev, selectedDay))
    : [];

  const nonEventReservations = reservations.filter(r => r.reservation_type !== 'event');

  // ── Render ────────────────────────────────────────────────────────────────

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

      {/* ── Calendar ─────────────────────────────────────────────────────── */}
      <CalendarGrid
        year={calYear}
        month={calMonth}
        today={todayStr}
        selectedDay={selectedDay}
        dayData={monthlyData}
        events={events}
        onSelectDay={handleSelectDay}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
        onEventClick={handleCalendarEventClick}
        onReservationClick={handleCalendarReservationClick}
      />
      {monthlyLoading && (
        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginBottom: 8 }}>
          カレンダー更新中...
        </div>
      )}

      {/* ── Selected Day Section ─────────────────────────────────────────── */}
      {selectedDay && (
        <div style={{ marginTop: 20 }}>
          {/* Day header */}
          <div style={s.dayHeader}>
            <span style={s.dayHeaderTitle}>{formatDateLabel(selectedDay)}</span>
            {selectedDay === todayStr && <span style={s.todayBadge}>今日</span>}
            <div style={{ flex: 1 }} />
            <button
              style={s.primaryBtn}
              onClick={() => {
                setCreatingEvent(true);
                setEditingEvent(null);
              }}
              disabled={creatingEvent && !editingEvent}
            >
              ＋ イベント作成
            </button>
          </div>

          {/* Inline event create form */}
          {creatingEvent && !editingEvent && (
            <InlineEventForm
              selectedDay={selectedDay}
              saving={eventFormSaving}
              onSave={handleSaveEvent}
              onCancel={() => setCreatingEvent(false)}
            />
          )}

          {/* Event cards for selected day */}
          {eventsLoading && (
            <div style={{ textAlign: 'center', color: '#999', padding: 20, fontSize: 13 }}>
              イベント読み込み中...
            </div>
          )}
          {!eventsLoading && eventsError && (
            <div style={{ textAlign: 'center', color: '#dc2626', padding: 12, fontSize: 13 }}>
              {eventsError}
            </div>
          )}

          {dayEvents.map(ev => {
            const participants = reservations.filter(r => r.resource_ref === ev.id);
            const isEditingThis = editingEvent?.id === ev.id;

            return (
              <div key={ev.id} style={s.eventCard}>
                {/* Event edit form (inline) */}
                {isEditingThis ? (
                  <InlineEventForm
                    selectedDay={selectedDay}
                    initial={{
                      title: ev.title,
                      startTime: formatJstTime(ev.starts_at),
                      endTime: formatJstTime(ev.ends_at),
                      capacity: String(ev.capacity),
                      price: ev.price != null ? String(ev.price) : '',
                      status: ev.status,
                    }}
                    saving={eventFormSaving}
                    onSave={handleSaveEvent}
                    onCancel={() => { setEditingEvent(null); setCreatingEvent(false); }}
                  />
                ) : (
                  <>
                    {/* Event header row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{ev.title}</span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {formatJstTime(ev.starts_at)}〜{formatJstTime(ev.ends_at)}
                      </span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>定員{ev.capacity}名</span>
                      {ev.price != null && (
                        <span style={{ fontSize: 12, color: '#64748b' }}>{ev.price.toLocaleString()}円</span>
                      )}
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        padding: '1px 7px', borderRadius: 4,
                        background: ev.status === 'published' ? '#10b98118' : '#94a3b818',
                        color: ev.status === 'published' ? '#10b981' : '#94a3b8',
                      }}>
                        {EVENT_STATUS_LABEL[ev.status] || ev.status}
                      </span>
                    </div>

                    {/* Event action buttons */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      <button
                        style={s.editBtn}
                        onClick={() => {
                          setEditingEvent(ev);
                          setCreatingEvent(false);
                        }}
                      >
                        編集
                      </button>
                      <button
                        style={{
                          ...s.editBtn,
                          background: ev.status === 'published' ? '#fef9c3' : '#dbeafe',
                          color: ev.status === 'published' ? '#a16207' : '#2563eb',
                          border: `1px solid ${ev.status === 'published' ? '#fde047' : '#93c5fd'}`,
                        }}
                        onClick={() => handleToggleEventStatus(ev)}
                      >
                        {ev.status === 'published' ? '下書きに戻す' : '公開する'}
                      </button>
                      {deleteConfirmId === ev.id ? (
                        <>
                          <button
                            style={{ ...s.dangerBtn, fontSize: 11, padding: '5px 12px' }}
                            onClick={() => handleDeleteEvent(ev.id)}
                            disabled={deletingId === ev.id}
                          >
                            {deletingId === ev.id ? '削除中' : '削除確認'}
                          </button>
                          <button
                            style={{ ...s.cancelBtn, fontSize: 11, padding: '5px 10px' }}
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            戻る
                          </button>
                        </>
                      ) : (
                        <button
                          style={s.dangerBtnOutline}
                          onClick={() => setDeleteConfirmId(ev.id)}
                        >
                          削除
                        </button>
                      )}
                    </div>

                    {/* Participants */}
                    {participants.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        {participants.map(r => {
                          const isPast = new Date(r.ends_at) < nowDate;
                          const isUpdating = updatingId === r.id;
                          return (
                            <div
                              key={r.id}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                padding: '10px 12px',
                                marginBottom: 6,
                                background: isPast ? '#f8fafc' : '#f0f4ff',
                                borderRadius: 8,
                                borderLeft: `3px solid ${STATUS_COLOR[r.status] || '#94a3b8'}`,
                                opacity: isPast ? 0.65 : isUpdating ? 0.7 : 1,
                              }}
                            >
                              <span style={{ fontSize: 13 }}>└</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                                    {r.customer_name}
                                  </span>
                                  <span style={{ fontSize: 12, color: '#64748b' }}>{r.party_size}名</span>
                                  <StatusBadge status={r.status} />
                                </div>
                                {r.notes && (
                                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{r.notes}</div>
                                )}
                                <StatusActionButtons reservation={r} onUpdate={handleUpdateStatus} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add participant */}
                    {addingParticipantEventId === ev.id ? (
                      <InlineParticipantForm
                        event={ev}
                        responses={participantResponses}
                        booking={bookingEvent}
                        onChangeResponse={(key, value) =>
                          setParticipantResponses(prev => ({ ...prev, [key]: value }))
                        }
                        onSubmit={() => handleBookParticipant(ev.id)}
                        onCancel={() => {
                          setAddingParticipantEventId(null);
                          setParticipantResponses({});
                        }}
                      />
                    ) : (
                      <button
                        style={s.addParticipantBtn}
                        onClick={() => {
                          setAddingParticipantEventId(ev.id);
                          setParticipantResponses({});
                        }}
                      >
                        ＋ 参加者追加
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Non-event reservations */}
          {(resLoading || resError || nonEventReservations.length > 0) && (
            <div style={{ marginTop: dayEvents.length > 0 ? 16 : 0 }}>
              {nonEventReservations.length > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                  その他の予約
                </div>
              )}
              {resLoading && (
                <div style={{ textAlign: 'center', color: '#999', padding: 24, fontSize: 14 }}>読み込み中...</div>
              )}
              {!resLoading && resError && (
                <div style={{ textAlign: 'center', color: '#dc2626', padding: 16, fontSize: 13 }}>{resError}</div>
              )}
              {!resLoading && !resError && nonEventReservations.length === 0 && dayEvents.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0', fontSize: 14 }}>
                  この日の予約はありません
                </div>
              )}
              {!resLoading && !resError && nonEventReservations.map(r => {
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
                      marginBottom: 8,
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
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
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

  // Event card
  eventCard: {
    background: '#fff',
    borderRadius: 10,
    padding: '14px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1px solid #e8ecf4',
    marginBottom: 10,
  },

  // Inline forms
  inlineForm: {
    background: '#f8fafc',
    border: '1px solid #e8ecf4',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 12,
  },
  participantForm: {
    background: '#f0f4ff',
    border: '1px dashed #c7d4f0',
    borderRadius: 8,
    padding: '12px 14px',
    marginTop: 6,
  },

  // Form fields
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#555',
    marginBottom: 3,
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
  addParticipantBtn: {
    background: '#f0fdf4',
    color: '#16a34a',
    border: '1px dashed #86efac',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
};
