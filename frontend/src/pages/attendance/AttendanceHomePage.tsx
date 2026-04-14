/**
 * S02 打刻ホーム
 * スタッフが最短で当日打刻を行う画面
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import type { AttendanceTodayResponse, AttendanceRawEvent } from '../../types/api';
import { Loading } from '../../components/atoms/Loading';
import { Alert } from '../../components/atoms/Alert';
import { InlineToast } from '../../components/molecules/InlineToast';

// 旧 .attendance-home / .attendance-home-header / .attendance-date /
// .attendance-clock / .attendance-shift-info / .attendance-status-badge /
// .attendance-elapsed / .attendance-actions / .attendance-action-btn /
// .attendance-events / .attendance-event-item / .attendance-event-time /
// .attendance-nav-links の置き換え。
const HOME = 'mx-auto max-w-[480px] p-4 text-center';
const DATE = 'text-sm text-sumi-600';
const CLOCK = 'text-[36px] font-bold leading-[1.2] tabular-nums';
const SHIFT_INFO =
  'mb-3 rounded-lg bg-[#f0f9ff] px-3 py-2 text-[13px] text-info-fg';
const STATUS_BADGE =
  'mb-2 inline-block rounded-[20px] px-6 py-2 text-base font-semibold';
const STATUS_COLORS: Record<string, string> = {
  not_clocked_in: 'bg-background-subtle text-sumi-600',
  working: 'bg-success-bg text-success-fg',
  on_break: 'bg-warning-bg text-warning-fg',
  completed: 'bg-info-bg text-info-fg',
};
const ELAPSED = 'mb-5 text-sm text-sumi-600';
const ACTIONS = 'mb-6 flex flex-col gap-3';
const ACTION_BASE =
  'min-h-[56px] rounded-xl border-none px-6 py-4 text-lg font-semibold text-white max-md:min-h-12 max-md:text-base disabled:opacity-60';
const ACTION_CLOCK_IN =
  'bg-green-500 hover:enabled:bg-green-700';
const ACTION_BREAK_START =
  'bg-warning-fill hover:enabled:bg-yellow-700';
const ACTION_BREAK_END = 'bg-blue-500';
const ACTION_CLOCK_OUT = 'bg-error-fill';
const EVENTS = 'mb-4 text-left';
const EVENTS_TITLE = 'mb-2 text-sm text-sumi-600';
const EVENT_ITEM = 'flex gap-2 py-1 text-sm';
const EVENT_TIME = 'text-sumi-600 tabular-nums';
const NAV_LINKS = 'flex justify-center gap-2';

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
  if (!data) return <Alert variant="error">勤怠情報の取得に失敗しました</Alert>;

  const { currentStatus, activeSession, recentEvents, todayShift, businessDate } = data;

  return (
    <div className={HOME}>
      {/* トースト */}
      {toast && (
        <InlineToast type={toast.type} data-testid="attendance-toast">
          {toast.msg}
        </InlineToast>
      )}

      {/* ヘッダー情報 */}
      <div className="mb-3">
        <div className={DATE}>{businessDate}</div>
        <div className={CLOCK}>{now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      </div>

      {/* 予定シフト */}
      {todayShift && (
        <div className={SHIFT_INFO}>
          予定シフト: {todayShift.startTime} 〜 {todayShift.endTime}
        </div>
      )}

      {/* 現在状態 */}
      <div
        className={`${STATUS_BADGE} ${STATUS_COLORS[currentStatus] ?? STATUS_COLORS.not_clocked_in}`}
        data-testid="attendance-status"
      >
        {STATUS_LABELS[currentStatus] || currentStatus}
      </div>

      {/* 経過時間 */}
      {activeSession && (
        <div className={ELAPSED}>
          {formatTime(activeSession.clockInAt)} から {formatElapsed(activeSession.clockInAt)}
          {activeSession.breakMinutes > 0 && ` （休憩 ${activeSession.breakMinutes}分）`}
        </div>
      )}

      {/* アクションボタン */}
      <div className={ACTIONS}>
        {currentStatus === 'not_clocked_in' && (
          <button
            type="button"
            className={`button ${ACTION_BASE} ${ACTION_CLOCK_IN}`}
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
              type="button"
              className={`button ${ACTION_BASE} ${ACTION_BREAK_START}`}
              onClick={handleBreakStart}
              disabled={actionLoading}
              data-testid="break-start-button"
            >
              休憩開始
            </button>
            <button
              type="button"
              className={`button ${ACTION_BASE} ${ACTION_CLOCK_OUT}`}
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
            type="button"
            className={`button ${ACTION_BASE} ${ACTION_BREAK_END}`}
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
        <div className={EVENTS}>
          <h3 className={EVENTS_TITLE}>今日の記録</h3>
          <ul className="list-none">
            {recentEvents.map((ev: RawAttendanceEvent, i: number) => (
              <li key={i} className={EVENT_ITEM}>
                <span className={EVENT_TIME}>{formatTime(ev.event_at)}</span>
                <span>{EVENT_LABELS[ev.event_type] || ev.event_type}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ナビゲーション */}
      <div className={NAV_LINKS}>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onNavigate('history')}
          data-testid="nav-history-button"
        >
          履歴を見る
        </button>
        <button
          type="button"
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
