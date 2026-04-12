import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';

interface NfcLocation {
  id: string;
  slug: string;
  name: string;
  templateId: string | null;
  templateName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  timing: string;
}

export default function NfcLocationsPage() {
  const { selectedStore } = useAuth();
  const [locations, setLocations] = useState<NfcLocation[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // 新規作成
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newTemplateId, setNewTemplateId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  // QR 表示中
  const [qrTarget, setQrTarget] = useState<NfcLocation | null>(null);

  const load = useCallback(async () => {
    if (!selectedStore) return;
    setLoading(true);
    try {
      const [locRes, tplRes] = await Promise.all([
        api.listNfcLocations(selectedStore.id),
        api.listChecklistTemplatesForStore(selectedStore.id),
      ]);
      setLocations(locRes.locations);
      setTemplates(tplRes.templates);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '読み込みに失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedStore]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!selectedStore || creating) return;
    if (!newName.trim()) { showToast('名前を入力してください', 'error'); return; }
    if (!newSlug.trim()) { showToast('slug を入力してください', 'error'); return; }
    setCreating(true);
    try {
      await api.createNfcLocation(selectedStore.id, {
        name: newName.trim(),
        slug: newSlug.trim(),
        templateId: newTemplateId || null,
      });
      showToast('NFC 場所を作成しました', 'success');
      setNewName('');
      setNewSlug('');
      setNewTemplateId('');
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '作成に失敗しました', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (loc: NfcLocation) => {
    if (!selectedStore) return;
    try {
      await api.updateNfcLocation(selectedStore.id, loc.id, { active: !loc.active });
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '更新に失敗しました', 'error');
    }
  };

  const handleDelete = async (loc: NfcLocation) => {
    if (!selectedStore) return;
    if (!confirm(`「${loc.name}」を削除します。よろしいですか？`)) return;
    try {
      await api.deleteNfcLocation(selectedStore.id, loc.id);
      showToast('削除しました', 'success');
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '削除に失敗しました', 'error');
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      showToast('URL をコピーしました', 'info');
    });
  };

  if (!selectedStore) {
    return <div style={{ padding: 24 }}>店舗を選択してください</div>;
  }

  return (
    <div style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 8 }}>🧹 NFC チェックポイント</h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 20 }}>
        トイレなどの物理的なチェック場所ごとに NFC タグを作成できます。
        表示されている URL を NFC タグに書き込むと、スタッフがスマホをかざして
        PIN + チェック入力 → HACCP 帳票に自動反映されます。
      </p>

      {/* 新規作成 */}
      <div
        style={{
          padding: 16,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          marginBottom: 24,
        }}
      >
        <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>新しい場所を追加</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: 4 }}>
              名前 (例: トイレ1)
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
              placeholder="トイレ1"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: 4 }}>
              slug (URL 用識別子、半角英数とハイフン)
            </label>
            <input
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box' }}
              placeholder="toilet-1"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: 4 }}>
              チェックリストテンプレート
            </label>
            <select
              value={newTemplateId}
              onChange={(e) => setNewTemplateId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, boxSizing: 'border-box', background: '#fff' }}
            >
              <option value="">(未設定)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
              テンプレートはチェックリスト管理画面から作成できます。トイレチェック用テンプレートも seed 済みです。
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              padding: '10px 16px',
              background: creating ? '#94a3b8' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: creating ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {creating ? '作成中...' : '場所を追加'}
          </button>
        </div>
      </div>

      {/* 一覧 */}
      <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>登録済みの場所</h3>
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>読み込み中...</div>
      ) : locations.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            color: '#64748b',
            background: '#fff',
            border: '1px dashed #cbd5e1',
            borderRadius: 10,
          }}
        >
          まだ場所が登録されていません
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {locations.map((loc) => (
            <div
              key={loc.id}
              style={{
                padding: 14,
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                opacity: loc.active ? 1 : 0.55,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>
                    📍 {loc.name}
                    {!loc.active && (
                      <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>
                        (無効)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                    slug: <code>{loc.slug}</code>
                    {loc.templateName && <span> · {loc.templateName}</span>}
                  </div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: '#475569',
                      marginTop: 6,
                      padding: '6px 8px',
                      background: '#f8fafc',
                      borderRadius: 6,
                      wordBreak: 'break-all',
                    }}
                  >
                    {loc.url}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleCopyUrl(loc.url)}
                  style={actionBtn}
                >
                  📋 URL をコピー
                </button>
                <button
                  onClick={() => setQrTarget(loc)}
                  style={actionBtn}
                >
                  📱 QR 表示
                </button>
                <button
                  onClick={() => handleToggleActive(loc)}
                  style={actionBtn}
                >
                  {loc.active ? '⏸ 無効化' : '▶ 有効化'}
                </button>
                <button
                  onClick={() => handleDelete(loc)}
                  style={{ ...actionBtn, color: '#dc2626' }}
                >
                  🗑 削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QR 表示モーダル */}
      {qrTarget && (
        <div
          onClick={() => setQrTarget(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, padding: 20,
              maxWidth: 360, width: '100%', textAlign: 'center',
            }}
          >
            <h3 style={{ marginBottom: 12 }}>📱 {qrTarget.name}</h3>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrTarget.url)}`}
              alt="QR code"
              style={{ width: 280, height: 280, maxWidth: '100%' }}
            />
            <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 12, wordBreak: 'break-all' }}>
              {qrTarget.url}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 8 }}>
              NFC Tools などのアプリでこの URL を NFC タグに書き込んでください。
            </p>
            <button
              onClick={() => setQrTarget(null)}
              style={{
                marginTop: 14,
                padding: '10px 20px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  padding: '6px 10px',
  background: '#fff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.82rem',
  color: '#0f172a',
};
