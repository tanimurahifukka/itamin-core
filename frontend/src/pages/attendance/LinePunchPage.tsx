/**
 * LINE打刻ページ（Supabase Auth不要）
 * LINE Login で取得した lineUserId で打刻操作を行う。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Loading } from '../../components/atoms/Loading';

const API_BASE = '/api';

const STATUS_LABELS: Record<string, string> = {
  not_clocked_in: '未出勤',
  working: '勤務中',
  on_break: '休憩中',
  completed: '退勤済み',
};

const EVENT_LABELS: Record<string, string> = {
  clock_in: '出勤', break_start: '休憩開始', break_end: '休憩終了', clock_out: '退勤',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatElapsed(startIso: string) {
  const ms = Date.now() - new Date(startIso).getTime();
  return `${Math.floor(ms / 3600000)}時間${Math.floor((ms % 3600000) / 60000)}分`;
}

async function linePunchApi(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/line-punch${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, body: data, message: data.error || data.message };
  return data;
}

interface LinePunchData {
  businessDate: string;
  currentStatus: string;
  activeSession: {
    clockInAt: string;
    breakMinutes: number;
  } | null;
  recentEvents: { event_type: string; event_at: string }[];
}

interface Props {
  lineUserId: string;
  storeId: string;
  displayName?: string;
  pictureUrl?: string;
}

export default function LinePunchPage({ lineUserId, storeId, displayName, pictureUrl }: Props) {
  const [data, setData] = useState<LinePunchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [now, setNow] = useState(new Date());
  const idempotencyRef = useRef('');

  const loadStatus = useCallback(async () => {
    try {
      const res = await linePunchApi('/today', { lineUserId, storeId });
      setData(res);
    } catch (e: unknown) {
      console.error('Failed to load:', e);
    } finally {
      setLoading(false);
    }
  }, [lineUserId, storeId]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const genKey = () => {
    idempotencyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return idempotencyRef.current;
  };

  const doAction = async (path: string, successMsg: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await linePunchApi(path, { lineUserId, storeId, idempotencyKey: genKey() });
      setToast({ msg: successMsg, type: 'success' });
      await loadStatus();
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setToast({ msg: err.body?.error || err.message || 'エラー', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Loading />;

  const currentStatus = data?.currentStatus || 'not_clocked_in';
  const activeSession = data?.activeSession;
  const recentEvents = data?.recentEvents || [];

  return (
    <div className="attendance-home">
      {toast && (
        <div className={`attendance-toast ${toast.type}`} data-testid="punch-toast">
          {toast.msg}
        </div>
      )}

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
        {pictureUrl && <img src={pictureUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
        <span style={{ fontWeight: 600 }}>{displayName || 'スタッフ'}</span>
      </div>

      <div className="attendance-home-header">
        <div className="attendance-date">{data?.businessDate}</div>
        <div className="attendance-clock">
          {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      <div className={`attendance-status-badge status-${currentStatus}`} data-testid="punch-status">
        {STATUS_LABELS[currentStatus]}
      </div>

      {activeSession && (
        <div className="attendance-elapsed">
          {formatTime(activeSession.clockInAt)} から {formatElapsed(activeSession.clockInAt)}
          {activeSession.breakMinutes > 0 && ` （休憩 ${activeSession.breakMinutes}分）`}
        </div>
      )}

      <div className="attendance-actions">
        {currentStatus === 'not_clocked_in' && (
          <button className="button attendance-action-btn clock-in"
            onClick={() => doAction('/clock-in', '出勤しました')}
            disabled={actionLoading} data-testid="line-clock-in-button">
            {actionLoading ? '処理中...' : '出勤する'}
          </button>
        )}
        {currentStatus === 'working' && (
          <>
            <button className="button attendance-action-btn break-start"
              onClick={() => doAction('/break-start', '休憩開始')}
              disabled={actionLoading} data-testid="line-break-start-button">
              休憩開始
            </button>
            <button className="button attendance-action-btn clock-out"
              onClick={() => doAction('/clock-out', '退勤しました')}
              disabled={actionLoading} data-testid="line-clock-out-button">
              退勤する
            </button>
          </>
        )}
        {currentStatus === 'on_break' && (
          <button className="button attendance-action-btn break-end"
            onClick={() => doAction('/break-end', '休憩終了')}
            disabled={actionLoading} data-testid="line-break-end-button">
            休憩終了
          </button>
        )}
        {currentStatus === 'completed' && (
          <div style={{ color: '#6b7280', padding: 16 }}>本日の勤務は終了しています</div>
        )}
      </div>

      {recentEvents.length > 0 && (
        <div className="attendance-events">
          <h3>今日の記録</h3>
          <ul className="attendance-event-list">
            {recentEvents.map((ev, i: number) => (
              <li key={i} className="attendance-event-item">
                <span className="attendance-event-time">{formatTime(ev.event_at)}</span>
                <span>{EVENT_LABELS[ev.event_type] || ev.event_type}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
