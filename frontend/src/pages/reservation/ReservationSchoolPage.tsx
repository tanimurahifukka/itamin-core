/**
 * スクール予約管理ページ (admin)
 * - コース管理
 * - セッション管理 (選択コースに対して)
 * - 受講申込一覧
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import type {
  ReservationRow,
  ReservationSchool,
  ReservationSchoolSession,
} from '../../types/api';
import {
  cardStyle,
  inputStyle,
  FieldRow,
  ModalOverlay,
  TabBar,
  formatDateTime,
} from './_ui';

type Tab = 'courses' | 'reservations';

export default function ReservationSchoolPage() {
  const { selectedStore } = useAuth();
  const [tab, setTab] = useState<Tab>('courses');

  if (!selectedStore) return <div className="loading">店舗を選択してください</div>;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>🎓 スクール予約</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
        料理教室・ヨガなどのコース予約。コースと開催セッションを管理します。
      </p>

      <TabBar
        tabs={[
          { id: 'courses', label: 'コース管理' },
          { id: 'reservations', label: '受講申込' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'courses' && <CoursesTab storeId={selectedStore.id} />}
      {tab === 'reservations' && <ReservationsTab storeId={selectedStore.id} />}
    </div>
  );
}

function CoursesTab({ storeId }: { storeId: string }) {
  const [schools, setSchools] = useState<ReservationSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<ReservationSchool | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listReservationSchools(storeId);
      setSchools(r.schools);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (id: string) => {
    if (!confirm('コースを削除しますか? (セッションも全削除されます)')) return;
    await api.deleteReservationSchool(storeId, id);
    if (selected?.id === id) setSelected(null);
    await load();
  };

  if (loading) return <div>読み込み中...</div>;

  if (selected) {
    return (
      <SessionsView
        storeId={storeId}
        school={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div>
      <button
        onClick={() => setShowCreate(true)}
        style={{ marginBottom: 16, padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        + コース追加
      </button>

      {schools.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          コースがまだありません
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {schools.map((s) => (
          <div key={s.id} style={{ ...cardStyle }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {s.name}
                  {!s.active && <span style={{ marginLeft: 8, fontSize: 11, color: '#ef4444' }}>(非公開)</span>}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  定員 {s.capacity}名
                  {s.instructor && ` / 講師: ${s.instructor}`}
                  {s.price != null && ` / ¥${s.price.toLocaleString()}`}
                </div>
                {s.description && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{s.description}</div>
                )}
              </div>
              <button onClick={() => setSelected(s)} style={{ padding: '6px 12px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                セッション管理
              </button>
              <button onClick={() => onDelete(s.id)} style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <SchoolCreateModal
          storeId={storeId}
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await load(); }}
        />
      )}
    </div>
  );
}

function SchoolCreateModal({
  storeId, onClose, onCreated,
}: { storeId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructor, setInstructor] = useState('');
  const [capacity, setCapacity] = useState(10);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.createReservationSchool(storeId, {
        name,
        description: description || null,
        instructor: instructor || null,
        capacity,
        price: price ? Number(price) : null,
        image_url: null,
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
      <h3 style={{ margin: 0, marginBottom: 16 }}>コース追加</h3>
      <FieldRow label="コース名">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="説明 (任意)">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} />
      </FieldRow>
      <FieldRow label="講師 (任意)">
        <input value={instructor} onChange={(e) => setInstructor(e.target.value)} style={inputStyle} />
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
        <button onClick={submit} disabled={saving || !name} style={{ padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </ModalOverlay>
  );
}

function SessionsView({
  storeId, school, onBack,
}: { storeId: string; school: ReservationSchool; onBack: () => void }) {
  const [sessions, setSessions] = useState<ReservationSchoolSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listSchoolSessions(storeId, school.id);
      setSessions(r.sessions);
    } finally {
      setLoading(false);
    }
  }, [storeId, school.id]);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (id: string) => {
    if (!confirm('セッションを削除しますか?')) return;
    await api.deleteSchoolSession(storeId, id);
    await load();
  };

  return (
    <div>
      <button onClick={onBack} style={{ marginBottom: 12, padding: '6px 12px', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        ← コース一覧に戻る
      </button>
      <h3 style={{ margin: '8px 0' }}>{school.name} のセッション</h3>
      <button
        onClick={() => setShowCreate(true)}
        style={{ marginBottom: 16, padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        + セッション追加
      </button>

      {loading ? <div>読み込み中...</div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {sessions.length === 0 && (
            <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
              セッションがまだありません
            </div>
          )}
          {sessions.map((s) => (
            <div key={s.id} style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {formatDateTime(s.starts_at)} — {formatDateTime(s.ends_at)}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  定員: {s.capacity_override ?? school.capacity}名 / 状態: {s.status}
                </div>
                {s.note && <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.note}</div>}
              </div>
              <button onClick={() => onDelete(s.id)} style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <SessionCreateModal
          storeId={storeId}
          schoolId={school.id}
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await load(); }}
        />
      )}
    </div>
  );
}

function SessionCreateModal({
  storeId, schoolId, onClose, onCreated,
}: { storeId: string; schoolId: string; onClose: () => void; onCreated: () => void }) {
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [capacityOverride, setCapacityOverride] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.createSchoolSession(storeId, schoolId, {
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        capacity_override: capacityOverride ? Number(capacityOverride) : null,
        note: note || null,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{ margin: 0, marginBottom: 16 }}>セッション追加</h3>
      <FieldRow label="開始日時">
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="終了日時">
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="定員上書き (空欄ならコース定員)">
        <input type="number" value={capacityOverride} onChange={(e) => setCapacityOverride(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="備考">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </FieldRow>
      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          キャンセル
        </button>
        <button onClick={submit} disabled={saving || !startsAt || !endsAt} style={{ padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
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
      const r = await api.listSchoolReservations(storeId);
      setReservations(r.reservations);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const onCancel = async (id: string) => {
    if (!confirm('この申込をキャンセルしますか?')) return;
    await api.cancelSchoolReservation(storeId, id);
    await load();
  };

  if (loading) return <div>読み込み中...</div>;

  return (
    <div>
      {reservations.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          申込がまだありません
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
              {(r.metadata as { school_name?: string })?.school_name && (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>コース: {(r.metadata as { school_name?: string }).school_name}</div>
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
