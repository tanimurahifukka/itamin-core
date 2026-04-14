import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/molecules/Toast';
import type {
  StoreBusinessHour,
  StoreCalendarOverride,
  CalendarOverrideKind,
  EffectiveHours,
} from '../types/api';

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function toHHMM(time: string | null | undefined): string {
  if (!time) return '';
  return time.slice(0, 5);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthRange(year: number, month: number): { from: string; to: string; days: Date[] } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const days: Date[] = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return { from: formatDate(first), to: formatDate(last), days };
}

function defaultHours(): StoreBusinessHour[] {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    open_time: '10:00',
    close_time: '22:00',
    is_closed: false,
  }));
}

function kindLabel(kind: CalendarOverrideKind): string {
  switch (kind) {
    case 'closed': return '休業';
    case 'special_hours': return '特別営業';
    case 'holiday': return '祝日休業';
  }
}

function kindColor(kind: CalendarOverrideKind): string {
  switch (kind) {
    case 'closed': return '#fecaca';
    case 'special_hours': return '#bfdbfe';
    case 'holiday': return '#fde68a';
  }
}

export default function CalendarAdminPage() {
  const { selectedStore } = useAuth();
  const isAdmin = selectedStore && ['owner', 'manager', 'leader'].includes(selectedStore.role);

  const [hours, setHours] = useState<StoreBusinessHour[]>(defaultHours());
  const [savingHours, setSavingHours] = useState(false);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [effective, setEffective] = useState<EffectiveHours[]>([]);
  const [overrides, setOverrides] = useState<StoreCalendarOverride[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<CalendarOverrideKind>('closed');
  const [modalOpen, setModalOpenTime] = useState('10:00');
  const [modalClose, setModalCloseTime] = useState('22:00');
  const [modalLabel, setModalLabel] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  const loadHours = useCallback(async () => {
    if (!selectedStore) return;
    try {
      const { hours: data } = await api.getBusinessHours(selectedStore.id);
      if (data && data.length > 0) {
        const byDow = new Map<number, StoreBusinessHour>();
        data.forEach(h => byDow.set(h.day_of_week, {
          ...h,
          open_time: toHHMM(h.open_time),
          close_time: toHHMM(h.close_time),
        }));
        const full = defaultHours().map(def => byDow.get(def.day_of_week) || def);
        setHours(full);
      }
    } catch (e: any) {
      showToast(e?.message || '営業時間の取得に失敗しました', 'error');
    }
  }, [selectedStore]);

  const loadMonth = useCallback(async () => {
    if (!selectedStore) return;
    setLoading(true);
    try {
      const { from, to } = monthRange(year, month);
      const [eff, ov] = await Promise.all([
        api.getEffectiveHours(selectedStore.id, from, to),
        api.listCalendarOverrides(selectedStore.id, from, to),
      ]);
      setEffective(eff.days);
      setOverrides(ov.overrides);
    } catch (e: any) {
      showToast(e?.message || 'カレンダーの取得に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedStore, year, month]);

  useEffect(() => { loadHours(); }, [loadHours]);
  useEffect(() => { loadMonth(); }, [loadMonth]);

  const overridesByDate = useMemo(() => {
    const m = new Map<string, StoreCalendarOverride>();
    overrides.forEach(o => m.set(o.date, o));
    return m;
  }, [overrides]);

  const effectiveByDate = useMemo(() => {
    const m = new Map<string, EffectiveHours>();
    effective.forEach(e => m.set(e.date, e));
    return m;
  }, [effective]);

  const handleHoursChange = (dow: number, patch: Partial<StoreBusinessHour>) => {
    setHours(prev => prev.map(h => h.day_of_week === dow ? { ...h, ...patch } : h));
  };

  const handleSaveHours = async () => {
    if (!selectedStore || savingHours) return;
    setSavingHours(true);
    try {
      await api.updateBusinessHours(selectedStore.id, hours);
      showToast('営業時間を保存しました', 'success');
      await loadMonth();
    } catch (e: any) {
      showToast(e?.message || '保存に失敗しました', 'error');
    } finally {
      setSavingHours(false);
    }
  };

  const openOverrideModal = (date: string) => {
    if (!isAdmin) return;
    const existing = overridesByDate.get(date);
    setModalDate(date);
    if (existing) {
      setModalKind(existing.kind);
      setModalOpenTime(toHHMM(existing.open_time) || '10:00');
      setModalCloseTime(toHHMM(existing.close_time) || '22:00');
      setModalLabel(existing.label || '');
    } else {
      setModalKind('closed');
      setModalOpenTime('10:00');
      setModalCloseTime('22:00');
      setModalLabel('');
    }
  };

  const closeModal = () => {
    setModalDate(null);
  };

  const handleSaveOverride = async () => {
    if (!selectedStore || !modalDate || modalSaving) return;
    setModalSaving(true);
    try {
      await api.createCalendarOverride(selectedStore.id, {
        date: modalDate,
        kind: modalKind,
        open_time: modalKind === 'special_hours' ? modalOpen : null,
        close_time: modalKind === 'special_hours' ? modalClose : null,
        label: modalLabel.trim() || null,
      });
      showToast('例外日を登録しました', 'success');
      closeModal();
      await loadMonth();
    } catch (e: any) {
      showToast(e?.message || '登録に失敗しました', 'error');
    } finally {
      setModalSaving(false);
    }
  };

  const handleDeleteOverride = async () => {
    if (!selectedStore || !modalDate) return;
    const existing = overridesByDate.get(modalDate);
    if (!existing) return;
    if (!confirm(`${modalDate} の例外を削除しますか？`)) return;
    setModalSaving(true);
    try {
      await api.deleteCalendarOverride(selectedStore.id, existing.id);
      showToast('例外を削除しました', 'success');
      closeModal();
      await loadMonth();
    } catch (e: any) {
      showToast(e?.message || '削除に失敗しました', 'error');
    } finally {
      setModalSaving(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  if (!selectedStore) {
    return <div style={{ padding: 16 }}>店舗を選択してください</div>;
  }

  const { days } = monthRange(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const gridCells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) gridCells.push(null);
  days.forEach(d => gridCells.push(d));

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>📅 営業日カレンダー</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
        曜日ごとの営業時間と、日別の例外（休業・特別営業・祝日）を管理します。予約・HACCP・キオスクなど他機能の営業判定ソースになります。
      </p>

      {/* 曜日別 営業時間 */}
      <section style={{ marginBottom: 24, background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>通常営業時間（曜日別）</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {hours.map(h => (
            <div key={h.day_of_week} style={{ display: 'grid', gridTemplateColumns: '40px 80px 1fr 1fr', gap: 8, alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>{DOW_LABELS[h.day_of_week]}</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={h.is_closed}
                  disabled={!isAdmin}
                  onChange={e => handleHoursChange(h.day_of_week, { is_closed: e.target.checked })}
                />
                定休
              </label>
              <input
                type="time"
                value={h.open_time}
                disabled={!isAdmin || h.is_closed}
                onChange={e => handleHoursChange(h.day_of_week, { open_time: e.target.value })}
                style={{ padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
              />
              <input
                type="time"
                value={h.close_time}
                disabled={!isAdmin || h.is_closed}
                onChange={e => handleHoursChange(h.day_of_week, { close_time: e.target.value })}
                style={{ padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
              />
            </div>
          ))}
        </div>
        {isAdmin && (
          <button
            onClick={handleSaveHours}
            disabled={savingHours}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: savingHours ? 'not-allowed' : 'pointer',
              opacity: savingHours ? 0.6 : 1,
            }}
          >
            {savingHours ? '保存中…' : '営業時間を保存'}
          </button>
        )}
      </section>

      {/* 月カレンダー */}
      <section style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>日別カレンダー</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prevMonth} style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>◀</button>
            <div style={{ minWidth: 100, textAlign: 'center', fontWeight: 600 }}>{year}年 {month}月</div>
            <button onClick={nextMonth} style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>▶</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 12 }}>
          {DOW_LABELS.map((l, i) => (
            <div key={l} style={{ padding: 4, textAlign: 'center', fontWeight: 600, color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#374151' }}>{l}</div>
          ))}
          {gridCells.map((d, idx) => {
            if (!d) return <div key={`e${idx}`} />;
            const dateStr = formatDate(d);
            const ov = overridesByDate.get(dateStr);
            const eff = effectiveByDate.get(dateStr);
            const bg = ov ? kindColor(ov.kind) : (eff && !eff.isOpen ? '#f3f4f6' : '#fff');
            const isToday = dateStr === formatDate(today);
            return (
              <button
                key={dateStr}
                onClick={() => openOverrideModal(dateStr)}
                disabled={!isAdmin}
                style={{
                  minHeight: 72,
                  padding: 4,
                  background: bg,
                  border: isToday ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  borderRadius: 4,
                  cursor: isAdmin ? 'pointer' : 'default',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{d.getDate()}</div>
                {ov ? (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 600 }}>{kindLabel(ov.kind)}</div>
                    {ov.kind === 'special_hours' && (
                      <div style={{ fontSize: 10 }}>{toHHMM(ov.open_time)}-{toHHMM(ov.close_time)}</div>
                    )}
                    {ov.label && <div style={{ fontSize: 10, color: '#6b7280' }}>{ov.label}</div>}
                  </>
                ) : eff && eff.isOpen ? (
                  <div style={{ fontSize: 10, color: '#6b7280' }}>{eff.openTime}-{eff.closeTime}</div>
                ) : (
                  <div style={{ fontSize: 10, color: '#6b7280' }}>休業</div>
                )}
              </button>
            );
          })}
        </div>
        {loading && <div style={{ textAlign: 'center', padding: 8, color: '#6b7280' }}>読み込み中…</div>}
      </section>

      {/* 例外モーダル */}
      {modalDate && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 8, padding: 20, width: '90%', maxWidth: 400 }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{modalDate} の例外</h3>

            <label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
              種別
              <select
                value={modalKind}
                onChange={e => setModalKind(e.target.value as CalendarOverrideKind)}
                style={{ display: 'block', width: '100%', padding: 6, marginTop: 4, border: '1px solid #d1d5db', borderRadius: 4 }}
              >
                <option value="closed">休業</option>
                <option value="special_hours">特別営業</option>
                <option value="holiday">祝日休業</option>
              </select>
            </label>

            {modalKind === 'special_hours' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 13 }}>
                  開店
                  <input type="time" value={modalOpen} onChange={e => setModalOpenTime(e.target.value)}
                    style={{ display: 'block', width: '100%', padding: 6, marginTop: 4, border: '1px solid #d1d5db', borderRadius: 4 }} />
                </label>
                <label style={{ fontSize: 13 }}>
                  閉店
                  <input type="time" value={modalClose} onChange={e => setModalCloseTime(e.target.value)}
                    style={{ display: 'block', width: '100%', padding: 6, marginTop: 4, border: '1px solid #d1d5db', borderRadius: 4 }} />
                </label>
              </div>
            )}

            <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
              ラベル（任意）
              <input
                type="text"
                value={modalLabel}
                onChange={e => setModalLabel(e.target.value)}
                placeholder="例: 年末年始、元日"
                style={{ display: 'block', width: '100%', padding: 6, marginTop: 4, border: '1px solid #d1d5db', borderRadius: 4 }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {overridesByDate.has(modalDate) && (
                <button
                  onClick={handleDeleteOverride}
                  disabled={modalSaving}
                  style={{ padding: '6px 12px', background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 4, cursor: 'pointer' }}
                >
                  削除
                </button>
              )}
              <button
                onClick={closeModal}
                style={{ padding: '6px 12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveOverride}
                disabled={modalSaving}
                style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
              >
                {modalSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
