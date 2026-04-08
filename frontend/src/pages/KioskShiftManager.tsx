import { useState, useEffect, useCallback } from 'react';
import { kioskApi } from '../api/kioskClient';

type ViewMode = 'week' | '15days' | 'month';

interface ShiftEntry {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  staffName: string;
}

interface RequestEntry {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  requestType: string;
  startTime?: string;
  endTime?: string;
  note?: string;
}

interface StaffItem {
  id: string;
  name: string;
}

interface CellEdit {
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

interface Props {
  storeId: string;
  staff: StaffItem[];
}

// ──────────────── 日付ユーティリティ ────────────────
function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function getRangeStart(anchor: string, mode: ViewMode): string {
  if (mode === 'week') {
    const d = new Date(anchor + 'T00:00:00');
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return toDateStr(d);
  }
  if (mode === 'month') {
    return anchor.slice(0, 7) + '-01';
  }
  return anchor; // 15days: anchor is start
}

function getDates(start: string, mode: ViewMode): string[] {
  const count = mode === 'week' ? 7 : mode === '15days' ? 15 : daysInMonth(start);
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

function daysInMonth(dateStr: string): number {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return { day: d.getDate(), week: days[d.getDay()], weekIdx: d.getDay() };
}

function fmtMonthYear(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

const REQUEST_TYPE_LABEL: Record<string, string> = {
  available: '○',
  unavailable: '×',
  preferred: '希望',
  partial: '一部',
};
const REQUEST_TYPE_COLOR: Record<string, string> = {
  available: '#4caf50',
  unavailable: '#ef5350',
  preferred: '#2196f3',
  partial: '#ff9800',
};

// ──────────────── メインコンポーネント ────────────────
export default function KioskShiftManager({ storeId, staff }: Props) {
  const today = toDateStr(new Date());
  const [mode, setMode] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(() => getRangeStart(today, 'week'));
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // セル編集
  const [editing, setEditing] = useState<CellEdit | null>(null);

  const dates = getDates(anchor, mode);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftRes, reqRes] = await Promise.all([
        kioskApi.getShiftRange(storeId, startDate, endDate),
        kioskApi.getShiftRequests(storeId, startDate, endDate),
      ]);
      setShifts(shiftRes.shifts);
      setRequests(reqRes.requests);
    } finally {
      setLoading(false);
    }
  }, [storeId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 2500);
  };

  // ナビゲーション
  const navigate = (dir: 1 | -1) => {
    const step = mode === 'week' ? 7 : mode === '15days' ? 15 : daysInMonth(anchor);
    const newAnchor = addDays(anchor, dir * step);
    setAnchor(mode === 'month' ? newAnchor.slice(0, 7) + '-01' : newAnchor);
    setEditing(null);
  };

  const changeMode = (m: ViewMode) => {
    setMode(m);
    setAnchor(getRangeStart(today, m));
    setEditing(null);
  };

  // セルのシフト取得
  const getShift = (staffId: string, date: string) =>
    shifts.find(s => s.staffId === staffId && s.date === date);

  // セルの希望取得
  const getRequests = (staffId: string, date: string) =>
    requests.filter(r => r.staffId === staffId && r.date === date);

  // セルクリック
  const handleCellClick = (staffId: string, date: string) => {
    const existing = getShift(staffId, date);
    if (editing?.staffId === staffId && editing?.date === date) {
      setEditing(null);
      return;
    }
    setEditing({
      staffId,
      date,
      startTime: existing?.startTime || '09:00',
      endTime: existing?.endTime || '17:00',
      breakMinutes: existing?.breakMinutes ?? 60,
    });
  };

  // シフト保存
  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await kioskApi.createShift(storeId, {
        staffId: editing.staffId,
        date: editing.date,
        startTime: editing.startTime,
        endTime: editing.endTime,
        breakMinutes: editing.breakMinutes,
      });
      showMsg('保存しました', true);
      setEditing(null);
      await load();
    } catch (e: any) {
      showMsg(e.message || '保存失敗', false);
    } finally {
      setSaving(false);
    }
  };

  // シフト削除
  const handleDelete = async (shiftId: string) => {
    setSaving(true);
    try {
      await kioskApi.deleteShift(storeId, shiftId);
      showMsg('削除しました', true);
      setEditing(null);
      await load();
    } catch (e: any) {
      showMsg(e.message || '削除失敗', false);
    } finally {
      setSaving(false);
    }
  };

  const headerLabel = mode === 'month'
    ? fmtMonthYear(anchor)
    : `${fmtMonthYear(startDate)} ${fmtDate(startDate).day}日 〜 ${fmtDate(endDate).day}日`;

  const colWidth = mode === 'month' ? 44 : mode === '15days' ? 72 : 100;

  return (
    <div style={g.root}>
      {/* ツールバー */}
      <div style={g.toolbar}>
        <div style={g.modeGroup}>
          {(['week', '15days', 'month'] as ViewMode[]).map(m => (
            <button
              key={m}
              style={{ ...g.modeBtn, ...(mode === m ? g.modeBtnActive : {}) }}
              onClick={() => changeMode(m)}
            >
              {m === 'week' ? '週' : m === '15days' ? '15日' : '月'}
            </button>
          ))}
        </div>

        <div style={g.navGroup}>
          <button style={g.navBtn} onClick={() => navigate(-1)}>‹ 前</button>
          <span style={g.navLabel}>{headerLabel}</span>
          <button style={g.navBtn} onClick={() => navigate(1)}>次 ›</button>
          <button style={g.todayBtn} onClick={() => { setAnchor(getRangeStart(today, mode)); setEditing(null); }}>
            今日
          </button>
        </div>

        {msg && (
          <span style={{ fontSize: 13, color: msg.ok ? '#2e7d32' : '#c62828', fontWeight: 600 }}>
            {msg.text}
          </span>
        )}

        {loading && <span style={{ fontSize: 12, color: '#999' }}>読み込み中...</span>}
      </div>

      {/* グリッド */}
      <div style={g.tableWrap}>
        <table style={g.table}>
          <thead>
            <tr>
              <th style={g.staffTh}>スタッフ</th>
              {dates.map(d => {
                const { day, week, weekIdx } = fmtDate(d);
                const isToday = d === today;
                const isSun = weekIdx === 0;
                const isSat = weekIdx === 6;
                return (
                  <th
                    key={d}
                    style={{
                      ...g.dateTh,
                      width: colWidth,
                      minWidth: colWidth,
                      background: isToday ? '#e8f0fe' : isSun ? '#fff5f5' : isSat ? '#f5f8ff' : '#fafbfc',
                      color: isSun ? '#d32f2f' : isSat ? '#1565c0' : '#333',
                    }}
                  >
                    <div style={{ fontSize: mode === 'month' ? 11 : 13, fontWeight: 700 }}>{day}</div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>{week}</div>
                    {isToday && <div style={g.todayDot} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {staff.map(st => (
              <tr key={st.id}>
                <td style={g.staffTd}>{st.name}</td>
                {dates.map(d => {
                  const shift = getShift(st.id, d);
                  const reqs = getRequests(st.id, d);
                  const isEditing = editing?.staffId === st.id && editing?.date === d;
                  const { weekIdx } = fmtDate(d);
                  const isSun = weekIdx === 0;
                  const isSat = weekIdx === 6;
                  const isToday = d === today;
                  return (
                    <td
                      key={d}
                      style={{
                        ...g.cell,
                        background: isEditing ? '#eff6ff' : isToday ? '#f0f5ff' : isSun ? '#fff8f8' : isSat ? '#f8faff' : '#fff',
                        outline: isEditing ? '2px solid #4f8ef7' : 'none',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleCellClick(st.id, d)}
                    >
                      {shift && (
                        <div style={g.shiftChip}>
                          <span style={g.shiftTime}>{shift.startTime}–{shift.endTime}</span>
                        </div>
                      )}
                      {reqs.map(r => (
                        <div key={r.id} style={{ ...g.reqChip, background: REQUEST_TYPE_COLOR[r.requestType] + '22', color: REQUEST_TYPE_COLOR[r.requestType] }}>
                          {REQUEST_TYPE_LABEL[r.requestType] || r.requestType}
                          {r.startTime && <span style={{ fontSize: 9, marginLeft: 2 }}>{r.startTime}</span>}
                        </div>
                      ))}
                      {!shift && reqs.length === 0 && (
                        <div style={g.emptyCell}>–</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 編集パネル */}
      {editing && (
        <div style={g.editPanel}>
          <div style={g.editTitle}>
            {staff.find(s => s.id === editing.staffId)?.name} —{' '}
            {new Date(editing.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
          </div>
          <div style={g.editRow}>
            <label style={g.editLabel}>開始</label>
            <input type="time" value={editing.startTime}
              onChange={e => setEditing(v => v && ({ ...v, startTime: e.target.value }))}
              style={g.editInput} />
            <label style={g.editLabel}>終了</label>
            <input type="time" value={editing.endTime}
              onChange={e => setEditing(v => v && ({ ...v, endTime: e.target.value }))}
              style={g.editInput} />
            <label style={g.editLabel}>休憩(分)</label>
            <input type="number" value={editing.breakMinutes} min={0} step={15}
              onChange={e => setEditing(v => v && ({ ...v, breakMinutes: Number(e.target.value) }))}
              style={{ ...g.editInput, width: 64 }} />
            <button style={g.saveBtn} onClick={handleSave} disabled={saving} data-testid="kiosk-shift-mgr-save">
              {saving ? '...' : '保存'}
            </button>
            {getShift(editing.staffId, editing.date) && (
              <button
                style={g.deleteBtn}
                onClick={() => handleDelete(getShift(editing.staffId, editing.date)!.id)}
                disabled={saving}
              >
                削除
              </button>
            )}
            <button style={g.cancelBtn} onClick={() => setEditing(null)}>✕</button>
          </div>

          {/* 希望表示 */}
          {getRequests(editing.staffId, editing.date).length > 0 && (
            <div style={g.reqList}>
              <span style={{ fontSize: 11, color: '#666', marginRight: 8 }}>希望:</span>
              {getRequests(editing.staffId, editing.date).map(r => (
                <span key={r.id} style={{ ...g.reqTag, background: REQUEST_TYPE_COLOR[r.requestType] + '22', color: REQUEST_TYPE_COLOR[r.requestType] }}>
                  {REQUEST_TYPE_LABEL[r.requestType] || r.requestType}
                  {r.startTime && `  ${r.startTime}〜${r.endTime}`}
                  {r.note && `  「${r.note}」`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 凡例 */}
      <div style={g.legend}>
        <span style={g.legendItem}><span style={{ ...g.legendDot, background: '#4caf50' }} />○ 希望あり</span>
        <span style={g.legendItem}><span style={{ ...g.legendDot, background: '#ef5350' }} />× 不可</span>
        <span style={g.legendItem}><span style={{ ...g.legendDot, background: '#2196f3' }} />希望シフト</span>
        <span style={g.legendItem}><span style={{ ...g.legendDot, background: '#4f8ef7' }} />確定シフト</span>
      </div>
    </div>
  );
}

const g: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', gap: 12 },
  toolbar: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#fff', padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0' },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: { padding: '6px 16px', border: '1px solid #d0d7e2', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#555', fontFamily: 'sans-serif' },
  modeBtnActive: { background: '#4f8ef7', color: '#fff', borderColor: '#4f8ef7', fontWeight: 700 },
  navGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn: { padding: '6px 12px', border: '1px solid #d0d7e2', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#333', fontFamily: 'sans-serif' },
  navLabel: { fontSize: 14, fontWeight: 700, color: '#222', minWidth: 160, textAlign: 'center' },
  todayBtn: { padding: '5px 10px', border: '1px solid #c7d4f0', borderRadius: 6, background: '#f0f4ff', cursor: 'pointer', fontSize: 12, color: '#4f8ef7', fontFamily: 'sans-serif' },
  tableWrap: { overflowX: 'auto', flex: 1, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' },
  table: { borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '100%' },
  staffTh: { position: 'sticky', left: 0, zIndex: 2, background: '#f8fafc', padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#555', borderBottom: '2px solid #e2e8f0', borderRight: '1px solid #e2e8f0', width: 100, minWidth: 100, textAlign: 'left' },
  dateTh: { padding: '6px 4px', fontSize: 12, fontWeight: 600, textAlign: 'center', borderBottom: '2px solid #e2e8f0', borderRight: '1px solid #f0f0f0', position: 'relative' },
  todayDot: { width: 4, height: 4, borderRadius: '50%', background: '#4f8ef7', margin: '2px auto 0' },
  staffTd: { position: 'sticky', left: 0, zIndex: 1, background: '#f8fafc', padding: '6px 10px', fontSize: 13, fontWeight: 600, color: '#333', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #e2e8f0', whiteSpace: 'nowrap', width: 100, minWidth: 100 },
  cell: { padding: '4px 3px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', verticalAlign: 'top', minHeight: 40, transition: 'background 0.1s' },
  shiftChip: { background: '#e8f0fe', borderRadius: 4, padding: '2px 4px', marginBottom: 2 },
  shiftTime: { fontSize: 10, color: '#1a56db', fontWeight: 600 },
  reqChip: { borderRadius: 4, padding: '1px 4px', fontSize: 10, fontWeight: 600, marginBottom: 1 },
  emptyCell: { textAlign: 'center', fontSize: 12, color: '#ddd', lineHeight: '32px' },
  editPanel: { background: '#fff', border: '2px solid #4f8ef7', borderRadius: 10, padding: '12px 16px' },
  editTitle: { fontSize: 13, fontWeight: 700, color: '#1a56db', marginBottom: 10 },
  editRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  editLabel: { fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  editInput: { padding: '6px 8px', border: '1px solid #d0d7e2', borderRadius: 6, fontSize: 13, fontFamily: 'sans-serif', width: 110 },
  saveBtn: { padding: '7px 18px', background: '#4f8ef7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'sans-serif' },
  deleteBtn: { padding: '7px 14px', background: '#fff', color: '#c62828', border: '1px solid #e0b0b0', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'sans-serif' },
  cancelBtn: { padding: '7px 10px', background: '#fff', color: '#888', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'sans-serif' },
  reqList: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  reqTag: { fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600 },
  legend: { display: 'flex', gap: 16, fontSize: 11, color: '#888', flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
};
