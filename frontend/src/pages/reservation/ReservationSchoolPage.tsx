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
import { Loading } from '../../components/atoms/Loading';

type Tab = 'courses' | 'reservations';

export default function ReservationSchoolPage() {
  const { selectedStore } = useAuth();
  const [tab, setTab] = useState<Tab>('courses');

  if (!selectedStore) return <Loading message="店舗を選択してください" />;

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
  const [editing, setEditing] = useState<ReservationSchool | null>(null);

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
    try {
      await api.deleteReservationSchool(storeId, id);
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '削除に失敗しました');
    }
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
              <button onClick={() => setEditing(s)} style={{ padding: '6px 12px', background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                編集
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
      {editing && (
        <SchoolEditModal
          storeId={storeId}
          school={editing}
          onClose={() => setEditing(null)}
          onUpdated={async () => { setEditing(null); await load(); }}
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

function SchoolEditModal({
  storeId, school, onClose, onUpdated,
}: { storeId: string; school: ReservationSchool; onClose: () => void; onUpdated: () => void }) {
  const [name, setName] = useState(school.name);
  const [description, setDescription] = useState(school.description || '');
  const [instructor, setInstructor] = useState(school.instructor || '');
  const [capacity, setCapacity] = useState(school.capacity);
  const [price, setPrice] = useState(school.price != null ? String(school.price) : '');
  const [active, setActive] = useState(school.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.updateReservationSchool(storeId, school.id, {
        name,
        description: description || null,
        instructor: instructor || null,
        capacity,
        price: price ? Number(price) : null,
        active,
      });
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{ margin: 0, marginBottom: 16 }}>コース編集</h3>
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
      <FieldRow label="公開">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {active ? '公開中' : '非公開'}
        </label>
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

function SessionParticipants({ storeId, sessionId }: { storeId: string; sessionId: string }) {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.listSessionReservations(storeId, sessionId);
        setReservations(r.reservations);
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId, sessionId]);

  if (loading) return <div style={{ padding: '8px 16px', fontSize: 12, color: '#94a3b8' }}>読み込み中...</div>;
  if (reservations.length === 0) return <div style={{ padding: '8px 16px', fontSize: 12, color: '#94a3b8' }}>予約者なし</div>;

  return (
    <div style={{ padding: '4px 16px 12px', background: '#f8fafc', borderRadius: '0 0 8px 8px', marginTop: -4 }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
        予約者一覧 ({reservations.filter(r => !['cancelled'].includes(r.status)).reduce((sum, r) => sum + r.party_size, 0)}名)
      </div>
      {reservations.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12, borderBottom: '1px solid #f0f0f0' }}>
          <div>
            <span style={{ fontWeight: 600 }}>{r.customer_name}</span>
            <span style={{ color: '#94a3b8', marginLeft: 8 }}>{r.party_size}名</span>
            {r.customer_phone && <span style={{ color: '#94a3b8', marginLeft: 8 }}>{r.customer_phone}</span>}
          </div>
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 4,
            background: r.status === 'cancelled' ? '#fee2e2' : r.status === 'completed' ? '#dcfce7' : '#dbeafe',
            color: r.status === 'cancelled' ? '#dc2626' : r.status === 'completed' ? '#16a34a' : '#1e40af',
          }}>
            {r.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function SessionsView({
  storeId, school, onBack,
}: { storeId: string; school: ReservationSchool; onBack: () => void }) {
  const [sessions, setSessions] = useState<ReservationSchoolSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

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
    try {
      await api.deleteSchoolSession(storeId, id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '削除に失敗しました');
    }
  };

  return (
    <div>
      <button onClick={onBack} style={{ marginBottom: 12, padding: '6px 12px', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        ← コース一覧に戻る
      </button>
      <h3 style={{ margin: '8px 0' }}>{school.name} のセッション</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          + セッション追加
        </button>
        <button
          onClick={() => setShowBulk(true)}
          style={{ padding: '8px 16px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          一括作成
        </button>
      </div>

      {loading ? <div>読み込み中...</div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {sessions.length === 0 && (
            <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
              セッションがまだありません
            </div>
          )}
          {sessions.map((s) => (
            <div key={s.id}>
              <div style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {formatDateTime(s.starts_at)} — {formatDateTime(s.ends_at)}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                    定員: {s.capacity_override ?? school.capacity}名 /
                    <select
                      value={s.status}
                      onChange={async (e) => {
                        try {
                          await api.updateSchoolSession(storeId, s.id, { status: e.target.value });
                        } catch (err) {
                          alert(err instanceof Error ? err.message : 'ステータス変更に失敗しました');
                        }
                        await load();
                      }}
                      style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                    >
                      <option value="scheduled">scheduled</option>
                      <option value="cancelled">cancelled</option>
                      <option value="completed">completed</option>
                    </select>
                  </div>
                  {s.note && <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.note}</div>}
                </div>
                <button
                  onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}
                  style={{ padding: '6px 12px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                >
                  {expandedSession === s.id ? '閉じる' : '予約者'}
                </button>
                <button onClick={() => onDelete(s.id)} style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                  削除
                </button>
              </div>
              {expandedSession === s.id && (
                <SessionParticipants storeId={storeId} sessionId={s.id} />
              )}
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
      {showBulk && (
        <BulkSessionCreateModal
          storeId={storeId}
          schoolId={school.id}
          onClose={() => setShowBulk(false)}
          onCreated={async () => { setShowBulk(false); await load(); }}
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

function BulkSessionCreateModal({
  storeId, schoolId, onClose, onCreated,
}: { storeId: string; schoolId: string; onClose: () => void; onCreated: () => void }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [capacityOverride, setCapacityOverride] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultCount, setResultCount] = useState<number | null>(null);

  const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const r = await api.bulkCreateSchoolSessions(storeId, schoolId, {
        start_date: startDate,
        end_date: endDate,
        days_of_week: daysOfWeek,
        start_time: startTime,
        end_time: endTime,
        capacity_override: capacityOverride ? Number(capacityOverride) : null,
        note: note || null,
      });
      setResultCount(r.count);
      setTimeout(() => onCreated(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  if (resultCount !== null) {
    return (
      <ModalOverlay onClose={onCreated}>
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{resultCount} 件作成しました</div>
        </div>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{ margin: 0, marginBottom: 16 }}>セッション一括作成</h3>
      <FieldRow label="開始日">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="終了日">
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="曜日">
        <div style={{ display: 'flex', gap: 4 }}>
          {dayLabels.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: daysOfWeek.includes(i) ? '#0ea5e9' : '#f1f5f9',
                color: daysOfWeek.includes(i) ? 'white' : '#64748b',
                fontWeight: daysOfWeek.includes(i) ? 700 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </FieldRow>
      <FieldRow label="開始時刻">
        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="終了時刻">
        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="定員上書き (任意)">
        <input type="number" value={capacityOverride} onChange={(e) => setCapacityOverride(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="備考 (任意)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </FieldRow>
      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          キャンセル
        </button>
        <button onClick={submit} disabled={saving || !startDate || !endDate || daysOfWeek.length === 0} style={{ padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {saving ? '作成中...' : '一括作成'}
        </button>
      </div>
    </ModalOverlay>
  );
}

function ReservationsTab({ storeId }: { storeId: string }) {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [courseFilter, setCourseFilter] = useState<string>('');

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
    try {
      await api.cancelSchoolReservation(storeId, id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'キャンセルに失敗しました');
    }
  };

  const onStatusChange = async (id: string, status: string) => {
    try {
      await api.updateSchoolReservation(storeId, id, { status });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'ステータス変更に失敗しました');
    }
  };

  if (loading) return <div>読み込み中...</div>;

  // Extract unique course names for filter
  const courseNames = [...new Set(
    reservations
      .map((r) => (r.metadata as { school_name?: string })?.school_name)
      .filter((n): n is string => !!n)
  )];

  const filtered = reservations.filter((r) => {
    if (statusFilter === 'active' && ['cancelled', 'completed', 'no_show'].includes(r.status)) return false;
    if (statusFilter !== 'active' && statusFilter !== '' && r.status !== statusFilter) return false;
    if (courseFilter) {
      const name = (r.metadata as { school_name?: string })?.school_name;
      if (name !== courseFilter) return false;
    }
    return true;
  });

  return (
    <div>
      {/* UX-3: Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
        >
          <option value="active">アクティブのみ</option>
          <option value="">すべて</option>
          <option value="confirmed">confirmed</option>
          <option value="completed">completed</option>
          <option value="cancelled">cancelled</option>
          <option value="no_show">no_show</option>
        </select>
        {courseNames.length > 1 && (
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
          >
            <option value="">全コース</option>
            {courseNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
          {filtered.length} 件
        </span>
      </div>

      {filtered.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          該当する申込がありません
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map((r) => (
          <div key={r.id} style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {/* CRM-3: Link to customer detail */}
                {r.customer_id ? (
                  <a
                    href={`/customers?id=${r.customer_id}`}
                    style={{ color: '#0369a1', textDecoration: 'none' }}
                    title="顧客詳細を開く"
                  >
                    {r.customer_name}
                  </a>
                ) : (
                  r.customer_name
                )}
                {' '}({r.party_size}名)
                <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: r.status === 'cancelled' ? '#fee2e2' : r.status === 'completed' ? '#dcfce7' : r.status === 'no_show' ? '#fef3c7' : '#dbeafe', color: r.status === 'cancelled' ? '#dc2626' : r.status === 'completed' ? '#16a34a' : r.status === 'no_show' ? '#92400e' : '#1e40af' }}>
                  {r.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {formatDateTime(r.starts_at)} — {r.confirmation_code}
              </div>
              {(r.metadata as { school_name?: string })?.school_name && (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>コース: {(r.metadata as { school_name?: string }).school_name}</div>
              )}
              {/* FE-1: Show customer booking note */}
              {r.notes && (
                <div style={{ fontSize: 11, color: '#92400e', marginTop: 2, background: '#fef3c7', padding: '2px 6px', borderRadius: 4, display: 'inline-block' }}>
                  備考: {r.notes}
                </div>
              )}
            </div>
            {/* FE-2: Status change buttons */}
            {!['cancelled', 'completed', 'no_show'].includes(r.status) && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => onStatusChange(r.id, 'completed')} style={{ padding: '4px 8px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                  完了
                </button>
                <button onClick={() => onStatusChange(r.id, 'no_show')} style={{ padding: '4px 8px', background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                  欠席
                </button>
                <button onClick={() => onCancel(r.id)} style={{ padding: '4px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                  取消
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
