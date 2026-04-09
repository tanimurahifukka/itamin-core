import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { api } from './api/client';
import { getKioskStore, getKioskToken, clearKioskSession } from './api/kioskClient';
import KioskLoginPage from './pages/KioskLoginPage';
import KioskDashboard from './pages/KioskDashboard';
import LineLinkPage from './pages/attendance/LineLinkPage';
import LineMenuPage from './pages/attendance/LineMenuPage';
import LoginPage from './pages/LoginPage';
import PasswordChangePage from './pages/PasswordChangePage';
import StoreSelectPage from './pages/StoreSelectPage';
import PunchClockPage from './pages/PunchClockPage';
import DashboardPage from './pages/DashboardPage';
import StaffPage from './pages/StaffPage';
import ChecklistAdminPage from './pages/ChecklistAdminPage';
import StoreChecklistPage from './pages/StoreChecklistPage';
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
import MenuPage from './pages/MenuPage';
import SalesCapturePage from './pages/SalesCapturePage';
import AttendanceStaffPage from './pages/AttendanceStaffPage';
import AttendanceAdminPage from './pages/AttendanceAdminPage';
import KioskLinkPage from './pages/KioskLinkPage';
import HaccpAdminPage from './pages/HaccpAdminPage';

function decodeLineLoginStateStoreId(state: string | null): string | null {
  if (!state?.startsWith('itamin:')) return null;
  try {
    const encoded = state.slice('itamin:'.length);
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded));
    return typeof parsed?.storeId === 'string' && parsed.storeId.trim() ? parsed.storeId : null;
  } catch {
    return null;
  }
}

function getLineCallbackStoreId(searchParams: URLSearchParams): string | null {
  return (
    searchParams.get('storeId') ||
    decodeLineLoginStateStoreId(searchParams.get('state'))
  );
}

function getSavedStoreId(): string | null {
  try {
    const raw = window.localStorage.getItem('itamin_selectedStore');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === 'string' && parsed.id.trim() ? parsed.id : null;
  } catch {
    return null;
  }
}

// プラグイン名 → コンポーネント対応表
const PLUGIN_COMPONENTS: Record<string, React.ComponentType> = {
  punch: PunchClockPage,
  attendance: DashboardPage,
  staff: StaffPage,
  check: ChecklistAdminPage,
  store_check: StoreChecklistPage,
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
  menu: MenuPage,
  sales_capture: SalesCapturePage,
  line_attendance: AttendanceStaffPage,
  attendance_admin: AttendanceAdminPage,
  kiosk: KioskLinkPage,
  haccp_kiosk: HaccpAdminPage,
  settings: PluginSettingsPage,
};

interface PluginTab {
  name: string;
  label: string;
  icon: string;
}

// キオスクモード: /kiosk?store=<storeId> でアクセス
function KioskApp() {
  const searchParams = new URLSearchParams(window.location.search);
  const storeIdFromUrl = searchParams.get('store') || '';

  const [kioskStoreId, setKioskStoreId] = useState<string>(() => {
    const saved = getKioskStore();
    return saved?.storeId || storeIdFromUrl;
  });
  const [kioskStoreName, setKioskStoreName] = useState<string>(() => {
    return getKioskStore()?.storeName || '';
  });
  const [loggedIn, setLoggedIn] = useState<boolean>(() => {
    const token = getKioskToken();
    const saved = getKioskStore();
    return !!(token && saved);
  });

  if (!kioskStoreId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
        URLに ?store=店舗ID を指定してください
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <KioskLoginPage
        storeId={kioskStoreId}
        onLogin={(id, name) => {
          setKioskStoreId(id);
          setKioskStoreName(name);
          setLoggedIn(true);
        }}
      />
    );
  }

  return (
    <KioskDashboard
      storeId={kioskStoreId}
      storeName={kioskStoreName}
      onLogout={() => {
        clearKioskSession();
        setLoggedIn(false);
      }}
    />
  );
}

export default function App() {
  const { user, loading, selectedStore, selectStore, signOut, stores, requiresPasswordChange, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState('');
  const [tabs, setTabs] = useState<PluginTab[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // モバイル判定（フックは早期returnより前に宣言）
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

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

  // モバイルリサイズ検知
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCardClick = useCallback((tabName: string) => {
    setActiveTab(tabName);
  }, []);

  const handleBackToMenu = useCallback(() => {
    setActiveTab('');
  }, []);

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

  // LINE Login / 連携モード検知
  const [liffMode, setLiffMode] = useState<{
    active: boolean;
    checked: boolean;
    source?: 'entry' | 'callback';
    storeId?: string;
    lineUserId?: string;
    displayName?: string;
    pictureUrl?: string;
    message?: string;
    error?: string;
  }>({ active: false, checked: false });

  useEffect(() => {
    let cancelled = false;
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const authCode = searchParams.get('code');

    const handleLineCallback = async () => {
      if (pathname !== '/auth/line/callback' || !authCode) {
        return false;
      }

      const storeId = getLineCallbackStoreId(searchParams);
      if (!storeId) {
        if (!cancelled) {
          setLiffMode({
            active: false,
            checked: true,
            error: 'storeId を特定できませんでした。LINE Login のコールバックURLに ?storeId=... を付けるか、/api/auth/line/login?storeId=... からログインを開始してください。',
          });
        }
        return true;
      }

      try {
        const callbackRes = await api.lineCallback(
          storeId,
          authCode,
          searchParams.get('state') || undefined
        );

        if (cancelled) return true;

        if (callbackRes.linked) {
          // 連携済み → 打刻ページへ
          setLiffMode({
            active: true,
            checked: true,
            source: 'callback',
            storeId,
            lineUserId: callbackRes.lineUserId,
            displayName: callbackRes.displayName,
            pictureUrl: callbackRes.pictureUrl,
          });
          return true;
        }

        setLiffMode({
          active: true,
          checked: true,
          source: 'callback',
          storeId,
          lineUserId: callbackRes.lineUserId,
          displayName: callbackRes.displayName,
          pictureUrl: callbackRes.pictureUrl,
        });
      } catch (e: any) {
        if (!cancelled) {
          setLiffMode({
            active: false,
            checked: true,
            error: e.body?.error || e.message || 'LINEログインの処理に失敗しました',
          });
        }
      }

      return true;
    };

    const initLineLogin = async () => {
      const callbackHandled = await handleLineCallback();
      if (callbackHandled) return;

      // /liff パスまたは ?mode=liff は LINE Login 開始専用の入口として扱う
      const isLineEntry = pathname === '/liff' || searchParams.get('mode') === 'liff';
      if (isLineEntry) {
        const storeId =
          searchParams.get('storeId') ||
          selectedStore?.id ||
          getSavedStoreId();

        if (!storeId) {
          if (!cancelled) {
            setLiffMode({
              active: false,
              checked: true,
              error: 'storeId を特定できませんでした。LINE打刻URLに ?storeId=... を付けて開いてください。',
            });
          }
          return;
        }

        try {
          const loginRes = await api.getLineLoginUrl(storeId);
          if (!loginRes?.url) {
            throw new Error('LINEログインURLを取得できませんでした');
          }
          window.location.assign(loginRes.url);
          return;
        } catch (e: any) {
          if (!cancelled) {
            setLiffMode({
              active: false,
              checked: true,
              error: e.body?.error || e.message || 'LINEログインの開始に失敗しました',
            });
          }
        }
        return;
      }

      // 通常アクセス → LINE連携モードにしない
      if (!cancelled) {
        setLiffMode({ active: false, checked: true });
      }
    };
    initLineLogin();

    return () => {
      cancelled = true;
    };
  }, []);

  // キオスクモード判定（フック呼び出し後に行う）
  if (window.location.pathname === '/kiosk') {
    return <KioskApp />;
  }

  if (loading || !liffMode.checked) {
    return <div className="loading">読み込み中...</div>;
  }

  // LINE Login 経由
  if (liffMode.active && liffMode.lineUserId && liffMode.storeId) {
    // lineUserId + storeId がある → 連携済み → 打刻ページ
    return (
      <div className="app">
        <header className="header">
          <div className="header-logo">ITA<span>MIN</span></div>
        </header>
        <LineMenuPage
          lineUserId={liffMode.lineUserId}
          storeId={liffMode.storeId}
          displayName={liffMode.displayName}
          pictureUrl={liffMode.pictureUrl}
        />
      </div>
    );
  }

  if (liffMode.active) {
    // lineUserId はあるが未連携 → 連携コード入力ページ
    return (
      <div className="app">
        <header className="header">
          <div className="header-logo">ITA<span>MIN</span></div>
        </header>
        <LineLinkPage
          lineUserId={liffMode.lineUserId || ''}
          displayName={liffMode.displayName}
          pictureUrl={liffMode.pictureUrl}
          onLinked={() => {
            window.history.replaceState({}, '', '/');
            setLiffMode({
              active: false,
              checked: true,
              source: liffMode.source,
              storeId: liffMode.storeId,
              message: 'LINE連携が完了しました。LINEから打刻画面を開き直してください。',
            });
          }}
        />
      </div>
    );
  }

  if (liffMode.message || liffMode.error) {
    return (
      <div className="app">
        <header className="header">
          <div className="header-logo">ITA<span>MIN</span></div>
        </header>
        <div className="attendance-link-page">
          <div className="attendance-link-card">
            <h2 className="attendance-link-title">LINEログイン</h2>
            <div className={liffMode.error ? 'alert alert-error' : 'alert alert-success'}>
              {liffMode.error || liffMode.message}
            </div>
          </div>
        </div>
      </div>
    );
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

  // モバイルでactiveTabが空 → カードメニュー表示
  const showMobileMenu = isMobile && !activeTab && !tabsLoading;

  // 主要タブ（打刻・チェックリスト）を上段に大きく表示
  const primaryTabs = tabs.filter(t => ['punch', 'check'].includes(t.name));
  const secondaryTabs = tabs.filter(t => !['punch', 'check'].includes(t.name));

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

      {showMobileMenu ? (
        /* モバイルカードメニュー */
        <div className="mobile-card-menu">
          <div className="mobile-greeting">
            {new Date().getHours() < 12 ? 'おはようございます' : new Date().getHours() < 18 ? 'お疲れさまです' : 'おつかれさまです'}、{displayName.split(/[\s@]/)[0]} さん
          </div>

          {primaryTabs.length > 0 && (
            <div className="mobile-card-grid primary">
              {primaryTabs.map(tab => (
                <button
                  key={tab.name}
                  className="mobile-card primary"
                  onClick={() => handleCardClick(tab.name)}
                >
                  <span className="mobile-card-icon">{tab.icon}</span>
                  <span className="mobile-card-label">{tab.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mobile-card-grid secondary">
            {secondaryTabs.map(tab => (
              <button
                key={tab.name}
                className="mobile-card secondary"
                onClick={() => handleCardClick(tab.name)}
              >
                <span className="mobile-card-icon">{tab.icon}</span>
                <span className="mobile-card-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* 通常レイアウト */
        <div className="app-body">
          {!isMobile && (
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
          )}

          <main className="main-content">
            {isMobile && (
              <button className="mobile-back-btn" onClick={handleBackToMenu}>
                ← メニュー
              </button>
            )}
            {tabsLoading ? (
              <div className="loading" style={{ minHeight: '40vh' }}>読み込み中...</div>
            ) : ActiveComponent ? (
              <ActiveComponent />
            ) : (
              <div>利用可能な機能がありません。</div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
