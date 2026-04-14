/**
 * S01 LINE 初回連携画面
 * 連携コード入力 → API → 成功ならホームへ遷移
 */
import { useState } from 'react';
import { api } from '../../api/client';
import { Alert } from '../../components/atoms/Alert';

// 旧 .attendance-link-* の代替
const LINK_PAGE =
  'flex min-h-[60vh] items-center justify-center p-4';
const LINK_CARD =
  'w-full max-w-[400px] rounded-xl bg-surface p-8 text-center shadow-[0_2px_8px_rgba(0,0,0,0.08)]';
const LINK_TITLE = 'mb-2 text-[20px]';
const LINK_DESC = 'mb-5 text-sm text-[#6b7280]';
const LINK_PROFILE = 'mb-4 flex items-center justify-center gap-2';
const LINK_AVATAR = 'h-10 w-10 rounded-full';
const LINK_FORM = 'text-left';
const LINK_INPUT_EXTRA = 'text-center text-[24px] tracking-[0.3em]';
const LINK_BTN = 'mt-3 w-full';
const LINK_HELP = 'mt-4 text-xs text-text-subtle';

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
    if (!lineUserId) {
      setError('LINEユーザー情報を取得できませんでした。LINEログインからやり直してください。');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.lineLinkWithCode(code.trim(), lineUserId, displayName, pictureUrl);
      onLinked();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string }; message?: string };
      const msg = e.body?.error || e.message || 'エラーが発生しました';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={LINK_PAGE}>
      <div className={LINK_CARD}>
        <h2 className={LINK_TITLE}>LINE連携</h2>
        <p className={LINK_DESC}>
          連携コードを入力すると、LINEから打刻できるようになります。
        </p>

        {displayName && (
          <div className={LINK_PROFILE}>
            {pictureUrl && <img src={pictureUrl} alt="" className={LINK_AVATAR} />}
            <span>{displayName}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={LINK_FORM}>
          <label className="mb-0.5 block text-[0.8rem] text-[#666]" htmlFor="link-code">連携コード</label>
          <input
            id="link-code"
            data-testid="link-code-input"
            className={`box-border w-full rounded-md border border-border px-3 py-2 text-[0.9rem] font-sans ${LINK_INPUT_EXTRA}`}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6桁の数字"
            value={code}
            onChange={e => setCode(e.target.value)}
            autoFocus
          />

          {error && <Alert variant="error" data-testid="link-error">{error}</Alert>}

          <button
            type="submit"
            className={`button button-primary ${LINK_BTN}`}
            disabled={loading || code.trim().length < 6 || !lineUserId}
            data-testid="link-submit-button"
          >
            {loading ? '連携中...' : '連携する'}
          </button>
        </form>

        <p className={LINK_HELP}>
          連携コードがない場合は、管理者にお問い合わせください。
        </p>
      </div>
    </div>
  );
}
