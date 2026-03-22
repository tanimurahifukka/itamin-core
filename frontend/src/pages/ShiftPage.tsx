import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';

interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  note: string;
  status: 'draft' | 'published';
}

interface ShiftRequest {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  requestType: 'available' | 'unavailable' | 'preferred';
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

interface Template {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  color: string | null;
}

interface StaffMember {
  id: string;
  userName: string;
}

const DAYS = ['月', '火', '水', '木', '金', '土', '日'];

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function formatDate(d: Date) {
  return d.toISOString().split('T')[0];
}

export default function ShiftPage() {
  const { selectedStore } = useAuth();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [editing, setEditing] = useState<{ staffId: string; date: string } | null>(null);
  const [editStart, setEditStart] = useState('09:00');
  const [editEnd, setEditEnd] = useState('17:00');
  const [weekDatesRange, setWeekDatesRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  // テンプレート管理
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplStart, setNewTplStart] = useState('09:00');
  const [newTplEnd, setNewTplEnd] = useState('17:00');

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const loadData = async () => {
    if (!selectedStore) return;
    const dateStr = formatDate(weekStart);
    try {
      const [shiftData, staffData, requestData, tplData] = await Promise.all([
        api.getWeeklyShifts(selectedStore.id, dateStr),
        api.getStoreStaff(selectedStore.id),
        api.getWeeklyRequests(selectedStore.id, dateStr),
        api.getTemplates(selectedStore.id),
      ]);
      setShifts(shiftData.shifts);
      setWeekDatesRange({ start: shiftData.startDate, end: shiftData.endDate });
      setStaffList(staffData.staff.map((s: any) => ({ id: s.id, userName: s.userName })));
      setRequests(requestData.requests);
      setTemplates(tplData.templates);
    } catch {}
  };

  useEffect(() => { loadData(); }, [selectedStore, weekStart]);

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };

  const getShift = (staffId: string, date: string) =>
    shifts.find(s => s.staffId === staffId && s.date === date);

  const getRequest = (staffId: string, date: string) =>
    requests.find(r => r.staffId === staffId && r.date === date);

  const handleCellClick = (staffId: string, date: string) => {
    const existing = getShift(staffId, date);
    setEditing({ staffId, date });
    setEditStart(existing?.startTime?.slice(0, 5) || '09:00');
    setEditEnd(existing?.endTime?.slice(0, 5) || '17:00');
  };

  const handleSave = async () => {
    if (!selectedStore || !editing) return;
    try {
      await api.saveShift(selectedStore.id, {
        staffId: editing.staffId,
        date: editing.date,
        startTime: editStart,
        endTime: editEnd,
      });
      setEditing(null);
      showToast('シフトを保存しました', 'success');
      await loadData();
    } catch (e: any) {
      showToast(e.message || '保存に失敗しました', 'error');
    }
  };

  const handleDelete = async (shiftId: string) => {
    if (!selectedStore) return;
    try {
      await api.deleteShift(selectedStore.id, shiftId);
      loadData();
    } catch {}
  };

  const handlePublish = async () => {
    if (!selectedStore || !weekDatesRange.start) return;
    try {
      const result = await api.publishShifts(selectedStore.id, weekDatesRange.start, weekDatesRange.end);
      if (result.published > 0) {
        showToast(`${result.published}件のシフトを確定しました`, 'success');
      } else {
        showToast('確定するシフトがありません', 'info');
      }
      await loadData();
    } catch (e: any) {
      showToast(e.message || '確定に失敗しました', 'error');
    }
  };

  const applyTemplate = (tpl: Template) => {
    setEditStart(tpl.startTime.slice(0, 5));
    setEditEnd(tpl.endTime.slice(0, 5));
  };

  const handleAddTemplate = async () => {
    if (!selectedStore || !newTplName.trim()) return;
    try {
      await api.saveTemplate(selectedStore.id, {
        name: newTplName.trim(),
        startTime: newTplStart,
        endTime: newTplEnd,
      });
      setNewTplName('');
      loadData();
    } catch {}
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!selectedStore) return;
    try {
      await api.deleteTemplate(selectedStore.id, id);
      loadData();
    } catch {}
  };

  // サマリー計算
  const daySummary = weekDates.map(d => {
    const dateStr = formatDate(d);
    const dayShifts = shifts.filter(s => s.date === dateStr);
    const totalStaff = dayShifts.length;
    const totalHours = dayShifts.reduce((sum, s) => {
      const start = parseTime(s.startTime);
      const end = parseTime(s.endTime);
      return sum + (end - start) / 60 - (s.breakMinutes || 0) / 60;
    }, 0);
    return { totalStaff, totalHours: Math.round(totalHours * 10) / 10 };
  });

  const hasDrafts = shifts.some(s => s.status === 'draft');

  const requestLabel = (r: ShiftRequest) => {
    if (r.requestType === 'unavailable') return '✕';
    if (r.requestType === 'preferred') return '◎';
    return '○';
  };

  const requestColor = (r: ShiftRequest) => {
    if (r.requestType === 'unavailable') return '#c53030';
    if (r.requestType === 'preferred') return '#2563eb';
    return '#22c55e';
  };

  return (
    <div className="main-content">
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>シフト表</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setShowTemplateManager(!showTemplateManager)} style={{ ...navBtnStyle, fontSize: '0.8rem' }}>
            テンプレート
          </button>
          {hasDrafts && (
            <button onClick={handlePublish} style={{ ...navBtnStyle, background: '#2563eb', color: 'white', borderColor: '#2563eb' }}>
              確定
            </button>
          )}
        </div>
      </div>

      {/* 週ナビ */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={prevWeek} style={navBtnStyle}>&lt;</button>
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
          {weekStart.getMonth() + 1}/{weekStart.getDate()} 〜
        </span>
        <button onClick={nextWeek} style={navBtnStyle}>&gt;</button>
      </div>

      {/* テンプレート管理パネル */}
      {showTemplateManager && (
        <div style={{ background: '#fff', border: '1px solid #d4d9df', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: 12 }}>シフトテンプレート</h4>
          {templates.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {templates.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', background: '#f7f8fa', borderRadius: 6, border: '1px solid #e8edf3',
                  fontSize: '0.85rem',
                }}>
                  <span style={{ fontWeight: 500 }}>{t.name}</span>
                  <span style={{ color: '#888' }}>{t.startTime.slice(0, 5)}-{t.endTime.slice(0, 5)}</span>
                  <button
                    onClick={() => handleDeleteTemplate(t.id)}
                    style={{ background: 'none', border: 'none', color: '#c53030', cursor: 'pointer', fontSize: '0.8rem' }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="名前（例: 早番）" value={newTplName} onChange={e => setNewTplName(e.target.value)}
              style={{ ...smallInputStyle, width: 120 }} />
            <input type="time" value={newTplStart} onChange={e => setNewTplStart(e.target.value)} style={smallInputStyle} />
            <span style={{ color: '#888' }}>〜</span>
            <input type="time" value={newTplEnd} onChange={e => setNewTplEnd(e.target.value)} style={smallInputStyle} />
            <button onClick={handleAddTemplate} style={{ ...navBtnStyle, fontSize: '0.8rem' }}>追加</button>
          </div>
        </div>
      )}

      {/* シフト表 */}
      <div className="shift-table-wrap">
        <table className="shift-table">
          <thead>
            <tr>
              <th>スタッフ</th>
              {weekDates.map((d, i) => (
                <th key={i} style={{
                  color: i >= 5 ? (i === 5 ? '#2196f3' : '#c53030') : undefined,
                }}>
                  {d.getDate()}{DAYS[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffList.map(staff => (
              <tr key={staff.id}>
                <td className="staff-name-col">{staff.userName}</td>
                {weekDates.map((d, i) => {
                  const dateStr = formatDate(d);
                  const shift = getShift(staff.id, dateStr);
                  const req = getRequest(staff.id, dateStr);
                  return (
                    <td
                      key={i}
                      className="shift-cell"
                      onClick={() => handleCellClick(staff.id, dateStr)}
                    >
                      {req && (
                        <div className="request-marker" style={{ color: requestColor(req) }}>
                          {requestLabel(req)}
                        </div>
                      )}
                      {shift ? (
                        <div className={`shift-badge ${shift.status}`}>
                          <div className="shift-time">{shift.startTime.slice(0, 5)}</div>
                          <div className="shift-time-end">{shift.endTime.slice(0, 5)}</div>
                        </div>
                      ) : (
                        <span style={{ color: '#ddd' }}>-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="summary-row">
              <td className="staff-name-col">合計</td>
              {daySummary.map((s, i) => (
                <td key={i}>
                  <div>{s.totalStaff}人</div>
                  <div>{s.totalHours}h</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: '0.75rem', color: '#888' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#fff7ed', border: '2px dashed #f59e0b', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />下書き</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#dcfce7', border: '2px solid #22c55e', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />確定</span>
        <span><span style={{ color: '#22c55e', fontWeight: 700, marginRight: 2 }}>○</span>出勤可</span>
        <span><span style={{ color: '#2563eb', fontWeight: 700, marginRight: 2 }}>◎</span>希望</span>
        <span><span style={{ color: '#c53030', fontWeight: 700, marginRight: 2 }}>✕</span>休み希望</span>
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
            <h4 style={{ marginBottom: 12, fontSize: '0.95rem' }}>
              {staffList.find(s => s.id === editing.staffId)?.userName} - {editing.date}
            </h4>

            {/* 希望情報 */}
            {(() => {
              const req = getRequest(editing.staffId, editing.date);
              if (!req) return null;
              return (
                <div style={{
                  background: '#f7f8fa', borderRadius: 6, padding: '8px 12px',
                  marginBottom: 12, fontSize: '0.85rem', color: '#555',
                }}>
                  希望: <span style={{ fontWeight: 600, color: requestColor(req) }}>{requestLabel(req)}</span>
                  {req.startTime && <span> {req.startTime.slice(0, 5)}-{req.endTime?.slice(0, 5)}</span>}
                  {req.note && <span> ({req.note})</span>}
                </div>
              );
            })()}

            {/* テンプレート適用 */}
            {templates.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {templates.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t)} style={{
                    padding: '4px 10px', border: '1px solid #d4d9df', borderRadius: 4,
                    background: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} style={inputStyle} />
              <span>〜</span>
              <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} style={{ ...btnStyle, background: '#2563eb', color: 'white', flex: 1 }}>
                保存
              </button>
              {getShift(editing.staffId, editing.date) && (
                <button
                  onClick={() => { handleDelete(getShift(editing.staffId, editing.date)!.id); setEditing(null); }}
                  style={{ ...btnStyle, background: '#f5f5f5', color: '#c53030' }}
                >
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

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

const navBtnStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #d4d9df', borderRadius: 6, padding: '6px 12px',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 500,
};
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #d4d9df', borderRadius: 6, flex: 1, fontFamily: 'inherit',
};
const smallInputStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.85rem',
};
const btnStyle: React.CSSProperties = {
  padding: '10px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
};
