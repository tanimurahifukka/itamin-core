import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * 打刻ルート選択式のヒントバナー。
 * punch プラグインの settingsSchema (enable_line_punch / enable_nfc_punch)
 * が ON の店舗では、本体の Web 打刻 UI の上に案内カードを出して
 * LINE / NFC 経路からも打刻できることを知らせる。
 *
 * NFC カードは管理者向けに URL + QR を表示する (スタッフは物理タグから開く)。
 */
interface Props {
  storeId: string;
  isManager: boolean;
}

interface PunchRouteConfig {
  enable_line_punch?: boolean;
  enable_nfc_punch?: boolean;
}

export default function PunchRouteHint({ storeId, isManager }: Props) {
  const [cfg, setCfg] = useState<PunchRouteConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getPluginSettings(storeId)
      .then((data) => {
        if (cancelled) return;
        const punch = data.plugins.find((p) => p.name === 'punch');
        setCfg((punch?.config as PunchRouteConfig) || {});
      })
      .catch(() => {
        if (!cancelled) setCfg({});
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  if (!cfg) return null;

  const lineOn = cfg.enable_line_punch === true;
  const nfcOn = cfg.enable_nfc_punch === true;
  if (!lineOn && !nfcOn) return null;

  const nfcUrl = `${window.location.origin}/nfc/punch?store=${storeId}`;

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>この店舗では他の打刻方法も使えます</div>
      <div style={styles.cardRow}>
        {lineOn && (
          <div style={styles.card}>
            <div style={styles.cardIcon}>📱</div>
            <div style={styles.cardLabel}>LINE 打刻</div>
            <div style={styles.cardDesc}>LINE のリッチメニューから打刻できます</div>
          </div>
        )}
        {nfcOn && (
          <div style={styles.card}>
            <div style={styles.cardIcon}>🏷️</div>
            <div style={styles.cardLabel}>NFC+PIN 打刻</div>
            <div style={styles.cardDesc}>店舗入口の NFC タグにスマホをかざし、4桁 PIN で打刻</div>
            {isManager && (
              <div style={styles.adminBox}>
                <div style={styles.adminLabel}>管理者向け: NFC タグに書き込む URL</div>
                <code style={styles.urlCode}>{nfcUrl}</code>
                <div style={{ marginTop: 10 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(nfcUrl)}`}
                    alt="NFC 打刻 URL QR"
                    style={{ width: 160, height: 160, background: '#fff', borderRadius: 8 }}
                  />
                </div>
                <button
                  style={styles.copyBtn}
                  onClick={() => {
                    navigator.clipboard.writeText(nfcUrl);
                  }}
                >
                  URL をコピー
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    margin: '12px auto 20px',
    maxWidth: 720,
    padding: '16px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: '#475569',
    marginBottom: 12,
    textAlign: 'center',
  },
  cardRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  card: {
    flex: '1 1 240px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '14px 16px',
    textAlign: 'center',
  },
  cardIcon: { fontSize: 32, marginBottom: 4 },
  cardLabel: { fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#64748b', lineHeight: 1.5 },
  adminBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px dashed #cbd5e1',
  },
  adminLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: 600,
    marginBottom: 6,
  },
  urlCode: {
    display: 'block',
    padding: '6px 8px',
    background: '#f1f5f9',
    borderRadius: 6,
    fontSize: 11,
    color: '#0f172a',
    wordBreak: 'break-all',
  },
  copyBtn: {
    marginTop: 10,
    padding: '6px 14px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
