import { useEffect, useState, useCallback } from 'react';
import { orgApi } from '../api/organizationsClient';
import { shiftMultiApi } from '../api/shiftMultiClient';
import { showToast } from '../components/molecules/Toast';
import TimePicker15 from '../components/organisms/TimePicker15';
import { Tabs } from '../components/molecules/Tabs';
import type { Organization } from '../api/organizationsClient';
import type {
  OrgStore,
  OrgEmployee,
  MultiStoreShift,
  MultiStoreRequest,
  ShiftConflict,
} from '../types/shiftMulti';

type ViewSpan = 'week' | 'half-month' | 'month';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 店舗カラーパレット
const STORE_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#be185d', '#4f46e5',
];

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function formatDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function getDayLabel(d: Date) {
  return DAY_LABELS[d.getDay()];
}

function getDayColor(d: Date) {
  const day = d.getDay();
  if (day === 0) return '#c53030';
  if (day === 6) return '#2196f3';
  return undefined;
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export default function ShiftMultiPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [stores, setStores] = useState<OrgStore[]>([]);
  const [storeFilter, setStoreFilter] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<OrgEmployee[]>([]);
  const [shifts, setShifts] = useState<MultiStoreShift[]>([]);
  const [requests, setRequests] = useState<MultiStoreRequest[]>([]);
  const [conflicts, setConflicts] = useState<ShiftConflict[]>([]);
  const [viewSpan, setViewSpan] = useState<ViewSpan>('week');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [datesRange, setDatesRange] = useState({ start: '', end: '' });
  const [showConflicts, setShowConflicts] = useState(false);

  // 編集モーダル
  const [editing, setEditing] = useState<{
    userId: string;
    date: string;
    storeId: string;
    staffId: string;
  } | null>(null);
  const [editStart, setEditStart] = useState('09:00');
  const [editEnd, setEditEnd] = useState('17:00');
  const [editBreakMinutes, setEditBreakMinutes] = useState(60);
  const [editStoreId, setEditStoreId] = useState('');

  const numDays = viewSpan === 'month'
    ? new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0).getDate()
    : viewSpan === 'half-month' ? 15 : 7;
  const isCompact = viewSpan !== 'week';

  const viewDates = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const storeColorMap = new Map<string, string>();
  stores.forEach((s, i) => storeColorMap.set(s.id, STORE_COLORS[i % STORE_COLORS.length]));

  // 組織一覧取得
  useEffect(() => {
    orgApi.list().then(res => {
      const orgs = res.organizations.filter(
        o => o.myRole === 'owner' || o.myRole === 'admin'
      );
      setOrganizations(orgs);
      if (orgs.length > 0 && !selectedOrgId) {
        setSelectedOrgId(orgs[0].id);
      }
    }).catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, []);

  // スタッフ取得
  useEffect(() => {
    if (!selectedOrgId) return;
    shiftMultiApi.getOrgStaff(selectedOrgId).then(res => {
      setEmployees(res.employees);
    }).catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, [selectedOrgId]);

  // シフトデータ取得
  const loadShifts = useCallback(async () => {
    if (!selectedOrgId) return;
    const dateStr = formatDate(weekStart);
    try {
      const [weeklyData, conflictData] = await Promise.all([
        shiftMultiApi.getWeeklyShifts(selectedOrgId, dateStr, numDays),
        shiftMultiApi.getConflicts(selectedOrgId, dateStr, numDays),
      ]);
      setStores(weeklyData.stores);
      setShifts(weeklyData.shifts);
      setRequests(weeklyData.requests);
      setDatesRange({ start: weeklyData.startDate, end: weeklyData.endDate });
      setConflicts(conflictData.conflicts);

      // 初回は全店舗表示
      if (storeFilter.size === 0 && weeklyData.stores.length > 0) {
        setStoreFilter(new Set(weeklyData.stores.map(s => s.id)));
      }
    } catch {}
  }, [selectedOrgId, weekStart, numDays]);

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

  // ナビゲーション
  const stepDays = viewSpan === 'half-month' ? 15 : 7;
  const prevPeriod = () => {
    if (viewSpan === 'month') {
      setWeekStart(new Date(weekStart.getFullYear(), weekStart.getMonth() - 1, 1));
    } else {
      const d = new Date(weekStart);
      d.setDate(d.getDate() - stepDays);
      setWeekStart(getMonday(d));
    }
  };
  const nextPeriod = () => {
    if (viewSpan === 'month') {
      setWeekStart(new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 1));
    } else {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + stepDays);
      setWeekStart(getMonday(d));
    }
  };

  // 店舗フィルター切替
  const toggleStore = (storeId: string) => {
    const next = new Set(storeFilter);
    if (next.has(storeId)) {
      next.delete(storeId);
    } else {
      next.add(storeId);
    }
    setStoreFilter(next);
  };

  // フィルター後のスタッフ
  const filteredEmployees = employees.filter(emp =>
    emp.stores.some(s => storeFilter.has(s.storeId))
  );

  // セルのシフト取得
  const getShiftsForCell = (userId: string, date: string) =>
    shifts.filter(s => s.userId === userId && s.date === date && storeFilter.has(s.storeId));

  // セルのリクエスト取得
  const getRequestsForCell = (userId: string, date: string) =>
    requests.filter(r => r.userId === userId && r.date === date && storeFilter.has(r.storeId));

  // 重複判定
  const hasConflict = (userId: string, date: string) =>
    conflicts.some(c => c.userId === userId && c.date === date && c.hasTimeOverlap);

  // セルクリック
  const handleCellClick = (emp: OrgEmployee, dateStr: string) => {
    const existingShifts = getShiftsForCell(emp.userId, dateStr);
    const firstStore = emp.stores[0];
    if (existingShifts.length > 0) {
      const s = existingShifts[0];
      setEditing({ userId: emp.userId, date: dateStr, storeId: s.storeId, staffId: s.staffId });
      setEditStart(s.startTime?.slice(0, 5) || '09:00');
      setEditEnd(s.endTime?.slice(0, 5) || '17:00');
      setEditBreakMinutes(s.breakMinutes ?? 60);
      setEditStoreId(s.storeId);
    } else {
      setEditing({
        userId: emp.userId,
        date: dateStr,
        storeId: firstStore.storeId,
        staffId: firstStore.staffId,
      });
      setEditStart('09:00');
      setEditEnd('17:00');
      setEditBreakMinutes(60);
      setEditStoreId(firstStore.storeId);
    }
  };

  // 店舗変更時に staffId を更新
  const handleStoreChange = (newStoreId: string) => {
    if (!editing) return;
    const emp = employees.find(e => e.userId === editing.userId);
    const storeEntry = emp?.stores.find(s => s.storeId === newStoreId);
    if (storeEntry) {
      setEditStoreId(newStoreId);
      setEditing({
        ...editing,
        storeId: newStoreId,
        staffId: storeEntry.staffId,
      });
    }
  };

  // シフト保存
  const handleSave = async () => {
    if (!selectedOrgId || !editing) return;
    try {
      const result = await shiftMultiApi.saveShift(selectedOrgId, {
        storeId: editing.storeId,
        staffId: editing.staffId,
        date: editing.date,
        startTime: editStart,
        endTime: editEnd,
        breakMinutes: editBreakMinutes,
      });
      setEditing(null);
      if (result.conflicts && result.conflicts.length > 0) {
        const names = result.conflicts.map(c => c.storeName).join(', ');
        showToast(`保存しました（${names} と時間帯が重複しています）`, 'info');
      } else {
        showToast('シフトを保存しました', 'success');
      }
      await loadShifts();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
    }
  };

  // シフト削除
  const handleDelete = async (shiftId: string) => {
    if (!confirm('このシフトを削除しますか？')) return;
    if (!selectedOrgId) return;
    try {
      await shiftMultiApi.deleteShift(selectedOrgId, shiftId);
      showToast('シフトを削除しました', 'info');
      setEditing(null);
      await loadShifts();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    }
  };

  // 一括確定
  const handlePublish = async () => {
    if (!selectedOrgId || !datesRange.start) return;
    try {
      const result = await shiftMultiApi.publishAll(
        selectedOrgId,
        datesRange.start,
        datesRange.end,
      );
      if (result.published > 0) {
        showToast(`${result.published}件のシフトを確定しました`, 'success');
      } else {
        showToast('確定するシフトがありません', 'info');
      }
      await loadShifts();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '確定に失敗しました', 'error');
    }
  };

  // サマリー
  const daySummary = viewDates.map(d => {
    const dateStr = formatDate(d);
    const dayShifts = shifts.filter(s => s.date === dateStr && storeFilter.has(s.storeId));
    const totalStaff = new Set(dayShifts.map(s => s.userId)).size;
    const totalHours = dayShifts.reduce((sum, s) => {
      const start = parseTime(s.startTime);
      const end = parseTime(s.endTime);
      return sum + (end - start) / 60 - (s.breakMinutes || 0) / 60;
    }, 0);
    return { totalStaff, totalHours: Math.round(totalHours * 10) / 10 };
  });

  const hasDrafts = shifts.some(s => s.status === 'draft');
  const hasTimeConflicts = conflicts.some(c => c.hasTimeOverlap);

  const lastDate = viewDates[viewDates.length - 1];
  const periodLabel = viewSpan === 'month'
    ? `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月`
    : viewSpan === 'half-month'
    ? `${weekStart.getMonth() + 1}/${weekStart.getDate()} 〜 ${lastDate.getMonth() + 1}/${lastDate.getDate()}`
    : `${weekStart.getMonth() + 1}/${weekStart.getDate()} 〜`;

  if (organizations.length === 0) {
    return (
      <div className="main-content">
        <h3>マルチ店舗シフト管理</h3>
        <p style={{ color: '#888', marginTop: 16 }}>
          管理者権限を持つ組織がありません。組織を作成し、複数の店舗を紐付けてください。
        </p>
        <a href="/organizations" style={{ color: '#2563eb', textDecoration: 'underline' }}>
          組織管理へ
        </a>
      </div>
    );
  }

  return (
    <div className="main-content">
      {/* ヘッダー: 組織選択 + アクション */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>マルチ店舗シフト</h3>
          {organizations.length > 1 && (
            <select
              value={selectedOrgId}
              onChange={e => setSelectedOrgId(e.target.value)}
              style={selectStyle}
            >
              {organizations.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tabs
            value={viewSpan}
            onChange={(span) => {
              setViewSpan(span);
              if (span === 'month') {
                setWeekStart(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1));
              } else {
                setWeekStart(getMonday(weekStart));
              }
            }}
            className="mb-0"
            items={[
              { value: 'week', label: '週' },
              { value: 'half-month', label: '半月' },
              { value: 'month', label: '月' },
            ]}
          />
          {hasTimeConflicts && (
            <button
              onClick={() => setShowConflicts(!showConflicts)}
              style={{ ...navBtnStyle, color: '#dc2626', borderColor: '#fca5a5' }}
            >
              {conflicts.filter(c => c.hasTimeOverlap).length}件の重複
            </button>
          )}
          {hasDrafts && (
            <button
              onClick={handlePublish}
              style={{ ...navBtnStyle, background: '#2563eb', color: 'white', borderColor: '#2563eb' }}
            >
              一括確定
            </button>
          )}
        </div>
      </div>

      {/* 店舗フィルター */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {stores.map(store => {
          const color = storeColorMap.get(store.id) || '#666';
          const active = storeFilter.has(store.id);
          return (
            <button
              key={store.id}
              onClick={() => toggleStore(store.id)}
              style={{
                padding: '4px 12px',
                borderRadius: 16,
                border: `2px solid ${color}`,
                background: active ? color : 'white',
                color: active ? 'white' : color,
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {store.name}
            </button>
          );
        })}
      </div>

      {/* 期間ナビ */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={prevPeriod} style={navBtnStyle}>&lt;</button>
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{periodLabel}</span>
        <button onClick={nextPeriod} style={navBtnStyle}>&gt;</button>
      </div>

      {/* 重複警告パネル */}
      {showConflicts && conflicts.filter(c => c.hasTimeOverlap).length > 0 && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: 12, marginBottom: 16, fontSize: '0.85rem',
        }}>
          <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 8 }}>
            時間帯重複のあるシフト
          </div>
          {conflicts.filter(c => c.hasTimeOverlap).map((c, i) => (
            <div key={i} style={{ marginBottom: 4, color: '#7f1d1d' }}>
              <strong>{c.userName}</strong> ({c.date}):{' '}
              {c.shifts.map((s, j) => (
                <span key={j}>
                  {j > 0 && ' / '}
                  <span style={{ color: storeColorMap.get(s.storeId) || '#666', fontWeight: 600 }}>
                    {s.storeName}
                  </span>
                  {' '}{s.startTime.slice(0, 5)}-{s.endTime.slice(0, 5)}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* シフト表 */}
      <div className="shift-table-wrap">
        <table className="shift-table" style={isCompact ? { fontSize: '0.75rem' } : undefined}>
          <thead>
            <tr>
              <th style={{ minWidth: 100 }}>スタッフ</th>
              {viewDates.map((d, i) => (
                <th key={i} style={{
                  color: getDayColor(d),
                  ...(isCompact ? { padding: '6px 2px' } : {}),
                }}>
                  {d.getDate()}{getDayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map(emp => (
              <tr key={emp.userId}>
                <td className="staff-name-col" style={isCompact ? { fontSize: '0.75rem', padding: '4px 6px' } : undefined}>
                  <div>{emp.name}</div>
                  <div style={{ fontSize: '0.65rem', color: '#999' }}>
                    {emp.stores
                      .filter(s => storeFilter.has(s.storeId))
                      .map(s => s.storeName)
                      .join(' / ')}
                  </div>
                </td>
                {viewDates.map((d, i) => {
                  const dateStr = formatDate(d);
                  const cellShifts = getShiftsForCell(emp.userId, dateStr);
                  const cellRequests = getRequestsForCell(emp.userId, dateStr);
                  const conflict = hasConflict(emp.userId, dateStr);
                  return (
                    <td
                      key={i}
                      className="shift-cell"
                      style={{
                        ...(isCompact ? { padding: '3px 1px' } : {}),
                        ...(conflict ? { background: '#fef2f2' } : {}),
                        cursor: 'pointer',
                      }}
                      onClick={() => handleCellClick(emp, dateStr)}
                    >
                      {conflict && (
                        <div style={{
                          position: 'absolute', top: 1, right: 2,
                          fontSize: '0.6rem', color: '#dc2626', fontWeight: 700,
                        }}>
                          !
                        </div>
                      )}
                      {cellRequests.map(r => (
                        <div key={r.id} className="request-marker" style={{
                          color: r.requestType === 'unavailable' ? '#c53030'
                               : r.requestType === 'preferred' ? '#2563eb' : '#22c55e',
                          ...(isCompact ? { fontSize: '0.65rem' } : {}),
                        }}>
                          {r.requestType === 'unavailable' ? '✕' : r.requestType === 'preferred' ? '◎' : '○'}
                        </div>
                      ))}
                      {cellShifts.map(shift => {
                        const color = storeColorMap.get(shift.storeId) || '#666';
                        return (
                          <div
                            key={shift.id}
                            className={`shift-badge ${shift.status}`}
                            style={{
                              ...(isCompact ? { padding: '2px 3px' } : {}),
                              borderColor: color,
                              borderLeft: `3px solid ${color}`,
                            }}
                          >
                            <div className="shift-time" style={{
                              ...(isCompact ? { fontSize: '0.7rem' } : {}),
                              color,
                            }}>
                              {shift.startTime.slice(0, 5)}
                            </div>
                            <div className="shift-time-end" style={{
                              ...(isCompact ? { fontSize: '0.65rem' } : {}),
                            }}>
                              {shift.endTime.slice(0, 5)}
                            </div>
                            {!isCompact && (
                              <div style={{ fontSize: '0.6rem', color, opacity: 0.8 }}>
                                {shift.storeName}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {cellShifts.length === 0 && cellRequests.length === 0 && (
                        <span style={{ color: '#ddd' }}>-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="summary-row">
              <td className="staff-name-col" style={isCompact ? { fontSize: '0.75rem' } : undefined}>合計</td>
              {daySummary.map((s, i) => (
                <td key={i} style={isCompact ? { fontSize: '0.7rem', padding: '4px 2px' } : undefined}>
                  <div>{s.totalStaff}人</div>
                  <div>{s.totalHours}h</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: '0.75rem', color: '#888', flexWrap: 'wrap' }}>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#fff7ed', border: '2px dashed #f59e0b', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          下書き
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#dcfce7', border: '2px solid #22c55e', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          確定
        </span>
        <span style={{ color: '#dc2626', fontWeight: 600 }}>! 時間帯重複</span>
        {stores.map(store => {
          const color = storeColorMap.get(store.id) || '#666';
          return (
            <span key={store.id}>
              <span style={{ display: 'inline-block', width: 12, height: 12, background: color, borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
              {store.name}
            </span>
          );
        })}
      </div>

      {/* 編集モーダル */}
      {editing && (() => {
        const emp = employees.find(e => e.userId === editing.userId);
        const existingShift = shifts.find(
          s => s.userId === editing.userId && s.date === editing.date && s.storeId === editStoreId
        );
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }} onClick={() => setEditing(null)}>
            <div style={{
              background: 'white', borderRadius: 10, padding: 24,
              width: '90%', maxWidth: 400,
            }} onClick={e => e.stopPropagation()}>
              <h4 style={{ marginBottom: 12, fontSize: '0.95rem' }}>
                {emp?.name} - {editing.date}
              </h4>

              {/* 店舗選択 */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: 4 }}>
                  店舗
                </label>
                <select
                  value={editStoreId}
                  onChange={e => handleStoreChange(e.target.value)}
                  style={selectStyle}
                >
                  {emp?.stores.map(s => (
                    <option key={s.storeId} value={s.storeId}>{s.storeName}</option>
                  ))}
                </select>
              </div>

              {/* リクエスト表示 */}
              {getRequestsForCell(editing.userId, editing.date).map(req => (
                <div key={req.id} style={{
                  background: '#f7f8fa', borderRadius: 6, padding: '8px 12px',
                  marginBottom: 8, fontSize: '0.85rem', color: '#555',
                }}>
                  <span style={{
                    color: storeColorMap.get(req.storeId) || '#666',
                    fontWeight: 600, marginRight: 4,
                  }}>
                    {req.storeName}
                  </span>
                  希望:{' '}
                  <span style={{
                    fontWeight: 600,
                    color: req.requestType === 'unavailable' ? '#c53030'
                         : req.requestType === 'preferred' ? '#2563eb' : '#22c55e',
                  }}>
                    {req.requestType === 'unavailable' ? '✕' : req.requestType === 'preferred' ? '◎' : '○'}
                  </span>
                  {req.startTime && <span> {req.startTime.slice(0, 5)}-{req.endTime?.slice(0, 5)}</span>}
                  {req.note && <span> ({req.note})</span>}
                </div>
              ))}

              {/* 他店舗のシフト（重複警告） */}
              {shifts
                .filter(s => s.userId === editing.userId && s.date === editing.date && s.storeId !== editStoreId)
                .map(s => (
                  <div key={s.id} style={{
                    background: '#fef2f2', borderRadius: 6, padding: '8px 12px',
                    marginBottom: 8, fontSize: '0.85rem', color: '#991b1b',
                    borderLeft: `3px solid ${storeColorMap.get(s.storeId) || '#666'}`,
                  }}>
                    <span style={{ fontWeight: 600 }}>{s.storeName}</span>
                    {' '}{s.startTime.slice(0, 5)}-{s.endTime.slice(0, 5)} ({s.status === 'published' ? '確定' : '下書き'})
                  </div>
                ))
              }

              {/* 時刻入力 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <TimePicker15 value={editStart} onChange={setEditStart} />
                <span>〜</span>
                <TimePicker15 value={editEnd} onChange={setEditEnd} />
              </div>

              {/* 休憩時間プリセット */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.8rem', color: '#666', display: 'block', marginBottom: 6 }}>休憩時間</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 30, 45, 60].map(mins => (
                    <button
                      key={mins}
                      onClick={() => setEditBreakMinutes(mins)}
                      style={{
                        padding: '6px 12px', border: '1px solid #d4d9df', borderRadius: 6,
                        background: editBreakMinutes === mins ? '#2563eb' : '#fff',
                        color: editBreakMinutes === mins ? '#fff' : '#555',
                        fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                        fontWeight: editBreakMinutes === mins ? 600 : 400,
                      }}
                    >
                      {mins}分
                    </button>
                  ))}
                </div>
              </div>

              {/* アクションボタン */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSave} style={{ ...btnStyle, background: '#2563eb', color: 'white', flex: 1 }}>
                  保存
                </button>
                {existingShift && (
                  <button
                    onClick={() => handleDelete(existingShift.id)}
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
        );
      })()}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #d4d9df', borderRadius: 6, padding: '6px 12px',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 500,
};

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #d4d9df', borderRadius: 6,
  fontFamily: 'inherit', fontSize: '0.85rem', background: 'white',
};

const btnStyle: React.CSSProperties = {
  padding: '10px 16px', border: 'none', borderRadius: 6, cursor: 'pointer',
  fontWeight: 500, fontFamily: 'inherit',
};
