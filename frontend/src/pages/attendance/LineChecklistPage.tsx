/**
 * LINEチェックリストページ（Supabase Auth不要）
 * 出勤時・退勤時のチェックリストを閲覧・提出する。
 */
import { useState, useEffect } from 'react';

interface Props {
  lineUserId: string;
  storeId: string;
  displayName?: string;
  pictureUrl?: string;
}

interface CheckItem {
  label: string;
  category?: string;
  templateId?: string;
}

async function lineStaffApi(path: string, body: Record<string, any>) {
  const res = await fetch(`/api/line-staff${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, body: data, message: data.error || data.message };
  return data;
}

export default function LineChecklistPage({ lineUserId, storeId, displayName }: Props) {
  const [timing, setTiming] = useState<'clock_in' | 'clock_out'>('clock_in');
  const [items, setItems] = useState<CheckItem[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [error, setError] = useState('');
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const load = async (t: 'clock_in' | 'clock_out') => {
    try {
      setLoading(true);
      setError('');
      const res = await lineStaffApi('/checklist', { lineUserId, storeId, timing: t });
      setItems(res.items || []);
      setAlreadySubmitted(!!res.latestRecord);

      if (res.latestRecord && Array.isArray(res.latestRecord.results)) {
        setChecked(res.latestRecord.results.map((r: any) => !!r.checked));
      } else {
        setChecked(new Array(res.items?.length || 0).fill(false));
      }
    } catch (e: any) {
      setError(e.body?.error || e.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(timing); }, [timing]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleCheck = (index: number) => {
    const next = [...checked];
    next[index] = !next[index];
    setChecked(next);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const results = items.map((item, i) => ({
        label: item.label,
        category: item.category || '',
        checked: checked[i] || false,
      }));
      await lineStaffApi('/checklist/submit', { lineUserId, storeId, timing, results });
      setToast({ msg: '提出しました', type: 'success' });
      setAlreadySubmitted(true);
    } catch (e: any) {
      setToast({ msg: e.body?.error || e.message || 'エラー', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const allChecked = checked.length > 0 && checked.every(Boolean);

  return (
    <div className="attendance-home" data-testid="line-checklist-page">
      {toast && (
        <div className={`attendance-toast ${toast.type}`} data-testid="checklist-toast">
          {toast.msg}
        </div>
      )}

      <h2 style={{ textAlign: 'center', marginBottom: 16 }}>チェックリスト</h2>

      {/* タイミング切り替え */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`button ${timing === 'clock_in' ? 'button-primary' : ''}`}
          onClick={() => setTiming('clock_in')}
          data-testid="checklist-timing-clock-in"
          style={{ flex: 1 }}
        >
          出勤時
        </button>
        <button
          className={`button ${timing === 'clock_out' ? 'button-primary' : ''}`}
          onClick={() => setTiming('clock_out')}
          data-testid="checklist-timing-clock-out"
          style={{ flex: 1 }}
        >
          退勤時
        </button>
      </div>

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : error ? (
        <p style={{ color: '#ef4444' }}>{error}</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center' }}>チェック項目がありません</p>
      ) : (
        <>
          {alreadySubmitted && (
            <div style={{
              padding: 8, marginBottom: 12, backgroundColor: '#f0fdf4',
              borderRadius: 6, textAlign: 'center', fontSize: 13, color: '#166534',
            }}>
              本日提出済み（再提出可能）
            </div>
          )}

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((item, i) => (
              <li
                key={i}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                }}
                onClick={() => toggleCheck(i)}
              >
                <input
                  type="checkbox"
                  checked={checked[i] || false}
                  onChange={() => toggleCheck(i)}
                  data-testid={`checklist-item-${i}`}
                  style={{ width: 20, height: 20, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 14 }}>{item.label}</div>
                  {item.category && (
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.category}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <button
            className="button button-primary"
            onClick={handleSubmit}
            disabled={submitting}
            data-testid="checklist-submit-button"
            style={{ marginTop: 16, width: '100%' }}
          >
            {submitting ? '提出中...' : allChecked ? '全チェック完了 - 提出' : '提出（未チェック項目あり）'}
          </button>
        </>
      )}
    </div>
  );
}
