import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { showToast } from '../components/molecules/Toast';

export default function KioskLinkPage() {
  const { selectedStore } = useAuth();
  const [copied, setCopied] = useState(false);

  const kioskUrl = selectedStore
    ? `${window.location.origin}/kiosk?store=${selectedStore.id}`
    : '';

  const handleCopy = async () => {
    if (!kioskUrl) return;
    try {
      await navigator.clipboard.writeText(kioskUrl);
      setCopied(true);
      showToast('キオスクURLをコピーしました', 'info');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('コピーに失敗しました', 'error');
    }
  };

  const handleOpen = () => {
    if (!kioskUrl) return;
    window.open(kioskUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-full min-w-0 max-w-[960px] flex-1 px-8 py-7 max-md:px-3.5 max-md:py-4">
      <h3 style={{ marginBottom: 8 }}>キオスクモード</h3>
      <p style={{ color: '#888', marginBottom: 24, fontSize: '0.85rem' }}>
        店舗共用端末（レジ横のタブレット等）で開くと、スタッフが自分で打刻・シフト確認できます。
      </p>

      <div style={cardStyle}>
        <div style={iconAreaStyle}>🖥️</div>
        <h4 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>店舗キオスク端末</h4>
        <p style={{ color: '#666', fontSize: '0.88rem', margin: '0 0 24px', lineHeight: 1.6 }}>
          PINを入力するだけで使える共用ログイン画面です。<br />
          スタッフが来たら自分の名前をタップして出勤・退勤できます。
        </p>

        <div style={urlBoxStyle}>
          <code style={urlTextStyle}>{kioskUrl}</code>
        </div>

        <div style={buttonRowStyle}>
          <button
            onClick={handleOpen}
            style={primaryBtnStyle}
            disabled={!kioskUrl}
            data-testid="kiosk-open-button"
          >
            🖥️ キオスク画面を開く
          </button>
          <button
            onClick={handleCopy}
            style={secondaryBtnStyle}
            disabled={!kioskUrl}
            data-testid="kiosk-copy-url-button"
          >
            {copied ? '✓ コピー済み' : 'URLをコピー'}
          </button>
        </div>
      </div>

      <div style={noteCardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem' }}>使い方</div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem', color: '#555', lineHeight: 2 }}>
          <li>設定ページ → キオスクモード でPINを設定する</li>
          <li>上のURLを店舗タブレットでブックマーク登録する</li>
          <li>タブレットでURLを開き、PINを入力してログイン</li>
          <li>スタッフが来たら自分の名前をタップして打刻</li>
        </ol>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d4d9df',
  borderRadius: 12,
  padding: '32px 24px',
  textAlign: 'center',
  marginBottom: 16,
};

const iconAreaStyle: React.CSSProperties = {
  fontSize: 48,
  marginBottom: 16,
};

const urlBoxStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 20,
  textAlign: 'left',
  overflowX: 'auto',
};

const urlTextStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  color: '#0f172a',
  wordBreak: 'break-all',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'center',
  flexWrap: 'wrap',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '12px 24px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '12px 24px',
  background: '#fff',
  color: '#334155',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  fontSize: '0.95rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const noteCardStyle: React.CSSProperties = {
  background: '#f0f9ff',
  border: '1px solid #bae6fd',
  borderRadius: 8,
  padding: '16px 20px',
};
