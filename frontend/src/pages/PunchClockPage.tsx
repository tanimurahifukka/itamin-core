import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import ChecklistGate from '../components/ChecklistGate';
import { showToast } from '../components/Toast';

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

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedStore) return;
    api.getTimecardStatus(selectedStore.id).then(data => {
      setIsClockedIn(data.isClockedIn);
      setStaffId(data.staffId || '');
      if (data.currentRecord) {
        setClockInTime(new Date(data.currentRecord.clockIn));
      }
    }).catch(() => {});
  }, [selectedStore]);

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

  // チェックリスト完了 → 実際の打刻実行
  const handleChecklistComplete = async () => {
    setShowChecklist(false);
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

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
      <div className="current-time">{formatTime(time)}</div>
      <div className="current-date">{formatDate(time)}</div>

      {error && <div className="error-msg">{error}</div>}

      <button
        className={`punch-btn ${isClockedIn ? 'clock-out' : 'clock-in'} ${punchSuccess ? 'punch-success' : ''}`}
        onClick={handlePunchRequest}
        disabled={loading}
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
      {showBreakModal && (
        <div className="break-modal-overlay" onClick={() => setShowBreakModal(false)}>
          <div className="break-modal" onClick={e => e.stopPropagation()}>
            <h3>休憩時間を入力</h3>
            <p className="break-modal-desc">退勤前に休憩時間を入力してください</p>
            <div className="break-input-row">
              <input
                type="number"
                min={0}
                max={480}
                value={breakMinutes}
                onChange={e => setBreakMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="break-input"
              />
              <span className="break-unit">分</span>
            </div>
            <div className="break-presets">
              {[0, 15, 30, 45, 60].map(m => (
                <button
                  key={m}
                  className={`break-preset ${breakMinutes === m ? 'active' : ''}`}
                  onClick={() => setBreakMinutes(m)}
                >
                  {m}分
                </button>
              ))}
            </div>
            <div className="break-modal-actions">
              <button className="break-cancel" onClick={() => setShowBreakModal(false)}>
                キャンセル
              </button>
              <button className="break-confirm" onClick={handleBreakConfirm}>
                退勤する
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
