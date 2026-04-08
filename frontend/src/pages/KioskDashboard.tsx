import { useState, useEffect, useCallback } from 'react';
import { kioskApi, clearKioskSession } from '../api/kioskClient';
import KioskShiftManager from './KioskShiftManager';

interface Staff {
  id: string;
  name: string;
  role: string;
  clockedIn: boolean;
  openRecordId: string | null;
  clockInTime: string | null;
}

interface Shift {
  id: string;
  staffId: string;
  startTime: string;
  endTime: string;
  staffName: string;
}

interface Props {
  storeId: string;
  storeName: string;
  onLogout: () => void;
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={s.clock}>
      <div style={s.clockTime}>
        {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={s.clockDate}>
        {now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
      </div>
    </div>
  );
}

const EMPTY_FORM = { staffId: '', startTime: '09:00', endTime: '17:00', breakMinutes: 0 };

export default function KioskDashboard({ storeId, storeName, onLogout }: Props) {
  const today = toDateStr(new Date());

  const [tab, setTab] = useState<'punch' | 'shift'>('punch');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftDate, setShiftDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [punching, setPunching] = useState<string | null>(null);

  // シフト作成フォーム
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (date?: string) => {
    try {
      const [staffRes, shiftRes] = await Promise.all([
        kioskApi.getStaff(storeId),
        kioskApi.getShifts(storeId, date || shiftDate),
      ]);
      setStaff(staffRes.staff);
      setShifts(shiftRes.shifts);
    } catch (e: any) {
      if (e.status === 401) { clearKioskSession(); onLogout(); }
    } finally {
      setLoading(false);
    }
  }, [storeId, onLogout, shiftDate]);

  useEffect(() => { load(); }, [load]);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handlePunch = async (st: Staff) => {
    if (punching) return;
    const action = st.clockedIn ? 'clock-out' : 'clock-in';
    setPunching(st.id);
    try {
      await kioskApi.punch(storeId, st.id, action);
      showMsg(
        action === 'clock-in' ? `${st.name} さん、おはようございます！` : `${st.name} さん、お疲れさまでした！`,
        'success'
      );
      await load();
    } catch (e: any) {
      showMsg(e.message || '打刻に失敗しました', 'error');
    } finally {
      setPunching(null);
    }
  };

  const handleDateChange = async (date: string) => {
    setShiftDate(date);
    setLoading(true);
    await load(date);
  };

  const handleCreateShift = async () => {
    if (!form.staffId || !form.startTime || !form.endTime) {
      showMsg('スタッフ・開始・終了時刻を入力してください', 'error');
      return;
    }
    if (form.startTime >= form.endTime) {
      showMsg('終了時刻は開始時刻より後にしてください', 'error');
      return;
    }
    setSaving(true);
    try {
      await kioskApi.createShift(storeId, {
        staffId: form.staffId,
        date: shiftDate,
        startTime: form.startTime,
        endTime: form.endTime,
        breakMinutes: form.breakMinutes,
      });
      showMsg('シフトを登録しました', 'success');
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load(shiftDate);
    } catch (e: any) {
      showMsg(e.message || 'シフトの登録に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    if (deleting) return;
    setDeleting(shiftId);
    try {
      await kioskApi.deleteShift(storeId, shiftId);
      showMsg('シフトを削除しました', 'success');
      await load(shiftDate);
    } catch (e: any) {
      showMsg(e.message || 'シフトの削除に失敗しました', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const isToday = shiftDate === today;

  return (
    <div style={s.container}>
      <header style={s.header}>
        <div style={s.headerLogo}>ITA<span style={{ color: '#4f8ef7' }}>MIN</span></div>
        <div style={s.headerTabs}>
          <button style={{ ...s.tab, ...(tab === 'punch' ? s.tabActive : {}) }} onClick={() => setTab('punch')}>打刻</button>
          <button style={{ ...s.tab, ...(tab === 'shift' ? s.tabActive : {}) }} onClick={() => setTab('shift')}>シフト管理</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={s.headerStore}>{storeName}</div>
          <button style={s.logoutBtn} onClick={() => { clearKioskSession(); onLogout(); }} data-testid="kiosk-logout">終了</button>
        </div>
      </header>

      {message && (
        <div style={{ ...s.message, background: message.type === 'success' ? '#e6f4ea' : '#fff0f0', color: message.type === 'success' ? '#2e7d32' : '#d32f2f' }}>
          {message.text}
        </div>
      )}

      {/* シフト管理タブ */}
      {tab === 'shift' && (
        <div style={{ ...s.body, maxWidth: '100%', padding: '16px 20px' }}>
          <KioskShiftManager storeId={storeId} staff={staff.map(st => ({ id: st.id, name: st.name }))} />
        </div>
      )}

      {/* 打刻タブ */}
      {tab === 'punch' && <div style={s.body}>
        <Clock />

        {loading ? (
          <div style={s.loadingText}>読み込み中...</div>
        ) : (
          <>
            {/* 打刻パネル */}
            <section style={s.section}>
              <h2 style={s.sectionTitle}>打刻</h2>
              <div style={s.staffGrid}>
                {staff.map(st => (
                  <button
                    key={st.id}
                    style={{
                      ...s.staffCard,
                      ...(st.clockedIn ? s.staffCardIn : s.staffCardOut),
                      opacity: punching && punching !== st.id ? 0.5 : 1,
                    }}
                    onClick={() => handlePunch(st)}
                    disabled={!!punching}
                    data-testid={`kiosk-punch-${st.id}`}
                  >
                    <div style={s.staffName}>{st.name}</div>
                    <div style={s.staffStatus}>
                      {st.clockedIn ? `出勤中 ${formatTime(st.clockInTime)}` : '未出勤'}
                    </div>
                    <div style={s.staffAction}>
                      {punching === st.id ? '処理中...' : st.clockedIn ? '退勤する' : '出勤する'}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* シフト管理パネル */}
            <section style={s.section}>
              {/* 日付ナビ */}
              <div style={s.shiftHeader}>
                <h2 style={{ ...s.sectionTitle, marginBottom: 0, borderBottom: 'none' }}>シフト</h2>
                <div style={s.dateNav}>
                  <button style={s.dateNavBtn} onClick={() => handleDateChange(addDays(shiftDate, -1))}>‹</button>
                  <span style={s.dateLabel}>
                    {formatDateLabel(shiftDate)}{isToday && <span style={s.todayBadge}>今日</span>}
                  </span>
                  <button style={s.dateNavBtn} onClick={() => handleDateChange(addDays(shiftDate, 1))}>›</button>
                  {!isToday && (
                    <button style={s.todayBtn} onClick={() => handleDateChange(today)}>今日</button>
                  )}
                </div>
                <button
                  style={s.addBtn}
                  onClick={() => { setShowForm(!showForm); setForm({ ...EMPTY_FORM, staffId: staff[0]?.id || '' }); }}
                  data-testid="kiosk-shift-add"
                >
                  ＋ 追加
                </button>
              </div>
              <div style={{ borderBottom: '2px solid #e0e7ff', marginBottom: 12 }} />

              {/* シフト作成フォーム */}
              {showForm && (
                <div style={s.formCard}>
                  <div style={s.formTitle}>シフト登録 — {formatDateLabel(shiftDate)}</div>
                  <div style={s.formGrid}>
                    <div>
                      <div style={s.formLabel}>スタッフ</div>
                      <select
                        value={form.staffId}
                        onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
                        style={s.formSelect}
                        data-testid="kiosk-shift-staff"
                      >
                        <option value="">選択してください</option>
                        {staff.map(st => (
                          <option key={st.id} value={st.id}>{st.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={s.formLabel}>開始</div>
                      <input
                        type="time"
                        value={form.startTime}
                        onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                        style={s.formInput}
                        data-testid="kiosk-shift-start"
                      />
                    </div>
                    <div>
                      <div style={s.formLabel}>終了</div>
                      <input
                        type="time"
                        value={form.endTime}
                        onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                        style={s.formInput}
                        data-testid="kiosk-shift-end"
                      />
                    </div>
                    <div>
                      <div style={s.formLabel}>休憩(分)</div>
                      <input
                        type="number"
                        value={form.breakMinutes}
                        min={0}
                        step={15}
                        onChange={e => setForm(f => ({ ...f, breakMinutes: Number(e.target.value) }))}
                        style={s.formInput}
                        data-testid="kiosk-shift-break"
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      style={s.saveBtn}
                      onClick={handleCreateShift}
                      disabled={saving}
                      data-testid="kiosk-shift-save"
                    >
                      {saving ? '登録中...' : '登録する'}
                    </button>
                    <button
                      style={s.cancelBtn}
                      onClick={() => setShowForm(false)}
                      disabled={saving}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}

              {/* シフト一覧 */}
              {shifts.length === 0 ? (
                <div style={s.emptyShift}>この日のシフトはありません</div>
              ) : (
                <div style={s.shiftList}>
                  {shifts.map(sh => (
                    <div key={sh.id} style={s.shiftRow}>
                      <span style={s.shiftName}>{sh.staffName}</span>
                      <span style={s.shiftTime}>{sh.startTime} – {sh.endTime}</span>
                      <button
                        style={s.deleteBtn}
                        onClick={() => handleDeleteShift(sh.id)}
                        disabled={deleting === sh.id}
                        data-testid={`kiosk-shift-delete-${sh.id}`}
                      >
                        {deleting === sh.id ? '…' : '削除'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f0f4ff', fontFamily: 'sans-serif' },
  header: { display: 'flex', alignItems: 'center', padding: '12px 24px', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', gap: 16 },
  headerLogo: { fontSize: 22, fontWeight: 800, letterSpacing: 1 },
  headerTabs: { display: 'flex', gap: 4, flex: 1 },
  tab: { padding: '7px 20px', border: '1px solid #d0d7e2', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#555', fontFamily: 'sans-serif' },
  tabActive: { background: '#4f8ef7', color: '#fff', borderColor: '#4f8ef7', fontWeight: 700 },
  headerStore: { fontSize: 14, color: '#666' },
  logoutBtn: { background: 'none', border: '1px solid #ccc', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#666', whiteSpace: 'nowrap' as const },
  message: { padding: '16px 24px', fontSize: 18, fontWeight: 600, textAlign: 'center', position: 'fixed', top: 64, left: 0, right: 0, zIndex: 100 },
  body: { maxWidth: 960, margin: '0 auto', padding: '24px 16px' },
  loadingText: { textAlign: 'center', color: '#999', paddingTop: 40 },
  clock: { textAlign: 'center', marginBottom: 32 },
  clockTime: { fontSize: 56, fontWeight: 700, letterSpacing: 2, color: '#222' },
  clockDate: { fontSize: 16, color: '#666', marginTop: 4 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 12, borderBottom: '2px solid #e0e7ff', paddingBottom: 6 },
  staffGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  staffCard: { border: 'none', borderRadius: 12, padding: '20px 12px', cursor: 'pointer', textAlign: 'center' },
  staffCardOut: { background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  staffCardIn: { background: '#e6f4ea', boxShadow: '0 2px 8px rgba(46,125,50,0.15)' },
  staffName: { fontSize: 18, fontWeight: 700, color: '#222', marginBottom: 6 },
  staffStatus: { fontSize: 12, color: '#666', marginBottom: 10 },
  staffAction: { fontSize: 13, fontWeight: 600, color: '#4f8ef7', background: 'rgba(79,142,247,0.1)', borderRadius: 6, padding: '4px 8px' },
  // シフト
  shiftHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  dateNav: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 },
  dateNavBtn: { background: '#fff', border: '1px solid #d0d7e2', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 18, color: '#555' },
  dateLabel: { fontSize: 15, fontWeight: 600, color: '#222' },
  todayBadge: { marginLeft: 6, background: '#4f8ef7', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11 },
  todayBtn: { background: '#f0f4ff', border: '1px solid #c7d4f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#4f8ef7' },
  addBtn: { background: '#4f8ef7', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  formCard: { background: '#fff', border: '1px solid #d0d7e2', borderRadius: 10, padding: '16px', marginBottom: 16 },
  formTitle: { fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  formLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  formSelect: { width: '100%', padding: '8px', border: '1px solid #d0d7e2', borderRadius: 6, fontSize: 14, fontFamily: 'sans-serif' },
  formInput: { width: '100%', padding: '8px', border: '1px solid #d0d7e2', borderRadius: 6, fontSize: 14, fontFamily: 'sans-serif', boxSizing: 'border-box' },
  saveBtn: { background: '#4f8ef7', color: '#fff', border: 'none', borderRadius: 7, padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  cancelBtn: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 7, padding: '10px 16px', cursor: 'pointer', fontSize: 14 },
  emptyShift: { textAlign: 'center', color: '#aaa', padding: '24px 0', fontSize: 14 },
  shiftList: { display: 'flex', flexDirection: 'column', gap: 8 },
  shiftRow: { display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 8, padding: '12px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', gap: 12 },
  shiftName: { fontSize: 15, fontWeight: 600, color: '#333', flex: 1 },
  shiftTime: { fontSize: 14, color: '#555' },
  deleteBtn: { background: 'none', border: '1px solid #e0b0b0', color: '#c0392b', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
};
