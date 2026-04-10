import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

interface Reading {
  id: string;
  device_id: string;
  device_name: string;
  temperature: number | null;
  humidity: number | null;
  battery: number | null;
  recorded_at: string;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtTimeShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

/** SVG折れ線グラフ（外部ライブラリ不使用） */
function LineChart({
  data,
  valueKey,
  color,
  unit,
  width = 560,
  height = 160,
}: {
  data: Reading[];
  valueKey: 'temperature' | 'humidity';
  color: string;
  unit: string;
  width?: number;
  height?: number;
}) {
  const PAD = { top: 16, right: 16, bottom: 32, left: 44 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  const values = data.map(d => d[valueKey]).filter((v): v is number => v != null);
  if (values.length === 0) return <div style={{ color: '#aaa', fontSize: 13 }}>データなし</div>;

  const minVal = Math.floor(Math.min(...values) - 1);
  const maxVal = Math.ceil(Math.max(...values) + 1);
  const range = maxVal - minVal || 1;

  // データは降順（最新が先頭）なので反転
  const sorted = [...data].reverse();
  const points = sorted
    .map((d, i) => {
      const v = d[valueKey];
      if (v == null) return null;
      const x = PAD.left + (i / Math.max(sorted.length - 1, 1)) * W;
      const y = PAD.top + H - ((v - minVal) / range) * H;
      return { x, y, v, t: d.recorded_at };
    })
    .filter(Boolean) as { x: number; y: number; v: number; t: string }[];

  if (points.length === 0) return null;

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  // Y軸目盛り（4本）
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = minVal + (range / 4) * i;
    const y = PAD.top + H - ((v - minVal) / range) * H;
    return { v: Math.round(v * 10) / 10, y };
  });

  // X軸ラベル（最大5点）
  const xLabelStep = Math.ceil(sorted.length / 5);
  const xLabels = sorted
    .filter((_, i) => i % xLabelStep === 0 || i === sorted.length - 1)
    .map((d) => {
      const origIdx = sorted.indexOf(d);
      const x = PAD.left + (origIdx / Math.max(sorted.length - 1, 1)) * W;
      return { x, t: d.recorded_at };
    });

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {/* グリッド線 */}
      {yTicks.map(t => (
        <line key={t.v} x1={PAD.left} y1={t.y} x2={PAD.left + W} y2={t.y} stroke="#e8edf6" strokeWidth={1} />
      ))}
      {/* Y軸ラベル */}
      {yTicks.map(t => (
        <text key={t.v} x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize={10} fill="#999">{t.v}</text>
      ))}
      {/* X軸ラベル */}
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={height - 4} textAnchor="middle" fontSize={9} fill="#bbb">{fmtTimeShort(l.t)}</text>
      ))}
      {/* 折れ線 */}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 点 */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
      ))}
      {/* 最新値ラベル */}
      {points.length > 0 && (
        <text
          x={points[points.length - 1].x + 6}
          y={points[points.length - 1].y - 6}
          fontSize={11}
          fill={color}
          fontWeight="bold"
        >
          {points[points.length - 1].v}{unit}
        </text>
      )}
    </svg>
  );
}

const LIMIT_BY_RANGE: Record<string, number> = { '24h': 96, '48h': 192, '7d': 1000 };

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
}

export default function SwitchBotReadingsPage() {
  const { selectedStore } = useAuth();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [activeDevice, setActiveDevice] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState<'24h' | '48h' | '7d'>('24h');

  // 記録デバイス選択
  const [allDevices, setAllDevices] = useState<DeviceInfo[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [deviceSelectLoading, setDeviceSelectLoading] = useState(false);
  const [deviceSelectSaving, setDeviceSelectSaving] = useState(false);
  const [deviceSelectError, setDeviceSelectError] = useState('');
  const [deviceSelectSaved, setDeviceSelectSaved] = useState(false);

  const load = useCallback(async () => {
    if (!selectedStore) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.getSwitchBotReadings(selectedStore.id, undefined, LIMIT_BY_RANGE[range]);
      const data = res.readings || [];

      // デバイス一覧を抽出
      const deviceMap = new Map<string, string>();
      for (const r of data) {
        if (!deviceMap.has(r.device_id)) deviceMap.set(r.device_id, r.device_name || r.device_id);
      }
      const deviceIds = Array.from(deviceMap.keys());
      setDevices(deviceIds);
      setReadings(data);
      setActiveDevice(prev => (!prev && deviceIds.length > 0 ? deviceIds[0] : prev));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setLoading(false);
    }
  }, [selectedStore, range]);

  useEffect(() => { load(); }, [load]);

  // 記録デバイス選択データのロード
  const loadDeviceSelection = useCallback(async () => {
    if (!selectedStore) return;
    setDeviceSelectLoading(true);
    setDeviceSelectError('');
    try {
      const [devicesRes, monitoredRes] = await Promise.all([
        api.getSwitchBotDevices(selectedStore.id),
        api.getSwitchBotMonitoredDevices(selectedStore.id),
      ]);
      setAllDevices(devicesRes.devices || []);
      const monitored = monitoredRes.monitoredDevices || [];
      setSelectedDeviceIds(monitored);
    } catch (e: unknown) {
      setDeviceSelectError(e instanceof Error ? e.message : 'デバイス一覧の取得に失敗しました');
    } finally {
      setDeviceSelectLoading(false);
    }
  }, [selectedStore]);

  useEffect(() => { loadDeviceSelection(); }, [loadDeviceSelection]);

  const handleToggleDevice = (deviceId: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]
    );
    setDeviceSelectSaved(false);
  };

  const handleSelectAll = () => {
    setSelectedDeviceIds(allDevices.map(d => d.deviceId));
    setDeviceSelectSaved(false);
  };

  const handleSelectNone = () => {
    setSelectedDeviceIds([]);
    setDeviceSelectSaved(false);
  };

  const handleSaveMonitored = async () => {
    if (!selectedStore) return;
    setDeviceSelectSaving(true);
    setDeviceSelectError('');
    try {
      await api.setSwitchBotMonitoredDevices(selectedStore.id, selectedDeviceIds);
      setDeviceSelectSaved(true);
    } catch (e: unknown) {
      setDeviceSelectError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setDeviceSelectSaving(false);
    }
  };

  const deviceReadings = useMemo(
    () => readings.filter(r => r.device_id === activeDevice),
    [readings, activeDevice]
  );

  const deviceName = deviceReadings[0]?.device_name || activeDevice;

  // 最新値
  const latest = deviceReadings[0] ?? null;

  // 範囲フィルタ
  const now = Date.now();
  const rangeMs = { '24h': 24 * 3600e3, '48h': 48 * 3600e3, '7d': 7 * 24 * 3600e3 };
  const filteredReadings = deviceReadings.filter(r => now - new Date(r.recorded_at).getTime() <= rangeMs[range]);

  if (!selectedStore) return null;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.title}>🌡️ SwitchBot 温湿度ログ</div>
          <div style={s.subtitle}>30分ごとに自動収集されたデータ</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['24h', '48h', '7d'] as const).map(r => (
            <button
              key={r}
              style={{ ...s.rangeBtn, ...(range === r ? s.rangeBtnActive : {}) }}
              onClick={() => setRange(r)}
            >
              {r === '24h' ? '24時間' : r === '48h' ? '48時間' : '7日間'}
            </button>
          ))}
          <button style={s.refreshBtn} onClick={load}>↻ 更新</button>
        </div>
      </div>

      {/* 記録デバイス選択 */}
      <div style={s.deviceSelectSection}>
        <div style={s.chartTitle}>記録デバイス選択</div>
        {deviceSelectError && <div style={{ ...s.errorMsg, marginBottom: 8 }}>{deviceSelectError}</div>}
        {deviceSelectLoading ? (
          <div style={{ color: '#aaa', fontSize: 13 }}>デバイス一覧を読み込み中...</div>
        ) : allDevices.length === 0 ? (
          <div style={{ color: '#aaa', fontSize: 13 }}>デバイスが見つかりません。APIトークンを設定してください。</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              {allDevices.map(device => (
                <label key={device.deviceId} style={s.deviceCheckLabel}>
                  <input
                    type="checkbox"
                    checked={selectedDeviceIds.includes(device.deviceId)}
                    onChange={() => handleToggleDevice(device.deviceId)}
                    style={{ marginRight: 6 }}
                  />
                  <span style={{ fontWeight: 600 }}>{device.deviceName}</span>
                  <span style={{ color: '#64748b', fontSize: 11, marginLeft: 4 }}>({device.deviceType})</span>
                  <span style={{ color: '#aaa', fontSize: 10, marginLeft: 4 }}>{device.deviceId}</span>
                </label>
              ))}
            </div>
            {selectedDeviceIds.length === 0 && (
              <div style={{ fontSize: 12, color: '#0891b2', marginBottom: 8, padding: '6px 10px', background: '#f0f9ff', borderRadius: 6 }}>
                未選択の場合、全温度計デバイスが自動的に記録されます
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button style={s.selectAllBtn} onClick={handleSelectAll}>全選択</button>
              <button style={s.selectAllBtn} onClick={handleSelectNone}>全解除</button>
              <button
                style={{ ...s.saveBtn, opacity: deviceSelectSaving ? 0.6 : 1 }}
                onClick={handleSaveMonitored}
                disabled={deviceSelectSaving}
              >
                {deviceSelectSaving ? '保存中...' : '保存'}
              </button>
              {deviceSelectSaved && <span style={{ fontSize: 12, color: '#16a34a' }}>保存しました</span>}
            </div>
          </>
        )}
      </div>

      {error && <div style={s.errorMsg}>{error}</div>}

      {loading ? (
        <div style={s.empty}>読み込み中...</div>
      ) : devices.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
          <div>まだデータがありません。</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>SwitchBotプラグインのAPIトークンを設定し、30分お待ちください。</div>
        </div>
      ) : (
        <>
          {/* デバイスタブ */}
          <div style={s.deviceTabs}>
            {devices.map(id => {
              const name = readings.find(r => r.device_id === id)?.device_name || id;
              return (
                <button
                  key={id}
                  style={{ ...s.deviceTab, ...(activeDevice === id ? s.deviceTabActive : {}) }}
                  onClick={() => setActiveDevice(id)}
                >
                  {name}
                </button>
              );
            })}
          </div>

          {/* 最新値カード */}
          {latest && (
            <div style={s.latestRow}>
              <div style={s.latestCard}>
                <div style={s.latestLabel}>現在温度</div>
                <div style={s.latestTemp}>{latest.temperature != null ? `${latest.temperature}°C` : '–'}</div>
                <div style={s.latestTime}>{fmtTime(latest.recorded_at)}</div>
              </div>
              <div style={s.latestCard}>
                <div style={s.latestLabel}>現在湿度</div>
                <div style={{ ...s.latestTemp, color: '#0891b2' }}>{latest.humidity != null ? `${latest.humidity}%` : '–'}</div>
                <div style={s.latestTime}>{fmtTime(latest.recorded_at)}</div>
              </div>
              {latest.battery != null && (
                <div style={s.latestCard}>
                  <div style={s.latestLabel}>バッテリー</div>
                  <div style={{ ...s.latestTemp, fontSize: 22, color: latest.battery > 20 ? '#16a34a' : '#dc2626' }}>{latest.battery}%</div>
                  <div style={s.latestTime}>🔋</div>
                </div>
              )}
              <div style={{ ...s.latestCard, flex: 1, alignItems: 'flex-start' }}>
                <div style={s.latestLabel}>{deviceName}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{filteredReadings.length} 件のデータ</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>30分間隔で自動収集</div>
              </div>
            </div>
          )}

          {/* グラフ */}
          {filteredReadings.length > 1 && (
            <div style={s.chartSection}>
              <div style={s.chartTitle}>温度推移</div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 400 }}>
                  <LineChart data={filteredReadings} valueKey="temperature" color="#dc2626" unit="°C" />
                </div>
              </div>
              <div style={{ ...s.chartTitle, marginTop: 20 }}>湿度推移</div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 400 }}>
                  <LineChart data={filteredReadings} valueKey="humidity" color="#0891b2" unit="%" />
                </div>
              </div>
            </div>
          )}

          {/* ログテーブル */}
          <div style={s.tableSection}>
            <div style={s.chartTitle}>ログ一覧</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>記録日時</th>
                    <th style={s.th}>温度</th>
                    <th style={s.th}>湿度</th>
                    <th style={s.th}>バッテリー</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReadings.slice(0, 96).map(r => (
                    <tr key={r.id} style={s.tr}>
                      <td style={s.td}>{fmtTime(r.recorded_at)}</td>
                      <td style={{ ...s.td, fontWeight: 600, color: '#dc2626' }}>
                        {r.temperature != null ? `${r.temperature}°C` : '–'}
                      </td>
                      <td style={{ ...s.td, color: '#0891b2' }}>
                        {r.humidity != null ? `${r.humidity}%` : '–'}
                      </td>
                      <td style={s.td}>
                        {r.battery != null ? `${r.battery}%` : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 20 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 20, fontWeight: 700, color: '#1e293b' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  rangeBtn: { padding: '5px 14px', border: '1px solid #d0d7e2', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#555', fontFamily: 'sans-serif' },
  rangeBtnActive: { background: '#1e40af', color: '#fff', borderColor: '#1e40af', fontWeight: 700 },
  refreshBtn: { padding: '5px 14px', border: '1px solid #d0d7e2', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#555', fontFamily: 'sans-serif' },
  errorMsg: { background: '#fff0f0', color: '#c62828', padding: '12px 16px', borderRadius: 8, fontSize: 13 },
  empty: { textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 15 },
  deviceTabs: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  deviceTab: { padding: '7px 18px', border: '1px solid #d0d7e2', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#555', fontFamily: 'sans-serif' },
  deviceTabActive: { background: '#1e40af', color: '#fff', borderColor: '#1e40af', fontWeight: 700 },
  latestRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  latestCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 20px', minWidth: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  latestLabel: { fontSize: 11, color: '#64748b', fontWeight: 600 },
  latestTemp: { fontSize: 28, fontWeight: 800, color: '#dc2626', lineHeight: 1.2 },
  latestTime: { fontSize: 11, color: '#aaa' },
  chartSection: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' },
  chartTitle: { fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  tableSection: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { padding: '8px 12px', borderBottom: '2px solid #e2e8f0', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const },
  td: { padding: '7px 12px', borderBottom: '1px solid #f1f5f9', color: '#334155' },
  tr: { transition: 'background 0.15s' },
  deviceSelectSection: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' },
  deviceCheckLabel: { display: 'flex', alignItems: 'center', fontSize: 13, color: '#334155', cursor: 'pointer', padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc' },
  selectAllBtn: { padding: '5px 14px', border: '1px solid #d0d7e2', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#555', fontFamily: 'sans-serif' },
  saveBtn: { padding: '5px 20px', border: 'none', borderRadius: 6, background: '#1e40af', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'sans-serif' },
};
