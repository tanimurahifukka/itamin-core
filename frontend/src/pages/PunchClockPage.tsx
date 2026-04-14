import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import ChecklistGate from '../components/organisms/ChecklistGate';
import PunchRouteHint from '../components/organisms/PunchRouteHint';
import { showToast } from '../components/molecules/Toast';
import { Modal } from '../components/molecules/Modal';
import { BreakMinutesField } from '../components/molecules/BreakMinutesField';
import { Button } from '../components/atoms/Button';
import { ErrorMessage } from '../components/atoms/ErrorMessage';
import type { MenuItem, InventoryItem, DailyReportItem } from '../types/api';

// 打刻テーマの濃紺グラデーション（旧 .break-confirm の配色）
const PUNCH_CONFIRM_CLASS =
  'flex-[2] bg-gradient-to-br from-[#0f3460] to-[#16213e] text-white hover:opacity-90';
import { todayJST } from '../lib/dateUtils';

const WEATHER_OPTIONS = ['晴れ', '曇り', '雨', '雪'];
const MANAGED_ROLES = ['manager', 'leader'];

export default function PunchClockPage() {
  const { selectedStore } = useAuth();
  const [time, setTime] = useState(new Date());
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<Date | null>(null);
  const [staffId, setStaffId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // チェックリストゲート状態
  const [showChecklist, setShowChecklist] = useState(false);
  const [checklistTiming, setChecklistTiming] = useState<'clock_in' | 'clock_out'>('clock_in');

  // 休憩時間入力モーダル
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [punchSuccess, setPunchSuccess] = useState<'in' | 'out' | null>(null);

  // 退勤押し忘れ修正モーダル
  const [showStaleModal, setShowStaleModal] = useState(false);
  const [staleRecord, setStaleRecord] = useState<{ id: string; clockIn: string; breakMinutes: number } | null>(null);
  const [staleClockOut, setStaleClockOut] = useState('');
  const [staleBreakMinutes, setStaleBreakMinutes] = useState(0);
  const [correctingStale, setCorrectingStale] = useState(false);

  // 退勤時レポートフォーム（マネージャー/リーダー用）
  const [showClockOutReport, setShowClockOutReport] = useState(false);
  const [reportSales, setReportSales] = useState('');
  const [reportCustomers, setReportCustomers] = useState('');
  const [reportWeather, setReportWeather] = useState('晴れ');
  const [reportMemo, setReportMemo] = useState('');
  const [reportInputMode, setReportInputMode] = useState<'manual' | 'menu'>('manual');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuQuantities, setMenuQuantities] = useState<Record<string, number>>({});
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryUpdates, setInventoryUpdates] = useState<Record<string, string>>({});
  const [submittingReport, setSubmittingReport] = useState(false);

  const isManagerRole = selectedStore && MANAGED_ROLES.includes(selectedStore.role);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedStore) return;
    // オーナーは打刻対象外なので status API を叩かない (backend が 403 を返す設計)
    if (selectedStore.role === 'owner') return;
    api.getTimecardStatus(selectedStore.id).then(data => {
      setStaffId(data.staffId || '');

      // 退勤押し忘れ検出: 前日以前の未退勤レコード
      if (data.isClockedIn && data.isStale && data.currentRecord) {
        setStaleRecord({
          id: data.currentRecord.id,
          clockIn: data.currentRecord.clockIn,
          breakMinutes: data.currentRecord.breakMinutes || 0,
        });
        const clockInDate = new Date(data.currentRecord.clockIn);
        const eightHoursLater = new Date(clockInDate.getTime() + 8 * 60 * 60 * 1000);
        const sameDay2300 = new Date(clockInDate);
        sameDay2300.setHours(23, 0, 0, 0);
        const defaultOut = eightHoursLater < sameDay2300 ? eightHoursLater : sameDay2300;
        const pad = (n: number) => String(n).padStart(2, '0');
        const localStr = `${defaultOut.getFullYear()}-${pad(defaultOut.getMonth() + 1)}-${pad(defaultOut.getDate())}T${pad(defaultOut.getHours())}:${pad(defaultOut.getMinutes())}`;
        setStaleClockOut(localStr);
        setStaleBreakMinutes(data.currentRecord.breakMinutes || 0);
        setIsClockedIn(false); // 退勤忘れの場合は「未出勤」扱いにする
        setShowStaleModal(true);
        return;
      }

      setIsClockedIn(data.isClockedIn);
      if (data.currentRecord) {
        setClockInTime(new Date(data.currentRecord.clockIn));
      }
    }).catch((e) => { setError('勤怠状態の取得に失敗しました。再読込してください。'); void e; });
  }, [selectedStore]);

  // マネージャー/リーダーの場合、メニュー・在庫データを事前読込
  useEffect(() => {
    if (!selectedStore || !isManagerRole) return;
    api.getMenuItems(selectedStore.id, true)
      .then(data => setMenuItems(data.items || []))
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
    api.getInventory(selectedStore.id)
      .then(data => setInventoryItems(data.items || []))
      .catch(() => { showToast('読み込みに失敗しました', 'error'); });
  }, [selectedStore, isManagerRole]);

  // 打刻ボタン押下 → チェックリスト表示
  const handlePunchRequest = () => {
    if (!selectedStore || loading) return;
    if (isClockedIn) {
      // 退勤時は休憩入力モーダルを表示
      setBreakMinutes(0);
      setShowBreakModal(true);
    } else {
      // 出勤時はチェックリストへ
      setChecklistTiming('clock_in');
      setShowChecklist(true);
    }
  };

  // 休憩入力確定 → チェックリストへ
  const handleBreakConfirm = () => {
    setShowBreakModal(false);
    setChecklistTiming('clock_out');
    setShowChecklist(true);
  };

  // チェックリスト完了 → マネージャー/リーダーはレポートフォーム表示、それ以外は即退勤
  const handleChecklistComplete = async () => {
    setShowChecklist(false);
    if (!selectedStore) return;

    if (isClockedIn && isManagerRole) {
      // 今日の既存日報を読み込み
      const today = todayJST();
      try {
        const data = await api.getDailyReport(selectedStore.id, today);
        if (data.report) {
          setReportSales(String(data.report.sales || ''));
          setReportCustomers(String(data.report.customerCount || ''));
          setReportWeather(data.report.weather || '晴れ');
          setReportMemo(data.report.memo || '');
        }
        if (data.items && data.items.length > 0) {
          const q: Record<string, number> = {};
          data.items.forEach((item: DailyReportItem) => { q[item.menuItemId] = item.quantity; });
          setMenuQuantities(q);
          setReportInputMode('menu');
        }
      } catch {}
      // 在庫データを再取得
      api.getInventory(selectedStore.id)
        .then(d => setInventoryItems(d.items || []))
        .catch(() => { showToast('読み込みに失敗しました', 'error'); });
      setShowClockOutReport(true);
      return;
    }

    // 出勤 or 非管理者退勤は即実行
    await executePunch();
  };

  // 退勤レポート送信 → 日報保存 + 在庫更新 + 退勤
  const handleReportSubmit = async () => {
    if (!selectedStore || submittingReport) return;
    setSubmittingReport(true);
    setError('');

    try {
      const today = todayJST();
      const menuTotal = Object.entries(menuQuantities).reduce((sum, [id, qty]) => {
        const item = menuItems.find(m => m.id === id);
        return sum + (item ? item.price * qty : 0);
      }, 0);

      const items = reportInputMode === 'menu'
        ? Object.entries(menuQuantities)
            .filter(([, qty]) => qty > 0)
            .map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
        : undefined;

      // 日報保存
      await api.saveDailyReport(selectedStore.id, {
        date: today,
        sales: reportInputMode === 'menu' ? menuTotal : (Number(reportSales) || 0),
        customerCount: Number(reportCustomers) || 0,
        weather: reportWeather,
        memo: reportMemo,
        items,
      });

      // 在庫更新
      const invUpdates = Object.entries(inventoryUpdates).filter(([, val]) => val !== '');
      for (const [itemId, val] of invUpdates) {
        try {
          await api.updateInventoryItem(selectedStore.id, itemId, { quantity: Number(val) || 0 });
        } catch {}
      }

      // 退勤実行
      await api.clockOut(selectedStore.id, breakMinutes);
      setIsClockedIn(false);
      setClockInTime(null);
      setBreakMinutes(0);
      setPunchSuccess('out');
      setShowClockOutReport(false);
      resetReportForm();
      showToast('日報を保存し、退勤しました。お疲れさまでした！', 'success');
      setTimeout(() => setPunchSuccess(null), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingReport(false);
    }
  };

  // レポートをスキップして退勤
  const handleReportSkip = async () => {
    if (submittingReport) return;
    setShowClockOutReport(false);
    resetReportForm();
    await executePunch();
  };

  const resetReportForm = () => {
    setReportSales('');
    setReportCustomers('');
    setReportWeather('晴れ');
    setReportMemo('');
    setReportInputMode('manual');
    setMenuQuantities({});
    setInventoryUpdates({});
  };

  // 未退勤レコード修正 → 新規出勤
  const handleStaleCorrect = async () => {
    if (!selectedStore || !staleRecord || !staleClockOut || correctingStale) return;
    setCorrectingStale(true);
    setError('');

    try {
      const clockOutISO = new Date(staleClockOut).toISOString();
      const data = await api.correctAndClockIn(selectedStore.id, staleRecord.id, clockOutISO, staleBreakMinutes);
      setIsClockedIn(true);
      setClockInTime(new Date(data.record.clockIn));
      setShowStaleModal(false);
      setStaleRecord(null);
      setPunchSuccess('in');
      showToast('前回の退勤を修正し、出勤しました！', 'success');
      setTimeout(() => setPunchSuccess(null), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCorrectingStale(false);
    }
  };

  // 実際の打刻実行
  const executePunch = async () => {
    if (!selectedStore) return;
    setLoading(true);
    setError('');

    try {
      if (isClockedIn) {
        await api.clockOut(selectedStore.id, breakMinutes);
        setIsClockedIn(false);
        setClockInTime(null);
        setBreakMinutes(0);
        setPunchSuccess('out');
        showToast('退勤しました。お疲れさまでした！', 'success');
      } else {
        const data = await api.clockIn(selectedStore.id);
        setIsClockedIn(true);
        setClockInTime(new Date(data.record.clockIn));
        setPunchSuccess('in');
        showToast('出勤しました。今日もよろしくお願いします！', 'success');
      }
      setTimeout(() => setPunchSuccess(null), 2000);
    } catch (e: unknown) {
      // 退勤押し忘れ検出: 409 + staleRecord
      // ApiRequestError has .status and .body properties set by the API client
      const apiErr = e as { status?: number; body?: { staleRecord?: { id: string; clockIn: string; breakMinutes: number } }; message?: string };
      if (apiErr.status === 409 && apiErr.body?.staleRecord) {
        setStaleRecord(apiErr.body.staleRecord);
        // デフォルト退勤時刻: 出勤から8時間後 or 前日23:00のうち早い方
        const clockInDate = new Date(apiErr.body.staleRecord.clockIn);
        const eightHoursLater = new Date(clockInDate.getTime() + 8 * 60 * 60 * 1000);
        const sameDay2300 = new Date(clockInDate);
        sameDay2300.setHours(23, 0, 0, 0);
        const defaultOut = eightHoursLater < sameDay2300 ? eightHoursLater : sameDay2300;
        // datetime-local形式に変換（ローカルタイムゾーン）
        const pad = (n: number) => String(n).padStart(2, '0');
        const localStr = `${defaultOut.getFullYear()}-${pad(defaultOut.getMonth() + 1)}-${pad(defaultOut.getDate())}T${pad(defaultOut.getHours())}:${pad(defaultOut.getMinutes())}`;
        setStaleClockOut(localStr);
        setStaleBreakMinutes(apiErr.body.staleRecord.breakMinutes || 0);
        setShowStaleModal(true);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  };

  const setMenuQty = (itemId: string, delta: number) => {
    setMenuQuantities(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [itemId]: next };
    });
  };

  const menuTotal = Object.entries(menuQuantities).reduce((sum, [id, qty]) => {
    const item = menuItems.find(m => m.id === id);
    return sum + (item ? item.price * qty : 0);
  }, 0);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatDate = (d: Date) =>
    d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const elapsed = clockInTime
    ? Math.floor((time.getTime() - clockInTime.getTime()) / 60000)
    : 0;
  const elapsedH = Math.floor(elapsed / 60);
  const elapsedM = elapsed % 60;

  return (
    <div className="punch-clock">
      {selectedStore && (
        <PunchRouteHint
          storeId={selectedStore.id}
          isManager={!!isManagerRole || selectedStore.role === 'owner'}
        />
      )}
      <div className="current-time">{formatTime(time)}</div>
      <div className="current-date">{formatDate(time)}</div>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <button
        className={`punch-btn ${isClockedIn ? 'clock-out' : 'clock-in'} ${punchSuccess ? 'punch-success' : ''}`}
        onClick={handlePunchRequest}
        disabled={loading || (!staffId && !error && selectedStore?.role !== 'owner')}
      >
        {loading ? '...' : punchSuccess === 'in' ? '✓' : punchSuccess === 'out' ? '✓' : isClockedIn ? '退勤' : '出勤'}
      </button>

      {isClockedIn && clockInTime && (
        <div className="punch-status">
          <span className="since">{formatTime(clockInTime)}</span> から勤務中
          （{elapsedH}時間{elapsedM}分）
        </div>
      )}

      {/* 休憩時間入力モーダル */}
      <Modal
        open={showBreakModal}
        onClose={() => setShowBreakModal(false)}
        size="sm"
        actions={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setShowBreakModal(false)}>
              キャンセル
            </Button>
            <Button className={PUNCH_CONFIRM_CLASS} onClick={handleBreakConfirm}>
              退勤する
            </Button>
          </>
        }
      >
        <h3 className="text-center text-[1.2rem] text-[#1a1a2e] mb-1">休憩時間を入力</h3>
        <p className="text-center text-[0.85rem] text-[#888] mb-5">退勤前に休憩時間を入力してください</p>
        <BreakMinutesField value={breakMinutes} onChange={setBreakMinutes} className="mb-2" />
      </Modal>

      {/* 退勤押し忘れ修正モーダル */}
      <Modal
        open={showStaleModal && !!staleRecord}
        onClose={() => setShowStaleModal(false)}
        size="sm"
        actions={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setShowStaleModal(false)} data-testid="stale-cancel-btn">
              キャンセル
            </Button>
            <Button
              className={PUNCH_CONFIRM_CLASS}
              onClick={handleStaleCorrect}
              disabled={!staleClockOut || correctingStale}
              data-testid="stale-correct-btn"
            >
              {correctingStale ? '処理中...' : '修正して出勤'}
            </Button>
          </>
        }
      >
        {staleRecord && (
          <div data-testid="stale-record-modal">
            <h3 className="text-center text-[1.2rem] text-[#1a1a2e] mb-1">前回の退勤が未記録です</h3>
            <p className="text-center text-[0.85rem] text-[#888] mb-5">
              {new Date(staleRecord.clockIn).toLocaleString('ja-JP')} に出勤した記録の退勤が打刻されていません。退勤時刻を入力してください。
            </p>

            {error && <ErrorMessage className="mb-2 mt-0">{error}</ErrorMessage>}

            <div className="mb-3">
              <label className="form-label" style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>退勤時刻</label>
              <input
                type="datetime-local"
                value={staleClockOut}
                onChange={e => setStaleClockOut(e.target.value)}
                className="form-input"
                data-testid="stale-clock-out-input"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d4d9df', borderRadius: 6, fontSize: '1rem' }}
              />
            </div>

            <div className="mb-3">
              <label className="form-label" style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>休憩時間</label>
              <BreakMinutesField
                value={staleBreakMinutes}
                onChange={setStaleBreakMinutes}
                inputTestId="stale-break-input"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* チェックリストゲート（プラグインフック） */}
      {showChecklist && selectedStore && (
        <ChecklistGate
          storeId={selectedStore.id}
          staffId={staffId}
          timing={checklistTiming}
          onComplete={handleChecklistComplete}
          onCancel={() => setShowChecklist(false)}
        />
      )}

      {/* 退勤時レポートフォーム（マネージャー/リーダー用） */}
      <Modal
        open={showClockOutReport}
        onClose={() => { /* intentional no-op: require explicit skip/save */ }}
        closeOnBackdrop={false}
        size="lg"
      >
        <div className="max-h-[80vh] overflow-y-auto">
          <h3 className="text-center text-[1.2rem] text-[#1a1a2e] mb-1">退勤レポート</h3>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: 12 }}>日報と在庫を確認してから退勤します</p>

            {error && <ErrorMessage className="mb-2 mt-0">{error}</ErrorMessage>}

            {/* 日報セクション */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8, color: '#1e293b' }}>日報</div>
              <div className="daily-report-form-grid">
                {reportInputMode === 'manual' && (
                  <div>
                    <label className="form-label">売上（円）</label>
                    <input type="number" placeholder="0" value={reportSales} onChange={e => setReportSales(e.target.value)} className="form-input" />
                  </div>
                )}
                <div>
                  <label className="form-label">来客数</label>
                  <input type="number" placeholder="0" value={reportCustomers} onChange={e => setReportCustomers(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">天気</label>
                  <select value={reportWeather} onChange={e => setReportWeather(e.target.value)} className="form-input">
                    {WEATHER_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              </div>

              {/* 入力モード切替 */}
              {menuItems.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => setReportInputMode('manual')}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d4d9df', background: reportInputMode === 'manual' ? '#2563eb' : 'white', color: reportInputMode === 'manual' ? 'white' : '#333', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}
                  >
                    手入力
                  </button>
                  <button
                    onClick={() => setReportInputMode('menu')}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d4d9df', background: reportInputMode === 'menu' ? '#2563eb' : 'white', color: reportInputMode === 'menu' ? 'white' : '#333', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}
                  >
                    商品別入力
                  </button>
                </div>
              )}

              {/* 商品別入力 */}
              {reportInputMode === 'menu' && menuItems.length > 0 && (
                <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', maxHeight: 200, overflowY: 'auto' }}>
                  {Object.entries(
                    menuItems.reduce<Record<string, MenuItem[]>>((acc, m) => {
                      const cat = m.category || 'その他';
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(m);
                      return acc;
                    }, {})
                  ).map(([cat, catItems]) => (
                    <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{cat}</div>
                      {catItems.map(m => {
                        const qty = menuQuantities[m.id] || 0;
                        return (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eef2f7' }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.name}</span>
                              <span style={{ color: '#888', fontSize: '0.8rem', marginLeft: 8 }}>¥{m.price.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button onClick={() => setMenuQty(m.id, -1)} disabled={qty === 0} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #d4d9df', background: 'white', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>-</button>
                              <span style={{ width: 28, textAlign: 'center', fontWeight: 600 }}>{qty}</span>
                              <button onClick={() => setMenuQty(m.id, 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #d4d9df', background: 'white', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>+</button>
                              {qty > 0 && <span style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600, marginLeft: 4, minWidth: 60, textAlign: 'right' }}>¥{(m.price * qty).toLocaleString()}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, fontWeight: 700, fontSize: '1.05rem' }}>
                    合計: ¥{menuTotal.toLocaleString()}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <label className="form-label">メモ</label>
                <input type="text" placeholder="一言メモ" value={reportMemo} onChange={e => setReportMemo(e.target.value)} className="form-input" />
              </div>
            </div>

            {/* 在庫チェックセクション */}
            {inventoryItems.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ padding: 12, background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a', maxHeight: 200, overflowY: 'auto' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: 8 }}>在庫残量チェック</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {inventoryItems.map((inv) => (
                      <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: '0.85rem', flex: 1 }}>
                          {inv.name}
                          {inv.unit && <span style={{ color: '#888', marginLeft: 4 }}>({inv.unit})</span>}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#888', minWidth: 40, textAlign: 'right' }}>現:{inv.quantity ?? 0}</span>
                        <input
                          type="number"
                          placeholder={String(inv.quantity ?? 0)}
                          value={inventoryUpdates[inv.id] ?? ''}
                          onChange={e => setInventoryUpdates(prev => ({ ...prev, [inv.id]: e.target.value }))}
                          style={{ width: 60, padding: '4px 8px', border: '1px solid #d4d9df', borderRadius: 4, fontSize: '0.85rem', textAlign: 'right' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* アクションボタン */}
            <div className="flex justify-between gap-2">
              <Button variant="secondary" size="sm" onClick={handleReportSkip} disabled={submittingReport}>
                スキップして退勤
              </Button>
              <Button variant="primary" size="sm" onClick={handleReportSubmit} disabled={submittingReport}>
                {submittingReport ? '送信中...' : '保存して退勤'}
              </Button>
            </div>
        </div>
      </Modal>
    </div>
  );
}
