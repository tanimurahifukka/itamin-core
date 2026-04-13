import { useState, useEffect, useCallback, useMemo } from 'react';
import { kioskApi } from '../api/kioskClient';

interface TemplateItem {
  id: string;
  label: string;
  item_type: string;
  required: boolean;
  min_value?: number;
  max_value?: number;
  unit?: string;
  options?: string[] | Record<string, unknown>;
  nfc_location_id?: string;
}

interface Template {
  id: string;
  name: string;
  timing: string;
  description?: string;
  items: TemplateItem[];
}

interface Submission {
  id: string;
  templateId: string;
  templateName: string;
  timing: string;
  submittedAt: string;
  submittedBy: string;
}

interface StaffItem {
  id: string;
  name: string;
}

interface MonthlyDayTiming {
  submitted: boolean;
  all_passed?: boolean;
  count?: number;
}

interface Props {
  storeId: string;
  staff: StaffItem[];
}

const TIMING_LABELS: Record<string, string> = {
  store_opening: '開店前',
  store_closing: '閉店後',
  store_daily: '営業中',
  clock_in: '出勤時',
  clock_out: '退勤時',
  ad_hoc: '随時',
};

// カレンダー表示用の短縮ラベル
const TIMING_SHORT: Record<string, string> = {
  store_opening: '開',
  store_daily: '日',
  store_closing: '閉',
  ad_hoc: '他',
};

const TIMINGS = ['store_opening', 'store_daily', 'store_closing', 'ad_hoc'] as const;

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

// カレンダー用: 月の日付一覧を生成(週の先頭を日曜として前後の空白込み)
function buildCalendarGrid(year: number, month: number): Array<string | null> {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return cells;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export default function KioskHaccp({ storeId, staff }: Props) {
  const [timing, setTiming] = useState<string>('store_opening');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [staffId, setStaffId] = useState(staff[0]?.id || '');
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [switchbotDevices, setSwitchbotDevices] = useState<Array<{ deviceId: string; deviceName: string; deviceType: string }>>([]);
  const [fetchingDevice, setFetchingDevice] = useState<string | null>(null);
  const [nfcStatuses, setNfcStatuses] = useState<Record<string, { done: boolean; submitted_at?: string }>>({});

  // カレンダーモード state
  const [viewMode, setViewMode] = useState<'input' | 'calendar'>('input');
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth() + 1);
  const [monthlyData, setMonthlyData] = useState<Record<string, Record<string, MonthlyDayTiming>>>({});
  const [calLoading, setCalLoading] = useState(false);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [calDateSubmissions, setCalDateSubmissions] = useState<Submission[]>([]);
  const [calDateLoading, setCalDateLoading] = useState(false);

  const today = toDateStr(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, subRes] = await Promise.all([
        kioskApi.getHaccpTemplates(storeId, timing),
        kioskApi.getHaccpSubmissions(storeId, today),
      ]);
      setTemplates(tplRes.templates);
      setSubmissions(subRes.submissions);
    } finally {
      setLoading(false);
    }
  }, [storeId, timing, today]);

  const loadMonthly = useCallback(async (year: number, month: number) => {
    setCalLoading(true);
    try {
      const res = await kioskApi.getHaccpMonthlySubmissions(storeId, year, month);
      setMonthlyData(res.days);
    } catch {
      setMonthlyData({});
    } finally {
      setCalLoading(false);
    }
  }, [storeId]);

  const loadCalDateSubmissions = useCallback(async (date: string) => {
    setCalDateLoading(true);
    try {
      const res = await kioskApi.getHaccpSubmissions(storeId, date);
      setCalDateSubmissions(res.submissions);
    } catch {
      setCalDateSubmissions([]);
    } finally {
      setCalDateLoading(false);
    }
  }, [storeId]);

  // テンプレートを開いたときにSwitchBotデバイス一覧を取得
  useEffect(() => {
    kioskApi.getSwitchBotDevices(storeId)
      .then(res => setSwitchbotDevices(res.devices || []))
      .catch(() => setSwitchbotDevices([]));
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (viewMode === 'calendar') {
      loadMonthly(calYear, calMonth);
      setSelectedCalDate(null);
      setCalDateSubmissions([]);
    }
  }, [viewMode, calYear, calMonth, loadMonthly]);

  // staff が更新されたとき、現在の staffId が一覧にない場合は先頭にリセット
  // staffId は意図的に deps から除外（staffId 変更で再実行させたくない）
  useEffect(() => {
    if (staff.length > 0 && !staff.find(s => s.id === staffId)) {
      setStaffId(staff[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff]);

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  // SwitchBotデバイスから温度/湿度を取得して指定項目に入力
  const fetchSwitchBot = async (deviceId: string, itemId: string, unit: string) => {
    if (fetchingDevice) return;
    setFetchingDevice(deviceId);
    try {
      const res = await kioskApi.getSwitchBotStatus(storeId, deviceId);
      const value = unit === '%' ? res.humidity : res.temperature;
      if (value == null) { showMsg('値を取得できませんでした', false); return; }
      setAnswers(a => ({ ...a, [itemId]: String(value) }));
      const device = switchbotDevices.find(d => d.deviceId === deviceId);
      showMsg(`${device?.deviceName || deviceId}: ${value}${unit} を入力しました`, true);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : 'SwitchBot取得失敗', false);
    } finally {
      setFetchingDevice(null);
    }
  };

  const openTemplate = (tpl: Template) => {
    setSelected(tpl);
    const init: Record<string, string | boolean> = {};
    for (const item of tpl.items) {
      if (item.item_type === 'checkbox') init[item.id] = false;
      else if (item.item_type === 'numeric') init[item.id] = '';
      else init[item.id] = '';
    }
    setAnswers(init);
    const nfcItems = tpl.items.filter(i => i.item_type === 'nfc_location');
    if (nfcItems.length > 0) {
      nfcItems.forEach(item => {
        const locationId = item.nfc_location_id || (typeof item.options === 'object' && !Array.isArray(item.options) ? (item.options?.nfc_location_id as string) : '') || '';
        if (!locationId) return;
        kioskApi.getNfcLocationStatus(storeId, locationId, today)
          .then(d => setNfcStatuses(prev => ({ ...prev, [item.id]: { done: d.done, submitted_at: d.submitted_at } })))
          .catch(() => { console.error('[KioskHaccp] fetch failed'); });
      });
    }
  };

  const handleSubmit = async () => {
    if (!selected || !staffId) { showMsg('担当者を選択してください', false); return; }

    // 必須チェック
    for (const item of selected.items) {
      if (item.item_type === 'nfc_location') {
        if (item.required && !nfcStatuses[item.id]?.done) { showMsg(`「${item.label}」のNFCチェックが未完了です`, false); return; }
        continue;
      }
      if (item.required) {
        const val = answers[item.id];
        if (item.item_type === 'checkbox' && !val) { showMsg(`「${item.label}」は必須です`, false); return; }
        if (item.item_type !== 'checkbox' && (val === '' || val == null)) { showMsg(`「${item.label}」は必須です`, false); return; }
      }
      // 数値範囲チェック
      if (item.item_type === 'numeric' && answers[item.id] !== '') {
        const n = Number(answers[item.id]);
        if (item.min_value != null && n < item.min_value) { showMsg(`「${item.label}」は ${item.min_value} 以上にしてください`, false); return; }
        if (item.max_value != null && n > item.max_value) { showMsg(`「${item.label}」は ${item.max_value} 以下にしてください`, false); return; }
      }
    }

    setSaving(true);
    try {
      const items = selected.items.map(item => ({
        template_item_id: item.id,
        bool_value: item.item_type === 'checkbox' ? (answers[item.id] ?? false) : item.item_type === 'nfc_location' ? (nfcStatuses[item.id]?.done ?? false) : null,
        numeric_value: item.item_type === 'numeric' && answers[item.id] !== '' ? Number(answers[item.id]) : null,
        text_value: item.item_type === 'text' ? (answers[item.id] || null) : null,
        select_value: item.item_type === 'select' ? (answers[item.id] || null) : null,
      }));

      await kioskApi.submitHaccp(storeId, {
        template_id: selected.id,
        membership_id: staffId,
        timing,
        items,
      });

      showMsg(`「${selected.name}」を提出しました`, true);
      setSelected(null);
      await load();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : '提出に失敗しました', false);
    } finally {
      setSaving(false);
    }
  };

  const todaySubmissions = submissions.filter(s => s.submittedAt.startsWith(today));
  const timingSubmissions = todaySubmissions.filter(s => s.timing === timing);

  const calendarGrid = useMemo(() => buildCalendarGrid(calYear, calMonth), [calYear, calMonth]);

  const navigateCalendar = (dir: 1 | -1) => {
    let newMonth = calMonth + dir;
    let newYear = calYear;
    if (newMonth > 12) { newMonth = 1; newYear++; }
    if (newMonth < 1) { newMonth = 12; newYear--; }
    setCalMonth(newMonth);
    setCalYear(newYear);
    setSelectedCalDate(null);
    setCalDateSubmissions([]);
  };

  const handleCalCellClick = (date: string) => {
    setSelectedCalDate(date);
    loadCalDateSubmissions(date);
  };

  // SwitchBotデバイスの現在値を全台取得
  const [deviceStatus, setDeviceStatus] = useState<Record<string, { temperature: number | null; humidity: number | null; loading: boolean }>>({});

  const refreshAllDevices = useCallback(async () => {
    if (switchbotDevices.length === 0) return;
    const init: Record<string, { temperature: number | null; humidity: number | null; loading: boolean }> = {};
    for (const d of switchbotDevices) init[d.deviceId] = { temperature: null, humidity: null, loading: true };
    setDeviceStatus(init);
    await Promise.all(switchbotDevices.map(async d => {
      try {
        const res = await kioskApi.getSwitchBotStatus(storeId, d.deviceId);
        setDeviceStatus(prev => ({ ...prev, [d.deviceId]: { temperature: res.temperature, humidity: res.humidity, loading: false } }));
      } catch {
        setDeviceStatus(prev => ({ ...prev, [d.deviceId]: { temperature: null, humidity: null, loading: false } }));
      }
    }));
  }, [switchbotDevices, storeId]);

  useEffect(() => { if (switchbotDevices.length > 0) refreshAllDevices(); }, [switchbotDevices, refreshAllDevices]);

  return (
    <div style={s.root}>
      {msg && (
        <div style={{ ...s.msg, background: msg.ok ? '#e6f4ea' : '#fff0f0', color: msg.ok ? '#2e7d32' : '#c62828' }}>
          {msg.text}
        </div>
      )}

      {/* SwitchBot温度パネル */}
      {switchbotDevices.length > 0 && (
        <div style={s.switchbotPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>🌡️ SwitchBot 現在温度</div>
            <button style={s.refreshBtn} onClick={refreshAllDevices}>更新</button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {switchbotDevices.map(d => {
              const st = deviceStatus[d.deviceId];
              return (
                <div key={d.deviceId} style={s.deviceCard}>
                  <div style={s.deviceName}>{d.deviceName}</div>
                  {st?.loading ? (
                    <div style={s.deviceTemp}>...</div>
                  ) : (
                    <>
                      <div style={s.deviceTemp}>{st?.temperature != null ? `${st.temperature}°C` : '–'}</div>
                      <div style={s.deviceHumid}>{st?.humidity != null ? `湿度 ${st.humidity}%` : ''}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* タイミング選択 + カレンダー切替 */}
      <div style={{ ...s.timingRow, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {TIMINGS.map(t => (
            <button
              key={t}
              style={{ ...s.timingBtn, ...(timing === t && viewMode === 'input' ? s.timingBtnActive : {}) }}
              onClick={() => { setTiming(t); setSelected(null); if (viewMode === 'calendar') setViewMode('input'); }}
            >
              {TIMING_LABELS[t]}
              {todaySubmissions.filter(s => s.timing === t).length > 0 && (
                <span style={s.doneBadge}>✓</span>
              )}
            </button>
          ))}
        </div>
        <button
          style={{ ...s.timingBtn, ...(viewMode === 'calendar' ? s.timingBtnActive : {}), marginLeft: 8 }}
          onClick={() => setViewMode(v => v === 'calendar' ? 'input' : 'calendar')}
        >
          📅 カレンダー
        </button>
      </div>

      {/* カレンダービュー */}
      {viewMode === 'calendar' && (
        <div style={s.calRoot}>
          {/* 月ナビ */}
          <div style={s.calNav}>
            <button style={s.calNavBtn} onClick={() => navigateCalendar(-1)}>◀</button>
            <span style={s.calNavLabel}>{calYear}年{calMonth}月</span>
            <button style={s.calNavBtn} onClick={() => navigateCalendar(1)}>▶</button>
            {calLoading && <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>読み込み中...</span>}
          </div>

          {/* 曜日ヘッダ */}
          <div style={s.calGrid}>
            {['日', '月', '火', '水', '木', '金', '土'].map((w, i) => (
              <div key={w} style={{ ...s.calWeekHeader, color: i === 0 ? '#d32f2f' : i === 6 ? '#1565c0' : '#555' }}>
                {w}
              </div>
            ))}

            {/* 日付セル */}
            {calendarGrid.map((dateStr, idx) => {
              if (!dateStr) {
                return <div key={`empty-${idx}`} style={s.calEmptyCell} />;
              }

              const dayNum = parseInt(dateStr.split('-')[2], 10);
              const weekIdx = idx % 7;
              const isSun = weekIdx === 0;
              const isSat = weekIdx === 6;
              const isToday = dateStr === today;
              const isFuture = dateStr > today;
              const isSelected = dateStr === selectedCalDate;
              const dayData = monthlyData[dateStr] || {};

              const timingsWithData = TIMINGS.filter(t => dayData[t]);
              const allSubmitted = TIMINGS.every(t => dayData[t]?.submitted);
              const anySubmitted = TIMINGS.some(t => dayData[t]?.submitted);
              const anyDeviation = TIMINGS.some(t => dayData[t]?.submitted && !dayData[t]?.all_passed);

              let cellBg = '#fff';
              if (isFuture) cellBg = '#f8fafc';
              else if (allSubmitted && !anyDeviation) cellBg = '#f0fdf4';
              else if (anySubmitted && anyDeviation) cellBg = '#fffbeb';
              else if (anySubmitted) cellBg = '#f0fdf4';

              return (
                <div
                  key={dateStr}
                  style={{
                    ...s.calCell,
                    background: cellBg,
                    border: isSelected ? '2px solid #4f8ef7' : isToday ? '2px solid #4f8ef7' : '1px solid #e2e8f0',
                    boxShadow: isToday ? '0 0 0 1px #4f8ef7' : 'none',
                    cursor: isFuture ? 'default' : 'pointer',
                    opacity: isFuture ? 0.5 : 1,
                  }}
                  onClick={() => !isFuture && handleCalCellClick(dateStr)}
                >
                  <div style={{
                    fontSize: 13,
                    fontWeight: isToday ? 700 : 500,
                    color: isSun ? '#d32f2f' : isSat ? '#1565c0' : '#222',
                    marginBottom: 4,
                  }}>
                    {dayNum}
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' as const }}>
                    {TIMINGS.map(t => {
                      const info = dayData[t];
                      const dot = info?.submitted
                        ? (info.all_passed ? '🟢' : '🟡')
                        : (isFuture ? '' : '⚪');
                      if (!dot) return null;
                      return (
                        <span key={t} style={s.calTimingDot} title={TIMING_LABELS[t]}>
                          <span style={{ fontSize: 8 }}>{dot}</span>
                          <span style={{ fontSize: 8, color: '#666' }}>{TIMING_SHORT[t]}</span>
                        </span>
                      );
                    })}
                    {!isFuture && timingsWithData.length === 0 && (
                      <span style={{ fontSize: 9, color: '#ccc' }}>–</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 凡例 */}
          <div style={s.calLegend}>
            <span>🟢 全項目OK</span>
            <span>🟡 逸脱あり</span>
            <span>⚪ 未提出</span>
          </div>

          {/* 選択日の詳細 */}
          {selectedCalDate && (
            <div style={{ marginTop: 16 }}>
              <div style={s.panelTitle}>
                {new Date(selectedCalDate + 'T00:00:00').toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })} の記録
              </div>
              {calDateLoading ? (
                <div style={s.empty}>読み込み中...</div>
              ) : calDateSubmissions.length === 0 ? (
                <div style={s.empty}>この日の提出記録はありません</div>
              ) : (
                <div style={s.subList}>
                  {calDateSubmissions.map(sub => (
                    <div key={sub.id} style={s.subRow}>
                      <div>
                        <div style={s.subName}>{sub.templateName}</div>
                        <div style={s.subMeta}>{TIMING_LABELS[sub.timing] || sub.timing} · {sub.submittedBy}</div>
                      </div>
                      <div style={s.subTime}>{fmtTime(sub.submittedAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ ...s.body, display: viewMode === 'calendar' ? 'none' : 'flex' }}>
        {/* 左: テンプレート一覧 + 本日の記録 */}
        <div style={s.left}>
          <div style={s.panelTitle}>チェックリスト</div>
          {loading ? (
            <div style={s.empty}>読み込み中...</div>
          ) : templates.length === 0 ? (
            <div style={s.empty}>このタイミングのチェックリストはありません</div>
          ) : (
            <div style={s.tplList}>
              {templates.map(tpl => {
                const done = timingSubmissions.some(s => s.templateId === tpl.id);
                return (
                  <button
                    key={tpl.id}
                    style={{ ...s.tplCard, ...(selected?.id === tpl.id ? s.tplCardActive : {}), ...(done ? s.tplCardDone : {}) }}
                    onClick={() => openTemplate(tpl)}
                    data-testid={`haccp-tpl-${tpl.id}`}
                  >
                    <div style={s.tplName}>{tpl.name}</div>
                    <div style={s.tplMeta}>{tpl.items.length}項目</div>
                    {done && <div style={s.doneTag}>✓ 提出済</div>}
                  </button>
                );
              })}
            </div>
          )}

          {/* 本日の記録 */}
          {todaySubmissions.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={s.panelTitle}>本日の記録</div>
              <div style={s.subList}>
                {todaySubmissions.map(sub => (
                  <div key={sub.id} style={s.subRow}>
                    <div>
                      <div style={s.subName}>{sub.templateName}</div>
                      <div style={s.subMeta}>{TIMING_LABELS[sub.timing] || sub.timing} · {sub.submittedBy}</div>
                    </div>
                    <div style={s.subTime}>{fmtTime(sub.submittedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右: チェックフォーム */}
        {selected && staff.length === 0 && (
          <div style={s.right}>
            <div style={s.formHeader}>
              <div style={s.formTitle}>{selected.name}</div>
              <button style={s.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={s.noStaffMsg}>
              本日の出勤者がいません。打刻してからチェックリストを入力してください。
            </div>
          </div>
        )}
        {selected && staff.length > 0 && (
          <div style={s.right}>
            <div style={s.formHeader}>
              <div style={s.formTitle}>{selected.name}</div>
              <button style={s.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* 担当者 */}
            <div style={s.fieldRow}>
              <label style={s.fieldLabel}>担当者</label>
              <select
                value={staffId}
                onChange={e => setStaffId(e.target.value)}
                style={s.select}
                data-testid="haccp-staff-select"
              >
                {staff.map(st => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>

            {/* チェック項目 */}
            <div style={s.itemList}>
              {selected.items.map(item => (
                <div key={item.id} style={s.itemRow}>
                  <div style={s.itemLabel}>
                    {item.label}
                    {item.required && <span style={s.required}> *</span>}
                    {item.unit && <span style={s.unit}> ({item.unit})</span>}
                    {item.min_value != null && item.max_value != null && (
                      <span style={s.range}> [{item.min_value}〜{item.max_value}]</span>
                    )}
                  </div>
                  <div style={s.itemInput}>
                    {item.item_type === 'checkbox' && (
                      <label style={s.checkLabel}>
                        <input
                          type="checkbox"
                          checked={!!answers[item.id]}
                          onChange={e => setAnswers(a => ({ ...a, [item.id]: e.target.checked }))}
                          style={{ width: 20, height: 20, cursor: 'pointer' }}
                          data-testid={`haccp-item-${item.id}`}
                        />
                        <span style={{ marginLeft: 8, fontSize: 14 }}>{answers[item.id] ? 'OK' : '未チェック'}</span>
                      </label>
                    )}
                    {item.item_type === 'numeric' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="number"
                          value={answers[item.id] as string}
                          min={item.min_value}
                          max={item.max_value}
                          step="0.1"
                          onChange={e => setAnswers(a => ({ ...a, [item.id]: e.target.value }))}
                          style={s.numInput}
                          data-testid={`haccp-item-${item.id}`}
                        />
                        {switchbotDevices.length > 0 && (item.unit === '°C' || item.unit === '%') && (
                          switchbotDevices.length === 1 ? (
                            <button
                              style={s.switchbotBtn}
                              onClick={() => fetchSwitchBot(switchbotDevices[0].deviceId, item.id, item.unit || '°C')}
                              disabled={fetchingDevice === switchbotDevices[0].deviceId}
                              title={switchbotDevices[0].deviceName}
                            >
                              {fetchingDevice === switchbotDevices[0].deviceId ? '...' : '🌡️'}
                            </button>
                          ) : (
                            <select
                              style={{ ...s.numInput, width: 'auto', fontSize: 12 }}
                              onChange={e => e.target.value && fetchSwitchBot(e.target.value, item.id, item.unit || '°C')}
                              value=""
                            >
                              <option value="">🌡️</option>
                              {switchbotDevices.map(d => (
                                <option key={d.deviceId} value={d.deviceId}>{d.deviceName}</option>
                              ))}
                            </select>
                          )
                        )}
                      </div>
                    )}
                    {item.item_type === 'text' && (
                      <input
                        type="text"
                        value={(answers[item.id] as string) || ''}
                        onChange={e => setAnswers(a => ({ ...a, [item.id]: e.target.value }))}
                        style={s.textInput}
                        data-testid={`haccp-item-${item.id}`}
                      />
                    )}
                    {item.item_type === 'select' && item.options && Array.isArray(item.options) && (
                      <select
                        value={(answers[item.id] as string) || ''}
                        onChange={e => setAnswers(a => ({ ...a, [item.id]: e.target.value }))}
                        style={s.select}
                        data-testid={`haccp-item-${item.id}`}
                      >
                        <option value="">選択</option>
                        {(item.options as string[]).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                    {item.item_type === 'nfc_location' && (() => {
                      const nfcStatus = nfcStatuses[item.id];
                      const nfcDone = nfcStatus?.done ?? false;
                      const locationId = item.nfc_location_id || (typeof item.options === 'object' && !Array.isArray(item.options) ? (item.options?.nfc_location_id as string) : '') || '';
                      const submittedTime = nfcStatus?.submitted_at
                        ? new Date(nfcStatus.submitted_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
                        : null;
                      return nfcDone ? (
                        <span style={{ fontSize: 13, color: '#2e7d32', fontWeight: 600 }}>
                          ✓ チェック済み{submittedTime ? ` ${submittedTime}` : ''}
                        </span>
                      ) : (
                        <a
                          href={`/nfc/clean?loc=${locationId}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 13, color: '#c2410c', fontWeight: 600, padding: '6px 12px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fef3c7', textDecoration: 'none' }}
                        >
                          チェックが必要です
                        </a>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>

            <button
              style={s.submitBtn}
              onClick={handleSubmit}
              disabled={saving}
              data-testid="haccp-submit"
            >
              {saving ? '提出中...' : '✓ 提出する'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' },
  msg: { position: 'fixed', top: 64, left: 0, right: 0, padding: '16px 24px', fontSize: 16, fontWeight: 700, textAlign: 'center', zIndex: 200 },
  timingRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  timingBtn: { padding: '9px 20px', border: '1px solid #d0d7e2', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#555', fontFamily: 'sans-serif', position: 'relative' },
  timingBtnActive: { background: '#4f8ef7', color: '#fff', borderColor: '#4f8ef7', fontWeight: 700 },
  doneBadge: { marginLeft: 6, fontSize: 11, background: '#4caf50', color: '#fff', borderRadius: 4, padding: '1px 5px' },
  // カレンダービュー
  calRoot: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px' },
  calNav: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  calNavBtn: { padding: '6px 14px', border: '1px solid #d0d7e2', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 16, color: '#333', fontFamily: 'sans-serif' },
  calNavLabel: { fontSize: 16, fontWeight: 700, color: '#222', minWidth: 120, textAlign: 'center' as const },
  calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 },
  calWeekHeader: { textAlign: 'center' as const, fontSize: 12, fontWeight: 700, padding: '6px 0', color: '#555' },
  calCell: { minHeight: 72, borderRadius: 6, padding: '6px 6px', cursor: 'pointer', transition: 'box-shadow 0.1s' },
  calEmptyCell: { minHeight: 72, borderRadius: 6 },
  calTimingDot: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', lineHeight: 1 },
  calLegend: { display: 'flex', gap: 16, fontSize: 11, color: '#888', marginTop: 10, flexWrap: 'wrap' as const },
  body: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  left: { flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 8 },
  right: { flex: 1, background: '#fff', border: '2px solid #4f8ef7', borderRadius: 10, padding: '16px 20px' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  empty: { color: '#aaa', fontSize: 13, padding: '16px 0' },
  tplList: { display: 'flex', flexDirection: 'column', gap: 6 },
  tplCard: { background: '#fff', border: '1px solid #d0d7e2', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'sans-serif', position: 'relative' },
  tplCardActive: { borderColor: '#4f8ef7', background: '#eff6ff' },
  tplCardDone: { borderColor: '#4caf50', background: '#f0fdf4' },
  tplName: { fontSize: 14, fontWeight: 600, color: '#222' },
  tplMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  doneTag: { fontSize: 11, color: '#4caf50', fontWeight: 700, marginTop: 4 },
  subList: { display: 'flex', flexDirection: 'column', gap: 6 },
  subRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: 6, padding: '8px 10px', border: '1px solid #e2e8f0' },
  subName: { fontSize: 13, fontWeight: 600, color: '#333' },
  subMeta: { fontSize: 11, color: '#888' },
  subTime: { fontSize: 12, color: '#555', fontWeight: 600 },
  formHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  formTitle: { fontSize: 16, fontWeight: 700, color: '#1a56db' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' },
  switchbotBtn: { background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'sans-serif' },
  fieldRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: '#555', minWidth: 56 },
  select: { padding: '7px 10px', border: '1px solid #d0d7e2', borderRadius: 6, fontSize: 14, fontFamily: 'sans-serif', flex: 1 },
  itemList: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 },
  itemRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#fafbfc', borderRadius: 8, border: '1px solid #e8edf6' },
  itemLabel: { flex: 1, fontSize: 14, color: '#333', fontWeight: 500 },
  itemInput: { flexShrink: 0 },
  required: { color: '#ef5350', fontWeight: 700 },
  unit: { fontSize: 12, color: '#888' },
  range: { fontSize: 11, color: '#4f8ef7' },
  checkLabel: { display: 'flex', alignItems: 'center', cursor: 'pointer' },
  numInput: { width: 100, padding: '7px 10px', border: '1px solid #d0d7e2', borderRadius: 6, fontSize: 16, textAlign: 'right' as const, fontFamily: 'sans-serif' },
  textInput: { width: 200, padding: '7px 10px', border: '1px solid #d0d7e2', borderRadius: 6, fontSize: 14, fontFamily: 'sans-serif' },
  submitBtn: { width: '100%', padding: '14px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'sans-serif' },
  switchbotPanel: { background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 16px' },
  refreshBtn: { background: '#fff', border: '1px solid #fcd34d', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: '#92400e', fontFamily: 'sans-serif' },
  deviceCard: { background: '#fff', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', minWidth: 100, textAlign: 'center' as const },
  deviceName: { fontSize: 11, color: '#92400e', fontWeight: 600, marginBottom: 4 },
  deviceTemp: { fontSize: 18, fontWeight: 700, color: '#1e40af' },
  deviceHumid: { fontSize: 11, color: '#64748b', marginTop: 2 },
  noStaffMsg: { padding: '20px 0', fontSize: 14, color: '#c2410c', fontWeight: 600, textAlign: 'center' as const },
};
