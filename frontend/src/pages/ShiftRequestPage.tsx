/**
 * シフト希望提出ページ（スタッフ用）
 * 月間カレンダービューで出勤可/希望/休みを登録
 */
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import TimePicker15 from '../components/TimePicker15';
import type { ShiftRequest } from '../types/api';

interface ExistingShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'draft' | 'published';
}

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
const REQUEST_TYPES = [
  { value: 'available', label: '出勤可', color: '#22c55e', bg: '#f0fdf4', symbol: '○' },
  { value: 'preferred', label: '希望', color: '#2563eb', bg: '#eff6ff', symbol: '◎' },
  { value: 'unavailable', label: '休み', color: '#c53030', bg: '#fef2f2', symbol: '✕' },
] as const;

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  // 月曜始まり: 0=月, 1=火, ..., 6=日
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  // 先月の空セル
  for (let i = 0; i < startDow; i++) cells.push(null);
  // 当月の日付
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  // 末尾を7の倍数に揃える
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

export default function ShiftRequestPage() {
  const { selectedStore, user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [confirmedShifts, setConfirmedShifts] = useState<ExistingShift[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; startTime: string; endTime: string }[]>([]);
  const [staffId, setStaffId] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editType, setEditType] = useState<'available' | 'unavailable' | 'preferred'>('available');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editNote, setEditNote] = useState('');

  const calendarDays = getCalendarDays(currentMonth.year, currentMonth.month);
  const today = formatDate(new Date());

  // staffId を取得（user.id = Supabase Auth UID で一致検索）
  useEffect(() => {
    if (!selectedStore || !user) return;
    api.getStoreStaff(selectedStore.id).then(data => {
      const me = data.staff.find((s: { userId: string; id: string }) => s.userId === user.id);
      if (me) setStaffId(me.id);
    }).catch(() => { console.error('[ShiftRequestPage] fetch failed'); });
  }, [selectedStore, user]);

  // 月のデータを取得（月初〜月末をカバーする週で取得）
  // テンプレート取得
  useEffect(() => {
    if (!selectedStore) return;
    api.getTemplates(selectedStore.id).then(data => {
      setTemplates(data.templates.map((t: { id: string; name: string; startTime: string; endTime: string }) => ({
        id: t.id, name: t.name, startTime: t.startTime, endTime: t.endTime,
      })));
    }).catch(() => { console.error('[ShiftRequestPage] fetch failed'); });
  }, [selectedStore]);

  const loadData = useCallback(async () => {
    if (!selectedStore || !staffId) return;
    try {
      // 月初〜月末の各週の月曜日を算出
      const weeks = new Set<string>();
      const lastDay = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();
      for (let day = 1; day <= lastDay; day += 7) {
        const d = new Date(currentMonth.year, currentMonth.month, day);
        const dow = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
        weeks.add(formatDate(monday));
      }
      // 月末の週もカバー
      const lastDate = new Date(currentMonth.year, currentMonth.month, lastDay);
      const dow = lastDate.getDay();
      const lastMonday = new Date(lastDate);
      lastMonday.setDate(lastDate.getDate() - (dow === 0 ? 6 : dow - 1));
      weeks.add(formatDate(lastMonday));

      const allRequests: ShiftRequest[] = [];
      const allShifts: ExistingShift[] = [];

      await Promise.all(
        Array.from(weeks).map(async (weekDate) => {
          const [reqData, shiftData] = await Promise.all([
            api.getWeeklyRequests(selectedStore.id, weekDate),
            api.getWeeklyShifts(selectedStore.id, weekDate),
          ]);
          allRequests.push(...reqData.requests.filter((r: ShiftRequest) => r.staffId === staffId));
          allShifts.push(
            ...shiftData.shifts
              .filter(s => s.staffId === staffId && s.status === 'published')
              .map(s => ({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, status: s.status as 'draft' | 'published' }))
          );
        })
      );

      // 重複除去
      const reqMap = new Map(allRequests.map(r => [r.date, r]));
      const shiftMap = new Map(allShifts.map(s => [s.date, s]));
      setRequests(Array.from(reqMap.values()));
      setConfirmedShifts(Array.from(shiftMap.values()));
    } catch {}
  }, [selectedStore, staffId, currentMonth]);

  useEffect(() => {
    const run = async () => { await loadData(); };
    void run();
  }, [loadData]);

  const prevMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { ...prev, month: prev.month - 1 };
    });
  };
  const nextMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { ...prev, month: prev.month + 1 };
    });
  };

  const getRequest = (date: string) => requests.find(r => r.date === date);
  const getConfirmed = (date: string) => confirmedShifts.find(s => s.date === date);

  const openEditor = (date: string) => {
    const existing = getRequest(date);
    setEditing(date);
    setEditType((existing?.requestType as 'available' | 'unavailable' | 'preferred') || 'available');
    setEditStart(existing?.startTime?.slice(0, 5) || '');
    setEditEnd(existing?.endTime?.slice(0, 5) || '');
    setEditNote(existing?.note || '');
  };

  const handleSave = async () => {
    if (!selectedStore || !editing || !staffId) return;
    try {
      await api.saveRequest(selectedStore.id, {
        staffId,
        date: editing,
        requestType: editType,
        startTime: editStart || undefined,
        endTime: editEnd || undefined,
        note: editNote || undefined,
      });
      setEditing(null);
      loadData();
    } catch {}
  };

  const handleDelete = async (date: string) => {
    if (!selectedStore) return;
    const req = getRequest(date);
    if (!req) return;
    try {
      await api.deleteRequest(selectedStore.id, req.id);
      setEditing(null);
      loadData();
    } catch {}
  };

  const monthLabel = `${currentMonth.year}年${currentMonth.month + 1}月`;

  return (
    <div className="main-content">
      <h3 style={{ marginBottom: 4 }}>シフト希望</h3>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: 16 }}>
        日付をタップして出勤可・休み希望を登録
      </p>

      {/* 月ナビ */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={prevMonth} style={navBtnStyle}>&lt;</button>
        <span style={{ fontSize: '1rem', fontWeight: 600, minWidth: 120, textAlign: 'center' }}>
          {monthLabel}
        </span>
        <button onClick={nextMonth} style={navBtnStyle}>&gt;</button>
      </div>

      {/* カレンダーグリッド */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0,
        background: '#fff', border: '1px solid #d4d9df', borderRadius: 8, overflow: 'hidden',
      }}>
        {/* 曜日ヘッダー */}
        {WEEKDAYS.map((day, i) => (
          <div key={day} style={{
            padding: '8px 0', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600,
            color: i === 5 ? '#2196f3' : i === 6 ? '#c53030' : '#555',
            background: '#f7f8fa', borderBottom: '1px solid #d4d9df',
          }}>
            {day}
          </div>
        ))}

        {/* 日付セル */}
        {calendarDays.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} style={{ ...cellStyle, background: '#fafbfc' }} />;
          }

          const dateStr = formatDate(date);
          const req = getRequest(dateStr);
          const confirmed = getConfirmed(dateStr);
          const isToday = dateStr === today;
          const isPast = dateStr < today;
          const dow = idx % 7;
          const typeInfo = req ? REQUEST_TYPES.find(t => t.value === req.requestType) : null;

          return (
            <div
              key={dateStr}
              onClick={() => !confirmed && !isPast && openEditor(dateStr)}
              style={{
                ...cellStyle,
                cursor: confirmed || isPast ? 'default' : 'pointer',
                background: confirmed ? '#f0fdf4' : typeInfo ? typeInfo.bg : '#fff',
                opacity: isPast ? 0.5 : 1,
                borderRight: dow < 6 ? '1px solid #eef0f3' : 'none',
              }}
            >
              {/* 日付 */}
              <div style={{
                fontSize: '0.8rem', fontWeight: isToday ? 700 : 400,
                color: isToday ? '#fff' : dow === 5 ? '#2196f3' : dow === 6 ? '#c53030' : '#1a1a1a',
                ...(isToday ? {
                  background: '#2563eb', borderRadius: '50%',
                  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 2px',
                } : { marginBottom: 2 }),
              }}>
                {date.getDate()}
              </div>

              {/* 確定シフト */}
              {confirmed && (
                <div style={{ fontSize: '0.6rem', color: '#2e7d32', fontWeight: 600, lineHeight: 1.2 }}>
                  {confirmed.startTime.slice(0, 5)}
                  <br />
                  {confirmed.endTime.slice(0, 5)}
                </div>
              )}

              {/* 希望マーク */}
              {req && !confirmed && typeInfo && (
                <div style={{
                  fontSize: '1rem', fontWeight: 700, color: typeInfo.color,
                  lineHeight: 1,
                }}>
                  {typeInfo.symbol}
                </div>
              )}

              {/* 時間（希望） */}
              {req && !confirmed && req.startTime && (
                <div style={{ fontSize: '0.55rem', color: '#888', lineHeight: 1.2, marginTop: 1 }}>
                  {req.startTime.slice(0, 5)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 凡例 */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: '0.75rem', color: '#888', flexWrap: 'wrap' }}>
        {REQUEST_TYPES.map(t => (
          <span key={t.value}>
            <span style={{ fontWeight: 700, color: t.color, marginRight: 3 }}>{t.symbol}</span>
            {t.label}
          </span>
        ))}
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#f0fdf4', border: '1px solid #c8e6c9', borderRadius: 2, verticalAlign: 'middle', marginRight: 3 }} />
          確定済み
        </span>
      </div>

      {/* 編集モーダル */}
      {editing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => setEditing(null)}>
          <div style={{
            background: 'white', borderRadius: 10, padding: 24,
            width: '90%', maxWidth: 360,
          }} onClick={e => e.stopPropagation()}>
            <h4 style={{ marginBottom: 16, fontSize: '0.95rem' }}>
              {new Date(editing + 'T00:00').getMonth() + 1}/{new Date(editing + 'T00:00').getDate()}
              ({WEEKDAYS[(new Date(editing + 'T00:00').getDay() + 6) % 7]}) の希望
            </h4>

            {/* タイプ選択 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {REQUEST_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setEditType(t.value)}
                  style={{
                    flex: 1, padding: '10px 8px', border: '2px solid',
                    borderColor: editType === t.value ? t.color : '#d4d9df',
                    background: editType === t.value ? t.bg : '#fff',
                    color: editType === t.value ? t.color : '#888',
                    borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                    fontFamily: 'inherit', fontSize: '0.85rem',
                  }}
                >
                  {t.symbol} {t.label}
                </button>
              ))}
            </div>

            {/* テンプレート + 時間 */}
            {editType !== 'unavailable' && (
              <>
                {templates.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setEditStart(t.startTime.slice(0, 5));
                          setEditEnd(t.endTime.slice(0, 5));
                        }}
                        style={{
                          padding: '5px 10px', border: '1px solid #d4d9df', borderRadius: 4,
                          background: (editStart === t.startTime.slice(0, 5) && editEnd === t.endTime.slice(0, 5)) ? '#e8edf3' : '#fff',
                          fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                          fontWeight: 500, color: '#555',
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <TimePicker15 value={editStart} onChange={setEditStart} />
                  <span style={{ color: '#888' }}>〜</span>
                  <TimePicker15 value={editEnd} onChange={setEditEnd} />
                </div>
              </>
            )}

            {/* メモ */}
            <input
              type="text" placeholder="メモ（任意）"
              value={editNote} onChange={e => setEditNote(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 16 }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} style={{ ...btnStyle, background: '#2563eb', color: 'white', flex: 1 }}>
                保存
              </button>
              {getRequest(editing) && (
                <button onClick={() => handleDelete(editing)} style={{ ...btnStyle, background: '#f5f5f5', color: '#c53030' }}>
                  削除
                </button>
              )}
              <button onClick={() => setEditing(null)} style={{ ...btnStyle, background: '#f5f5f5' }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  minHeight: 64, padding: '6px 4px', textAlign: 'center',
  borderBottom: '1px solid #eef0f3', transition: 'background 0.15s',
};
const navBtnStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #d4d9df', borderRadius: 6, padding: '6px 12px',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 500,
};
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #d4d9df', borderRadius: 6, flex: 1, fontFamily: 'inherit',
};
const btnStyle: React.CSSProperties = {
  padding: '10px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
};
