/**
 * LINEシフト希望ページ（Supabase Auth不要）
 * シフトテンプレート（通し・SUNABACO等）から選択して希望を出せる。
 */
import { useState, useEffect, useCallback } from 'react';

interface Props {
  lineUserId: string;
  storeId: string;
  displayName?: string;
  pictureUrl?: string;
}

interface ShiftRequest {
  id: string;
  date: string;
  requestType: 'available' | 'unavailable' | 'preferred';
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string | null;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const TYPE_LABELS: Record<string, string> = {
  available: '出勤可',
  unavailable: '出勤不可',
  preferred: '希望',
};
const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  available: { bg: '#dcfce7', color: '#166534' },
  unavailable: { bg: '#fee2e2', color: '#991b1b' },
  preferred: { bg: '#dbeafe', color: '#1e40af' },
};

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

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_LABELS[d.getDay()]})`;
}

function formatTime(t: string) {
  // "09:30:00" → "09:30"
  return t ? t.slice(0, 5) : '';
}

export default function LineShiftRequestPage({ lineUserId, storeId }: Props) {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [error, setError] = useState('');

  // フォーム
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<string>('preferred');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formNote, setFormNote] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [reqRes, tplRes] = await Promise.all([
        lineStaffApi('/shift-requests', { lineUserId, storeId }),
        lineStaffApi('/shift-templates', { lineUserId, storeId }),
      ]);
      setRequests(reqRes.requests);
      setTemplates(tplRes.templates || []);
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setError(err.body?.error || err.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [lineUserId, storeId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId === '') {
      // カスタム
      setFormStartTime('');
      setFormEndTime('');
      return;
    }
    if (templateId === '_unavailable') {
      setFormType('unavailable');
      setFormStartTime('');
      setFormEndTime('');
      return;
    }
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      setFormType('preferred');
      setFormStartTime(formatTime(tpl.start_time));
      setFormEndTime(formatTime(tpl.end_time));
    }
  };

  const handleSave = async () => {
    if (!formDate) {
      setToast({ msg: '日付を選択してください', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await lineStaffApi('/shift-requests/save', {
        lineUserId, storeId,
        date: formDate,
        requestType: formType,
        startTime: formStartTime || null,
        endTime: formEndTime || null,
        note: formNote || null,
      });
      setToast({ msg: '保存しました', type: 'success' });
      setFormDate('');
      setFormStartTime('');
      setFormEndTime('');
      setFormNote('');
      setSelectedTemplate('');
      await load();
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setToast({ msg: err.body?.error || err.message || 'エラー', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">読み込み中...</div>;
  if (error) return <div className="attendance-home"><p style={{ color: '#ef4444' }}>{error}</p></div>;

  return (
    <div className="attendance-home" data-testid="line-shift-request-page">
      {toast && (
        <div className={`attendance-toast ${toast.type}`} data-testid="shift-request-toast">
          {toast.msg}
        </div>
      )}

      <h2 style={{ textAlign: 'center', marginBottom: 16 }}>シフト希望</h2>

      {/* 登録フォーム */}
      <div style={{ marginBottom: 20, padding: 12, backgroundColor: '#f9fafb', borderRadius: 8 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>希望を登録</h3>

        {/* 日付 */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>日付</label>
          <input
            type="date"
            className="form-input"
            value={formDate}
            onChange={e => setFormDate(e.target.value)}
            data-testid="shift-request-date-input"
          />
        </div>

        {/* テンプレートプリセット選択 */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>シフト区分</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {templates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                className={`button ${selectedTemplate === tpl.id ? 'button-primary' : ''}`}
                onClick={() => handleTemplateSelect(tpl.id)}
                data-testid={`template-${tpl.name}`}
                style={{
                  fontSize: 13,
                  padding: '8px 14px',
                  borderRadius: 20,
                  border: selectedTemplate === tpl.id ? 'none' : '1px solid #d4d9df',
                  backgroundColor: selectedTemplate === tpl.id
                    ? (tpl.color || '#2563eb')
                    : '#fff',
                  color: selectedTemplate === tpl.id ? '#fff' : '#374151',
                  minHeight: 40,
                }}
              >
                {tpl.name}
                <span style={{ fontSize: 10, display: 'block', opacity: 0.8 }}>
                  {formatTime(tpl.start_time)}〜{formatTime(tpl.end_time)}
                </span>
              </button>
            ))}
            <button
              type="button"
              className={`button ${selectedTemplate === '_unavailable' ? 'button-primary' : ''}`}
              onClick={() => handleTemplateSelect('_unavailable')}
              data-testid="template-unavailable"
              style={{
                fontSize: 13,
                padding: '8px 14px',
                borderRadius: 20,
                border: selectedTemplate === '_unavailable' ? 'none' : '1px solid #d4d9df',
                backgroundColor: selectedTemplate === '_unavailable' ? '#ef4444' : '#fff',
                color: selectedTemplate === '_unavailable' ? '#fff' : '#374151',
                minHeight: 40,
              }}
            >
              出勤不可
            </button>
            <button
              type="button"
              className={`button ${selectedTemplate === '' && formType !== 'unavailable' ? '' : ''}`}
              onClick={() => { setSelectedTemplate(''); setFormType('available'); }}
              data-testid="template-custom"
              style={{
                fontSize: 13,
                padding: '8px 14px',
                borderRadius: 20,
                border: '1px dashed #9ca3af',
                backgroundColor: '#fff',
                color: '#6b7280',
                minHeight: 40,
              }}
            >
              カスタム
            </button>
          </div>
        </div>

        {/* カスタム時間入力（テンプレート未選択 or カスタム時のみ） */}
        {formType !== 'unavailable' && selectedTemplate === '' && (
          <>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>区分</label>
              <select
                className="form-input"
                value={formType}
                onChange={e => setFormType(e.target.value)}
                data-testid="shift-request-type-select"
              >
                <option value="available">出勤可</option>
                <option value="preferred">希望</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>開始</label>
                <input
                  type="time"
                  className="form-input"
                  value={formStartTime}
                  onChange={e => setFormStartTime(e.target.value)}
                  data-testid="shift-request-start-time-input"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>終了</label>
                <input
                  type="time"
                  className="form-input"
                  value={formEndTime}
                  onChange={e => setFormEndTime(e.target.value)}
                  data-testid="shift-request-end-time-input"
                />
              </div>
            </div>
          </>
        )}

        {/* 選択中テンプレートの時間表示 */}
        {formType !== 'unavailable' && selectedTemplate !== '' && selectedTemplate !== '_unavailable' && (
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 6 }}>
            {formStartTime} 〜 {formEndTime}
          </div>
        )}

        {/* メモ */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 2 }}>メモ</label>
          <input
            type="text"
            className="form-input"
            value={formNote}
            onChange={e => setFormNote(e.target.value)}
            placeholder="任意"
            data-testid="shift-request-note-input"
          />
        </div>

        <button
          className="button button-primary"
          onClick={handleSave}
          disabled={saving}
          data-testid="shift-request-save-button"
          style={{ width: '100%' }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* 一覧 */}
      <h3 style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>登録済みの希望</h3>
      {requests.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>希望はまだ登録されていません</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {requests.map(r => {
            const tc = TYPE_COLORS[r.requestType] || { bg: '#f3f4f6', color: '#374151' };
            return (
              <li key={r.id} style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{formatDate(r.date)}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    backgroundColor: tc.bg, color: tc.color,
                  }}>{TYPE_LABELS[r.requestType] || r.requestType}</span>
                </div>
                {(r.startTime || r.endTime) && (
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {r.startTime ? formatTime(r.startTime) : '--:--'} - {r.endTime ? formatTime(r.endTime) : '--:--'}
                  </div>
                )}
                {r.note && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{r.note}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
