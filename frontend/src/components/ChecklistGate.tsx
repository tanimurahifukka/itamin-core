/**
 * チェックリストゲート v2
 * 打刻前に全項目チェックを強制するモーダル
 * インターフェース: { storeId, staffId, timing, onComplete, onCancel } を維持
 * staffId = store_staff.id（= membership_id）
 */
import { useEffect, useRef, useState } from 'react';
import { checkApi, ActiveItem, SubmissionItemInput, CheckTiming } from '../api/checkApi';

interface Props {
  storeId: string;
  staffId: string;
  timing: 'clock_in' | 'clock_out';
  onComplete: () => void;
  onCancel: () => void;
}

type ItemValues = {
  bool_value: boolean | null;
  numeric_value: string;  // string で入力、送信時に変換
  text_value: string;
  select_value: string;
};

function emptyValues(): ItemValues {
  return { bool_value: null, numeric_value: '', text_value: '', select_value: '' };
}

function isItemComplete(item: ActiveItem, values: ItemValues): boolean {
  if (!item.required) return true;
  switch (item.item_type) {
    case 'checkbox':
      return values.bool_value === true;
    case 'numeric': {
      const v = parseFloat(values.numeric_value);
      return !isNaN(v);
    }
    case 'text':
      return values.text_value.trim().length > 0;
    case 'select':
      return values.select_value.trim().length > 0;
    case 'photo':
      return true; // photo は always passing（ゲートでは簡略化）
    default:
      return true;
  }
}

function getThintText(item: ActiveItem): string {
  if (item.item_type !== 'numeric') return '';
  const parts: string[] = [];
  if (item.unit) parts.push(item.unit);
  if (item.min_value != null && item.max_value != null) {
    parts.push(`${item.min_value} ～ ${item.max_value}`);
  } else if (item.min_value != null) {
    parts.push(`${item.min_value} 以上`);
  } else if (item.max_value != null) {
    parts.push(`${item.max_value} 以下`);
  }
  return parts.length ? parts.join(' | ') : '';
}

export default function ChecklistGate({ storeId, staffId, timing, onComplete, onCancel }: Props) {
  const [items, setItems]         = useState<ActiveItem[]>([]);
  const [values, setValues]       = useState<Record<string, ItemValues>>({});
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  // ref 化: 親が毎秒 re-render してもコールバック参照変更で useEffect が再実行されないようにする
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    checkApi.getActive(storeId, 'personal', timing as CheckTiming)
      .then(data => {
        if (!data.merged_items || data.merged_items.length === 0) {
          onCompleteRef.current();
          return;
        }
        setItems(data.merged_items);
        setTemplateIds([...new Set(data.merged_items.map(i => i.template_id))]);
        const initial: Record<string, ItemValues> = {};
        data.merged_items.forEach(item => { initial[item.id] = emptyValues(); });
        setValues(initial);
        setLoading(false);
      })
      .catch(e => {
        // エラー時でも打刻フローを止めない
        console.warn('[ChecklistGate] fetch error, skipping gate:', e.message);
        onCompleteRef.current();
      });
  }, [storeId, timing]);

  const allComplete = items.length > 0 && items.every(item => isItemComplete(item, values[item.id] ?? emptyValues()));

  const updateValue = (itemId: string, patch: Partial<ItemValues>) => {
    setValues(prev => ({ ...prev, [itemId]: { ...(prev[itemId] ?? emptyValues()), ...patch } }));
  };

  const handleSubmit = async () => {
    if (!allComplete || submitting) return;
    setSubmitting(true);

    try {
      // テンプレートごとに submission を作成
      for (const tplId of templateIds) {
        const tplItems = items.filter(i => i.template_id === tplId);
        const subItems: SubmissionItemInput[] = tplItems.map(item => {
          const v = values[item.id] ?? emptyValues();
          return {
            template_item_id: item.id,
            item_key: item.item_key,
            bool_value: item.item_type === 'checkbox' ? (v.bool_value ?? false) : null,
            numeric_value: item.item_type === 'numeric' && v.numeric_value ? parseFloat(v.numeric_value) : null,
            text_value: item.item_type === 'text' ? v.text_value : null,
            select_value: item.item_type === 'select' ? v.select_value : null,
          };
        });

        await checkApi.createSubmission(storeId, {
          scope: 'personal',
          timing: timing as CheckTiming,
          template_id: tplId,
          membership_id: staffId,
          items: subItems,
        });
      }
      onComplete();
    } catch (e: unknown) {
      // 提出エラー時もゲートを通過させる（打刻フローを壊さない）
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[ChecklistGate] submission error (proceeding):', msg);
      setError(`記録に失敗しました: ${msg}`);
      // 3 秒後に通過
      setTimeout(() => onComplete(), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const completedCount = items.filter(item => isItemComplete(item, values[item.id] ?? emptyValues())).length;
  const title    = timing === 'clock_in' ? '出勤前チェック' : '退勤前チェック';
  const subtitle = timing === 'clock_in' ? '全項目を確認してください' : '退勤前の確認事項';

  if (loading) {
    return (
      <div className="checklist-overlay">
        <div className="checklist-modal">
          <p>読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="checklist-overlay">
      <div className="checklist-modal">
        <div className="checklist-header">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="checklist-items">
          {items.map(item => {
            const v = values[item.id] ?? emptyValues();
            const done = isItemComplete(item, v);
            const hint = getThintText(item);

            if (item.item_type === 'numeric') {
              return (
                <div key={item.id} className={`checklist-item text-input ${done ? 'checked' : ''}`}>
                  <div className={`checkbox ${done ? 'checked' : ''}`}>{done && '✓'}</div>
                  <div className="checklist-text-field">
                    <span className="checklist-text-label">
                      {item.label}
                      {item.is_ccp && <span style={{ color: '#dc2626', marginLeft: 6, fontSize: '0.75rem', fontWeight: 700 }}>CCP</span>}
                    </span>
                    {hint && <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: 4 }}>{hint}</span>}
                    <input
                      type="number"
                      className="checklist-text-input"
                      placeholder="数値を入力"
                      value={v.numeric_value}
                      onChange={e => updateValue(item.id, { numeric_value: e.target.value })}
                      onClick={e => e.stopPropagation()}
                      step="0.1"
                    />
                  </div>
                </div>
              );
            }

            if (item.item_type === 'text') {
              return (
                <div key={item.id} className={`checklist-item text-input ${done ? 'checked' : ''}`}>
                  <div className={`checkbox ${done ? 'checked' : ''}`}>{done && '✓'}</div>
                  <div className="checklist-text-field">
                    <span className="checklist-text-label">{item.label}</span>
                    <input
                      type="text"
                      className="checklist-text-input"
                      placeholder="入力してください"
                      value={v.text_value}
                      onChange={e => updateValue(item.id, { text_value: e.target.value })}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                </div>
              );
            }

            if (item.item_type === 'select') {
              const opts: string[] = Array.isArray(item.options?.values) ? item.options.values as string[] : [];
              return (
                <div key={item.id} className={`checklist-item text-input ${done ? 'checked' : ''}`}>
                  <div className={`checkbox ${done ? 'checked' : ''}`}>{done && '✓'}</div>
                  <div className="checklist-text-field">
                    <span className="checklist-text-label">{item.label}</span>
                    <select
                      className="checklist-text-input"
                      value={v.select_value}
                      onChange={e => updateValue(item.id, { select_value: e.target.value })}
                      onClick={e => e.stopPropagation()}
                    >
                      <option value="">選択してください</option>
                      {opts.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                </div>
              );
            }

            // checkbox（デフォルト）
            return (
              <label
                key={item.id}
                className={`checklist-item ${done ? 'checked' : ''}`}
                onClick={() => updateValue(item.id, { bool_value: !v.bool_value })}
              >
                <div className={`checkbox ${done ? 'checked' : ''}`}>{done && '✓'}</div>
                <span>
                  {item.label}
                  {item.is_ccp && <span style={{ color: '#dc2626', marginLeft: 6, fontSize: '0.75rem', fontWeight: 700 }}>CCP</span>}
                </span>
              </label>
            );
          })}
        </div>

        <div className="checklist-progress">
          {completedCount} / {items.length} 完了
        </div>

        <div className="checklist-actions">
          <button className="checklist-cancel" onClick={onCancel}>
            キャンセル
          </button>
          <button
            className={`checklist-submit ${allComplete ? 'active' : ''}`}
            onClick={handleSubmit}
            disabled={!allComplete || submitting}
          >
            {submitting ? '記録中...' : allComplete ? '確認完了' : 'すべてチェックしてください'}
          </button>
        </div>
      </div>
    </div>
  );
}
