/**
 * S02 打刻ホーム
 * スタッフが最短で当日打刻を行う画面
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import type { AttendanceTodayResponse, AttendanceRawEvent } from '../../types/api';
import { Loading } from '../../components/atoms/Loading';

type AttendanceTodayData = AttendanceTodayResponse;
type RawAttendanceEvent = AttendanceRawEvent;

const STATUS_LABELS: Record<string, string> = {
  not_clocked_in: '未出勤',
  working: '勤務中',
  on_break: '休憩中',
  completed: '退勤済み',
};

const EVENT_LABELS: Record<string, string> = {
  clock_in: '出勤',
  break_start: '休憩開始',
  break_end: '休憩終了',
  clock_out: '退勤',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatElapsed(startIso: string) {
  const ms = Date.now() - new Date(startIso).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}時間${m}分`;
}

interface Props {
  onNavigate: (page: string) => void;
}

export default function AttendanceHomePage({ onNavigate }: Props) {
  const { selectedStore } = useAuth();
  const [data, setData] = useState<AttendanceTodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [now, setNow] = useState(new Date());
  const idempotencyRef = useRef<string>('');

  const storeId = selectedStore?.id;

  const loadStatus = useCallback(async () => {
    if (!storeId) return;
    // オーナーは打刻対象外なので status API を叩かない (backend が 403 を返す設計)
    if (selectedStore?.role === 'owner') { setLoading(false); return; }
    try {
      const res = await api.getAttendanceToday(storeId);
      setData(res);
    } catch (e: unknown) {
      console.error('Failed to load attendance status:', e);
    } finally {
      setLoading(false);
    }
  }, [storeId, selectedStore?.role]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // 現在時刻更新
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // トースト自動消去
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const genKey = () => {
    idempotencyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return idempotencyRef.current;
  };

  const doAction = async (action: () => Promise<unknown>, successMsg: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await action();
      setToast({ msg: successMsg, type: 'success' });
      await loadStatus();
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setToast({ msg: err.body?.error || err.message || 'エラーが発生しました', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockIn = () => doAction(
    () => api.attendanceClockIn(storeId!, 'web', genKey()),
    '出勤しました'
  );
  const handleBreakStart = () => doAction(
    () => api.attendanceBreakStart(storeId!, undefined, genKey()),
    '休憩を開始しました'
  );
  const handleBreakEnd = () => doAction(
    () => api.attendanceBreakEnd(storeId!, genKey()),
    '休憩を終了しました'
  );
  const handleClockOut = () => doAction(
    () => api.attendanceClockOut(storeId!, genKey()),
    '退勤しました'
  );

  if (loading) return <Loading />;
  if (!data) return <div className="alert alert-error">勤怠情報の取得に失敗しました</div>;

  const { currentStatus, activeSession, recentEvents, todayShift, businessDate } = data;

  return (
    <div className="attendance-home">
      {/* トースト */}
      {toast && (
        <div className={`attendance-toast ${toast.type}`} data-testid="attendance-toast">
          {toast.msg}
        </div>
      )}

      {/* ヘッダー情報 */}
      <div className="attendance-home-header">
        <div className="attendance-date">{businessDate}</div>
        <div className="attendance-clock">{now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      </div>

      {/* 予定シフト */}
      {todayShift && (
        <div className="attendance-shift-info">
          予定シフト: {todayShift.startTime} 〜 {todayShift.endTime}
        </div>
      )}

      {/* 現在状態 */}
      <div className={`attendance-status-badge status-${currentStatus}`} data-testid="attendance-status">
        {STATUS_LABELS[currentStatus] || currentStatus}
      </div>

      {/* 経過時間 */}
      {activeSession && (
        <div className="attendance-elapsed">
          {formatTime(activeSession.clockInAt)} から {formatElapsed(activeSession.clockInAt)}
          {activeSession.breakMinutes > 0 && ` （休憩 ${activeSession.breakMinutes}分）`}
        </div>
      )}

      {/* アクションボタン */}
      <div className="attendance-actions">
        {currentStatus === 'not_clocked_in' && (
          <button
            className="button button-primary attendance-action-btn clock-in"
            onClick={handleClockIn}
            disabled={actionLoading}
            data-testid="clock-in-button"
          >
            {actionLoading ? '処理中...' : '出勤する'}
          </button>
        )}

        {currentStatus === 'working' && (
          <>
            <button
              className="button attendance-action-btn break-start"
              onClick={handleBreakStart}
              disabled={actionLoading}
              data-testid="break-start-button"
            >
              休憩開始
            </button>
            <button
              className="button button-danger attendance-action-btn clock-out"
              onClick={handleClockOut}
              disabled={actionLoading}
              data-testid="clock-out-button"
            >
              退勤する
            </button>
          </>
        )}

        {currentStatus === 'on_break' && (
          <button
            className="button button-primary attendance-action-btn break-end"
            onClick={handleBreakEnd}
            disabled={actionLoading}
            data-testid="break-end-button"
          >
            休憩終了
          </button>
        )}
      </div>

      {/* 直近イベント */}
      {recentEvents && recentEvents.length > 0 && (
        <div className="attendance-events">
          <h3>今日の記録</h3>
          <ul className="attendance-event-list">
            {recentEvents.map((ev: RawAttendanceEvent, i: number) => (
              <li key={i} className="attendance-event-item">
                <span className="attendance-event-time">{formatTime(ev.event_at)}</span>
                <span className="attendance-event-label">{EVENT_LABELS[ev.event_type] || ev.event_type}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ナビゲーション */}
      <div className="attendance-nav-links">
        <button
          className="button button-secondary"
          onClick={() => onNavigate('history')}
          data-testid="nav-history-button"
        >
          履歴を見る
        </button>
        <button
          className="button button-secondary"
          onClick={() => onNavigate('correction')}
          data-testid="nav-correction-button"
        >
          修正を申請する
        </button>
      </div>
    </div>
  );
}
