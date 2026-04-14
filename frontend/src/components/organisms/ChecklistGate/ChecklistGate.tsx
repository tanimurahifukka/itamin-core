/**
 * チェックリストゲート v2
 * 打刻前に全項目チェックを強制するモーダル
 * インターフェース: { storeId, staffId, timing, onComplete, onCancel } を維持
 * staffId = store_staff.id（= membership_id）
 */
import { useEffect, useRef, useState } from 'react';
import { checkApi, ActiveItem, SubmissionItemInput, CheckTiming } from '../../../api/checkApi';
import { Modal } from '../../molecules/Modal';
import { Button } from '../../atoms/Button';
import { cn } from '../../../lib/cn';

// 共通スタイル: 項目カード / チェックボックス / テキスト入力
// 視覚アイデンティティ（緑=完了）は変えない。
const ITEM_BASE =
  'flex items-center gap-3.5 rounded-[10px] border-2 px-4 py-3.5 transition-colors select-none';
const ITEM_DEFAULT = 'border-[#e8e8e8] hover:border-[#ccc]';
const ITEM_DONE = 'border-[#34a853] bg-[#f0faf3]';
const ITEM_TEXT_LAYOUT = 'items-start py-3 cursor-default';
const CHECKBOX_BASE =
  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border-2 text-base font-bold text-white transition-colors';
const CHECKBOX_DEFAULT = 'border-[#ccc]';
const CHECKBOX_DONE = 'border-[#34a853] bg-[#34a853]';
const TEXT_INPUT =
  'w-full rounded-md border border-border px-3 py-2 text-sm font-sans transition-colors focus:border-primary focus:outline-none';

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
      <Modal open onClose={onCancel} closeOnBackdrop={false} contentClassName="max-h-[90vh] overflow-y-auto p-7">
        <p>読み込み中...</p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onCancel}
      closeOnBackdrop={false}
      contentClassName="max-w-[480px] max-h-[90vh] overflow-y-auto p-7"
      actions={
        <>
          <Button variant="secondary" className="flex-1 rounded-[10px] py-3.5 text-base" onClick={onCancel}>
            キャンセル
          </Button>
          <Button
            className={cn(
              'flex-[2] rounded-[10px] py-3.5 text-base font-semibold',
              allComplete
                ? 'bg-[#34a853] text-white hover:bg-[#2d9249]'
                : 'bg-[#e0e0e0] text-[#999] cursor-not-allowed',
            )}
            onClick={handleSubmit}
            disabled={!allComplete || submitting}
          >
            {submitting ? '記録中...' : allComplete ? '確認完了' : 'すべてチェックしてください'}
          </Button>
        </>
      }
    >
      <div className="mb-6 text-center">
        <h2 className="mb-1.5 text-[1.4rem] text-[#1a1a2e]">{title}</h2>
        <p className="text-[0.85rem] text-[#888]">{subtitle}</p>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="mb-5 flex flex-col gap-2">
        {items.map(item => {
          const v = values[item.id] ?? emptyValues();
          const done = isItemComplete(item, v);
          const hint = getThintText(item);

          if (item.item_type === 'numeric') {
            return (
              <div
                key={item.id}
                className={cn(ITEM_BASE, ITEM_TEXT_LAYOUT, done ? ITEM_DONE : ITEM_DEFAULT)}
              >
                <div className={cn(CHECKBOX_BASE, done ? CHECKBOX_DONE : CHECKBOX_DEFAULT)}>
                  {done && '✓'}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[0.9rem] font-medium text-text">
                    {item.label}
                    {item.is_ccp && <span className="ml-1.5 text-xs font-bold text-[#dc2626]">CCP</span>}
                  </span>
                  {hint && <span className="block mb-1 text-[0.78rem] text-[#64748b]">{hint}</span>}
                  <input
                    type="number"
                    className={TEXT_INPUT}
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
              <div
                key={item.id}
                className={cn(ITEM_BASE, ITEM_TEXT_LAYOUT, done ? ITEM_DONE : ITEM_DEFAULT)}
              >
                <div className={cn(CHECKBOX_BASE, done ? CHECKBOX_DONE : CHECKBOX_DEFAULT)}>
                  {done && '✓'}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[0.9rem] font-medium text-text">{item.label}</span>
                  <input
                    type="text"
                    className={TEXT_INPUT}
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
              <div
                key={item.id}
                className={cn(ITEM_BASE, ITEM_TEXT_LAYOUT, done ? ITEM_DONE : ITEM_DEFAULT)}
              >
                <div className={cn(CHECKBOX_BASE, done ? CHECKBOX_DONE : CHECKBOX_DEFAULT)}>
                  {done && '✓'}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[0.9rem] font-medium text-text">{item.label}</span>
                  <select
                    className={TEXT_INPUT}
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
              className={cn(ITEM_BASE, done ? ITEM_DONE : ITEM_DEFAULT, 'cursor-pointer')}
              onClick={() => updateValue(item.id, { bool_value: !v.bool_value })}
            >
              <div className={cn(CHECKBOX_BASE, done ? CHECKBOX_DONE : CHECKBOX_DEFAULT)}>
                {done && '✓'}
              </div>
              <span>
                {item.label}
                {item.is_ccp && <span className="ml-1.5 text-xs font-bold text-[#dc2626]">CCP</span>}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mb-5 text-center text-[0.9rem] text-[#888]">
        {completedCount} / {items.length} 完了
      </div>
    </Modal>
  );
}
