/**
 * 店舗チェックリストページ
 * 開店前 / 日中 / 閉店前の店舗スコープチェックリストを管理
 */
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import {
  checkApi,
  CheckTiming,
  ChecklistTemplate,
  ActiveItem,
  Submission,
  SubmissionItemInput,
} from '../api/checkApi';

type StoreTab = 'store_opening' | 'store_daily' | 'store_closing';

const TAB_LABELS: Record<StoreTab, string> = {
  store_opening: '開店前',
  store_daily: '日中巡回',
  store_closing: '閉店前',
};

interface SubmissionState {
  submitted: boolean;
  has_deviation: boolean;
  all_passed: boolean;
  submitted_at: string;
  submission: Submission;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function statusColor(state: SubmissionState | null): string {
  if (!state) return '#ef4444'; // 未完了 = 赤
  if (state.has_deviation) return '#f59e0b'; // 逸脱あり = 黄
  return '#22c55e'; // 完了 = 緑
}

function statusLabel(state: SubmissionState | null): string {
  if (!state) return '未提出';
  if (state.has_deviation) return '逸脱あり';
  if (state.all_passed) return '完了';
  return '提出済';
}

type ItemValues = {
  bool_value: boolean;
  numeric_value: string;
  text_value: string;
  select_value: string;
};

function emptyVals(): ItemValues {
  return { bool_value: false, numeric_value: '', text_value: '', select_value: '' };
}

function isItemDone(item: ActiveItem, v: ItemValues): boolean {
  if (!item.required) return true;
  switch (item.item_type) {
    case 'checkbox': return v.bool_value;
    case 'numeric':  return !isNaN(parseFloat(v.numeric_value));
    case 'text':     return v.text_value.trim().length > 0;
    case 'select':   return v.select_value.length > 0;
    default:         return true;
  }
}

interface CheckFormProps {
  template: ChecklistTemplate;
  items: ActiveItem[];
  timing: CheckTiming;
  storeId: string;
  membershipId: string;
  onSubmitted: () => void;
}

function CheckForm({ template, items, timing, storeId, membershipId, onSubmitted }: CheckFormProps) {
  const [values, setValues] = useState<Record<string, ItemValues>>(() => {
    const init: Record<string, ItemValues> = {};
    items.forEach(i => { init[i.id] = emptyVals(); });
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateVal = (id: string, patch: Partial<ItemValues>) => {
    setValues(prev => ({ ...prev, [id]: { ...(prev[id] ?? emptyVals()), ...patch } }));
  };

  const allDone = items.length > 0 && items.every(i => isItemDone(i, values[i.id] ?? emptyVals()));

  const handleSubmit = async () => {
    if (!allDone || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const subItems: SubmissionItemInput[] = items.map(item => {
        const v = values[item.id] ?? emptyVals();
        return {
          template_item_id: item.id,
          item_key: item.item_key,
          bool_value: item.item_type === 'checkbox' ? v.bool_value : null,
          numeric_value: item.item_type === 'numeric' && v.numeric_value ? parseFloat(v.numeric_value) : null,
          text_value: item.item_type === 'text' ? v.text_value : null,
          select_value: item.item_type === 'select' ? v.select_value : null,
        };
      });

      await checkApi.createSubmission(storeId, {
        scope: 'store',
        timing,
        template_id: template.id,
        membership_id: membershipId,
        items: subItems,
      });
      onSubmitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      {error && <div style={{ color: '#dc2626', marginBottom: 8, fontSize: '0.9rem' }}>{error}</div>}
      {items.map(item => {
        const v = values[item.id] ?? emptyVals();
        const done = isItemDone(item, v);

        // measurement_only の項目は別ボタン
        if (item.tracking_mode === 'measurement_only') {
          return (
            <MeasurementOnlyItem
              key={item.id}
              item={item}
              storeId={storeId}
            />
          );
        }

        return (
          <div
            key={item.id}
            style={{
              padding: '10px 12px',
              marginBottom: 8,
              borderRadius: 8,
              border: `1px solid ${done ? '#86efac' : '#e5e7eb'}`,
              background: done ? '#f0fdf4' : '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>
                  {item.label}
                  {item.is_ccp && (
                    <span style={{
                      marginLeft: 6, fontSize: '0.7rem', fontWeight: 700,
                      color: '#dc2626', background: '#fee2e2', padding: '1px 5px', borderRadius: 3,
                    }}>CCP</span>
                  )}
                </span>
                {item.item_type === 'numeric' && (item.min_value != null || item.max_value != null) && (
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    {item.unit && `${item.unit} `}
                    {item.min_value != null && item.max_value != null
                      ? `${item.min_value} ～ ${item.max_value}`
                      : item.min_value != null ? `${item.min_value} 以上`
                      : `${item.max_value} 以下`}
                  </div>
                )}
              </div>
              <div style={{ minWidth: 120, textAlign: 'right' }}>
                {item.item_type === 'checkbox' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', justifyContent: 'flex-end' }}>
                    <input
                      type="checkbox"
                      checked={v.bool_value}
                      onChange={e => updateVal(item.id, { bool_value: e.target.checked })}
                    />
                    <span style={{ fontSize: '0.85rem' }}>確認</span>
                  </label>
                ) : item.item_type === 'numeric' ? (
                  <input
                    type="number"
                    value={v.numeric_value}
                    onChange={e => updateVal(item.id, { numeric_value: e.target.value })}
                    step="0.1"
                    style={{
                      width: 90, padding: '6px 8px', borderRadius: 6,
                      border: '1px solid #d1d5db', textAlign: 'right',
                    }}
                    placeholder="0.0"
                  />
                ) : item.item_type === 'text' ? (
                  <input
                    type="text"
                    value={v.text_value}
                    onChange={e => updateVal(item.id, { text_value: e.target.value })}
                    style={{
                      width: 120, padding: '6px 8px', borderRadius: 6,
                      border: '1px solid #d1d5db',
                    }}
                    placeholder="入力"
                  />
                ) : item.item_type === 'select' ? (
                  <select
                    value={v.select_value}
                    onChange={e => updateVal(item.id, { select_value: e.target.value })}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
                  >
                    <option value="">選択</option>
                    {(Array.isArray(item.options?.values) ? item.options.values as string[] : []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={handleSubmit}
        disabled={!allDone || submitting}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '12px',
          borderRadius: 8,
          border: 'none',
          background: allDone ? '#0f3460' : '#cbd5e1',
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.95rem',
          cursor: allDone && !submitting ? 'pointer' : 'default',
        }}
      >
        {submitting ? '提出中...' : '提出'}
      </button>
    </div>
  );
}

function MeasurementOnlyItem({ item, storeId }: { item: ActiveItem; storeId: string }) {
  const [value, setValue]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  const handleAdd = async () => {
    if (!value.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const numVal = parseFloat(value);
      await checkApi.createMeasurement(storeId, {
        item_key: item.item_key,
        numeric_value: !isNaN(numVal) ? numVal : null,
        text_value: isNaN(numVal) ? value : null,
        template_item_id: item.id,
        source: 'manual',
      });
      setValue('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      padding: '10px 12px', marginBottom: 8, borderRadius: 8,
      border: '1px solid #e5e7eb', background: '#f8fafc',
    }}>
      <div style={{ fontWeight: 500, marginBottom: 6 }}>
        {item.label}
        {item.is_ccp && (
          <span style={{
            marginLeft: 6, fontSize: '0.7rem', fontWeight: 700,
            color: '#dc2626', background: '#fee2e2', padding: '1px 5px', borderRadius: 3,
          }}>CCP</span>
        )}
        <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#64748b' }}>（時系列記録）</span>
      </div>
      {item.item_type === 'numeric' && (item.min_value != null || item.max_value != null) && (
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 6 }}>
          {item.unit && `${item.unit} `}
          {item.min_value != null && item.max_value != null
            ? `${item.min_value} ～ ${item.max_value}`
            : item.min_value != null ? `${item.min_value} 以上`
            : `${item.max_value} 以下`}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          value={value}
          onChange={e => setValue(e.target.value)}
          step="0.1"
          placeholder="0.0"
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 6,
            border: '1px solid #d1d5db',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!value.trim() || saving}
          style={{
            padding: '7px 12px', borderRadius: 6, border: 'none',
            background: value.trim() ? '#0f3460' : '#cbd5e1',
            color: '#fff', cursor: value.trim() && !saving ? 'pointer' : 'default',
            fontSize: '0.85rem', whiteSpace: 'nowrap',
          }}
        >
          {saving ? '...' : saved ? '✓ 記録済' : '＋ 記録を追加'}
        </button>
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function StoreChecklistPage() {
  const { selectedStore } = useAuth();
  const [activeTab, setActiveTab] = useState<StoreTab>('store_opening');

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [items, setItems]         = useState<ActiveItem[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [membershipId, setMembershipId] = useState('');

  // membership_id (store_staff.id) を取得
  useEffect(() => {
    if (!selectedStore) return;
    api.getAttendanceToday(selectedStore.id)
      .then((d) => { if (d.membershipId) setMembershipId(d.membershipId); })
      .catch(() => {});
  }, [selectedStore]);

  const load = useCallback(async () => {
    if (!selectedStore) return;
    setLoading(true);
    setError('');
    try {
      const [activeData, subData] = await Promise.all([
        checkApi.getActive(selectedStore.id, 'store', activeTab),
        checkApi.getSubmissions(selectedStore.id, {
          from: todayStr(),
          to: todayStr(),
          scope: 'store',
          timing: activeTab,
        }),
      ]);
      setTemplates(activeData.templates);
      setItems(activeData.merged_items);
      setSubmissions(subData.submissions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedStore, activeTab]);

  useEffect(() => { load(); }, [load]);

  if (!selectedStore) {
    return <div className="main-content"><p>店舗を選択してください</p></div>;
  }

  // テンプレートごとに本日の最新提出状況をまとめる
  const submissionByTemplate = new Map<string, SubmissionState>();
  for (const sub of submissions) {
    const prev = submissionByTemplate.get(sub.template_id);
    if (!prev || sub.submitted_at > prev.submitted_at) {
      submissionByTemplate.set(sub.template_id, {
        submitted: true,
        has_deviation: sub.has_deviation,
        all_passed: sub.all_passed,
        submitted_at: sub.submitted_at,
        submission: sub,
      });
    }
  }

  return (
    <div className="main-content">
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>今日の店舗チェック</h3>

        {/* タブ */}
        <div className="timing-tabs" style={{ marginBottom: 20 }}>
          {(Object.keys(TAB_LABELS) as StoreTab[]).map(tab => (
            <button
              key={tab}
              className={`timing-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ color: '#dc2626', marginBottom: 12, padding: '10px 14px', background: '#fee2e2', borderRadius: 8 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading">読み込み中...</div>
        ) : templates.length === 0 ? (
          <div style={{
            padding: 20, border: '1px dashed #cbd5e1', borderRadius: 10,
            color: '#64748b', background: '#fff', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📋</div>
            <div>このタイミングのテンプレートがまだ割り当てられていません。</div>
            <div style={{ fontSize: '0.85rem', marginTop: 6, color: '#94a3b8' }}>
              管理者がテンプレートを作成・割り当てると表示されます。
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {templates.map(tpl => {
              const state   = submissionByTemplate.get(tpl.id) ?? null;
              const tplItems = items.filter(i => i.template_id === tpl.id);
              const color    = statusColor(state);
              const label    = statusLabel(state);

              return (
                <div
                  key={tpl.id}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: `2px solid ${color}`,
                    overflow: 'hidden',
                  }}
                >
                  {/* ヘッダー */}
                  <div style={{
                    padding: '12px 16px',
                    background: color + '18',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>{tpl.name}</span>
                      <span style={{ marginLeft: 10, fontSize: '0.8rem', color: '#475569' }}>
                        v{tpl.version}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '0.8rem', fontWeight: 700, color,
                      padding: '3px 10px', borderRadius: 20,
                      background: color + '22', border: `1px solid ${color}`,
                    }}>
                      {label}
                    </span>
                  </div>

                  {/* 直近提出時刻 */}
                  {state && (
                    <div style={{ padding: '6px 16px', fontSize: '0.8rem', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                      最終提出: {new Date(state.submitted_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      {state.has_deviation && (
                        <span style={{ marginLeft: 10, color: '#f59e0b', fontWeight: 600 }}>⚠ 逸脱あり</span>
                      )}
                    </div>
                  )}

                  {/* チェックフォーム（何度でも提出可能）*/}
                  <div style={{ padding: '12px 16px' }}>
                    {tplItems.length === 0 ? (
                      <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>項目がありません</div>
                    ) : (
                      <CheckForm
                        template={tpl}
                        items={tplItems}
                        timing={activeTab}
                        storeId={selectedStore.id}
                        membershipId={membershipId}
                        onSubmitted={load}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
