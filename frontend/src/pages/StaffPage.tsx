import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { showToast } from '../components/molecules/Toast';
import { Button } from '../components/atoms/Button';
import { Input } from '../components/atoms/Input';
import { ErrorMessage } from '../components/atoms/ErrorMessage';
import { Modal } from '../components/molecules/Modal';
import type { StaffMember, Invitation, AuditLogEntry } from '../types/api';

// 旧 .store-id-banner / .store-id-* 系を Tailwind に移植。
const BANNER =
  'mb-4 rounded-xl border-2 border-dashed border-border bg-surface px-5 py-4';
const BANNER_LABEL =
  'mb-2 text-[0.8rem] font-semibold uppercase tracking-[0.5px] text-[#888]';
const BANNER_ROW = 'mb-1.5 flex items-center gap-2.5';
const BANNER_VALUE =
  'flex-1 select-all rounded-md border border-border-light bg-bg px-3 py-2 font-mono text-[0.85rem] text-text break-all';
const BANNER_EDIT_INPUT =
  'flex-1 rounded-md border-2 border-primary px-3 py-2 text-[0.9rem] text-text font-sans focus:outline-none';
const BANNER_PRIMARY_BTN =
  'cursor-pointer whitespace-nowrap rounded-md border-none bg-primary px-4 py-2 text-[0.8rem] font-semibold text-white font-sans transition-colors hover:bg-primary-hover';
const BANNER_GHOST_BTN =
  'cursor-pointer whitespace-nowrap rounded-md border border-border bg-surface px-3.5 py-2 text-[0.8rem] font-medium text-text-muted font-sans transition-colors hover:bg-[#f0f2f5]';
const BANNER_HINT = 'text-[0.78rem] text-text-subtle';

// 旧 .wage-* 系
const WAGE_DISPLAY =
  'cursor-pointer whitespace-nowrap rounded-md border border-border-light bg-bg px-2.5 py-1 text-[0.78rem] text-text-muted font-sans transition-all hover:border-primary hover:bg-primary-bg hover:text-primary';
const WAGE_EDIT = 'flex items-center gap-1';
const WAGE_YEN = 'text-[0.85rem] font-semibold text-[#888]';
const WAGE_INPUT =
  'w-[70px] rounded border-2 border-primary px-2 py-1 text-[0.85rem] text-right font-sans focus:outline-none';
const WAGE_SAVE =
  'flex h-7 w-7 items-center justify-center rounded border-none bg-primary text-[0.85rem] text-white cursor-pointer';

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  leader: 'リーダー',
  full_time: '正社員',
  part_time: 'アルバイト',
};

const assignableRoles = [
  { value: 'manager', label: 'マネージャー' },
  { value: 'leader', label: 'リーダー' },
  { value: 'full_time', label: '正社員' },
  { value: 'part_time', label: 'アルバイト' },
];

const staffMenuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 14px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  color: '#1f2937',
};

export default function StaffPage() {
  const { selectedStore, stores } = useAuth();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
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

  // 交通費編集
  const [editingTransportId, setEditingTransportId] = useState<string | null>(null);
  const [editTransportValue, setEditTransportValue] = useState('');

  // 入社日編集
  const [editingJoinedId, setEditingJoinedId] = useState<string | null>(null);
  const [editJoinedValue, setEditJoinedValue] = useState('');

  // ロール変更
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  // 退職モーダル
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [removing, setRemoving] = useState(false);

  // パスワードリセットモーダル
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ password: string; message: string } | null>(null);

  // 他店舗に追加モーダル
  const [assignTarget, setAssignTarget] = useState<StaffMember | null>(null);
  const [assignStoreId, setAssignStoreId] = useState('');
  const [assignRole, setAssignRole] = useState('part_time');
  const [assigning, setAssigning] = useState(false);

  // 行アクションドロップダウン
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 監査ログ (リセット履歴) モーダル
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<AuditLogEntry[]>([]);

  // クリック外で行メニューを閉じる
  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  const isOwner = selectedStore?.role === 'owner';

  const loadStaff = useCallback(() => {
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
      .catch(() => { console.error('[StaffPage] fetch failed'); });
  }, [selectedStore]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '更新に失敗しました', 'error');
    }
  };

  const handleSaveTransport = async (staffId: string) => {
    if (!selectedStore) return;
    const fee = parseInt(editTransportValue) || 0;
    try {
      await api.updateStaff(selectedStore.id, staffId, { transportFee: fee });
      showToast('交通費を更新しました', 'success');
      setEditingTransportId(null);
      loadStaff();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '更新に失敗しました', 'error');
    }
  };

  const handleSaveJoined = async (staffId: string) => {
    if (!selectedStore) return;
    try {
      await api.updateStaff(selectedStore.id, staffId, { joinedAt: editJoinedValue || null });
      showToast('入社日を更新しました', 'success');
      setEditingJoinedId(null);
      loadStaff();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '更新に失敗しました', 'error');
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
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '変更に失敗しました', 'error');
    }
  };

  const handleCancelInvitation = async (invitationId: string, inviteeName: string) => {
    if (!selectedStore) return;
    try {
      await api.cancelInvitation(selectedStore.id, invitationId);
      showToast(`${inviteeName} さんの招待をキャンセルしました`, 'info');
      loadStaff();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '招待キャンセルに失敗しました', 'error');
    }
  };

  const handleChangeRole = async (staffId: string, newRole: string) => {
    if (!selectedStore) return;
    try {
      await api.updateStaff(selectedStore.id, staffId, { role: newRole });
      showToast('ロールを変更しました', 'success');
      setEditingRoleId(null);
      loadStaff();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'ロール変更に失敗しました', 'error');
    }
  };

  const openRemoveModal = (staff: StaffMember) => {
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
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '退職処理に失敗しました', 'error');
    } finally {
      setRemoving(false);
    }
  };

  const openResetModal = (staff: StaffMember) => {
    setResetTarget(staff);
    setResetPasswordInput('');
    setResetResult(null);
    setResetting(false);
  };

  const handleResetPassword = async () => {
    if (!selectedStore || !resetTarget || resetting) return;
    const custom = resetPasswordInput.trim();
    if (custom && custom.length < 6) {
      showToast('パスワードは6文字以上にしてください', 'error');
      return;
    }
    setResetting(true);
    try {
      const result = await api.resetStaffPassword(
        selectedStore.id,
        resetTarget.id,
        custom || undefined
      );
      setResetResult({ password: result.password, message: result.message });
      showToast(result.message, 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'パスワードリセットに失敗しました', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleCopyResetPassword = () => {
    if (!resetResult) return;
    navigator.clipboard.writeText(resetResult.password).then(() => {
      showToast('パスワードをコピーしました', 'info');
    });
  };

  // スタッフ PIN (NFC 清掃 / NFC 打刻で共用)
  const [pinResult, setPinResult] = useState<{ staffName: string; pin: string } | null>(null);

  const handleRegenerateStaffPin = async (staff: StaffMember) => {
    if (!selectedStore) return;
    if (!confirm(`${staff.userName} さんの PIN を再発行します。既存 PIN は無効化されます。よろしいですか？`)) return;
    try {
      const result = await api.regenerateStaffPin(selectedStore.id, staff.id);
      setPinResult({ staffName: result.staffName || staff.userName, pin: result.pin });
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'PIN の発行に失敗しました', 'error');
    }
  };

  const handleCopyStaffPin = () => {
    if (!pinResult) return;
    navigator.clipboard.writeText(pinResult.pin).then(() => {
      showToast('PIN をコピーしました', 'info');
    });
  };

  // 他店舗にスタッフを追加
  const otherManagedStores = stores.filter(
    s => s.id !== selectedStore?.id && ['owner', 'manager'].includes(s.role)
  );

  const handleAssignToStore = async () => {
    if (!assignTarget || !assignStoreId || assigning) return;
    setAssigning(true);
    try {
      const result = await api.assignExistingStaff(assignStoreId, assignTarget.userId, assignRole);
      showToast(result.message, 'success');
      setAssignTarget(null);
      setAssignStoreId('');
      setAssignRole('part_time');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '追加に失敗しました', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const openHistoryModal = async () => {
    if (!selectedStore) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const result = await api.getAuditLog(selectedStore.id, 'password_reset', 50);
      setHistoryEntries(result.entries);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '履歴の取得に失敗しました', 'error');
    } finally {
      setHistoryLoading(false);
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
      <div className={BANNER}>
        <div className={BANNER_LABEL}>初期パスワード</div>
        {editingPassword ? (
          <div className={BANNER_ROW}>
            <input
              type="text"
              className={BANNER_EDIT_INPUT}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="新しい初期パスワード(6文字以上)"
              autoFocus
            />
            <button type="button" className={BANNER_PRIMARY_BTN} onClick={handleSavePassword}>保存</button>
            <button type="button" className={BANNER_GHOST_BTN} onClick={() => { setEditingPassword(false); setNewPassword(''); }}>取消</button>
          </div>
        ) : (
          <div className={BANNER_ROW}>
            <code className={BANNER_VALUE}>{initialPassword}</code>
            <button type="button" className={BANNER_PRIMARY_BTN} onClick={handleCopyId}>
              {copied ? '✓' : 'コピー'}
            </button>
            <button type="button" className={BANNER_GHOST_BTN} onClick={() => { setEditingPassword(true); setNewPassword(initialPassword); }}>変更</button>
          </div>
        )}
        <p className={BANNER_HINT}>
          スタッフ追加時にこのパスワードでアカウントが作成されます。初回ログイン時に変更を求められます。
        </p>
      </div>

      {/* 登録リンク */}
      <div className={`${BANNER} mb-3`}>
        <div className={BANNER_LABEL}>スタッフ登録リンク</div>
        <div className={BANNER_ROW}>
          <code className={`${BANNER_VALUE} text-[0.75rem] break-all`}>
            {`${window.location.origin}?join=${selectedStore?.id}`}
          </code>
          <button
            type="button"
            className={BANNER_PRIMARY_BTN}
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}?join=${selectedStore?.id}`);
              showToast('登録リンクをコピーしました', 'info');
            }}
          >
            コピー
          </button>
        </div>
        <p className={BANNER_HINT}>
          このリンクを共有すると、スタッフが自分で名前・メール・パスワードを入力して登録できます。
        </p>
      </div>

      <div className="staff-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>スタッフ一覧</h3>
          {isOwner && (
            <button
              onClick={openHistoryModal}
              style={{
                padding: '8px 14px',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
              title="パスワードリセット履歴"
            >
              📋 リセット履歴
            </button>
          )}
        </div>

        {staffList.map((s) => (
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
                  <div className={WAGE_EDIT}>
                    <span className={WAGE_YEN}>¥</span>
                    <input
                      type="number"
                      className={WAGE_INPUT}
                      value={editWageValue}
                      onChange={e => setEditWageValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveWage(s.id); if (e.key === 'Escape') setEditingWageId(null); }}
                      autoFocus
                    />
                    <button type="button" className={WAGE_SAVE} onClick={() => handleSaveWage(s.id)}>✓</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={WAGE_DISPLAY}
                    onClick={() => { setEditingWageId(s.id); setEditWageValue(String(s.hourlyWage || '')); }}
                    title="クリックして時給を編集"
                  >
                    {s.hourlyWage ? `¥${Number(s.hourlyWage).toLocaleString()}/h` : '時給未設定'}
                  </button>
                )
              )}
              {isOwner && s.role !== 'owner' && (
                editingTransportId === s.id ? (
                  <div className={WAGE_EDIT}>
                    <span className={WAGE_YEN}>¥</span>
                    <input
                      type="number"
                      className={WAGE_INPUT}
                      value={editTransportValue}
                      onChange={e => setEditTransportValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveTransport(s.id); if (e.key === 'Escape') setEditingTransportId(null); }}
                      autoFocus
                      data-testid="transport-fee-input"
                    />
                    <button type="button" className={WAGE_SAVE} onClick={() => handleSaveTransport(s.id)}>✓</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={WAGE_DISPLAY}
                    onClick={() => { setEditingTransportId(s.id); setEditTransportValue(String(s.transportFee || '')); }}
                    title="クリックして交通費を編集"
                    data-testid="transport-fee-display"
                  >
                    {s.transportFee !== null && s.transportFee !== undefined ? `交通費 ¥${Number(s.transportFee).toLocaleString()}/日` : '交通費未設定'}
                  </button>
                )
              )}
              {isOwner && s.role !== 'owner' && (
                editingJoinedId === s.id ? (
                  <div className={WAGE_EDIT}>
                    <input
                      type="date"
                      className={WAGE_INPUT}
                      value={editJoinedValue}
                      onChange={e => setEditJoinedValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveJoined(s.id); if (e.key === 'Escape') setEditingJoinedId(null); }}
                      autoFocus
                      data-testid="joined-at-input"
                    />
                    <button type="button" className={WAGE_SAVE} onClick={() => handleSaveJoined(s.id)}>✓</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={WAGE_DISPLAY}
                    onClick={() => { setEditingJoinedId(s.id); setEditJoinedValue(s.joinedAt ? s.joinedAt.split('T')[0] : ''); }}
                    title="クリックして入社日を編集"
                    data-testid="joined-at-display"
                  >
                    {s.joinedAt ? `入社 ${new Date(s.joinedAt).toLocaleDateString('ja-JP')}` : '入社日未設定'}
                  </button>
                )
              )}
              {s.role !== 'owner' && (
                <div
                  ref={openMenuId === s.id ? menuRef : undefined}
                  style={{ position: 'relative' }}
                >
                  <button
                    className="staff-action-menu-btn"
                    onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                    aria-label="アクション"
                    title="アクション"
                    style={{
                      background: '#f1f5f9',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: '1.1rem',
                      color: '#475569',
                      lineHeight: 1,
                    }}
                  >
                    ⋯
                  </button>
                  {openMenuId === s.id && (
                    <div
                      role="menu"
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        right: 0,
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
                        minWidth: 180,
                        zIndex: 50,
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        onClick={() => { setOpenMenuId(null); openResetModal(s); }}
                        style={staffMenuItemStyle}
                      >
                        🔑 パスワードを再設定
                      </button>
                      <button
                        onClick={() => { setOpenMenuId(null); handleRegenerateStaffPin(s); }}
                        style={staffMenuItemStyle}
                      >
                        🔢 PIN を再発行
                      </button>
                      {otherManagedStores.length > 0 && s.role !== 'owner' && (
                        <button
                          onClick={() => { setOpenMenuId(null); setAssignTarget(s); setAssignStoreId(''); setAssignRole('part_time'); }}
                          style={staffMenuItemStyle}
                        >
                          🏪 他店舗に追加
                        </button>
                      )}
                      <button
                        className="staff-action-remove"
                        onClick={() => { setOpenMenuId(null); openRemoveModal(s); }}
                        style={{ ...staffMenuItemStyle, color: '#dc2626' }}
                      >
                        🚪 退職処理
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {invitations.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
            <h4 style={{ marginBottom: 10 }}>招待中</h4>
            {invitations.map((inv) => (
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
          {error && <ErrorMessage>{error}</ErrorMessage>}
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

      {/* パスワードリセットモーダル */}
      <Modal
        open={!!resetTarget}
        onClose={() => !resetting && setResetTarget(null)}
        closeOnBackdrop={!resetting}
        actions={
          !resetResult ? (
            <>
              <Button variant="secondary" className="flex-1" onClick={() => setResetTarget(null)} disabled={resetting}>
                キャンセル
              </Button>
              <Button
                className="flex-[2] bg-[#f59e0b] hover:bg-[#d97706] text-white"
                onClick={handleResetPassword}
                disabled={resetting}
              >
                {resetting ? '処理中...' : 'リセットする'}
              </Button>
            </>
          ) : (
            <Button variant="danger" fullWidth onClick={() => setResetTarget(null)}>
              閉じる
            </Button>
          )
        }
      >
        {resetTarget && (
          <>
            <div className="text-center text-[2.5rem] mb-3">🔑</div>
            <h3 className="text-center text-[1.15rem] text-text mb-2">パスワードリセット</h3>
            {!resetResult ? (
              <>
                <p className="text-center text-sm text-text-muted leading-[1.7] mb-5">
                  <strong>{resetTarget.userName}</strong> さんのログインパスワードをリセットします。
                  空欄の場合は事業所の初期パスワードが使用されます。
                </p>
                <div className="mb-5">
                  <label className="block text-sm text-text-muted mb-2">
                    新しいパスワード（任意・6文字以上）
                  </label>
                  <Input
                    type="text"
                    value={resetPasswordInput}
                    onChange={e => setResetPasswordInput(e.target.value)}
                    placeholder="空欄で初期パスワードを使用"
                    autoFocus
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-center text-sm text-[#22c55e] leading-[1.7] mb-5">
                  ✓ {resetResult.message}
                </p>
                <div className="mb-5">
                  <label className="block text-sm text-text-muted mb-2">新しいパスワード</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={resetResult.password}
                      readOnly
                      className="flex-1 font-mono text-[1.05rem]"
                    />
                    <Button variant="primary" size="sm" onClick={handleCopyResetPassword}>
                      コピー
                    </Button>
                  </div>
                  <p className="text-xs text-text-subtle mt-2">
                    このパスワードを本人に伝えてください。次回ログイン時に変更が求められます。
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      {/* リセット履歴モーダル */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        size="lg"
        actions={
          <Button variant="primary" fullWidth onClick={() => setHistoryOpen(false)}>
            閉じる
          </Button>
        }
      >
        <div className="text-center text-[2.5rem] mb-3">📋</div>
        <h3 className="text-center text-[1.15rem] text-text mb-2">パスワードリセット履歴</h3>
        <p className="text-left text-sm text-text-muted leading-[1.7] mb-2">
          直近 50 件までのパスワードリセット記録を表示します。
        </p>
        <div className="mt-2 max-h-[360px] overflow-y-auto rounded-md border border-[#e2e8f0]">
          {historyLoading ? (
            <div className="p-6 text-center text-[#64748b]">読み込み中...</div>
          ) : historyEntries.length === 0 ? (
            <div className="p-6 text-center text-[#64748b]">履歴はまだありません</div>
          ) : (
            historyEntries.map((entry) => {
              const meta = entry.metadata || {};
              const custom = Boolean((meta as Record<string, unknown>).custom_password_used);
              return (
                <div
                  key={entry.id}
                  className="border-b border-[#f1f5f9] px-3.5 py-3 text-left text-[0.88rem]"
                >
                  <div className="mb-1 text-[#0f172a]">
                    <strong>{entry.target_name || '(削除済みスタッフ)'}</strong>
                    <span className="ml-2 text-[#64748b]">
                      ← {entry.actor_name || '(不明)'}
                      {entry.actor_role ? ` (${roleLabels[entry.actor_role] || entry.actor_role})` : ''}
                    </span>
                  </div>
                  <div className="text-xs text-[#64748b]">
                    {new Date(entry.created_at).toLocaleString('ja-JP')}
                    {custom ? ' · カスタムパスワード' : ' · 初期パスワード'}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {/* スタッフ PIN 発行結果モーダル */}
      <Modal
        open={!!pinResult}
        onClose={() => setPinResult(null)}
        actions={null}
      >
        {pinResult && (
          <>
            <div className="text-center text-[2.5rem] mb-3">🔢</div>
            <h3 className="text-center text-[1.15rem] text-text mb-2">PIN を再発行しました</h3>
            <p className="text-center text-sm text-text-muted leading-[1.7] mb-5">
              <strong>{pinResult.staffName}</strong> さんの新しい PIN です。
              NFC チェックインと NFC 打刻の両方で使用します。
            </p>
            <div className="my-4 rounded-[10px] bg-[#f1f5f9] p-5 text-center">
              <div className="font-mono text-[2rem] font-bold tracking-[0.4em] text-[#0f172a]">
                {pinResult.pin}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={handleCopyStaffPin}>
                PIN をコピー
              </Button>
              <Button variant="secondary" className="flex-1 bg-[#e2e8f0]" onClick={() => setPinResult(null)}>
                閉じる
              </Button>
            </div>
            <p className="text-xs text-text-subtle mt-3">
              この PIN を本人に伝えてください。再発行すると旧 PIN は無効になります。
            </p>
          </>
        )}
      </Modal>

      {/* 他店舗に追加モーダル */}
      <Modal
        open={!!assignTarget}
        onClose={() => !assigning && setAssignTarget(null)}
        closeOnBackdrop={!assigning}
        actions={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setAssignTarget(null)} disabled={assigning}>
              キャンセル
            </Button>
            <Button
              variant="primary"
              className="flex-[2]"
              onClick={handleAssignToStore}
              disabled={!assignStoreId || assigning}
            >
              {assigning ? '追加中...' : '追加する'}
            </Button>
          </>
        }
      >
        {assignTarget && (
          <>
            <div className="text-center text-[2.5rem] mb-3">🏪</div>
            <h3 className="text-center text-[1.15rem] text-text mb-2">他店舗に追加</h3>
            <p className="text-center text-sm text-text-muted leading-[1.7] mb-5">
              <strong>{assignTarget.userName}</strong> さんを別の事業所にも追加します。
            </p>

            <div className="mb-3">
              <label className="block text-[0.85rem] text-[#475569] mb-1">
                追加先の事業所
              </label>
              <select
                value={assignStoreId}
                onChange={e => setAssignStoreId(e.target.value)}
                className="w-full rounded-md border border-[#cbd5e1] bg-surface px-2.5 py-2 text-[0.95rem]"
              >
                <option value="">選択してください</option>
                {otherManagedStores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-[0.85rem] text-[#475569] mb-1">
                ロール
              </label>
              <select
                value={assignRole}
                onChange={e => setAssignRole(e.target.value)}
                className="w-full rounded-md border border-[#cbd5e1] bg-surface px-2.5 py-2 text-[0.95rem]"
              >
                {assignableRoles.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </Modal>

      {/* 退職確認モーダル */}
      <Modal
        open={!!removeTarget}
        onClose={() => !removing && setRemoveTarget(null)}
        closeOnBackdrop={!removing}
        actions={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setRemoveTarget(null)} disabled={removing}>
              キャンセル
            </Button>
            <Button
              variant="danger"
              className="flex-[2]"
              onClick={handleRemove}
              disabled={!confirmMatch || removing}
            >
              {removing ? '処理中...' : '退職させる'}
            </Button>
          </>
        }
      >
        {removeTarget && (
          <>
            <div className="text-center text-[2.5rem] mb-3">⚠️</div>
            <h3 className="text-center text-[1.15rem] text-text mb-2">スタッフの退職処理</h3>
            <p className="text-center text-sm text-text-muted leading-[1.7] mb-5">
              <strong>{removeTarget.userName}</strong> さんをこの事業所から削除します。
              この操作は取り消せません。関連するシフト希望なども削除されます。
            </p>

            <div className="mb-5">
              <label className="block text-sm text-text-muted mb-2">
                確認のため事業所名 <strong>{storeName}</strong> を入力してください
              </label>
              <Input
                type="text"
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                placeholder={storeName}
                autoFocus
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
