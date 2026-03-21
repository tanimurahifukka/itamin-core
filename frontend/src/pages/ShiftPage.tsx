import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  note: string;
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
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [editing, setEditing] = useState<{ staffId: string; date: string } | null>(null);
  const [editStart, setEditStart] = useState('09:00');
  const [editEnd, setEditEnd] = useState('17:00');

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const loadData = async () => {
    if (!selectedStore) return;
    try {
      const [shiftData, staffData] = await Promise.all([
        api.getWeeklyShifts(selectedStore.id, formatDate(weekStart)),
        api.getStoreStaff(selectedStore.id),
      ]);
      setShifts(shiftData.shifts);
      setStaffList(staffData.staff.map((s: any) => ({ id: s.id, userName: s.userName })));
    } catch {}
  };

  useEffect(() => { loadData(); }, [selectedStore, weekStart]);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const getShift = (staffId: string, date: string) =>
    shifts.find(s => s.staffId === staffId && s.date === date);

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
      loadData();
    } catch {}
  };

  const handleDelete = async (shiftId: string) => {
    if (!selectedStore) return;
    try {
      await api.deleteShift(selectedStore.id, shiftId);
      loadData();
    } catch {}
  };

  return (
    <div className="main-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3>シフト表</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={prevWeek} style={navBtnStyle}>&lt;</button>
          <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>
            {weekStart.getMonth() + 1}/{weekStart.getDate()} 〜
          </span>
          <button onClick={nextWeek} style={navBtnStyle}>&gt;</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>スタッフ</th>
              {weekDates.map((d, i) => (
                <th key={i} style={{
                  ...thStyle,
                  color: i >= 5 ? (i === 5 ? '#2196f3' : '#e94560') : undefined,
                }}>
                  {d.getDate()}{DAYS[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffList.map(staff => (
              <tr key={staff.id}>
                <td style={{ ...tdStyle, fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {staff.userName}
                </td>
                {weekDates.map((d, i) => {
                  const dateStr = formatDate(d);
                  const shift = getShift(staff.id, dateStr);
                  return (
                    <td
                      key={i}
                      style={{ ...tdStyle, cursor: 'pointer', textAlign: 'center', minWidth: 70 }}
                      onClick={() => handleCellClick(staff.id, dateStr)}
                    >
                      {shift ? (
                        <div style={{ background: '#fef3f5', borderRadius: 4, padding: '2px 4px' }}>
                          <div style={{ color: '#e94560', fontWeight: 500 }}>
                            {shift.startTime.slice(0, 5)}
                          </div>
                          <div style={{ color: '#888', fontSize: '0.75rem' }}>
                            {shift.endTime.slice(0, 5)}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#ddd' }}>-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 24,
            width: '90%', maxWidth: 320,
          }}>
            <h4 style={{ marginBottom: 16 }}>
              {staffList.find(s => s.id === editing.staffId)?.userName} - {editing.date}
            </h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} style={inputStyle} />
              <span>〜</span>
              <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} style={{ ...btnStyle, background: '#e94560', color: 'white', flex: 1 }}>
                保存
              </button>
              {getShift(editing.staffId, editing.date) && (
                <button
                  onClick={() => { handleDelete(getShift(editing.staffId, editing.date)!.id); setEditing(null); }}
                  style={{ ...btnStyle, background: '#f5f5f5', color: '#e94560' }}
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

const thStyle: React.CSSProperties = {
  padding: '10px 6px', borderBottom: '2px solid #e0e0e0', textAlign: 'center', fontSize: '0.8rem',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 4px', borderBottom: '1px solid #f0f0f0',
};
const navBtnStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #ddd', borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
};
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '2px solid #e0e0e0', borderRadius: 8, flex: 1,
};
const btnStyle: React.CSSProperties = {
  padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
};
