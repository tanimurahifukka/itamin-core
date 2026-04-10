import { useState, useEffect } from 'react';
import {
  orgApi,
  type Organization,
  type OrgMember,
  type Subscription,
  type OrgUsage,
} from '../api/organizationsClient';

interface OrgDetail {
  organization: Organization;
  myRole: string;
  subscription: Subscription | null;
}

interface OrgUsageDetail {
  usage: OrgUsage;
  limits: {
    max_stores: number;
    max_staff_per_store: number;
    max_plugins: number;
    allowed_plugins: string[];
  };
  planName: string;
}

interface StoreEntry {
  id: string;
  name: string;
  address?: string;
  phone?: string;
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [stores, setStores] = useState<StoreEntry[]>([]);
  const [usageDetail, setUsageDetail] = useState<OrgUsageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create org modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [newOrgType, setNewOrgType] = useState('company');
  const [createLoading, setCreateLoading] = useState(false);

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('viewer');
  const [addMemberLoading, setAddMemberLoading] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
    setLoading(true);
    setError(null);
    try {
      const res = await orgApi.list();
      setOrganizations(res.organizations);
    } catch (e) {
      setError(e instanceof Error ? e.message : '組織一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function selectOrganization(orgId: string) {
    setSelectedOrgId(orgId);
    setOrgDetail(null);
    setMembers([]);
    setStores([]);
    setUsageDetail(null);
    setShowAddMember(false);
    setError(null);
    setDetailLoading(true);
    try {
      const [detailRes, membersRes, storesRes, usageRes] = await Promise.all([
        orgApi.get(orgId),
        orgApi.listMembers(orgId),
        orgApi.listStores(orgId),
        orgApi.getUsage(orgId),
      ]);
      setOrgDetail(detailRes);
      setMembers(membersRes.members);
      setStores(storesRes.stores);
      setUsageDetail(usageRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : '組織詳細の取得に失敗しました');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleCreateOrg() {
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      setError('組織名とスラグは必須です');
      return;
    }
    setCreateLoading(true);
    setError(null);
    try {
      await orgApi.create({ name: newOrgName, slug: newOrgSlug, orgType: newOrgType });
      setShowCreateModal(false);
      setNewOrgName('');
      setNewOrgSlug('');
      setNewOrgType('company');
      await loadOrganizations();
    } catch (e) {
      setError(e instanceof Error ? e.message : '組織の作成に失敗しました');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleAddMember() {
    if (!selectedOrgId || !newMemberEmail.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }
    setAddMemberLoading(true);
    setError(null);
    try {
      const res = await orgApi.addMember(selectedOrgId, {
        email: newMemberEmail,
        role: newMemberRole,
      });
      setMembers((prev) => [...prev, res.member]);
      setNewMemberEmail('');
      setNewMemberRole('viewer');
      setShowAddMember(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'メンバーの追加に失敗しました');
    } finally {
      setAddMemberLoading(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!selectedOrgId) return;
    if (!window.confirm('このメンバーを削除しますか？')) return;
    setError(null);
    try {
      await orgApi.removeMember(selectedOrgId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'メンバーの削除に失敗しました');
    }
  }

  async function handleRoleChange(memberId: string, role: string) {
    if (!selectedOrgId) return;
    setError(null);
    try {
      await orgApi.updateMemberRole(selectedOrgId, memberId, role);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId ? { ...m, role: role as OrgMember['role'] } : m
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ロールの変更に失敗しました');
    }
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    height: '100%',
    minHeight: '600px',
    gap: '0',
  };

  const sidebarStyle: React.CSSProperties = {
    width: '260px',
    flexShrink: 0,
    borderRight: '1px solid #e5e7eb',
    padding: '16px',
    overflowY: 'auto',
  };

  const mainStyle: React.CSSProperties = {
    flex: 1,
    padding: '24px',
    overflowY: 'auto',
  };

  const errorBannerStyle: React.CSSProperties = {
    background: '#fee2e2',
    color: '#991b1b',
    padding: '10px 14px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  };

  const orgItemStyle = (selected: boolean): React.CSSProperties => ({
    padding: '10px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    background: selected ? '#eff6ff' : 'transparent',
    border: selected ? '1px solid #bfdbfe' : '1px solid transparent',
    marginBottom: '4px',
  });

  const sectionStyle: React.CSSProperties = {
    marginBottom: '28px',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '12px',
    paddingBottom: '6px',
    borderBottom: '1px solid #e5e7eb',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 10px',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 600,
    color: '#374151',
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'middle',
  };

  const btnPrimaryStyle: React.CSSProperties = {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  };

  const btnDangerStyle: React.CSSProperties = {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '4px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  };

  const inputStyle: React.CSSProperties = {
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '7px 10px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '7px 10px',
    fontSize: '14px',
    background: '#fff',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '8px',
    padding: '24px',
    width: '420px',
    maxWidth: '90vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  };

  return (
    <div>
      {error && (
        <div style={errorBannerStyle}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={containerStyle}>
        {/* サイドバー: 組織一覧 */}
        <div style={sidebarStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>組織一覧</h2>
            <button style={{ ...btnPrimaryStyle, padding: '5px 10px', fontSize: '12px' }} onClick={() => setShowCreateModal(true)}>
              + 新規作成
            </button>
          </div>

          {loading && <p style={{ fontSize: '14px', color: '#6b7280' }}>読み込み中...</p>}

          {organizations.map((org) => (
            <div
              key={org.id}
              style={orgItemStyle(selectedOrgId === org.id)}
              onClick={() => selectOrganization(org.id)}
            >
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{org.name}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{org.slug} · {org.org_type}</div>
            </div>
          ))}

          {!loading && organizations.length === 0 && (
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>組織がありません</p>
          )}
        </div>

        {/* メインエリア: 組織詳細 */}
        <div style={mainStyle}>
          {!selectedOrgId && (
            <div style={{ color: '#9ca3af', textAlign: 'center', marginTop: '60px' }}>
              <p style={{ fontSize: '16px' }}>左の一覧から組織を選択してください</p>
            </div>
          )}

          {selectedOrgId && detailLoading && (
            <p style={{ color: '#6b7280' }}>読み込み中...</p>
          )}

          {selectedOrgId && !detailLoading && orgDetail && (
            <div>
              {/* 基本情報 */}
              <div style={sectionStyle}>
                <h2 style={{ margin: '0 0 12px', fontSize: '20px' }}>{orgDetail.organization.name}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
                  <div><span style={{ color: '#6b7280' }}>スラグ: </span>{orgDetail.organization.slug}</div>
                  <div><span style={{ color: '#6b7280' }}>種別: </span>{orgDetail.organization.org_type}</div>
                  <div><span style={{ color: '#6b7280' }}>自分のロール: </span>{orgDetail.myRole}</div>
                  <div>
                    <span style={{ color: '#6b7280' }}>作成日: </span>
                    {new Date(orgDetail.organization.created_at).toLocaleDateString('ja-JP')}
                  </div>
                </div>
              </div>

              {/* プラン・利用状況 */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>プラン・利用状況</div>
                {orgDetail.subscription ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
                    <div><span style={{ color: '#6b7280' }}>プラン: </span>{orgDetail.subscription.plans?.name ?? '—'}</div>
                    <div><span style={{ color: '#6b7280' }}>ステータス: </span>{orgDetail.subscription.status}</div>
                    {orgDetail.subscription.ends_at && (
                      <div>
                        <span style={{ color: '#6b7280' }}>有効期限: </span>
                        {new Date(orgDetail.subscription.ends_at).toLocaleDateString('ja-JP')}
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: '14px', color: '#9ca3af' }}>プランが設定されていません</p>
                )}
                {usageDetail && (
                  <div style={{ marginTop: '12px', display: 'flex', gap: '20px', fontSize: '14px' }}>
                    <div style={{ background: '#f3f4f6', padding: '10px 16px', borderRadius: '6px' }}>
                      <div style={{ color: '#6b7280', marginBottom: '2px' }}>店舗数</div>
                      <div style={{ fontWeight: 700, fontSize: '18px' }}>
                        {usageDetail.usage.stores}
                        <span style={{ fontWeight: 400, fontSize: '14px', color: '#6b7280' }}>
                          /{usageDetail.limits.max_stores}
                        </span>
                      </div>
                    </div>
                    <div style={{ background: '#f3f4f6', padding: '10px 16px', borderRadius: '6px' }}>
                      <div style={{ color: '#6b7280', marginBottom: '2px' }}>プラグイン数</div>
                      <div style={{ fontWeight: 700, fontSize: '18px' }}>
                        {usageDetail.usage.plugins}
                        <span style={{ fontWeight: 400, fontSize: '14px', color: '#6b7280' }}>
                          /{usageDetail.limits.max_plugins}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* メンバー */}
              <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...sectionTitleStyle }}>
                  <span>メンバー</span>
                  <button style={{ ...btnPrimaryStyle, padding: '4px 12px', fontSize: '13px' }} onClick={() => setShowAddMember((v) => !v)}>
                    {showAddMember ? 'キャンセル' : '+ メンバー追加'}
                  </button>
                </div>

                {showAddMember && (
                  <div style={{ background: '#f9fafb', padding: '14px', borderRadius: '6px', marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label style={{ fontSize: '12px', color: '#374151', display: 'block', marginBottom: '4px' }}>メールアドレス</label>
                      <input
                        style={inputStyle}
                        type="email"
                        placeholder="user@example.com"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#374151', display: 'block', marginBottom: '4px' }}>ロール</label>
                      <select style={selectStyle} value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)}>
                        <option value="viewer">閲覧者</option>
                        <option value="admin">管理者</option>
                        <option value="owner">オーナー</option>
                      </select>
                    </div>
                    <button
                      style={btnPrimaryStyle}
                      onClick={handleAddMember}
                      disabled={addMemberLoading}
                    >
                      {addMemberLoading ? '追加中...' : '追加'}
                    </button>
                  </div>
                )}

                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>ユーザー</th>
                      <th style={thStyle}>ロール</th>
                      <th style={thStyle}>参加日</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td style={tdStyle}>
                          {member.profiles?.full_name || member.profiles?.email || member.user_id}
                        </td>
                        <td style={tdStyle}>
                          <select
                            style={{ ...selectStyle, padding: '4px 8px', fontSize: '13px' }}
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          >
                            <option value="viewer">閲覧者</option>
                            <option value="admin">管理者</option>
                            <option value="owner">オーナー</option>
                          </select>
                        </td>
                        <td style={tdStyle}>
                          {new Date(member.joined_at).toLocaleDateString('ja-JP')}
                        </td>
                        <td style={tdStyle}>
                          <button style={btnDangerStyle} onClick={() => handleRemoveMember(member.id)}>
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                    {members.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af' }}>
                          メンバーがいません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 店舗一覧 */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>紐付き店舗</div>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>店舗名</th>
                      <th style={thStyle}>住所</th>
                      <th style={thStyle}>電話番号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((store) => (
                      <tr key={store.id}>
                        <td style={tdStyle}>{store.name}</td>
                        <td style={tdStyle}>{store.address || '—'}</td>
                        <td style={tdStyle}>{store.phone || '—'}</td>
                      </tr>
                    ))}
                    {stores.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af' }}>
                          店舗が紐付いていません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 組織作成モーダル */}
      {showCreateModal && (
        <div style={overlayStyle} onClick={() => setShowCreateModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>新しい組織を作成</h3>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                組織名 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                style={inputStyle}
                placeholder="例: 株式会社サンプル"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                スラグ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                style={inputStyle}
                placeholder="例: sample-corp"
                value={newOrgSlug}
                onChange={(e) => setNewOrgSlug(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                種別
              </label>
              <select
                style={{ ...selectStyle, width: '100%' }}
                value={newOrgType}
                onChange={(e) => setNewOrgType(e.target.value)}
              >
                <option value="company">会社</option>
                <option value="franchise">フランチャイズ</option>
                <option value="group">グループ</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                style={{ ...btnPrimaryStyle, background: '#6b7280' }}
                onClick={() => setShowCreateModal(false)}
              >
                キャンセル
              </button>
              <button
                style={btnPrimaryStyle}
                onClick={handleCreateOrg}
                disabled={createLoading}
              >
                {createLoading ? '作成中...' : '作成する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
