import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';

type ViewMode = 'daily' | 'monthly' | 'staff';

export default function DashboardPage() {
  const { selectedStore } = useAuth();
  const isOwner = selectedStore?.role === 'owner';
  const isManager = selectedStore?.role === 'manager';
  const canEdit = isOwner || isManager;
  const [records, setRecords] = useState<any[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // スタッフ別ビュー
  const [selectedStaff, setSelectedStaff] = useState<{ staffId: string; staffName: string } | null>(null);

  // 未退勤レコード（ペア不一致）
  const [staleRecords, setStaleRecords] = useState<any[]>([]);

  // 編集モーダル
  const [editRecord, setEditRecord] = useState<any>(null);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editBreakMinutes, setEditBreakMinutes] = useState(0);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // 日別データ取得
  const loadDailyRecords = () => {
    if (!selectedStore) return;
    api.getDailyRecords(selectedStore.id, date)
      .then(data => setRecords(data.records))
      .catch(() => {});
  };

  useEffect(() => { loadDailyRecords(); }, [selectedStore, date]);

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
      const stale: any[] = [];
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        try {
          const data = await api.getDailyRecords(selectedStore.id, dateStr);
          const unpaired = (data.records || []).filter((r: any) => !r.clockOut);
          // 今日の「勤務中」は除外（当日は正常な勤務中の可能性）
          if (i === 0) {
            // 当日でも出勤から12時間以上経過していたら異常とみなす
            const now = Date.now();
            unpaired.forEach((r: any) => {
              const elapsed = (now - new Date(r.clockIn).getTime()) / 3600000;
              if (elapsed > 12) stale.push({ ...r, date: dateStr });
            });
          } else {
            unpaired.forEach((r: any) => stale.push({ ...r, date: dateStr }));
          }
        } catch {}
      }
      setStaleRecords(stale);
    };
    checkStale();
  }, [selectedStore, canEdit]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  const toLocalDatetimeStr = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const calcHours = (record: any) => {
    if (!record.clockOut) return null;
    const diff = (new Date(record.clockOut).getTime() - new Date(record.clockIn).getTime()) / 3600000;
    return diff - (record.breakMinutes || 0) / 60;
  };

  const calcHoursStr = (record: any) => {
    const h = calcHours(record);
    if (h === null) return '勤務中';
    return `${h.toFixed(1)}h`;
  };

  // 編集モーダルを開く
  const openEditModal = (record: any) => {
    if (!canEdit) return;
    setEditRecord(record);
    setEditClockIn(toLocalDatetimeStr(record.clockIn));
    setEditClockOut(record.clockOut ? toLocalDatetimeStr(record.clockOut) : '');
    setEditBreakMinutes(record.breakMinutes || 0);
    setEditError('');
  };

  const closeEditModal = () => {
    setEditRecord(null);
    setEditError('');
  };

  const handleEditSubmit = async () => {
    if (!selectedStore || !editRecord || editSubmitting) return;
    setEditSubmitting(true);
    setEditError('');

    try {
      const updates: any = {};
      const newClockIn = new Date(editClockIn).toISOString();
      const newClockOut = editClockOut ? new Date(editClockOut).toISOString() : undefined;

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
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  // 人件費計算
  const calcLaborCost = (record: any) => {
    const h = calcHours(record);
    if (h === null || !record.hourlyWage) return null;
    return Math.round(h * record.hourlyWage);
  };

  // 1日コスト計算（人件費 + 交通費）
  const calcDailyCost = (record: any) => {
    const labor = calcLaborCost(record);
    if (labor === null) return null;
    return labor + (record.transportFee || 0);
  };

  // 今日のサマリー計算
  const isToday = date === new Date().toISOString().split('T')[0];
  const working = records.filter(r => !r.clockOut);
  const finished = records.filter(r => r.clockOut);
  const totalHoursToday = finished.reduce((sum, r) => sum + (calcHours(r) || 0), 0);
  const totalLaborCost = finished.reduce((sum, r) => sum + (calcLaborCost(r) || 0), 0);
  // 出勤したスタッフのユニーク交通費合計
  const uniqueStaffIds = new Set(records.map((r: any) => r.staffId));
  const totalTransportFee = records
    .filter((r: any, i: number, arr: any[]) => arr.findIndex((a: any) => a.staffId === r.staffId) === i)
    .reduce((sum: number, r: any) => sum + (r.transportFee || 0), 0);
  const totalDailyCost = totalLaborCost + totalTransportFee;

  const handlePrevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const handleNextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
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
            {staleRecords.map((r: any) => (
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
      <div className="view-mode-tabs">
        <button
          className={`view-mode-tab ${viewMode === 'daily' ? 'active' : ''}`}
          onClick={() => setViewMode('daily')}
        >
          日別
        </button>
        <button
          className={`view-mode-tab ${viewMode === 'monthly' ? 'active' : ''}`}
          onClick={() => setViewMode('monthly')}
        >
          月別集計
        </button>
        <button
          className={`view-mode-tab ${viewMode === 'staff' ? 'active' : ''}`}
          onClick={() => setViewMode('staff')}
          data-testid="staff-view-tab"
        >
          スタッフ別
        </button>
      </div>

      {viewMode === 'daily' && (
        <>
          {/* サマリーカード */}
          {records.length > 0 && (
            <div className="today-summary" style={isOwner ? { gridTemplateColumns: 'repeat(4, 1fr)' } : undefined}>
              {isToday && (
                <div className="summary-card working">
                  <div className="summary-number">{working.length}</div>
                  <div className="summary-label">勤務中</div>
                </div>
              )}
              <div className="summary-card finished">
                <div className="summary-number">{finished.length}</div>
                <div className="summary-label">退勤済み</div>
              </div>
              <div className="summary-card hours">
                <div className="summary-number">{totalHoursToday.toFixed(1)}</div>
                <div className="summary-label">合計時間</div>
              </div>
              {isOwner && (
                <div className="summary-card labor" data-testid="daily-labor-cost">
                  <div className="summary-number">¥{totalLaborCost.toLocaleString()}</div>
                  <div className="summary-label">概算人件費</div>
                </div>
              )}
              {isOwner && totalTransportFee > 0 && (
                <div className="summary-card" data-testid="daily-transport-cost">
                  <div className="summary-number">¥{totalTransportFee.toLocaleString()}</div>
                  <div className="summary-label">交通費</div>
                </div>
              )}
              {isOwner && (
                <div className="summary-card" data-testid="daily-total-cost" style={{ borderLeft: '4px solid #ef4444' }}>
                  <div className="summary-number">¥{totalDailyCost.toLocaleString()}</div>
                  <div className="summary-label">1日コスト合計</div>
                </div>
              )}
            </div>
          )}

          {/* 日別タイムカード */}
          <div className="records-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>日別タイムカード</h3>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="date-picker"
              />
            </div>

            {records.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <p className="empty-state-text">
                  {isToday ? 'まだ出勤記録がありません' : 'この日の記録はありません'}
                </p>
                <p className="empty-state-hint">
                  {isToday ? 'スタッフが出勤すると自動的に表示されます' : '日付を変更して別の日の記録を確認できます'}
                </p>
              </div>
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
                  {records.map((r: any) => {
                    const cost = calcLaborCost(r);
                    return (
                      <tr key={r.id} className={!r.clockOut ? 'row-working row-unpaired' : ''}>
                        <td>
                          <span className="staff-name-cell">{r.staffName || '—'}</span>
                          {!r.clockOut && <span className="status-dot" title="勤務中" />}
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
                {monthlyData.summary.map((s: any, i: number) => (
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
                    <td>{s.workDays ?? s.totalDays ?? '—'}日</td>
                    <td>{s.totalWorkHours != null ? `${Number(s.totalWorkHours).toFixed(1)}h` : '—'}</td>
                    <td>
                      {s.totalWorkHours != null && (s.workDays || s.totalDays)
                        ? `${(Number(s.totalWorkHours) / (s.workDays || s.totalDays || 1)).toFixed(1)}h`
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
                    {monthlyData.summary.reduce((sum: number, s: any) => sum + (Number(s.totalWorkHours) || 0), 0).toFixed(1)}h
                  </td>
                  <td>—</td>
                  {isOwner && <td>—</td>}
                  {isOwner && <td style={{ color: '#2563eb' }}>
                    ¥{monthlyData.summary.reduce((sum: number, s: any) => sum + (Number(s.estimatedSalary) || 0), 0).toLocaleString()}
                  </td>}
                </tr>
              </tbody>
            </table>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <p className="empty-state-text">この月の集計データがありません</p>
              <p className="empty-state-hint">月を変更して別の期間を確認できます</p>
            </div>
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
              {monthlyData.summary.map((s: any) => (
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
              .filter((r: any) => r.staff_id === selectedStaff.staffId)
              .sort((a: any, b: any) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());

            const staffSummary = monthlyData.summary?.find((s: any) => s.staffId === selectedStaff.staffId);

            if (staffRecords.length === 0) {
              return (
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <p className="empty-state-text">この月の勤務記録はありません</p>
                </div>
              );
            }

            return (
              <>
                {/* スタッフサマリー */}
                {staffSummary && (
                  <div className="today-summary" style={isOwner ? { gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 } : { marginBottom: 16 }}>
                    <div className="summary-card finished">
                      <div className="summary-number">{staffSummary.workDays}日</div>
                      <div className="summary-label">出勤日数</div>
                    </div>
                    <div className="summary-card hours">
                      <div className="summary-number">{Number(staffSummary.totalWorkHours).toFixed(1)}h</div>
                      <div className="summary-label">合計時間</div>
                    </div>
                    {isOwner && (
                      <div className="summary-card labor">
                        <div className="summary-number">¥{staffSummary.hourlyWage?.toLocaleString() || '—'}</div>
                        <div className="summary-label">時給</div>
                      </div>
                    )}
                    {isOwner && (
                      <div className="summary-card" style={{ borderLeftColor: '#2563eb' }}>
                        <div className="summary-number">¥{Number(staffSummary.estimatedSalary).toLocaleString()}</div>
                        <div className="summary-label">概算給与</div>
                      </div>
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
                    {staffRecords.map((r: any) => {
                      const mapped = {
                        id: r.id,
                        clockIn: r.clock_in,
                        clockOut: r.clock_out,
                        breakMinutes: r.break_minutes,
                        hourlyWage: r.staff?.hourly_wage || staffSummary?.hourlyWage || 0,
                        staffName: selectedStaff.staffName,
                      };
                      const h = calcHours(mapped);
                      const cost = h !== null && mapped.hourlyWage ? Math.round(h * mapped.hourlyWage) : null;
                      const dateStr = new Date(r.clock_in).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' });
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
            <div className="empty-state">
              <div className="empty-state-icon">👤</div>
              <p className="empty-state-text">スタッフを選択してください</p>
              <p className="empty-state-hint">上のボタンからスタッフを選ぶと月間タイムカードが表示されます</p>
            </div>
          )}
        </div>
      )}

      {/* 勤怠編集モーダル */}
      {editRecord && (
        <div className="break-modal-overlay" onClick={closeEditModal}>
          <div className="break-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }} data-testid="edit-record-modal">
            <h3>勤怠記録の修正</h3>
            <p className="break-modal-desc">
              {editRecord.staffName || '—'} さんの記録を修正します
            </p>

            {editError && <div className="error-msg" style={{ marginBottom: 8 }}>{editError}</div>}

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
              <div className="break-input-row">
                <input
                  type="number"
                  min={0}
                  max={480}
                  value={editBreakMinutes}
                  onChange={e => setEditBreakMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                  className="break-input"
                  data-testid="edit-break-input"
                />
                <span className="break-unit">分</span>
              </div>
              <div className="break-presets">
                {[0, 15, 30, 45, 60].map(m => (
                  <button
                    key={m}
                    className={`break-preset ${editBreakMinutes === m ? 'active' : ''}`}
                    onClick={() => setEditBreakMinutes(m)}
                  >
                    {m}分
                  </button>
                ))}
              </div>
            </div>

            <div className="break-modal-actions">
              <button className="break-cancel" onClick={closeEditModal} data-testid="edit-cancel-btn">
                キャンセル
              </button>
              <button
                className="break-confirm"
                onClick={handleEditSubmit}
                disabled={editSubmitting}
                data-testid="edit-save-btn"
              >
                {editSubmitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
