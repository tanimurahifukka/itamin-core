import { useState, useEffect, useCallback } from 'react';
import { kioskApi } from '../api/kioskClient';

interface TemplateItem {
  id: string;
  label: string;
  item_type: string;
  required: boolean;
  min_value?: number;
  max_value?: number;
  unit?: string;
  options?: string[];
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

const TIMINGS = ['store_opening', 'store_daily', 'store_closing', 'ad_hoc'] as const;

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

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
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // SwitchBot: { deviceId: itemId[] } のマッピング（enabled-pluginsと一緒に取得）
  const [switchbotMappings, setSwitchbotMappings] = useState<Record<string, string[]>>({});
  const [fetchingTemp, setFetchingTemp] = useState<string | null>(null); // deviceId

  const today = toDateStr(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, subRes, pluginsRes] = await Promise.all([
        kioskApi.getHaccpTemplates(storeId, timing),
        kioskApi.getHaccpSubmissions(storeId, today),
        kioskApi.getEnabledPlugins(storeId),
      ]);
      setTemplates(tplRes.templates);
      setSubmissions(subRes.submissions);
      // SwitchBotマッピングをpluginsResから取得（enabled-pluginsにconfig情報はないので別途対応）
      // mappingsはlocalStorageにキャッシュされたものを使う
      const cached = localStorage.getItem(`switchbot_mappings_${storeId}`);
      if (cached) setSwitchbotMappings(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  }, [storeId, timing, today]);

  useEffect(() => { load(); }, [load]);

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  // SwitchBotから温度取得してanswersに自動入力
  const fetchSwitchBot = async (deviceId: string, itemIds: string[]) => {
    if (fetchingTemp) return;
    setFetchingTemp(deviceId);
    try {
      const res = await kioskApi.getSwitchBotStatus(storeId, deviceId);
      const newAnswers: Record<string, any> = {};
      for (const itemId of itemIds) {
        const item = selected?.items.find(i => i.id === itemId);
        if (!item) continue;
        if (item.unit === '%' && res.humidity != null) newAnswers[itemId] = String(res.humidity);
        else if (res.temperature != null) newAnswers[itemId] = String(res.temperature);
      }
      setAnswers(a => ({ ...a, ...newAnswers }));
      showMsg(`${res.temperature != null ? `${res.temperature}°C` : ''}${res.humidity != null ? ` 湿度${res.humidity}%` : ''} を取得しました`, true);
    } catch (e: any) {
      showMsg(e.message || 'SwitchBot取得失敗', false);
    } finally {
      setFetchingTemp(null);
    }
  };

  // このテンプレートのアイテムにマッチするSwitchBotデバイス一覧を返す
  const getMatchedDevices = (): { deviceId: string; itemIds: string[] }[] => {
    if (!selected || Object.keys(switchbotMappings).length === 0) return [];
    return Object.entries(switchbotMappings)
      .map(([deviceId, itemIds]) => ({
        deviceId,
        itemIds: itemIds.filter(id => selected.items.some(i => i.id === id)),
      }))
      .filter(d => d.itemIds.length > 0);
  };

  const openTemplate = (tpl: Template) => {
    setSelected(tpl);
    // 初期値セット
    const init: Record<string, any> = {};
    for (const item of tpl.items) {
      if (item.item_type === 'checkbox') init[item.id] = false;
      else if (item.item_type === 'numeric') init[item.id] = '';
      else init[item.id] = '';
    }
    setAnswers(init);
  };

  const handleSubmit = async () => {
    if (!selected || !staffId) { showMsg('担当者を選択してください', false); return; }

    // 必須チェック
    for (const item of selected.items) {
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
        bool_value: item.item_type === 'checkbox' ? (answers[item.id] ?? false) : null,
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
    } catch (e: any) {
      showMsg(e.message || '提出に失敗しました', false);
    } finally {
      setSaving(false);
    }
  };

  const todaySubmissions = submissions.filter(s => s.submittedAt.startsWith(today));
  const timingSubmissions = todaySubmissions.filter(s => s.timing === timing);

  return (
    <div style={s.root}>
      {msg && (
        <div style={{ ...s.msg, background: msg.ok ? '#e6f4ea' : '#fff0f0', color: msg.ok ? '#2e7d32' : '#c62828' }}>
          {msg.text}
        </div>
      )}

      {/* タイミング選択 */}
      <div style={s.timingRow}>
        {TIMINGS.map(t => (
          <button
            key={t}
            style={{ ...s.timingBtn, ...(timing === t ? s.timingBtnActive : {}) }}
            onClick={() => { setTiming(t); setSelected(null); }}
          >
            {TIMING_LABELS[t]}
            {todaySubmissions.filter(s => s.timing === t).length > 0 && (
              <span style={s.doneBadge}>✓</span>
            )}
          </button>
        ))}
      </div>

      <div style={s.body}>
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
        {selected && (
          <div style={s.right}>
            <div style={s.formHeader}>
              <div style={s.formTitle}>{selected.name}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {getMatchedDevices().map(({ deviceId, itemIds }) => (
                  <button
                    key={deviceId}
                    style={s.switchbotBtn}
                    onClick={() => fetchSwitchBot(deviceId, itemIds)}
                    disabled={fetchingTemp === deviceId}
                    title={`SwitchBot (${deviceId.slice(0, 8)}...) から温度・湿度を取得`}
                  >
                    {fetchingTemp === deviceId ? '取得中...' : '🌡️ SwitchBotから取得'}
                  </button>
                ))}
                <button style={s.closeBtn} onClick={() => setSelected(null)}>✕</button>
              </div>
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
                      <input
                        type="number"
                        value={answers[item.id]}
                        min={item.min_value}
                        max={item.max_value}
                        step="0.1"
                        onChange={e => setAnswers(a => ({ ...a, [item.id]: e.target.value }))}
                        style={s.numInput}
                        data-testid={`haccp-item-${item.id}`}
                      />
                    )}
                    {item.item_type === 'text' && (
                      <input
                        type="text"
                        value={answers[item.id] || ''}
                        onChange={e => setAnswers(a => ({ ...a, [item.id]: e.target.value }))}
                        style={s.textInput}
                        data-testid={`haccp-item-${item.id}`}
                      />
                    )}
                    {item.item_type === 'select' && item.options && (
                      <select
                        value={answers[item.id] || ''}
                        onChange={e => setAnswers(a => ({ ...a, [item.id]: e.target.value }))}
                        style={s.select}
                        data-testid={`haccp-item-${item.id}`}
                      >
                        <option value="">選択</option>
                        {item.options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
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
  timingRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  timingBtn: { padding: '9px 20px', border: '1px solid #d0d7e2', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#555', fontFamily: 'sans-serif', position: 'relative' },
  timingBtnActive: { background: '#4f8ef7', color: '#fff', borderColor: '#4f8ef7', fontWeight: 700 },
  doneBadge: { marginLeft: 6, fontSize: 11, background: '#4caf50', color: '#fff', borderRadius: 4, padding: '1px 5px' },
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
};
