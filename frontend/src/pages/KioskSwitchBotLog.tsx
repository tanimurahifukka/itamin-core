import { useState, useEffect, useCallback } from 'react';
import { kioskApi } from '../api/kioskClient';
import { toDateStr, addDays } from '../lib/dateUtils';

interface Reading {
  temperature: number | null;
  humidity: number | null;
  battery: number | null;
  recordedAt: string;
}

interface DeviceData {
  deviceId: string;
  deviceName: string;
  readings: Reading[];
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

/** SVG温度折れ線グラフ（00:00-24:00固定X軸） */
function TempLineChart({ readings }: { readings: Reading[] }) {
  const PAD = { top: 20, right: 20, bottom: 36, left: 48 };
  const width = 600;
  const height = 180;
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  if (readings.length === 0) {
    return <div style={s.chartEmpty}>グラフデータなし</div>;
  }

  const validReadings = readings.filter((r): r is Reading & { temperature: number } => r.temperature !== null);
  if (validReadings.length === 0) {
    return <div style={s.chartEmpty}>グラフデータなし</div>;
  }
  const temps = validReadings.map(r => r.temperature);
  const minTemp = Math.floor(Math.min(...temps) - 1);
  const maxTemp = Math.ceil(Math.max(...temps) + 1);
  const range = maxTemp - minTemp || 1;

  // X軸: 0〜86400秒 (00:00〜24:00)
  const toX = (iso: string): number => {
    const d = new Date(iso);
    const seconds = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    return PAD.left + (seconds / 86400) * W;
  };
  const toY = (temp: number): number => {
    return PAD.top + H - ((temp - minTemp) / range) * H;
  };

  const sorted = [...validReadings].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  const points = sorted.map(r => ({
    x: toX(r.recordedAt),
    y: toY(r.temperature),
    v: r.temperature,
    t: r.recordedAt,
  }));

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  // Y軸目盛り（5本）
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = minTemp + (range / 4) * i;
    const y = toY(v);
    return { v: Math.round(v * 10) / 10, y };
  });

  // X軸ラベル（0, 6, 12, 18, 24時）
  const xHours = [0, 6, 12, 18, 24];
  const xLabels = xHours.map(h => ({
    x: PAD.left + (h / 24) * W,
    label: h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`,
  }));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {/* グリッド線（Y） */}
      {yTicks.map(t => (
        <line key={t.v} x1={PAD.left} y1={t.y} x2={PAD.left + W} y2={t.y} stroke="#e8edf6" strokeWidth={1} />
      ))}
      {/* グリッド線（X: 時間） */}
      {xLabels.map(l => (
        <line key={l.label} x1={l.x} y1={PAD.top} x2={l.x} y2={PAD.top + H} stroke="#f0f4ff" strokeWidth={1} />
      ))}
      {/* Y軸ラベル */}
      {yTicks.map(t => (
        <text key={t.v} x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize={10} fill="#999">{t.v}°</text>
      ))}
      {/* X軸ラベル */}
      {xLabels.map(l => (
        <text key={l.label} x={l.x} y={height - 4} textAnchor="middle" fontSize={9} fill="#bbb">{l.label}</text>
      ))}
      {/* 折れ線 */}
      {points.length > 1 && (
        <polyline
          points={polyline}
          fill="none"
          stroke="#dc2626"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {/* データ点 */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#dc2626" />
      ))}
      {/* 最新値ラベル */}
      {points.length > 0 && (
        <text
          x={Math.min(points[points.length - 1].x + 6, PAD.left + W - 30)}
          y={points[points.length - 1].y - 6}
          fontSize={11}
          fill="#dc2626"
          fontWeight="bold"
        >
          {points[points.length - 1].v}°C
        </text>
      )}
    </svg>
  );
}

export default function KioskSwitchBotLog({ storeId }: { storeId: string }) {
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await kioskApi.getSwitchBotReadings(storeId, date);
      setDevices(res.devices || []);
      setActiveDeviceId(prev => {
        if (!prev && res.devices.length > 0) return res.devices[0].deviceId;
        const stillExists = res.devices.some(d => d.deviceId === prev);
        if (!stillExists && res.devices.length > 0) return res.devices[0].deviceId;
        return prev;
      });
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, date]);

  useEffect(() => { load(); }, [load]);

  const activeDevice = devices.find(d => d.deviceId === activeDeviceId) ?? null;
  const readings = activeDevice?.readings ?? [];
  const today = toDateStr(new Date());
  const isToday = date === today;

  return (
    <div style={s.root}>
      {/* 日付ナビゲーション */}
      <div style={s.dateNav}>
        <button style={s.dateNavBtn} onClick={() => setDate(d => addDays(d, -1))}>←</button>
        <span style={s.dateLabel}>
          {formatDateLabel(date)}
          {isToday && <span style={s.todayBadge}>今日</span>}
        </span>
        <button style={s.dateNavBtn} onClick={() => setDate(d => addDays(d, 1))}>→</button>
        {!isToday && (
          <button style={s.todayBtn} onClick={() => setDate(today)}>今日</button>
        )}
      </div>

      {loading ? (
        <div style={s.empty}>読み込み中...</div>
      ) : devices.length === 0 ? (
        <div style={s.empty}>この日のデータはありません</div>
      ) : (
        <>
          {/* デバイス選択タブ */}
          <div style={s.deviceTabs}>
            {devices.map(d => (
              <button
                key={d.deviceId}
                style={{ ...s.deviceTab, ...(activeDeviceId === d.deviceId ? s.deviceTabActive : {}) }}
                onClick={() => setActiveDeviceId(d.deviceId)}
              >
                {d.deviceName}
              </button>
            ))}
          </div>

          {activeDevice && (
            <>
              {/* 温度グラフ */}
              <div style={s.chartSection}>
                <div style={s.sectionTitle}>温度推移（°C）</div>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 360 }}>
                    <TempLineChart readings={readings} />
                  </div>
                </div>
              </div>

              {/* データテーブル */}
              <div style={s.tableSection}>
                <div style={s.sectionTitle}>
                  記録一覧
                  <span style={s.recordCount}>{readings.length} 件</span>
                </div>
                {readings.length === 0 ? (
                  <div style={s.empty}>この日のデータはありません</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>時刻</th>
                          <th style={s.th}>温度</th>
                          <th style={s.th}>湿度</th>
                          <th style={s.th}>バッテリー</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...readings]
                          .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
                          .map((r) => (
                            <tr key={r.recordedAt} style={s.tr}>
                              <td style={s.td}>{fmtTime(r.recordedAt)}</td>
                              <td style={{ ...s.td, fontWeight: 600, color: '#dc2626' }}>
                                {r.temperature != null ? `${r.temperature}°C` : '—'}
                              </td>
                              <td style={{ ...s.td, color: '#0891b2' }}>
                                {r.humidity != null ? `${r.humidity}%` : '—'}
                              </td>
                              <td style={{ ...s.td, color: r.battery != null && r.battery <= 20 ? '#dc2626' : '#16a34a' }}>
                                {r.battery != null ? `${r.battery}%` : '—'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  // 日付ナビ
  dateNav: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dateNavBtn: {
    background: '#fff',
    border: '1px solid #d0d7e2',
    borderRadius: 6,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 16,
    color: '#555',
    fontFamily: 'sans-serif',
  },
  dateLabel: { fontSize: 15, fontWeight: 600, color: '#222', flex: 1, textAlign: 'center' as const },
  todayBadge: {
    marginLeft: 6,
    background: '#4f8ef7',
    color: '#fff',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 11,
  },
  todayBtn: {
    background: '#f0f4ff',
    border: '1px solid #c7d4f0',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: '#4f8ef7',
    fontFamily: 'sans-serif',
  },
  // デバイスタブ
  deviceTabs: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  deviceTab: {
    padding: '7px 18px',
    border: '1px solid #d0d7e2',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    color: '#555',
    fontFamily: 'sans-serif',
  },
  deviceTabActive: { background: '#4f8ef7', color: '#fff', borderColor: '#4f8ef7', fontWeight: 700 },
  // グラフ
  chartSection: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' },
  chartEmpty: { color: '#aaa', fontSize: 13, padding: '12px 0' },
  // テーブル
  tableSection: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#64748b',
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  recordCount: {
    background: '#f0f4ff',
    color: '#4f8ef7',
    borderRadius: 4,
    padding: '1px 7px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'none' as const,
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    padding: '8px 12px',
    borderBottom: '2px solid #e2e8f0',
    textAlign: 'left' as const,
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase' as const,
  },
  td: { padding: '7px 12px', borderBottom: '1px solid #f1f5f9', color: '#334155' },
  tr: {},
  empty: { textAlign: 'center' as const, color: '#aaa', padding: '32px 0', fontSize: 14 },
};
