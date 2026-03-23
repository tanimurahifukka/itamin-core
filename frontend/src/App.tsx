import { useEffect, useState, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { api } from './api/client';
import LoginPage from './pages/LoginPage';
import PasswordChangePage from './pages/PasswordChangePage';
import StoreSelectPage from './pages/StoreSelectPage';
import PunchClockPage from './pages/PunchClockPage';
import DashboardPage from './pages/DashboardPage';
import StaffPage from './pages/StaffPage';
import ChecklistAdminPage from './pages/ChecklistAdminPage';
import PluginSettingsPage from './pages/PluginSettingsPage';
import ShiftPage from './pages/ShiftPage';
import ShiftRequestPage from './pages/ShiftRequestPage';
import InventoryPage from './pages/InventoryPage';
import OvertimeAlertPage from './pages/OvertimeAlertPage';
import ConsecutiveWorkPage from './pages/ConsecutiveWorkPage';
import DailyReportPage from './pages/DailyReportPage';
import NoticePage from './pages/NoticePage';
import PaidLeavePage from './pages/PaidLeavePage';
import ExpensePage from './pages/ExpensePage';
import FeedbackPage from './pages/FeedbackPage';

// プラグイン名 → コンポーネント対応表
const PLUGIN_COMPONENTS: Record<string, React.ComponentType> = {
  punch: PunchClockPage,
  attendance: DashboardPage,
  staff: StaffPage,
  check: ChecklistAdminPage,
  shift: ShiftPage,
  shift_request: ShiftRequestPage,
  inventory: InventoryPage,
  overtime_alert: OvertimeAlertPage,
  consecutive_work: ConsecutiveWorkPage,
  daily_report: DailyReportPage,
  notice: NoticePage,
  paid_leave: PaidLeavePage,
  expense: ExpensePage,
  feedback: FeedbackPage,
  settings: PluginSettingsPage,
};

interface PluginTab {
  name: string;
  label: string;
  icon: string;
}

export default function App() {
  const { user, loading, selectedStore, selectStore, signOut, stores, requiresPasswordChange, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState('');
  const [tabs, setTabs] = useState<PluginTab[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const loadTabs = async (background = false) => {
    if (!selectedStore) {
      setTabs([]);
      setActiveTab('');
      setTabsLoading(false);
      return;
    }

    if (!background) {
      setTabsLoading(true);
      setTabs([]);
      setActiveTab('');
    }

    try {
      const data = await api.getPluginSettings(selectedStore.id);
      const myRole = selectedStore.role;
      const pluginMap = new Map<string, any>(data.plugins.map((p: any) => [p.name, p]));
      const allowStaffRequest = pluginMap.get('shift')?.config?.allow_staff_request ?? true;
      const visibleTabs: PluginTab[] = [];

      for (const p of data.plugins) {
        // 有効でない非コアプラグインはスキップ
        if (!p.enabled && !p.core) continue;
        if (p.name === 'shift_request' && !allowStaffRequest) continue;
        if (p.name === 'punch' && myRole === 'owner') continue;
        // 自分のロールがアクセス権限に含まれているか
        const allowed: string[] = p.allowedRoles || p.defaultRoles || [];
        if (!allowed.includes(myRole)) continue;
        // コンポーネントが存在するもののみ
        if (!PLUGIN_COMPONENTS[p.name]) continue;

        visibleTabs.push({ name: p.name, label: p.label, icon: p.icon });
      }

      setTabs(visibleTabs);
      setActiveTab(current => (
        visibleTabs.find(t => t.name === current) ? current : (visibleTabs[0]?.name || '')
      ));
    } catch {
      if (!background) {
        setTabs([]);
        setActiveTab('');
      }
    } finally {
      setTabsLoading(false);
    }
  };

  // プラグイン権限からタブを動的生成
  useEffect(() => {
    loadTabs();
  }, [selectedStore]);

  useEffect(() => {
    const handlePluginUpdate = () => {
      loadTabs();
    };
    const handleFocus = () => {
      loadTabs(true);
    };

    window.addEventListener('plugins-updated', handlePluginUpdate);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('plugins-updated', handlePluginUpdate);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedStore]);

  // Close profile menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (requiresPasswordChange) {
    return <PasswordChangePage changePassword={changePassword} signOut={signOut} />;
  }

  const displayName = user.user_metadata?.full_name || user.email || '';
  const picture = user.user_metadata?.avatar_url;

  const ProfileDropdown = () => (
    <div className="profile-area" ref={profileRef}>
      <button
        className="profile-trigger"
        onClick={() => setShowProfileMenu(!showProfileMenu)}
      >
        {picture ? (
          <img src={picture} alt={displayName} className="profile-avatar" />
        ) : (
          <span className="profile-avatar-placeholder">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="profile-name">{displayName}</span>
      </button>
      {showProfileMenu && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-name">{displayName}</div>
          {user.email && <div className="profile-dropdown-email">{user.email}</div>}
          <button className="profile-dropdown-logout" onClick={signOut}>
            ログアウト
          </button>
        </div>
      )}
    </div>
  );

  if (!selectedStore) {
    return (
      <div className="app">
        <header className="header">
          <div className="header-logo">ITA<span>MIN</span></div>
          <div className="header-user">
            <ProfileDropdown />
          </div>
        </header>
        <StoreSelectPage />
      </div>
    );
  }

  const ActiveComponent = PLUGIN_COMPONENTS[activeTab];

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">ITA<span>MIN</span></div>
        <div className="header-user">
          <span
            className="store-name-link"
            style={{ cursor: stores.length > 1 ? 'pointer' : 'default' }}
            onClick={() => stores.length > 1 && selectStore(null)}
          >
            {selectedStore.name}
          </span>
          <ProfileDropdown />
        </div>
      </header>

      <div className="app-body">
        <nav className="sidebar">
          <ul className="sidebar-nav">
            {tabs.map(tab => (
              <li key={tab.name}>
                <button
                  className={`sidebar-nav-item ${activeTab === tab.name ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.name)}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="main-content">
          {tabsLoading ? (
            <div className="loading" style={{ minHeight: '40vh' }}>読み込み中...</div>
          ) : ActiveComponent ? (
            <ActiveComponent />
          ) : (
            <div>利用可能な機能がありません。</div>
          )}
        </main>
      </div>
    </div>
  );
}
