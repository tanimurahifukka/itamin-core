import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import ChecklistGate from '../components/ChecklistGate';

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
    setChecklistTiming(isClockedIn ? 'clock_out' : 'clock_in');
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
        await api.clockOut(selectedStore.id);
        setIsClockedIn(false);
        setClockInTime(null);
      } else {
        const data = await api.clockIn(selectedStore.id);
        setIsClockedIn(true);
        setClockInTime(new Date(data.record.clockIn));
      }
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
        className={`punch-btn ${isClockedIn ? 'clock-out' : 'clock-in'}`}
        onClick={handlePunchRequest}
        disabled={loading}
      >
        {loading ? '...' : isClockedIn ? '退勤' : '出勤'}
      </button>

      {isClockedIn && clockInTime && (
        <div className="punch-status">
          <span className="since">{formatTime(clockInTime)}</span> から勤務中
          （{elapsedH}時間{elapsedM}分）
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
