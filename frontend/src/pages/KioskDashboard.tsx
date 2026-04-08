import { useState, useEffect, useCallback } from 'react';
import { kioskApi, clearKioskSession } from '../api/kioskClient';

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
  startTime: string;
  endTime: string;
  staffName: string;
}

interface Props {
  storeId: string;
  storeName: string;
  onLogout: () => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={styles.clock}>
      <div style={styles.clockTime}>
        {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={styles.clockDate}>
        {now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
      </div>
    </div>
  );
}

export default function KioskDashboard({ storeId, storeName, onLogout }: Props) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [punching, setPunching] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [staffRes, shiftRes] = await Promise.all([
        kioskApi.getStaff(storeId),
        kioskApi.getShiftsToday(storeId),
      ]);
      setStaff(staffRes.staff);
      setShifts(shiftRes.shifts);
    } catch (e: any) {
      if (e.status === 401) {
        clearKioskSession();
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  }, [storeId, onLogout]);

  useEffect(() => { load(); }, [load]);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handlePunch = async (s: Staff) => {
    if (punching) return;
    const action = s.clockedIn ? 'clock-out' : 'clock-in';
    setPunching(s.id);
    try {
      await kioskApi.punch(storeId, s.id, action);
      showMessage(
        action === 'clock-in' ? `${s.name} さん、おはようございます！` : `${s.name} さん、お疲れさまでした！`,
        'success'
      );
      await load();
    } catch (e: any) {
      showMessage(e.message || '打刻に失敗しました', 'error');
    } finally {
      setPunching(null);
    }
  };

  const handleLogout = () => {
    clearKioskSession();
    onLogout();
  };

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <header style={styles.header}>
        <div style={styles.headerLogo}>ITA<span style={{ color: '#4f8ef7' }}>MIN</span></div>
        <div style={styles.headerStore}>{storeName}</div>
        <button style={styles.logoutBtn} onClick={handleLogout} data-testid="kiosk-logout">
          終了
        </button>
      </header>

      {/* メッセージ */}
      {message && (
        <div style={{ ...styles.message, background: message.type === 'success' ? '#e6f4ea' : '#fff0f0', color: message.type === 'success' ? '#2e7d32' : '#d32f2f' }}>
          {message.text}
        </div>
      )}

      <div style={styles.body}>
        {/* 時計 */}
        <Clock />

        {loading ? (
          <div style={styles.loadingText}>読み込み中...</div>
        ) : (
          <>
            {/* スタッフ打刻 */}
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>打刻</h2>
              <div style={styles.staffGrid}>
                {staff.map(s => (
                  <button
                    key={s.id}
                    style={{
                      ...styles.staffCard,
                      ...(s.clockedIn ? styles.staffCardIn : styles.staffCardOut),
                      opacity: punching && punching !== s.id ? 0.5 : 1,
                    }}
                    onClick={() => handlePunch(s)}
                    disabled={!!punching}
                    data-testid={`kiosk-punch-${s.id}`}
                  >
                    <div style={styles.staffName}>{s.name}</div>
                    <div style={styles.staffStatus}>
                      {s.clockedIn
                        ? `出勤中 ${formatTime(s.clockInTime)}`
                        : '未出勤'}
                    </div>
                    <div style={styles.staffAction}>
                      {punching === s.id ? '処理中...' : s.clockedIn ? '退勤する' : '出勤する'}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* 本日のシフト */}
            {shifts.length > 0 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>本日のシフト</h2>
                <div style={styles.shiftList}>
                  {shifts.map(sh => (
                    <div key={sh.id} style={styles.shiftRow}>
                      <span style={styles.shiftName}>{sh.staffName}</span>
                      <span style={styles.shiftTime}>{sh.startTime} – {sh.endTime}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f0f4ff', fontFamily: 'sans-serif' },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 24px',
    background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  headerLogo: { fontSize: 22, fontWeight: 800, letterSpacing: 1, flex: 1 },
  headerStore: { fontSize: 15, color: '#444', flex: 2, textAlign: 'center' },
  logoutBtn: {
    background: 'none', border: '1px solid #ccc', borderRadius: 6,
    padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#666',
  },
  message: {
    padding: '16px 24px', fontSize: 18, fontWeight: 600, textAlign: 'center',
    position: 'fixed', top: 64, left: 0, right: 0, zIndex: 100,
  },
  body: { maxWidth: 900, margin: '0 auto', padding: '24px 16px' },
  loadingText: { textAlign: 'center', color: '#999', paddingTop: 40 },
  clock: { textAlign: 'center', marginBottom: 32 },
  clockTime: { fontSize: 56, fontWeight: 700, letterSpacing: 2, color: '#222' },
  clockDate: { fontSize: 16, color: '#666', marginTop: 4 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 12, borderBottom: '2px solid #e0e7ff', paddingBottom: 6 },
  staffGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  staffCard: {
    border: 'none', borderRadius: 12, padding: '20px 12px', cursor: 'pointer',
    textAlign: 'center', transition: 'transform 0.1s',
  },
  staffCardOut: { background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  staffCardIn: { background: '#e6f4ea', boxShadow: '0 2px 8px rgba(46,125,50,0.15)' },
  staffName: { fontSize: 18, fontWeight: 700, color: '#222', marginBottom: 6 },
  staffStatus: { fontSize: 12, color: '#666', marginBottom: 10 },
  staffAction: { fontSize: 13, fontWeight: 600, color: '#4f8ef7', background: 'rgba(79,142,247,0.1)', borderRadius: 6, padding: '4px 8px' },
  shiftList: { display: 'flex', flexDirection: 'column', gap: 8 },
  shiftRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#fff', borderRadius: 8, padding: '12px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  shiftName: { fontSize: 15, fontWeight: 600, color: '#333' },
  shiftTime: { fontSize: 14, color: '#666' },
};
