/**
 * イベント予約管理ページ (admin)
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import type { ReservationEvent, ReservationRow } from '../../types/api';
import {
  cardStyle,
  inputStyle,
  FieldRow,
  ModalOverlay,
  TabBar,
  formatDateTime,
} from './_ui';

type Tab = 'events' | 'reservations';

export default function ReservationEventPage() {
  const { selectedStore } = useAuth();
  const [tab, setTab] = useState<Tab>('events');

  if (!selectedStore) return <div className="loading">店舗を選択してください</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>🎉 イベント予約</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
        貸切パーティ、ライブ、ワイン会などの単発イベント予約。
      </p>

      <TabBar
        tabs={[
          { id: 'events', label: 'イベント一覧' },
          { id: 'reservations', label: '予約一覧' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'events' && <EventsTab storeId={selectedStore.id} />}
      {tab === 'reservations' && <ReservationsTab storeId={selectedStore.id} />}
    </div>
  );
}

const STATUS_DOT_COLOR: Record<ReservationEvent['status'], string> = {
  published: '#16a34a',
  draft: '#94a3b8',
  cancelled: '#dc2626',
  completed: '#0ea5e9',
};

const STATUS_LABEL: Record<ReservationEvent['status'], string> = {
  published: '公開中',
  draft: '下書き',
  cancelled: '中止',
  completed: '終了',
};

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function EventCalendarView({ events }: { events: ReservationEvent[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // Build calendar grid: weeks rows, each with 7 days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Start grid on Sunday of the week containing firstDay
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);
  while (cursor <= lastDay || cursor.getDay() !== 0) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor > lastDay && cursor.getDay() === 0) break;
  }

  const eventsOnDate = (date: Date): ReservationEvent[] =>
    events.filter(e => isSameDay(new Date(e.starts_at), date));

  const selectedEvents = selectedDate ? eventsOnDate(selectedDate) : [];

  const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button
          onClick={prevMonth}
          style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 14 }}
        >
          ‹
        </button>
        <span style={{ fontWeight: 600, fontSize: 16, minWidth: 100, textAlign: 'center' }}>
          {year}年{month + 1}月
        </span>
        <button
          onClick={nextMonth}
          style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 14 }}
        >
          ›
        </button>
      </div>

      {/* Calendar grid */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {/* Day-of-week header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          {DAY_LABELS.map((label, i) => (
            <div
              key={label}
              style={{
                textAlign: 'center',
                padding: '6px 0',
                fontSize: 12,
                fontWeight: 600,
                color: i === 0 ? '#ef4444' : i === 6 ? '#0ea5e9' : '#64748b',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div
            key={wi}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: wi < weeks.length - 1 ? '1px solid #e2e8f0' : 'none' }}
          >
            {week.map((date, di) => {
              const inMonth = date.getMonth() === month;
              const isToday = isSameDay(date, today);
              const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
              const dayEvents = eventsOnDate(date);
              const hasEvents = dayEvents.length > 0;

              return (
                <div
                  key={di}
                  onClick={() => hasEvents ? setSelectedDate(isSelected ? null : date) : undefined}
                  style={{
                    minHeight: 80,
                    padding: '4px 6px',
                    background: isSelected ? '#eff6ff' : '#fff',
                    borderRight: di < 6 ? '1px solid #e2e8f0' : 'none',
                    cursor: hasEvents ? 'pointer' : 'default',
                    opacity: inMonth ? 1 : 0.35,
                    position: 'relative',
                  }}
                >
                  {/* Date number */}
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      fontSize: 12,
                      fontWeight: isToday ? 700 : 400,
                      background: isToday ? '#0ea5e9' : 'transparent',
                      color: isToday ? '#fff' : di === 0 ? '#ef4444' : di === 6 ? '#0ea5e9' : '#1e293b',
                      marginBottom: 4,
                    }}
                  >
                    {date.getDate()}
                  </div>

                  {/* Event chips (up to 3, rest as +N) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {dayEvents.slice(0, 2).map(ev => (
                      <div
                        key={ev.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          background: '#f1f5f9',
                          borderRadius: 4,
                          padding: '1px 4px',
                          overflow: 'hidden',
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT_COLOR[ev.status], flexShrink: 0 }} />
                        <span style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155' }}>
                          {ev.title}
                        </span>
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div style={{ fontSize: 10, color: '#0ea5e9', paddingLeft: 2 }}>+{dayEvents.length - 2}件</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected date detail panel */}
      {selectedDate && selectedEvents.length > 0 && (
        <div style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#0f172a' }}>
            {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日のイベント
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedEvents.map(ev => (
              <div
                key={ev.id}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, borderLeft: `3px solid ${STATUS_DOT_COLOR[ev.status]}` }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                    {ev.title}
                    <span style={{ marginLeft: 8, fontSize: 11, color: STATUS_DOT_COLOR[ev.status] }}>
                      {STATUS_LABEL[ev.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {formatDateTime(ev.starts_at)} — {formatDateTime(ev.ends_at)}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    定員 {ev.capacity}名
                    {ev.price != null && ` / ¥${ev.price.toLocaleString()}`}
                  </div>
                  {ev.description && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{ev.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventsTab({ storeId }: { storeId: string }) {
  const [events, setEvents] = useState<ReservationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listReservationEvents(storeId);
      setEvents(r.events);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (id: string) => {
    if (!confirm('削除しますか?')) return;
    await api.deleteReservationEvent(storeId, id);
    await load();
  };

  const onStatusChange = async (id: string, status: ReservationEvent['status']) => {
    await api.updateReservationEvent(storeId, id, { status });
    await load();
  };

  if (loading) return <div>読み込み中...</div>;

  return (
    <div>
      {/* Toolbar: view toggle + add button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
          <button
            onClick={() => setViewMode('calendar')}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRight: '1px solid #e2e8f0',
              background: viewMode === 'calendar' ? '#0ea5e9' : '#f8fafc',
              color: viewMode === 'calendar' ? '#fff' : '#64748b',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: viewMode === 'calendar' ? 600 : 400,
            }}
          >
            カレンダー
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '6px 14px',
              border: 'none',
              background: viewMode === 'list' ? '#0ea5e9' : '#f8fafc',
              color: viewMode === 'list' ? '#fff' : '#64748b',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: viewMode === 'list' ? 600 : 400,
            }}
          >
            リスト
          </button>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ marginLeft: 'auto', padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          + イベント追加
        </button>
      </div>

      {viewMode === 'calendar' && (
        <EventCalendarView events={events} />
      )}

      {viewMode === 'list' && (
        <>
          {events.length === 0 && (
            <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
              イベントがまだありません
            </div>
          )}

          <div style={{ display: 'grid', gap: 8 }}>
            {events.map((e) => (
              <div key={e.id} style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {e.title}
                    <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: e.status === 'published' ? '#dcfce7' : '#f1f5f9', color: e.status === 'published' ? '#166534' : '#475569' }}>
                      {e.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    {formatDateTime(e.starts_at)} — {formatDateTime(e.ends_at)}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    定員 {e.capacity}名
                    {e.price != null && ` / ¥${e.price.toLocaleString()}`}
                  </div>
                  {e.description && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{e.description}</div>
                  )}
                </div>
                <select
                  value={e.status}
                  onChange={(ev) => onStatusChange(e.id, ev.target.value as ReservationEvent['status'])}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                >
                  <option value="draft">下書き</option>
                  <option value="published">公開中</option>
                  <option value="cancelled">中止</option>
                  <option value="completed">終了</option>
                </select>
                <button onClick={() => onDelete(e.id)} style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                  削除
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {showCreate && (
        <EventCreateModal
          storeId={storeId}
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await load(); }}
        />
      )}
    </div>
  );
}

function EventCreateModal({
  storeId, onClose, onCreated,
}: { storeId: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [capacity, setCapacity] = useState(20);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.createReservationEvent(storeId, {
        title,
        description: description || null,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        capacity,
        price: price ? Number(price) : null,
        image_url: null,
        status: 'published',
        sort_order: 0,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{ margin: 0, marginBottom: 16 }}>イベント追加</h3>
      <FieldRow label="タイトル">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="説明">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} />
      </FieldRow>
      <FieldRow label="開始日時">
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="終了日時">
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="定員">
        <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} style={inputStyle} />
      </FieldRow>
      <FieldRow label="参考価格 (円・任意)">
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle} />
      </FieldRow>
      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          キャンセル
        </button>
        <button onClick={submit} disabled={saving || !title || !startsAt || !endsAt} style={{ padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </ModalOverlay>
  );
}

function ReservationsTab({ storeId }: { storeId: string }) {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listEventReservations(storeId);
      setReservations(r.reservations);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const onCancel = async (id: string) => {
    if (!confirm('この予約をキャンセルしますか?')) return;
    await api.cancelEventReservation(storeId, id);
    await load();
  };

  if (loading) return <div>読み込み中...</div>;

  return (
    <div>
      {reservations.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          予約がまだありません
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {reservations.map((r) => (
          <div key={r.id} style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {r.customer_name} ({r.party_size}名)
                <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: r.status === 'cancelled' ? '#fee2e2' : '#dbeafe', color: r.status === 'cancelled' ? '#dc2626' : '#1e40af' }}>
                  {r.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {formatDateTime(r.starts_at)} — {r.confirmation_code}
              </div>
              {(r.metadata as { event_title?: string })?.event_title && (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>イベント: {(r.metadata as { event_title?: string }).event_title}</div>
              )}
            </div>
            {r.status !== 'cancelled' && (
              <button onClick={() => onCancel(r.id)} style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                キャンセル
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
