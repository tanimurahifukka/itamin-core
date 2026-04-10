import { useState, useEffect } from 'react';
import {
  platformApi,
  type Organization,
  type Plan,
  type PlatformMember,
  type OrgUsage,
} from '../api/organizationsClient';

type Tab = 'organizations' | 'team' | 'plans';

interface PlatformOrgDetail {
  organization: Organization;
  subscription: { status: string; plans: Plan | null } | null;
  usage: {
    usage: OrgUsage;
    limits: {
      max_stores: number;
      max_staff_per_store: number;
      max_plugins: number;
      allowed_plugins: string[];
    };
    planName: string;
  };
}

export default function PlatformDashboard() {
  const [accessDenied, setAccessDenied] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('organizations');
  const [error, setError] = useState<string | null>(null);

  // 組織一覧
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrgDetail, setSelectedOrgDetail] = useState<PlatformOrgDetail | null>(null);
  const [orgDetailLoading, setOrgDetailLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planChangeValue, setPlanChangeValue] = useState('');
  const [planChangeLoading, setPlanChangeLoading] = useState(false);

  // チーム管理
  const [team, setTeam] = useState<PlatformMember[]>([]);
  const [teamLoaded, setTeamLoaded] = useState(false);
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [newTeamRole, setNewTeamRole] = useState('support');
  const [addTeamLoading, setAddTeamLoading] = useState(false);

  // プラン管理
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<Partial<Plan>>({
    name: '',
    slug: '',
    max_stores: 1,
    max_staff_per_store: 10,
    max_plugins: 5,
    allowed_plugins: [],
    price_monthly_jpy: 0,
    is_active: true,
  });
  const [planSaveLoading, setPlanSaveLoading] = useState(false);

  // アクセスチェック
  useEffect(() => {
    platformApi
      .me()
      .then((res) => {
        setMyRole(res.role);
      })
      .catch(() => {
        setAccessDenied(true);
      });
  }, []);

  // タブ切り替え時のデータロード
  useEffect(() => {
    if (accessDenied || myRole === null) return;

    if (activeTab === 'organizations' && !orgsLoaded) {
      loadOrganizations();
    } else if (activeTab === 'team' && !teamLoaded) {
      loadTeam();
    } else if (activeTab === 'plans' && !plansLoaded) {
      loadPlans();
    }
  }, [activeTab, accessDenied, myRole]);

  async function loadOrganizations() {
    setError(null);
    try {
      const res = await platformApi.listOrganizations();
      setOrganizations(res.organizations);
      setOrgsLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '組織一覧の取得に失敗しました');
    }
  }

  async function loadTeam() {
    setError(null);
    try {
      const res = await platformApi.listTeam();
      setTeam(res.team);
      setTeamLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'チームの取得に失敗しました');
    }
  }

  async function loadPlans() {
    setError(null);
    try {
      const res = await platformApi.listPlans();
      setPlans(res.plans);
      setPlansLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'プラン一覧の取得に失敗しました');
    }
  }

  async function selectOrg(orgId: string) {
    setSelectedOrgId(orgId);
    setSelectedOrgDetail(null);
    setOrgDetailLoading(true);
    setError(null);
    try {
      const [detailRes, plansRes] = await Promise.all([
        platformApi.getOrganization(orgId),
        plans.length === 0 ? platformApi.listPlans() : Promise.resolve({ plans }),
      ]);
      setSelectedOrgDetail(detailRes);
      if (plans.length === 0) {
        const pr = plansRes as { plans: Plan[] };
        setPlans(pr.plans);
      }
      setPlanChangeValue(detailRes.subscription?.plans?.id ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '組織詳細の取得に失敗しました');
    } finally {
      setOrgDetailLoading(false);
    }
  }

  async function handlePlanChange() {
    if (!selectedOrgId || !planChangeValue) return;
    setPlanChangeLoading(true);
    setError(null);
    try {
      await platformApi.updateSubscription(selectedOrgId, { planId: planChangeValue });
      await selectOrg(selectedOrgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'プランの変更に失敗しました');
    } finally {
      setPlanChangeLoading(false);
    }
  }

  async function handleAddTeamMember() {
    if (!newTeamEmail.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }
    setAddTeamLoading(true);
    setError(null);
    try {
      const res = await platformApi.addTeamMember({ email: newTeamEmail, role: newTeamRole });
      setTeam((prev) => [...prev, res.member]);
      setNewTeamEmail('');
      setNewTeamRole('support');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'チームメンバーの追加に失敗しました');
    } finally {
      setAddTeamLoading(false);
    }
  }

  async function handleRemoveTeamMember(memberId: string) {
    if (!window.confirm('このメンバーを削除しますか？')) return;
    setError(null);
    try {
      await platformApi.removeTeamMember(memberId);
      setTeam((prev) => prev.filter((m) => m.id !== memberId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'チームメンバーの削除に失敗しました');
    }
  }

  async function handleSavePlan() {
    setPlanSaveLoading(true);
    setError(null);
    try {
      if (editPlanId) {
        const res = await platformApi.updatePlan(editPlanId, planForm);
        setPlans((prev) => prev.map((p) => (p.id === editPlanId ? res.plan : p)));
      } else {
        const res = await platformApi.createPlan(planForm);
        setPlans((prev) => [...prev, res.plan]);
      }
      setShowCreatePlan(false);
      setEditPlanId(null);
      setPlanForm({
        name: '',
        slug: '',
        max_stores: 1,
        max_staff_per_store: 10,
        max_plugins: 5,
        allowed_plugins: [],
        price_monthly_jpy: 0,
        is_active: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'プランの保存に失敗しました');
    } finally {
      setPlanSaveLoading(false);
    }
  }

  function startEditPlan(plan: Plan) {
    setEditPlanId(plan.id);
    setPlanForm({ ...plan });
    setShowCreatePlan(true);
  }

  const filteredOrgs = organizations.filter(
    (o) =>
      orgSearch === '' ||
      o.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
      o.slug.toLowerCase().includes(orgSearch.toLowerCase())
  );

  // ---- スタイル定義 ----
  const pageStyle: React.CSSProperties = { padding: '24px', maxWidth: '1100px' };

  const errorBannerStyle: React.CSSProperties = {
    background: '#fee2e2',
    color: '#991b1b',
    padding: '10px 14px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    gap: '4px',
    borderBottom: '2px solid #e5e7eb',
    marginBottom: '24px',
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: active ? 700 : 400,
    color: active ? '#2563eb' : '#374151',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    marginBottom: '-2px',
  });

  const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '14px' };
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

  const btnSecondaryStyle: React.CSSProperties = {
    background: '#6b7280',
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
    width: '480px',
    maxWidth: '90vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    display: 'block',
    marginBottom: '4px',
  };

  const fieldStyle: React.CSSProperties = { marginBottom: '12px' };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '12px',
    paddingBottom: '6px',
    borderBottom: '1px solid #e5e7eb',
  };

  // アクセス拒否
  if (accessDenied) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ fontSize: '18px', color: '#991b1b' }}>アクセス権限がありません</p>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          このページはプラットフォーム管理者のみアクセスできます。
        </p>
      </div>
    );
  }

  if (myRole === null) {
    return <div style={{ padding: '24px', color: '#6b7280' }}>権限を確認中...</div>;
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px' }}>プラットフォーム管理</h1>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>ロール: {myRole}</span>
      </div>

      {error && (
        <div style={errorBannerStyle}>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* タブバー */}
      <div style={tabBarStyle}>
        <button style={tabBtnStyle(activeTab === 'organizations')} onClick={() => setActiveTab('organizations')}>
          組織一覧
        </button>
        <button style={tabBtnStyle(activeTab === 'team')} onClick={() => setActiveTab('team')}>
          チーム管理
        </button>
        <button style={tabBtnStyle(activeTab === 'plans')} onClick={() => setActiveTab('plans')}>
          プラン管理
        </button>
      </div>

      {/* ===== 組織一覧タブ ===== */}
      {activeTab === 'organizations' && (
        <div style={{ display: 'flex', gap: '0' }}>
          {/* 組織リスト */}
          <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid #e5e7eb', paddingRight: '16px' }}>
            <input
              style={{ ...inputStyle, marginBottom: '12px' }}
              placeholder="組織名・スラグで検索..."
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
            />
            {filteredOrgs.map((org) => (
              <div
                key={org.id}
                onClick={() => selectOrg(org.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: selectedOrgId === org.id ? '#eff6ff' : 'transparent',
                  border: selectedOrgId === org.id ? '1px solid #bfdbfe' : '1px solid transparent',
                  marginBottom: '4px',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{org.name}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{org.slug}</div>
              </div>
            ))}
            {filteredOrgs.length === 0 && (
              <p style={{ fontSize: '14px', color: '#9ca3af' }}>
                {orgsLoaded ? '組織が見つかりません' : '読み込み中...'}
              </p>
            )}
          </div>

          {/* 組織詳細 */}
          <div style={{ flex: 1, paddingLeft: '24px' }}>
            {!selectedOrgId && (
              <p style={{ color: '#9ca3af' }}>左の一覧から組織を選択してください</p>
            )}

            {selectedOrgId && orgDetailLoading && <p style={{ color: '#6b7280' }}>読み込み中...</p>}

            {selectedOrgId && !orgDetailLoading && selectedOrgDetail && (
              <div>
                <h2 style={{ margin: '0 0 16px', fontSize: '18px' }}>
                  {selectedOrgDetail.organization.name}
                </h2>

                {/* 利用状況 */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={sectionTitleStyle}>利用状況</div>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                    <div style={{ background: '#f3f4f6', padding: '10px 16px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>店舗数</div>
                      <div style={{ fontWeight: 700, fontSize: '18px' }}>
                        {selectedOrgDetail.usage.usage.stores}
                        <span style={{ fontWeight: 400, fontSize: '13px', color: '#6b7280' }}>
                          /{selectedOrgDetail.usage.limits.max_stores}
                        </span>
                      </div>
                    </div>
                    <div style={{ background: '#f3f4f6', padding: '10px 16px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>プラグイン数</div>
                      <div style={{ fontWeight: 700, fontSize: '18px' }}>
                        {selectedOrgDetail.usage.usage.plugins}
                        <span style={{ fontWeight: 400, fontSize: '13px', color: '#6b7280' }}>
                          /{selectedOrgDetail.usage.limits.max_plugins}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* サブスクリプション */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={sectionTitleStyle}>サブスクリプション</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px', marginBottom: '12px' }}>
                    <div>
                      <span style={{ color: '#6b7280' }}>現在のプラン: </span>
                      <strong>{selectedOrgDetail.subscription?.plans?.name ?? 'なし'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>ステータス: </span>
                      {selectedOrgDetail.subscription?.status ?? '—'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      style={selectStyle}
                      value={planChangeValue}
                      onChange={(e) => setPlanChangeValue(e.target.value)}
                    >
                      <option value="">プランを選択...</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (¥{p.price_monthly_jpy.toLocaleString()}/月)
                        </option>
                      ))}
                    </select>
                    <button
                      style={btnPrimaryStyle}
                      onClick={handlePlanChange}
                      disabled={planChangeLoading || !planChangeValue}
                    >
                      {planChangeLoading ? '変更中...' : 'プランを変更'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== チーム管理タブ ===== */}
      {activeTab === 'team' && (
        <div>
          {/* 追加フォーム */}
          <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px', fontSize: '15px' }}>チームメンバーを追加</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={labelStyle}>メールアドレス</label>
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="admin@example.com"
                  value={newTeamEmail}
                  onChange={(e) => setNewTeamEmail(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>ロール</label>
                <select
                  style={selectStyle}
                  value={newTeamRole}
                  onChange={(e) => setNewTeamRole(e.target.value)}
                >
                  <option value="viewer">閲覧者</option>
                  <option value="support">サポート</option>
                  <option value="admin">管理者</option>
                  {myRole === 'super_admin' && <option value="super_admin">スーパー管理者</option>}
                </select>
              </div>
              <button style={btnPrimaryStyle} onClick={handleAddTeamMember} disabled={addTeamLoading}>
                {addTeamLoading ? '追加中...' : '追加'}
              </button>
            </div>
          </div>

          {/* チームテーブル */}
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
              {team.map((member) => (
                <tr key={member.id}>
                  <td style={tdStyle}>
                    {member.profiles?.full_name || member.profiles?.email || member.user_id}
                  </td>
                  <td style={tdStyle}>{member.role}</td>
                  <td style={tdStyle}>
                    {new Date(member.joined_at).toLocaleDateString('ja-JP')}
                  </td>
                  <td style={tdStyle}>
                    {myRole === 'super_admin' && (
                      <button style={btnDangerStyle} onClick={() => handleRemoveTeamMember(member.id)}>
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {teamLoaded && team.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af' }}>
                    チームメンバーがいません
                  </td>
                </tr>
              )}
              {!teamLoaded && (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af' }}>
                    読み込み中...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== プラン管理タブ ===== */}
      {activeTab === 'plans' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>プラン一覧</h2>
            <button
              style={btnPrimaryStyle}
              onClick={() => {
                setEditPlanId(null);
                setPlanForm({
                  name: '',
                  slug: '',
                  max_stores: 1,
                  max_staff_per_store: 10,
                  max_plugins: 5,
                  allowed_plugins: [],
                  price_monthly_jpy: 0,
                  is_active: true,
                });
                setShowCreatePlan(true);
              }}
            >
              + 新規プラン
            </button>
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>プラン名</th>
                <th style={thStyle}>スラグ</th>
                <th style={thStyle}>店舗数上限</th>
                <th style={thStyle}>プラグイン上限</th>
                <th style={thStyle}>月額(円)</th>
                <th style={thStyle}>有効</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td style={tdStyle}>{plan.name}</td>
                  <td style={tdStyle}>{plan.slug}</td>
                  <td style={tdStyle}>{plan.max_stores}</td>
                  <td style={tdStyle}>{plan.max_plugins}</td>
                  <td style={tdStyle}>¥{plan.price_monthly_jpy.toLocaleString()}</td>
                  <td style={tdStyle}>{plan.is_active ? '有効' : '無効'}</td>
                  <td style={tdStyle}>
                    <button style={btnSecondaryStyle} onClick={() => startEditPlan(plan)}>
                      編集
                    </button>
                  </td>
                </tr>
              ))}
              {plansLoaded && plans.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af' }}>
                    プランがありません
                  </td>
                </tr>
              )}
              {!plansLoaded && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af' }}>
                    読み込み中...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* プラン作成・編集モーダル */}
      {showCreatePlan && (
        <div style={overlayStyle} onClick={() => setShowCreatePlan(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>
              {editPlanId ? 'プランを編集' : '新しいプランを作成'}
            </h3>

            <div style={fieldStyle}>
              <label style={labelStyle}>プラン名</label>
              <input
                style={inputStyle}
                placeholder="例: スタンダード"
                value={planForm.name ?? ''}
                onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>スラグ</label>
              <input
                style={inputStyle}
                placeholder="例: standard"
                value={planForm.slug ?? ''}
                onChange={(e) => setPlanForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>店舗数上限</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={planForm.max_stores ?? 1}
                  onChange={(e) => setPlanForm((f) => ({ ...f, max_stores: Number(e.target.value) }))}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>スタッフ数上限(店舗あたり)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={planForm.max_staff_per_store ?? 10}
                  onChange={(e) =>
                    setPlanForm((f) => ({ ...f, max_staff_per_store: Number(e.target.value) }))
                  }
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>プラグイン数上限</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={planForm.max_plugins ?? 5}
                  onChange={(e) => setPlanForm((f) => ({ ...f, max_plugins: Number(e.target.value) }))}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>月額料金(円)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={planForm.price_monthly_jpy ?? 0}
                  onChange={(e) =>
                    setPlanForm((f) => ({ ...f, price_monthly_jpy: Number(e.target.value) }))
                  }
                />
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>許可プラグイン(カンマ区切り)</label>
              <input
                style={inputStyle}
                placeholder="例: shift,expense,haccp"
                value={(planForm.allowed_plugins ?? []).join(',')}
                onChange={(e) =>
                  setPlanForm((f) => ({
                    ...f,
                    allowed_plugins: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter((s) => s !== ''),
                  }))
                }
              />
            </div>

            <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="plan-is-active"
                checked={planForm.is_active ?? true}
                onChange={(e) => setPlanForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <label htmlFor="plan-is-active" style={{ fontSize: '14px', cursor: 'pointer' }}>
                有効
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                style={{ ...btnPrimaryStyle, background: '#6b7280' }}
                onClick={() => {
                  setShowCreatePlan(false);
                  setEditPlanId(null);
                }}
              >
                キャンセル
              </button>
              <button style={btnPrimaryStyle} onClick={handleSavePlan} disabled={planSaveLoading}>
                {planSaveLoading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
