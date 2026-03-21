import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import StoreSelectPage from './pages/StoreSelectPage';
import PunchClockPage from './pages/PunchClockPage';
import DashboardPage from './pages/DashboardPage';
import StaffPage from './pages/StaffPage';
import ChecklistAdminPage from './pages/ChecklistAdminPage';

type Tab = 'punch' | 'dashboard' | 'staff' | 'checklist';

export default function App() {
  const { user, loading, selectedStore, selectStore, signOut, stores } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('punch');

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  const displayName = user.user_metadata?.full_name || user.email || '';
  const picture = user.user_metadata?.avatar_url;

  if (!selectedStore) {
    return (
      <div className="app">
        <header className="header">
          <div className="header-logo">ITA<span>MIN</span></div>
          <div className="header-user">
            {picture && <img src={picture} alt={displayName} />}
            <span>{displayName}</span>
            <button onClick={signOut}>ログアウト</button>
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
            style={{ cursor: stores.length > 1 ? 'pointer' : 'default', textDecoration: stores.length > 1 ? 'underline' : 'none' }}
            onClick={() => stores.length > 1 && selectStore(null)}
          >
            {selectedStore.name}
          </span>
          {picture && <img src={picture} alt={displayName} />}
          <button onClick={signOut}>ログアウト</button>
        </div>
      </header>

      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'punch' ? 'active' : ''}`}
          onClick={() => setActiveTab('punch')}
        >
          打刻
        </button>
        {isManager && (
          <button
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            タイムカード管理
          </button>
        )}
        {isManager && (
          <button
            className={`nav-tab ${activeTab === 'checklist' ? 'active' : ''}`}
            onClick={() => setActiveTab('checklist')}
          >
            チェックリスト管理
          </button>
        )}
        {isManager && (
          <button
            className={`nav-tab ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            スタッフ管理
          </button>
        )}
      </nav>

      {activeTab === 'punch' && <PunchClockPage />}
      {activeTab === 'dashboard' && isManager && <DashboardPage />}
      {activeTab === 'checklist' && isManager && <ChecklistAdminPage />}
      {activeTab === 'staff' && isManager && <StaffPage />}
    </div>
  );
}
