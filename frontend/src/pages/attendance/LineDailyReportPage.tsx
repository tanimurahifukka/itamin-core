/**
 * LINE日報ページ（Supabase Auth不要）
 * 本日の日報を閲覧・保存する。
 */
import { useState, useEffect, useCallback } from 'react';

interface Props {
  lineUserId: string;
  storeId: string;
  displayName?: string;
  pictureUrl?: string;
}

const WEATHER_OPTIONS = ['晴れ', '曇り', '雨', '雪', 'その他'];

async function lineStaffApi(path: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/line-staff${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, body: data, message: data.error || data.message };
  return data;
}

export default function LineDailyReportPage({ lineUserId, storeId }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [sales, setSales] = useState('');
  const [customerCount, setCustomerCount] = useState('');
  const [weather, setWeather] = useState('');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [error, setError] = useState('');
  const [existingId, setExistingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await lineStaffApi('/daily-report', { lineUserId, storeId, date });
      if (res.report) {
        setSales(String(res.report.sales || ''));
        setCustomerCount(String(res.report.customerCount || ''));
        setWeather(res.report.weather || '');
        setMemo(res.report.memo || '');
        setExistingId(res.report.id);
      } else {
        setSales('');
        setCustomerCount('');
        setWeather('');
        setMemo('');
        setExistingId(null);
      }
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setError(err.body?.error || err.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [lineUserId, storeId, date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await lineStaffApi('/daily-report/save', {
        lineUserId, storeId,
        date,
        sales: Number(sales) || 0,
        customerCount: Number(customerCount) || 0,
        weather,
        memo,
      });
      setToast({ msg: '保存しました', type: 'success' });
      if (res.report) setExistingId(res.report.id);
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setToast({ msg: err.body?.error || err.message || 'エラー', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="attendance-home" data-testid="line-daily-report-page">
      {toast && (
        <div className={`attendance-toast ${toast.type}`} data-testid="daily-report-toast">
          {toast.msg}
        </div>
      )}

      <h2 style={{ textAlign: 'center', marginBottom: 16 }}>日報</h2>

      {/* 日付選択 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>日付</label>
        <input
          type="date"
          className="form-input"
          value={date}
          onChange={e => setDate(e.target.value)}
          data-testid="daily-report-date-input"
        />
      </div>

      {loading ? (
        <div className="loading">読み込み中...</div>
      ) : error ? (
        <p style={{ color: '#ef4444' }}>{error}</p>
      ) : (
        <>
          {existingId && (
            <div style={{
              padding: 6, marginBottom: 12, backgroundColor: '#f0fdf4',
              borderRadius: 6, textAlign: 'center', fontSize: 12, color: '#166534',
            }}>
              登録済み（上書き保存可能）
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>売上（円）</label>
            <input
              type="number"
              className="form-input"
              value={sales}
              onChange={e => setSales(e.target.value)}
              placeholder="0"
              data-testid="daily-report-sales-input"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>来客数</label>
            <input
              type="number"
              className="form-input"
              value={customerCount}
              onChange={e => setCustomerCount(e.target.value)}
              placeholder="0"
              data-testid="daily-report-customer-count-input"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>天気</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {WEATHER_OPTIONS.map(w => (
                <button
                  key={w}
                  className={`button ${weather === w ? 'button-primary' : ''}`}
                  onClick={() => setWeather(weather === w ? '' : w)}
                  data-testid={`daily-report-weather-${w}`}
                  style={{ fontSize: 13, padding: '4px 12px' }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>メモ</label>
            <textarea
              className="form-input"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={4}
              placeholder="特記事項など"
              data-testid="daily-report-memo-input"
              style={{ resize: 'vertical' }}
            />
          </div>

          <button
            className="button button-primary"
            onClick={handleSave}
            disabled={saving}
            data-testid="daily-report-save-button"
            style={{ width: '100%' }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </>
      )}
    </div>
  );
}
