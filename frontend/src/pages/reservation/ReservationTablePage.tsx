/**
 * テーブル予約管理ページ (admin)
 * - 予約一覧 (今日 / 指定日)
 * - テーブル管理 (CRUD)
 * - 公開設定 (slug + 予約 URL 表示)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import type { ReservationRow, ReservationTable } from '../../types/api';
import { Loading } from '../../components/atoms/Loading';

type Tab = 'list' | 'tables' | 'publish';

export default function ReservationTablePage() {
  const { selectedStore } = useAuth();
  const [tab, setTab] = useState<Tab>('list');

  if (!selectedStore) return <Loading message="店舗を選択してください" />;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>📅 テーブル予約</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
        席単位の予約管理。公開 URL で顧客からの Web 予約を受け付けます。
      </p>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
        <TabButton active={tab === 'list'} onClick={() => setTab('list')}>予約一覧</TabButton>
        <TabButton active={tab === 'tables'} onClick={() => setTab('tables')}>テーブル管理</TabButton>
        <TabButton active={tab === 'publish'} onClick={() => setTab('publish')}>公開設定</TabButton>
      </div>

      {tab === 'list' && <ReservationListTab storeId={selectedStore.id} />}
      {tab === 'tables' && <TablesTab storeId={selectedStore.id} />}
      {tab === 'publish' && <PublishTab storeId={selectedStore.id} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 18px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #0ea5e9' : '2px solid transparent',
        color: active ? '#0ea5e9' : '#475569',
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ============================================================
// 予約一覧タブ
// ============================================================
function ReservationListTab({ storeId }: { storeId: string }) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const [date, setDate] = useState(today);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date(date + 'T00:00:00+09:00').toISOString();
      const to = new Date(new Date(date + 'T00:00:00+09:00').getTime() + 86400000).toISOString();
      const res = await api.listTableReservations(storeId, { from, to });
      setReservations(res.reservations);
    } finally {
      setLoading(false);
    }
  }, [storeId, date]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
        <button className="button" onClick={load}>更新</button>
        <button className="button button-primary" onClick={() => setShowCreate(true)}>+ 新規予約</button>
      </div>

      {loading ? (
        <div>読み込み中…</div>
      ) : reservations.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>この日の予約はありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reservations.map((r) => (
            <ReservationRowCard key={r.id} r={r} storeId={storeId} onChanged={load} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateReservationModal
          storeId={storeId}
          defaultDate={date}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function ReservationRowCard({
  r, storeId, onChanged,
}: { r: ReservationRow; storeId: string; onChanged: () => void }) {
  const time = new Date(r.starts_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const end = new Date(r.ends_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const isCancelled = r.status === 'cancelled';

  const statusColors: Record<string, string> = {
    confirmed: '#10b981',
    pending: '#f59e0b',
    seated: '#0ea5e9',
    completed: '#64748b',
    no_show: '#b91c1c',
    cancelled: '#94a3b8',
  };

  const handleCancel = async () => {
    if (!confirm(`${r.customer_name} 様の予約をキャンセルしますか？`)) return;
    try {
      await api.cancelTableReservation(storeId, r.id);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : '失敗しました');
    }
  };

  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        opacity: isCancelled ? 0.5 : 1,
      }}
    >
      <div style={{ minWidth: 90, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
        {time}<span style={{ fontSize: 13, color: '#94a3b8' }}> - {end}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{r.customer_name} <span style={{ color: '#64748b', fontWeight: 400 }}>({r.party_size}名)</span></div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {r.customer_phone || r.customer_email || 'コード: ' + r.confirmation_code}
          {r.notes && ` / ${r.notes}`}
        </div>
      </div>
      <span
        style={{
          padding: '4px 10px',
          borderRadius: 999,
          background: statusColors[r.status] + '22',
          color: statusColors[r.status],
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {r.status}
      </span>
      {!isCancelled && (
        <button className="button" onClick={handleCancel} style={{ padding: '6px 12px', fontSize: 12 }}>
          キャンセル
        </button>
      )}
    </div>
  );
}

function CreateReservationModal({
  storeId, defaultDate, onClose, onCreated,
}: { storeId: string; defaultDate: string; onClose: () => void; onCreated: () => void }) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState(120);
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const starts = new Date(`${date}T${time}:00+09:00`);
      const ends = new Date(starts.getTime() + duration * 60000);
      await api.createTableReservation(storeId, {
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        party_size: partySize,
        customer_name: name,
        customer_phone: phone || undefined,
        customer_email: email || undefined,
        notes: notes || undefined,
      });
      onCreated();
    } catch (e) {
      alert(e instanceof Error ? e.message : '失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0 }}>新規予約</h3>
        <Row label="日付">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
        </Row>
        <Row label="時刻">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required style={inputStyle} />
        </Row>
        <Row label="所要（分）">
          <input type="number" value={duration} min={30} step={15} onChange={(e) => setDuration(parseInt(e.target.value))} style={inputStyle} />
        </Row>
        <Row label="人数">
          <input type="number" value={partySize} min={1} onChange={(e) => setPartySize(parseInt(e.target.value))} required style={inputStyle} />
        </Row>
        <Row label="お客様名"><input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} /></Row>
        <Row label="電話"><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></Row>
        <Row label="メール"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></Row>
        <Row label="備考"><input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} /></Row>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="button" onClick={onClose}>キャンセル</button>
          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? '作成中…' : '作成'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ============================================================
// テーブル管理タブ
// ============================================================
function TablesTab({ storeId }: { storeId: string }) {
  const [tables, setTables] = useState<ReservationTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listReservationTables(storeId);
      setTables(res.tables);
    } finally {
      setLoading(false);
    }
  }, [storeId]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('このテーブルを削除しますか？既存の予約には影響しません。')) return;
    try {
      await api.deleteReservationTable(storeId, id);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '失敗しました');
    }
  };

  if (loading) return <div>読み込み中…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>{tables.length} 件のテーブル</div>
        <button className="button button-primary" onClick={() => setShowCreate(true)}>+ テーブル追加</button>
      </div>

      {tables.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          まだテーブルが登録されていません
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {tables.map((t) => (
            <div key={t.id} style={{ padding: 14, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {t.min_party_size}〜{t.capacity}名 {t.location ? `/ ${t.location}` : ''}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 999,
                  background: t.active ? '#d1fae5' : '#fee2e2',
                  color: t.active ? '#065f46' : '#991b1b',
                }}>
                  {t.active ? '有効' : '無効'}
                </span>
              </div>
              {t.note && <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>{t.note}</div>}
              <button
                onClick={() => handleDelete(t.id)}
                style={{ marginTop: 10, background: 'none', border: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTableModal
          storeId={storeId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateTableModal({
  storeId, onClose, onCreated,
}: { storeId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [minPartySize, setMinPartySize] = useState(1);
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createReservationTable(storeId, {
        name,
        capacity,
        min_party_size: minPartySize,
        location: location || null,
        sort_order: 0,
        active: true,
        note: null,
      });
      onCreated();
    } catch (e) {
      alert(e instanceof Error ? e.message : '失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0 }}>テーブル追加</h3>
        <Row label="名称"><input value={name} onChange={(e) => setName(e.target.value)} required placeholder="例: T1 / カウンター" style={inputStyle} /></Row>
        <Row label="最大人数"><input type="number" value={capacity} min={1} onChange={(e) => setCapacity(parseInt(e.target.value))} required style={inputStyle} /></Row>
        <Row label="最小人数"><input type="number" value={minPartySize} min={1} onChange={(e) => setMinPartySize(parseInt(e.target.value))} required style={inputStyle} /></Row>
        <Row label="場所"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例: 1階窓側" style={inputStyle} /></Row>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="button" onClick={onClose}>キャンセル</button>
          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? '作成中…' : '作成'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ============================================================
// 公開設定タブ
// ============================================================
function PublishTab({ storeId }: { storeId: string }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getReservationSlug(storeId).then((r) => {
      setSlug(r.slug);
      setInput(r.slug || '');
      setLoading(false);
    });
  }, [storeId]);

  const publicUrl = useMemo(() => {
    if (!slug) return '';
    return `${window.location.origin}/r/${slug}/table`;
  }, [slug]);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await api.setReservationSlug(storeId, input);
      setSlug(res.slug);
      setMsg('✓ 保存しました');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>読み込み中…</div>;

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>店舗 slug（公開 URL の一部）</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', color: '#64748b' }}>{window.location.origin}/r/</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toLowerCase())}
            placeholder="例: my-cafe"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button className="button button-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
        {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith('✓') ? '#059669' : '#dc2626' }}>{msg}</div>}
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
          英数字とハイフン、3〜64 文字。admin / api / nfc 等の予約語は使用できません。
        </div>
      </div>

      {slug && (
        <div style={{ padding: 16, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>公開予約 URL</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, padding: '8px 12px', background: '#f1f5f9', borderRadius: 6, fontSize: 13, wordBreak: 'break-all' }}>
              {publicUrl}
            </code>
            <button
              className="button"
              onClick={() => { navigator.clipboard.writeText(publicUrl); setMsg('✓ コピーしました'); }}
            >
              コピー
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <img
              alt="QR"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicUrl)}`}
              style={{ border: '1px solid #e2e8f0', borderRadius: 6 }}
            />
          </div>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
            この URL を SNS・名刺・メニューに載せると顧客が Web から直接予約できます。
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 共通 UI
// ============================================================
const inputStyle: React.CSSProperties = {
  padding: 8,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  width: '100%',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      {children}
    </label>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, padding: 24,
          width: '90%', maxWidth: 460, maxHeight: '90vh', overflow: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}
