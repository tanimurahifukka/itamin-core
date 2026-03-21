/**
 * チェックリストゲート
 * 打刻前に全項目チェックを強制するモーダル
 */
import { useEffect, useState } from 'react';
import { checkApi, CheckItem, CheckResult } from '../api/checkApi';

interface Props {
  storeId: string;
  staffId: string;
  timing: 'clock_in' | 'clock_out';
  onComplete: () => void;
  onCancel: () => void;
}

export default function ChecklistGate({ storeId, staffId, timing, onComplete, onCancel }: Props) {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkApi.getChecklist(storeId, timing)
      .then(data => {
        setItems(data.checklist.items);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [storeId, timing]);

  const toggle = (itemId: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const allChecked = items.length > 0 && items.every(item => !item.required || checked.has(item.id));

  const handleSubmit = async () => {
    if (!allChecked || submitting) return;
    setSubmitting(true);

    const results: CheckResult[] = items.map(item => ({
      item_id: item.id,
      label: item.label,
      checked: checked.has(item.id),
    }));

    try {
      await checkApi.saveRecord({
        store_id: storeId,
        staff_id: staffId,
        timing,
        results,
      });
      onComplete();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const title = timing === 'clock_in' ? '出勤前チェック' : '退勤前チェック';
  const subtitle = timing === 'clock_in'
    ? 'HACCP準拠 — 全項目を確認してください'
    : 'HACCP準拠 — 退勤前の確認事項';

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
          {items.map(item => (
            <label
              key={item.id}
              className={`checklist-item ${checked.has(item.id) ? 'checked' : ''}`}
              onClick={() => toggle(item.id)}
            >
              <div className={`checkbox ${checked.has(item.id) ? 'checked' : ''}`}>
                {checked.has(item.id) && '✓'}
              </div>
              <span>{item.label}</span>
            </label>
          ))}
        </div>

        <div className="checklist-progress">
          {checked.size} / {items.length} 完了
        </div>

        <div className="checklist-actions">
          <button className="checklist-cancel" onClick={onCancel}>
            キャンセル
          </button>
          <button
            className={`checklist-submit ${allChecked ? 'active' : ''}`}
            onClick={handleSubmit}
            disabled={!allChecked || submitting}
          >
            {submitting ? '記録中...' : allChecked ? '確認完了' : 'すべてチェックしてください'}
          </button>
        </div>
      </div>
    </div>
  );
}
