/**
 * S01 LINE 初回連携画面
 * 連携コード入力 → API → 成功ならホームへ遷移
 */
import { useState } from 'react';
import { api } from '../../api/client';

interface Props {
  lineUserId: string;
  displayName?: string;
  pictureUrl?: string;
  onLinked: () => void;
}

export default function LineLinkPage({ lineUserId, displayName, pictureUrl, onLinked }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      await api.lineLinkWithCode(code.trim(), lineUserId, displayName, pictureUrl);
      onLinked();
    } catch (err: any) {
      const msg = err.body?.error || err.message || 'エラーが発生しました';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="attendance-link-page">
      <div className="attendance-link-card">
        <h2 className="attendance-link-title">LINE連携</h2>
        <p className="attendance-link-desc">
          連携コードを入力すると、LINEから打刻できるようになります。
        </p>

        {displayName && (
          <div className="attendance-link-profile">
            {pictureUrl && <img src={pictureUrl} alt="" className="attendance-link-avatar" />}
            <span>{displayName}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="attendance-link-form">
          <label className="form-label" htmlFor="link-code">連携コード</label>
          <input
            id="link-code"
            data-testid="link-code-input"
            className="form-input attendance-link-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6桁の数字"
            value={code}
            onChange={e => setCode(e.target.value)}
            autoFocus
          />

          {error && <div className="alert alert-error" data-testid="link-error">{error}</div>}

          <button
            type="submit"
            className="button button-primary attendance-link-btn"
            disabled={loading || code.trim().length < 6}
            data-testid="link-submit-button"
          >
            {loading ? '連携中...' : '連携する'}
          </button>
        </form>

        <p className="attendance-link-help">
          連携コードがない場合は、管理者にお問い合わせください。
        </p>
      </div>
    </div>
  );
}
