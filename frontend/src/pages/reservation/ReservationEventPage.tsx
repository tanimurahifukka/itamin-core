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

function EventsTab({ storeId }: { storeId: string }) {
  const [events, setEvents] = useState<ReservationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

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
      <button
        onClick={() => setShowCreate(true)}
        style={{ marginBottom: 16, padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        + イベント追加
      </button>

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
