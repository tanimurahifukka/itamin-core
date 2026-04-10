/**
 * 時間帯予約管理ページ (admin)
 * - スロット定義 (曜日 × 時間帯 × 定員)
 * - 予約一覧
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import type { ReservationRow, ReservationTimeslot } from '../../types/api';
import {
  cardStyle,
  inputStyle,
  FieldRow,
  ModalOverlay,
  TabBar,
  formatDateTime,
} from './_ui';

type Tab = 'slots' | 'reservations';

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function dowLabel(d: number): string {
  if (d === -1) return '毎日';
  return DOW_LABELS[d] || '?';
}

export default function ReservationTimeslotPage() {
  const { selectedStore } = useAuth();
  const [tab, setTab] = useState<Tab>('slots');

  if (!selectedStore) return <div className="loading">店舗を選択してください</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>⏰ 時間帯予約</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
        ランチ枠・ディナー枠など、時間帯ごとに定員ベースで予約を受け付けます。
      </p>

      <TabBar
        tabs={[
          { id: 'slots', label: 'スロット管理' },
          { id: 'reservations', label: '予約一覧' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'slots' && <SlotsTab storeId={selectedStore.id} />}
      {tab === 'reservations' && <ReservationsTab storeId={selectedStore.id} />}
    </div>
  );
}

function SlotsTab({ storeId }: { storeId: string }) {
  const [slots, setSlots] = useState<ReservationTimeslot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listReservationTimeslots(storeId);
      setSlots(r.timeslots);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (id: string) => {
    if (!confirm('削除しますか?')) return;
    await api.deleteReservationTimeslot(storeId, id);
    await load();
  };

  const onToggle = async (s: ReservationTimeslot) => {
    await api.updateReservationTimeslot(storeId, s.id, { active: !s.active });
    await load();
  };

  if (loading) return <div>読み込み中...</div>;

  return (
    <div>
      <button
        onClick={() => setShowModal(true)}
        style={{ marginBottom: 16, padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        + スロット追加
      </button>

      {slots.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          スロットがまだありません
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {slots.map((s) => (
          <div key={s.id} style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {s.name}
                {!s.active && <span style={{ marginLeft: 8, fontSize: 11, color: '#ef4444' }}>(非公開)</span>}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                {dowLabel(s.day_of_week)} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} / 定員 {s.capacity}
                {s.price != null && ` / ¥${s.price.toLocaleString()}`}
              </div>
              {s.description && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{s.description}</div>
              )}
            </div>
            <button onClick={() => onToggle(s)} style={{ padding: '6px 12px', background: s.active ? '#f1f5f9' : '#dcfce7', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              {s.active ? '非公開にする' : '公開する'}
            </button>
            <button onClick={() => onDelete(s.id)} style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              削除
            </button>
          </div>
        ))}
      </div>

      {showModal && (
        <SlotCreateModal
          storeId={storeId}
          onClose={() => setShowModal(false)}
          onCreated={async () => { setShowModal(false); await load(); }}
        />
      )}
    </div>
  );
}

function SlotCreateModal({
  storeId, onClose, onCreated,
}: { storeId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dow, setDow] = useState(-1);
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('14:00');
  const [capacity, setCapacity] = useState(20);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.createReservationTimeslot(storeId, {
        name,
        description: description || null,
        day_of_week: dow,
        start_time: startTime,
        end_time: endTime,
        capacity,
        price: price ? Number(price) : null,
        active: true,
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
      <h3 style={{ margin: 0, marginBottom: 16 }}>スロット追加</h3>
      <FieldRow label="名前">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="ランチA" />
      </FieldRow>
      <FieldRow label="説明 (任意)">
        <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="曜日">
        <select value={dow} onChange={(e) => setDow(Number(e.target.value))} style={inputStyle}>
          <option value={-1}>毎日</option>
          {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}曜</option>)}
        </select>
      </FieldRow>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldRow label="開始">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
          </FieldRow>
        </div>
        <div style={{ flex: 1 }}>
          <FieldRow label="終了">
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
          </FieldRow>
        </div>
      </div>
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
        <button onClick={submit} disabled={saving || !name} style={{ padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
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
      const r = await api.listTimeslotReservations(storeId);
      setReservations(r.reservations);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const onCancel = async (id: string) => {
    if (!confirm('この予約をキャンセルしますか?')) return;
    await api.cancelTimeslotReservation(storeId, id);
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
              {r.customer_email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.customer_email}</div>}
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
