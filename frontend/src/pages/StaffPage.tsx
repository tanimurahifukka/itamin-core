import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/Toast';

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  full_time: '正社員',
  part_time: 'アルバイト',
};

const assignableRoles = [
  { value: 'manager', label: 'マネージャー' },
  { value: 'full_time', label: '正社員' },
  { value: 'part_time', label: 'アルバイト' },
];

export default function StaffPage() {
  const { selectedStore } = useAuth();
  const [staffList, setStaffList] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('part_time');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);

  // 初期パスワード
  const [initialPassword, setInitialPassword] = useState('');
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // 時給編集
  const [editingWageId, setEditingWageId] = useState<string | null>(null);
  const [editWageValue, setEditWageValue] = useState('');

  // ロール変更
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  // 退職モーダル
  const [removeTarget, setRemoveTarget] = useState<any | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [removing, setRemoving] = useState(false);

  const isOwner = selectedStore?.role === 'owner';

  const loadStaff = () => {
    if (!selectedStore) return;
    Promise.all([
      api.getStoreStaff(selectedStore.id),
      api.getStoreInvitations(selectedStore.id),
      api.getInitialPassword(selectedStore.id),
    ])
      .then(([staffData, invitationData, pwData]) => {
        setStaffList(staffData.staff);
        setInvitations(invitationData.invitations);
        setInitialPassword(pwData.initialPassword);
      })
      .catch(() => {});
  };

  useEffect(() => { loadStaff(); }, [selectedStore]);

  const handleAdd = async () => {
    if (!selectedStore || !name.trim() || !email.trim()) return;
    setError('');
    setSuccess('');
    try {
      const result = await api.addStaff(selectedStore.id, name.trim(), email.trim(), role);
      setName('');
      setEmail('');
      setRole('part_time');
      if (result.invited) {
        setSuccess(`${name} さんに招待メールを送信しました`);
      } else {
        setSuccess(`${name} さんを追加しました`);
      }
      loadStaff();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleResend = async (invitationId: string, inviteeName: string) => {
    if (!selectedStore || resendingId) return;
    setError('');
    setSuccess('');
    setResendingId(invitationId);
    try {
      const result = await api.resendInvitation(selectedStore.id, invitationId);
      setSuccess(result.message || `${inviteeName} さんに招待メールを再送しました`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResendingId(null);
    }
  };

  const handleSaveWage = async (staffId: string) => {
    if (!selectedStore) return;
    const wage = parseInt(editWageValue) || 0;
    try {
      await api.updateStaff(selectedStore.id, staffId, { hourlyWage: wage });
      showToast('時給を更新しました', 'success');
      setEditingWageId(null);
      loadStaff();
    } catch (e: any) {
      showToast(e.message || '更新に失敗しました', 'error');
    }
  };

  const handleSavePassword = async () => {
    if (!selectedStore || !newPassword.trim() || newPassword.length < 4) {
      showToast('4文字以上で入力してください', 'error');
      return;
    }
    try {
      await api.setInitialPassword(selectedStore.id, newPassword.trim());
      setInitialPassword(newPassword.trim());
      setEditingPassword(false);
      setNewPassword('');
      showToast('初期パスワードを変更しました', 'success');
    } catch (e: any) {
      showToast(e.message || '変更に失敗しました', 'error');
    }
  };

  const handleCancelInvitation = async (invitationId: string, inviteeName: string) => {
    if (!selectedStore) return;
    try {
      await api.cancelInvitation(selectedStore.id, invitationId);
      showToast(`${inviteeName} さんの招待をキャンセルしました`, 'info');
      loadStaff();
    } catch (e: any) {
      showToast(e.message || '招待キャンセルに失敗しました', 'error');
    }
  };

  const handleChangeRole = async (staffId: string, newRole: string) => {
    if (!selectedStore) return;
    try {
      await api.updateStaff(selectedStore.id, staffId, { role: newRole });
      showToast('ロールを変更しました', 'success');
      setEditingRoleId(null);
      loadStaff();
    } catch (e: any) {
      showToast(e.message || 'ロール変更に失敗しました', 'error');
    }
  };

  const openRemoveModal = (staff: any) => {
    setRemoveTarget(staff);
    setConfirmInput('');
    setRemoving(false);
  };

  const handleRemove = async () => {
    if (!selectedStore || !removeTarget || removing) return;
    setRemoving(true);
    try {
      const result = await api.removeStaff(selectedStore.id, removeTarget.id);
      showToast(result.message || `${removeTarget.userName} さんを退職処理しました`, 'success');
      setRemoveTarget(null);
      loadStaff();
    } catch (e: any) {
      showToast(e.message || '退職処理に失敗しました', 'error');
    } finally {
      setRemoving(false);
    }
  };

  // 再入職
  const [rehireEmail, setRehireEmail] = useState('');
  const [rehireRole, setRehireRole] = useState('part_time');
  const [rehiring, setRehiring] = useState(false);

  const handleRehire = async () => {
    if (!selectedStore || !rehireEmail.trim() || rehiring) return;
    setError('');
    setSuccess('');
    setRehiring(true);
    try {
      const result = await api.rehireStaff(selectedStore.id, { email: rehireEmail.trim(), role: rehireRole });
      setSuccess(result.message || '再入職しました');
      setRehireEmail('');
      setRehireRole('part_time');
      loadStaff();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRehiring(false);
    }
  };

  const storeName = selectedStore?.name || '';
  const storeId = selectedStore?.id || '';
  const confirmMatch = storeName.length > 0 && confirmInput === storeName;
  const [copied, setCopied] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(initialPassword || storeId).then(() => {
      setCopied(true);
      showToast('初期パスワードをコピーしました', 'info');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="main-content">
      {/* 初期パスワード表示 */}
      <div className="store-id-banner">
        <div className="store-id-label">初期パスワード</div>
        {editingPassword ? (
          <div className="store-id-row">
            <input
              type="text"
              className="store-id-edit-input"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="新しい初期パスワード（6文字以上）"
              autoFocus
            />
            <button className="store-id-copy" onClick={handleSavePassword}>保存</button>
            <button className="store-id-cancel" onClick={() => { setEditingPassword(false); setNewPassword(''); }}>取消</button>
          </div>
        ) : (
          <div className="store-id-row">
            <code className="store-id-value">{initialPassword}</code>
            <button className="store-id-copy" onClick={handleCopyId}>
              {copied ? '✓' : 'コピー'}
            </button>
            <button className="store-id-cancel" onClick={() => { setEditingPassword(true); setNewPassword(initialPassword); }}>変更</button>
          </div>
        )}
        <p className="store-id-hint">
          スタッフ追加時にこのパスワードでアカウントが作成されます。初回ログイン時に変更を求められます。
        </p>
      </div>

      <div className="staff-section">
        <h3 style={{ marginBottom: 16 }}>スタッフ一覧</h3>

        {staffList.map((s: any) => (
          <div key={s.id} className="staff-item-card">
            <div className="staff-item-top">
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#666', flexShrink: 0 }}>
                {(s.userName || s.email || '?')[0].toUpperCase()}
              </div>
              <div className="info">
                <div className="name">{s.userName || s.email}</div>
                <div className="email">{s.email}</div>
                {isOwner && s.lastSignInAt && (
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
                    最終ログイン: {new Date(s.lastSignInAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
            <div className="staff-item-meta">
              {s.role === 'owner' ? (
                <span className="role-badge owner">{roleLabels.owner}</span>
              ) : editingRoleId === s.id ? (
                <select
                  className="role-select"
                  value={s.role}
                  onChange={e => handleChangeRole(s.id, e.target.value)}
                  onBlur={() => setEditingRoleId(null)}
                  autoFocus
                >
                  {assignableRoles.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              ) : (
                <span
                  className={`role-badge ${s.role}${isOwner ? ' clickable' : ''}`}
                  onClick={() => isOwner && setEditingRoleId(s.id)}
                  title={isOwner ? 'クリックしてロール変更' : undefined}
                >
                  {roleLabels[s.role] || s.role}
                </span>
              )}
              {isOwner && s.role !== 'owner' && (
                editingWageId === s.id ? (
                  <div className="wage-edit">
                    <span className="wage-yen">¥</span>
                    <input
                      type="number"
                      className="wage-input"
                      value={editWageValue}
                      onChange={e => setEditWageValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveWage(s.id); if (e.key === 'Escape') setEditingWageId(null); }}
                      autoFocus
                    />
                    <button className="wage-save" onClick={() => handleSaveWage(s.id)}>✓</button>
                  </div>
                ) : (
                  <button
                    className="wage-display"
                    onClick={() => { setEditingWageId(s.id); setEditWageValue(String(s.hourlyWage || '')); }}
                    title="クリックして時給を編集"
                  >
                    {s.hourlyWage ? `¥${Number(s.hourlyWage).toLocaleString()}/h` : '時給未設定'}
                  </button>
                )
              )}
              {s.role !== 'owner' && (
                <button
                  className="remove-staff-btn"
                  onClick={() => openRemoveModal(s)}
                  title="退職処理"
                >
                  退職
                </button>
              )}
            </div>
          </div>
        ))}

        {invitations.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
            <h4 style={{ marginBottom: 10 }}>招待中</h4>
            {invitations.map((inv: any) => (
              <div key={inv.id} className="staff-item">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: '#666', flexShrink: 0 }}>
                  {(inv.name || inv.email || '?')[0].toUpperCase()}
                </div>
                <div className="info">
                  <div className="name">{inv.name || inv.email}</div>
                  <div className="email">{inv.email}</div>
                </div>
                <span className={`role-badge ${inv.role}`}>
                  {roleLabels[inv.role] || inv.role}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleResend(inv.id, inv.name || inv.email)}
                    disabled={resendingId === inv.id}
                    className="invite-action-btn resend"
                  >
                    {resendingId === inv.id ? '送信中...' : '再送'}
                  </button>
                  <button
                    onClick={() => handleCancelInvitation(inv.id, inv.name || inv.email)}
                    className="invite-action-btn cancel"
                  >
                    取消
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
          <h4 style={{ marginBottom: 8 }}>スタッフを招待</h4>
          {error && <div className="error-msg">{error}</div>}
          {success && <div style={{ color: '#22c55e', fontSize: '0.9rem', marginBottom: 8 }}>{success}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              placeholder="名前"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ padding: '10px 14px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
            <input
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ padding: '10px 14px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #d4d9df', borderRadius: 6, fontFamily: 'inherit', fontSize: '0.9rem', background: '#fff', color: '#1a1a1a' }}
              >
                {assignableRoles.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={handleAdd}
                style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: '0.9rem' }}
              >
                招待
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#999', marginTop: 6 }}>
            アカウントが自動作成されます。初期パスワードは事業所IDです。
          </p>
        </div>

        {/* 再入職 */}
        <div style={{ marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
          <h4 style={{ marginBottom: 8 }}>退職者の再入職</h4>
          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: 10 }}>
            過去に退職したスタッフを再追加します。パスワードは初期パスワードにリセットされます。
          </p>
          <div className="rehire-form-row">
            <input
              type="email"
              placeholder="退職者のメールアドレス"
              value={rehireEmail}
              onChange={e => setRehireEmail(e.target.value)}
              className="rehire-input"
            />
            <select
              value={rehireRole}
              onChange={e => setRehireRole(e.target.value)}
              className="rehire-select"
            >
              {assignableRoles.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              onClick={handleRehire}
              disabled={rehiring || !rehireEmail.trim()}
              className="rehire-btn"
              style={{ opacity: rehiring || !rehireEmail.trim() ? 0.6 : 1 }}
            >
              {rehiring ? '処理中...' : '再入職'}
            </button>
          </div>
        </div>
      </div>

      {/* 退職確認モーダル */}
      {removeTarget && (
        <div className="remove-modal-overlay" onClick={() => !removing && setRemoveTarget(null)}>
          <div className="remove-modal" onClick={e => e.stopPropagation()}>
            <div className="remove-modal-icon">⚠️</div>
            <h3 className="remove-modal-title">スタッフの退職処理</h3>
            <p className="remove-modal-desc">
              <strong>{removeTarget.userName}</strong> さんをこの事業所から削除します。
              この操作は取り消せません。関連するシフト希望なども削除されます。
            </p>

            <div className="remove-modal-confirm">
              <label className="remove-modal-label">
                確認のため事業所名 <strong>{storeName}</strong> を入力してください
              </label>
              <input
                type="text"
                className="remove-modal-input"
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                placeholder={storeName}
                autoFocus
              />
            </div>

            <div className="remove-modal-actions">
              <button
                className="remove-modal-cancel"
                onClick={() => setRemoveTarget(null)}
                disabled={removing}
              >
                キャンセル
              </button>
              <button
                className={`remove-modal-submit ${confirmMatch ? 'active' : ''}`}
                onClick={handleRemove}
                disabled={!confirmMatch || removing}
              >
                {removing ? '処理中...' : '退職させる'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
