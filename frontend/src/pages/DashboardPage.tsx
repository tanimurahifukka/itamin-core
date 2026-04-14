import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/molecules/Toast';
import { Modal } from '../components/molecules/Modal';
import { BreakMinutesField } from '../components/molecules/BreakMinutesField';
import { Button } from '../components/atoms/Button';
import { StatusDot } from '../components/atoms/StatusDot';
import { ErrorMessage } from '../components/atoms/ErrorMessage';
import { SummaryCard } from '../components/molecules/SummaryCard';
import { Tabs } from '../components/molecules/Tabs';
import type { TimeRecord, MonthlySummaryStaff, StaffMember, MonthlyRecordsResponse, MonthlyRawStaffRecord } from '../types/api';
import { todayJST, formatDateJST, formatShortDateJST, formatTimeJST, currentJstYearMonth, isoToJstDateTimeLocalValue, jstDateTimeLocalValueToIso } from '../lib/dateUtils';
import { EmptyState } from '../components/molecules/EmptyState';

type ViewMode = 'daily' | 'monthly' | 'staff';

type MonthlyData = MonthlyRecordsResponse;
type RawStaffRecord = MonthlyRawStaffRecord;

function permissionLevelToRoles(level: string | undefined): string[] {
  switch (level) {
    case 'owner_manager':
      return ['owner', 'manager'];
    case 'owner_manager_leader':
      return ['owner', 'manager', 'leader'];
    case 'owner':
    default:
      return ['owner'];
  }
}

export default function DashboardPage() {
  const { selectedStore } = useAuth();
  const initialMonth = currentJstYearMonth();
  const isOwner = selectedStore?.role === 'owner';
  const [editAllowedRoles, setEditAllowedRoles] = useState<string[]>(['owner']);
  const [deleteAllowedRoles, setDeleteAllowedRoles] = useState<string[]>(['owner']);
  const canEdit = !!selectedStore?.role && editAllowedRoles.includes(selectedStore.role);
  const canDelete = !!selectedStore?.role && deleteAllowedRoles.includes(selectedStore.role);

  // 打刻プラグインの edit_permission / delete_permission を読む
  useEffect(() => {
    if (!selectedStore) return;
    api.getPluginSettings(selectedStore.id)
      .then(data => {
        const punch = data.plugins.find(p => p.name === 'punch');
        const editLevel = punch?.config?.edit_permission as string | undefined;
        const deleteLevel = punch?.config?.delete_permission as string | undefined;
        setEditAllowedRoles(permissionLevelToRoles(editLevel));
        setDeleteAllowedRoles(permissionLevelToRoles(deleteLevel));
      })
      .catch(() => {
        setEditAllowedRoles(['owner']);
        setDeleteAllowedRoles(['owner']);
      });
  }, [selectedStore]);
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [date, setDate] = useState(todayJST());
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);
  const [year, setYear] = useState(initialMonth.year);
  const [month, setMonth] = useState(initialMonth.month);

  // スタッフ別ビュー
  const [selectedStaff, setSelectedStaff] = useState<{ staffId: string; staffName: string } | null>(null);

  // 未退勤レコード（ペア不一致）
  const [staleRecords, setStaleRecords] = useState<(TimeRecord & { date: string })[]>([]);

  // 編集モーダル (edit mode は editRecord!=null、create mode は isCreating=true)
  const [editRecord, setEditRecord] = useState<TimeRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editBreakMinutes, setEditBreakMinutes] = useState(0);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const [editStaffId, setEditStaffId] = useState('');
  const [storeStaff, setStoreStaff] = useState<StaffMember[]>([]);

  // 日別データ取得
  const loadDailyRecords = useCallback(() => {
    if (!selectedStore) return;
    api.getDailyRecords(selectedStore.id, date)
      .then(data => setRecords(data.records))
      .catch(() => { console.error('[DashboardPage] fetch failed'); });
  }, [selectedStore, date]);

  useEffect(() => { loadDailyRecords(); }, [loadDailyRecords]);

  // 月別データ取得
  useEffect(() => {
    if (!selectedStore || (viewMode !== 'monthly' && viewMode !== 'staff')) return;
    api.getMonthlyRecords(selectedStore.id, year, month)
      .then(data => setMonthlyData(data))
      .catch(() => setMonthlyData(null));
  }, [selectedStore, viewMode, year, month]);

  // 未退勤レコード検出（全日の clock_out = null）
  useEffect(() => {
    if (!selectedStore || !canEdit) return;
    // 今日の日別データから未退勤を取得 + 過去分は別途チェック
    // 直近7日間をスキャンして未退勤を検出
    const checkStale = async () => {
      const stale: (TimeRecord & { date: string })[] = [];
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = formatDateJST(d);
        try {
          const data = await api.getDailyRecords(selectedStore.id, dateStr);
          const unpaired = (data.records || []).filter((r: TimeRecord) => !r.clockOut);
          // 今日の「勤務中」は除外（当日は正常な勤務中の可能性）
          if (i === 0) {
            // 当日でも出勤から12時間以上経過していたら異常とみなす
            const now = Date.now();
            unpaired.forEach((r: TimeRecord) => {
              const elapsed = (now - new Date(r.clockIn).getTime()) / 3600000;
              if (elapsed > 12) stale.push({ ...r, date: dateStr });
            });
          } else {
            unpaired.forEach((r: TimeRecord) => stale.push({ ...r, date: dateStr }));
          }
        } catch {}
      }
      setStaleRecords(stale);
    };
    checkStale();
  }, [selectedStore, canEdit]);

  const formatTime = (iso: string) => formatTimeJST(iso);

  const calcHours = (record: TimeRecord) => {
    if (!record.clockOut) return null;
    const diff = (new Date(record.clockOut).getTime() - new Date(record.clockIn).getTime()) / 3600000;
    return diff - (record.breakMinutes || 0) / 60;
  };

  const calcHoursStr = (record: TimeRecord) => {
    const h = calcHours(record);
    if (h === null) return '勤務中';
    return `${h.toFixed(1)}h`;
  };

  // 編集モーダルを開く
  const openEditModal = (record: TimeRecord) => {
    if (!canEdit) return;
    setIsCreating(false);
    setEditRecord(record);
    setEditStaffId(record.staffId || '');
    setEditClockIn(isoToJstDateTimeLocalValue(record.clockIn));
    setEditClockOut(record.clockOut ? isoToJstDateTimeLocalValue(record.clockOut) : '');
    setEditBreakMinutes(record.breakMinutes || 0);
    setEditError('');
  };

  // 新規作成モーダルを開く
  const openCreateModal = async () => {
    if (!canEdit || !selectedStore) return;
    // デフォルト値: 表示中の日付の 09:00-17:00
    const baseDate = date;
    setIsCreating(true);
    setEditRecord(null);
    setEditStaffId('');
    setEditClockIn(`${baseDate}T09:00`);
    setEditClockOut(`${baseDate}T17:00`);
    setEditBreakMinutes(60);
    setEditError('');
    // スタッフ一覧を読み込み (既に読み込み済みならスキップ)
    if (storeStaff.length === 0) {
      try {
        const data = await api.getStoreStaff(selectedStore.id);
        setStoreStaff(data.staff);
      } catch {
        setEditError('スタッフ一覧の取得に失敗しました');
      }
    }
  };

  const closeEditModal = () => {
    setEditRecord(null);
    setIsCreating(false);
    setEditError('');
  };

  const handleEditSubmit = async () => {
    if (!selectedStore || editSubmitting) return;
    setEditSubmitting(true);
    setEditError('');

    try {
      if (isCreating) {
        if (!editStaffId) {
          setEditError('スタッフを選択してください');
          setEditSubmitting(false);
          return;
        }
        if (!editClockIn) {
          setEditError('出勤時刻は必須です');
          setEditSubmitting(false);
          return;
        }
        const newClockIn = jstDateTimeLocalValueToIso(editClockIn);
        const newClockOut = editClockOut ? jstDateTimeLocalValueToIso(editClockOut) : null;
        await api.createTimeRecord(selectedStore.id, {
          staffId: editStaffId,
          clockIn: newClockIn,
          clockOut: newClockOut,
          breakMinutes: editBreakMinutes,
        });
        showToast('勤怠記録を作成しました', 'success');
        closeEditModal();
        loadDailyRecords();
        return;
      }

      if (!editRecord) return;

      // clockOut accepts null to explicitly clear the value (not supported by the API type, but handled server-side)
      const updates: { clockIn?: string; clockOut?: string | null; breakMinutes?: number } = {};
      const newClockIn = jstDateTimeLocalValueToIso(editClockIn);
      const newClockOut = editClockOut ? jstDateTimeLocalValueToIso(editClockOut) : undefined;

      if (newClockIn !== editRecord.clockIn) updates.clockIn = newClockIn;
      if (editClockOut && newClockOut !== editRecord.clockOut) updates.clockOut = newClockOut;
      if (!editClockOut && editRecord.clockOut) updates.clockOut = null;
      if (editBreakMinutes !== (editRecord.breakMinutes || 0)) updates.breakMinutes = editBreakMinutes;

      if (Object.keys(updates).length === 0) {
        closeEditModal();
        return;
      }

      await api.updateTimeRecord(selectedStore.id, editRecord.id, updates);
      showToast('勤怠記録を修正しました', 'success');
      closeEditModal();
      // データ再読み込み
      loadDailyRecords();
      // 未退勤リストも更新
      setStaleRecords(prev => prev.filter(r => r.id !== editRecord.id));
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleEditDelete = async () => {
    if (!selectedStore || !editRecord || editSubmitting) return;
    const name = editRecord.staffName || 'このスタッフ';
    if (!window.confirm(`${name}さんのこの勤怠記録を削除します。よろしいですか？`)) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      await api.deleteTimeRecord(selectedStore.id, editRecord.id);
      showToast('勤怠記録を削除しました', 'success');
      const deletedId = editRecord.id;
      closeEditModal();
      loadDailyRecords();
      setStaleRecords(prev => prev.filter(r => r.id !== deletedId));
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSubmitting(false);
    }
  };

  // 人件費計算
  const calcLaborCost = (record: TimeRecord) => {
    const h = calcHours(record);
    if (h === null || !record.hourlyWage) return null;
    return Math.round(h * record.hourlyWage);
  };

  // 今日のサマリー計算
  const isToday = date === todayJST();
  const working = records.filter(r => !r.clockOut);
  const finished = records.filter(r => r.clockOut);
  const totalHoursToday = finished.reduce((sum, r) => sum + (calcHours(r) || 0), 0);
  const totalLaborCost = finished.reduce((sum, r) => sum + (calcLaborCost(r) || 0), 0);
  // 出勤したスタッフのユニーク交通費合計
  const totalTransportFee = records
    .filter((r, i, arr) => arr.findIndex(a => a.staffId === r.staffId) === i)
    .reduce((sum, r) => sum + (r.transportFee || 0), 0);
  const totalDailyCost = totalLaborCost + totalTransportFee;

  const handlePrevMonth = () => {
    if (month === 1) { setYear((y: number) => y - 1); setMonth(12); }
    else setMonth((m: number) => m - 1);
  };
  const handleNextMonth = () => {
    if (month === 12) { setYear((y: number) => y + 1); setMonth(1); }
    else setMonth((m: number) => m + 1);
  };

  return (
    <>
      {/* 未退勤アラート */}
      {canEdit && staleRecords.length > 0 && (
        <div className="stale-alert" data-testid="stale-alert-banner">
          <div className="stale-alert-header">
            <span className="stale-alert-icon">!</span>
            <strong>退勤未打刻が {staleRecords.length} 件あります</strong>
          </div>
          <div className="stale-alert-list">
            {staleRecords.map((r) => (
              <div key={r.id} className="stale-alert-item">
                <span>{r.date} {r.staffName || '—'}</span>
                <span className="stale-alert-time">出勤 {formatTime(r.clockIn)}〜</span>
                <button
                  className="stale-alert-fix-btn"
                  onClick={() => openEditModal(r)}
                  data-testid={`stale-fix-btn-${r.id}`}
                >
                  修正
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ビュー切替タブ */}
      <Tabs
        value={viewMode}
        onChange={setViewMode}
        items={[
          { value: 'daily', label: '日別' },
          { value: 'monthly', label: '月別集計' },
          { value: 'staff', label: 'スタッフ別', dataTestId: 'staff-view-tab' },
        ]}
      />

      {viewMode === 'daily' && (
        <>
          {/* サマリーカード */}
          {records.length > 0 && (
            <div className="today-summary" style={isOwner ? { gridTemplateColumns: 'repeat(4, 1fr)' } : undefined}>
              {isToday && <SummaryCard variant="working" value={working.length} label="勤務中" />}
              <SummaryCard variant="finished" value={finished.length} label="退勤済み" />
              <SummaryCard variant="hours" value={totalHoursToday.toFixed(1)} label="合計時間" />
              {isOwner && (
                <SummaryCard
                  variant="labor"
                  value={`¥${totalLaborCost.toLocaleString()}`}
                  label="概算人件費"
                  data-testid="daily-labor-cost"
                />
              )}
              {isOwner && totalTransportFee > 0 && (
                <SummaryCard
                  value={`¥${totalTransportFee.toLocaleString()}`}
                  label="交通費"
                  data-testid="daily-transport-cost"
                />
              )}
              {isOwner && (
                <SummaryCard
                  value={`¥${totalDailyCost.toLocaleString()}`}
                  label="1日コスト合計"
                  data-testid="daily-total-cost"
                  className="border-l-[#ef4444]"
                />
              )}
            </div>
          )}

          {/* 日別タイムカード */}
          <div className="records-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
              <h3>日別タイムカード</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="date-picker"
                />
                {canEdit && (
                  <button
                    className="edit-record-btn"
                    onClick={openCreateModal}
                    data-testid="create-record-btn"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    ＋ 新規追加
                  </button>
                )}
              </div>
            </div>

            {records.length === 0 ? (
              <EmptyState icon="📋" text={isToday ? 'まだ出勤記録がありません' : 'この日の記録はありません'} hint={isToday ? 'スタッフが出勤すると自動的に表示されます' : '日付を変更して別の日の記録を確認できます'} />
            ) : (
              <table className="records-table">
                <thead>
                  <tr>
                    <th>スタッフ</th>
                    <th>出勤</th>
                    <th>退勤</th>
                    <th>休憩</th>
                    <th>実働</th>
                    {isOwner && <th>人件費</th>}
                    {isOwner && <th>交通費</th>}
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const cost = calcLaborCost(r);
                    return (
                      <tr key={r.id} className={!r.clockOut ? 'row-working row-unpaired' : ''}>
                        <td>
                          <span className="staff-name-cell">{r.staffName || '—'}</span>
                          {!r.clockOut && <StatusDot state="working_pulse" title="勤務中" />}
                        </td>
                        <td>{formatTime(r.clockIn)}</td>
                        <td className={!r.clockOut ? 'text-unpaired' : ''}>
                          {r.clockOut ? formatTime(r.clockOut) : '未打刻'}
                        </td>
                        <td>{r.breakMinutes}分</td>
                        <td className={!r.clockOut ? 'text-working' : ''}>
                          {calcHoursStr(r)}
                        </td>
                        {isOwner && (
                          <td style={{ textAlign: 'right' }}>
                            {cost !== null ? `¥${cost.toLocaleString()}` : '—'}
                          </td>
                        )}
                        {isOwner && (
                          <td style={{ textAlign: 'right' }}>
                            ¥{(r.transportFee || 0).toLocaleString()}
                          </td>
                        )}
                        {canEdit && (
                          <td>
                            <button
                              className="edit-record-btn"
                              onClick={() => openEditModal(r)}
                              data-testid={`edit-record-btn-${r.id}`}
                            >
                              編集
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {isOwner && finished.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 700, background: '#f9fafb' }}>
                      <td>合計</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td>{totalHoursToday.toFixed(1)}h</td>
                      <td style={{ textAlign: 'right' }}>¥{totalLaborCost.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>¥{totalTransportFee.toLocaleString()}</td>
                      {canEdit && <td></td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </>
      )}

      {viewMode === 'monthly' && (
        /* 月別集計ビュー */
        <div className="records-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3>月別集計</h3>
            <div className="month-nav">
              <button className="month-nav-btn" onClick={handlePrevMonth}>&lt;</button>
              <span className="month-nav-label">{year}年{month}月</span>
              <button className="month-nav-btn" onClick={handleNextMonth}>&gt;</button>
            </div>
          </div>

          {monthlyData?.summary && monthlyData.summary.length > 0 ? (
            <>
            <table className="records-table">
              <thead>
                <tr>
                  <th>スタッフ</th>
                  <th>出勤日数</th>
                  <th>合計時間</th>
                  <th>平均/日</th>
                  {isOwner && <th>時給</th>}
                  {isOwner && <th>概算給与</th>}
                  {isOwner && <th>交通費計</th>}
                  {isOwner && <th>合計コスト</th>}
                </tr>
              </thead>
              <tbody>
                {monthlyData.summary.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <button
                        className="staff-name-link"
                        onClick={() => { setSelectedStaff({ staffId: s.staffId, staffName: s.staffName }); setViewMode('staff'); }}
                        data-testid={`staff-detail-btn-${s.staffId}`}
                      >
                        {s.staffName || '—'}
                      </button>
                    </td>
                    <td>{s.workDays ?? '—'}日</td>
                    <td>{s.totalWorkHours != null ? `${Number(s.totalWorkHours).toFixed(1)}h` : '—'}</td>
                    <td>
                      {s.totalWorkHours != null && s.workDays
                        ? `${(Number(s.totalWorkHours) / (s.workDays || 1)).toFixed(1)}h`
                        : '—'}
                    </td>
                    {isOwner && <td>{s.hourlyWage ? `¥${Number(s.hourlyWage).toLocaleString()}` : '—'}</td>}
                    {isOwner && <td>
                      {s.estimatedSalary != null ? `¥${Number(s.estimatedSalary).toLocaleString()}` : '—'}
                    </td>}
                    {isOwner && <td>
                      {s.totalTransportFee != null ? `¥${Number(s.totalTransportFee).toLocaleString()}` : '—'}
                    </td>}
                    {isOwner && <td style={{ fontWeight: 600 }}>
                      {s.totalCost != null ? `¥${Number(s.totalCost).toLocaleString()}` : '—'}
                    </td>}
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 700, background: '#f9fafb' }}>
                  <td>合計</td>
                  <td>—</td>
                  <td>
                    {monthlyData.summary.reduce((sum, s) => sum + (Number(s.totalWorkHours) || 0), 0).toFixed(1)}h
                  </td>
                  <td>—</td>
                  {isOwner && <td>—</td>}
                  {isOwner && <td style={{ color: '#2563eb' }}>
                    ¥{monthlyData.summary.reduce((sum, s) => sum + (Number(s.estimatedSalary) || 0), 0).toLocaleString()}
                  </td>}
                </tr>
              </tbody>
            </table>
            </>
          ) : (
            <EmptyState icon="📊" text="この月の集計データがありません" hint="月を変更して別の期間を確認できます" />
          )}
        </div>
      )}

      {viewMode === 'staff' && (
        <div className="records-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3>
              {selectedStaff
                ? `${selectedStaff.staffName} のタイムカード`
                : 'スタッフ別タイムカード'}
            </h3>
            <div className="month-nav">
              <button className="month-nav-btn" onClick={handlePrevMonth}>&lt;</button>
              <span className="month-nav-label">{year}年{month}月</span>
              <button className="month-nav-btn" onClick={handleNextMonth}>&gt;</button>
            </div>
          </div>

          {/* スタッフ選択 */}
          {monthlyData?.summary && monthlyData.summary.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {monthlyData.summary.map((s) => (
                <button
                  key={s.staffId}
                  className={`staff-chip ${selectedStaff?.staffId === s.staffId ? 'active' : ''}`}
                  onClick={() => setSelectedStaff({ staffId: s.staffId, staffName: s.staffName })}
                  data-testid={`staff-chip-${s.staffId}`}
                >
                  {s.staffName || '—'}
                </button>
              ))}
            </div>
          )}

          {/* スタッフ別月間明細 */}
          {selectedStaff && monthlyData?.records ? (() => {
            const staffRecords = (monthlyData.records || [])
              .filter((r: MonthlyRawStaffRecord) => r.staff_id === selectedStaff.staffId)
              .sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());

            const staffSummary = monthlyData.summary?.find((s) => s.staffId === selectedStaff.staffId);

            if (staffRecords.length === 0) {
              return (
                <EmptyState icon="📋" text="この月の勤務記録はありません" />
              );
            }

            return (
              <>
                {/* スタッフサマリー */}
                {staffSummary && (
                  <div className="today-summary" style={isOwner ? { gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 } : { marginBottom: 16 }}>
                    <SummaryCard variant="finished" value={`${staffSummary.workDays}日`} label="出勤日数" />
                    <SummaryCard variant="hours" value={`${Number(staffSummary.totalWorkHours).toFixed(1)}h`} label="合計時間" />
                    {isOwner && (
                      <SummaryCard
                        variant="labor"
                        value={`¥${staffSummary.hourlyWage?.toLocaleString() || '—'}`}
                        label="時給"
                      />
                    )}
                    {isOwner && (
                      <SummaryCard
                        value={`¥${Number(staffSummary.estimatedSalary).toLocaleString()}`}
                        label="概算給与"
                        className="border-l-[#2563eb]"
                      />
                    )}
                  </div>
                )}

                <table className="records-table">
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th>出勤</th>
                      <th>退勤</th>
                      <th>休憩</th>
                      <th>実働</th>
                      {isOwner && <th>人件費</th>}
                      {canEdit && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {staffRecords.map((r: MonthlyRawStaffRecord) => {
                      const mapped: TimeRecord = {
                        id: r.id,
                        clockIn: r.clock_in,
                        clockOut: r.clock_out,
                        breakMinutes: r.break_minutes,
                        hourlyWage: r.staff?.hourly_wage || staffSummary?.hourlyWage || 0,
                        staffName: selectedStaff.staffName,
                      };
                      const h = calcHours(mapped);
                      const cost = h !== null && mapped.hourlyWage ? Math.round(h * mapped.hourlyWage) : null;
                      const dateStr = formatShortDateJST(r.clock_in);
                      return (
                        <tr key={r.id} className={!r.clock_out ? 'row-working row-unpaired' : ''}>
                          <td>{dateStr}</td>
                          <td>{formatTime(r.clock_in)}</td>
                          <td className={!r.clock_out ? 'text-unpaired' : ''}>
                            {r.clock_out ? formatTime(r.clock_out) : '未打刻'}
                          </td>
                          <td>{r.break_minutes}分</td>
                          <td>{h !== null ? `${h.toFixed(1)}h` : '勤務中'}</td>
                          {isOwner && (
                            <td style={{ textAlign: 'right' }}>
                              {cost !== null ? `¥${cost.toLocaleString()}` : '—'}
                            </td>
                          )}
                          {canEdit && (
                            <td>
                              <button
                                className="edit-record-btn"
                                onClick={() => openEditModal(mapped)}
                                data-testid={`edit-staff-record-btn-${r.id}`}
                              >
                                編集
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  {isOwner && staffSummary && (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 700, background: '#f9fafb' }}>
                        <td>合計</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td>{Number(staffSummary.totalWorkHours).toFixed(1)}h</td>
                        <td style={{ textAlign: 'right', color: '#2563eb' }}>¥{Number(staffSummary.estimatedSalary).toLocaleString()}</td>
                        {canEdit && <td></td>}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </>
            );
          })() : (
            <EmptyState icon="👤" text="スタッフを選択してください" hint="上のボタンからスタッフを選ぶと月間タイムカードが表示されます" />
          )}
        </div>
      )}

      {/* 勤怠編集モーダル (create / edit 兼用) */}
      <Modal
        open={!!editRecord || isCreating}
        onClose={closeEditModal}
        size="sm"
        actions={
          <div data-testid="edit-record-modal-actions" className="flex w-full flex-wrap gap-2">
            <Button variant="secondary" onClick={closeEditModal} data-testid="edit-cancel-btn">
              キャンセル
            </Button>
            {!isCreating && editRecord && canDelete && (
              <Button
                variant="secondary"
                onClick={handleEditDelete}
                disabled={editSubmitting}
                data-testid="edit-delete-btn"
                className="border-error text-error"
              >
                削除
              </Button>
            )}
            <Button
              className="flex-[2] bg-gradient-to-br from-[#0f3460] to-[#16213e] text-white hover:opacity-90"
              onClick={handleEditSubmit}
              disabled={editSubmitting}
              data-testid="edit-save-btn"
            >
              {editSubmitting ? (isCreating ? '作成中...' : '保存中...') : (isCreating ? '作成' : '保存')}
            </Button>
          </div>
        }
      >
        {(editRecord || isCreating) && (
          <div data-testid="edit-record-modal">
            <h3 className="text-center text-[1.2rem] text-[#1a1a2e] mb-1">
              {isCreating ? '勤怠記録の新規作成' : '勤怠記録の修正'}
            </h3>
            <p className="text-center text-[0.85rem] text-[#888] mb-5">
              {isCreating
                ? 'スタッフと時刻を選択して作成します'
                : `${editRecord?.staffName || '—'} さんの記録を修正します`}
            </p>

            {editError && <ErrorMessage className="mb-2 mt-0">{editError}</ErrorMessage>}

            {isCreating && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>スタッフ</label>
                <select
                  value={editStaffId}
                  onChange={e => setEditStaffId(e.target.value)}
                  data-testid="edit-staff-select"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontSize: '1rem', background: 'white' }}
                >
                  <option value="">選択してください</option>
                  {storeStaff
                    .filter(s => s.role !== 'owner')
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.userName}（{s.role}）
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>出勤時刻</label>
              <input
                type="datetime-local"
                value={editClockIn}
                onChange={e => setEditClockIn(e.target.value)}
                data-testid="edit-clock-in-input"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontSize: '1rem' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>退勤時刻</label>
              <input
                type="datetime-local"
                value={editClockOut}
                onChange={e => setEditClockOut(e.target.value)}
                data-testid="edit-clock-out-input"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontSize: '1rem' }}
              />
              {!editClockOut && (
                <p style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: 4 }}>未打刻 — 退勤時刻を入力してください</p>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>休憩時間</label>
              <BreakMinutesField
                value={editBreakMinutes}
                onChange={setEditBreakMinutes}
                inputTestId="edit-break-input"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
