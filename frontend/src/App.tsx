import { useEffect, useState, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { api } from './api/client';
import LoginPage from './pages/LoginPage';
import StoreSelectPage from './pages/StoreSelectPage';
import PunchClockPage from './pages/PunchClockPage';
import DashboardPage from './pages/DashboardPage';
import StaffPage from './pages/StaffPage';
import ChecklistAdminPage from './pages/ChecklistAdminPage';
import PluginSettingsPage from './pages/PluginSettingsPage';
import ShiftPage from './pages/ShiftPage';

type Tab = 'punch' | 'dashboard' | 'staff' | 'checklist' | 'shift' | 'plugins';

export default function App() {
  const { user, loading, selectedStore, selectStore, signOut, stores } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('punch');
  const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(new Set());
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // 有効プラグインを取得
  useEffect(() => {
    if (!selectedStore) return;
    api.getPluginSettings(selectedStore.id).then(data => {
      const enabled = new Set<string>(
        data.plugins.filter((p: any) => p.enabled).map((p: any) => p.name)
      );
      setEnabledPlugins(enabled);
    }).catch(() => {});
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

  const isManager = selectedStore.role === 'owner' || selectedStore.role === 'manager';

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

      <main className="main-content">
        {activeTab === 'punch' && <PunchClockPage />}
        {activeTab === 'dashboard' && isManager && <DashboardPage />}
        {activeTab === 'shift' && enabledPlugins.has('shift') && <ShiftPage />}
        {activeTab === 'checklist' && isManager && enabledPlugins.has('check') && <ChecklistAdminPage />}
        {activeTab === 'staff' && isManager && <StaffPage />}
        {activeTab === 'plugins' && isManager && <PluginSettingsPage />}
      </main>

      <nav className="bottom-nav">
        <button
          className={`bottom-nav-item ${activeTab === 'punch' ? 'active' : ''}`}
          onClick={() => setActiveTab('punch')}
        >
          <span className="bottom-nav-icon">🕐</span>
          <span className="bottom-nav-label">打刻</span>
        </button>
        {isManager && (
          <button
            className={`bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="bottom-nav-icon">📊</span>
            <span className="bottom-nav-label">勤怠</span>
          </button>
        )}
        {enabledPlugins.has('shift') && (
          <button
            className={`bottom-nav-item ${activeTab === 'shift' ? 'active' : ''}`}
            onClick={() => setActiveTab('shift')}
          >
            <span className="bottom-nav-icon">📅</span>
            <span className="bottom-nav-label">シフト</span>
          </button>
        )}
        {isManager && enabledPlugins.has('check') && (
          <button
            className={`bottom-nav-item ${activeTab === 'checklist' ? 'active' : ''}`}
            onClick={() => setActiveTab('checklist')}
          >
            <span className="bottom-nav-icon">✅</span>
            <span className="bottom-nav-label">チェック</span>
          </button>
        )}
        {isManager && (
          <button
            className={`bottom-nav-item ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            <span className="bottom-nav-icon">👥</span>
            <span className="bottom-nav-label">スタッフ</span>
          </button>
        )}
        {isManager && (
          <button
            className={`bottom-nav-item ${activeTab === 'plugins' ? 'active' : ''}`}
            onClick={() => setActiveTab('plugins')}
          >
            <span className="bottom-nav-icon">⚙️</span>
            <span className="bottom-nav-label">設定</span>
          </button>
        )}
      </nav>
    </div>
  );
}
