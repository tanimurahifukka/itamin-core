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
import SwitchBotReadingsPage from './pages/SwitchBotReadingsPage';
import CustomersPage from './pages/CustomersPage';
import OrganizationsPage from './pages/OrganizationsPage';
import PlatformDashboard from './pages/PlatformDashboard';
import NfcCleanPage from './pages/NfcCleanPage';
import NfcPunchPage from './pages/NfcPunchPage';
import NfcLocationsPage from './pages/NfcLocationsPage';
import ReservationTablePage from './pages/reservation/ReservationTablePage';
import ReservationTimeslotPage from './pages/reservation/ReservationTimeslotPage';
import ReservationSchoolPage from './pages/reservation/ReservationSchoolPage';
import ReservationEventPage from './pages/reservation/ReservationEventPage';
import PublicTableBookingPage from './pages/reservation/PublicTableBookingPage';
import PublicTimeslotBookingPage from './pages/reservation/PublicTimeslotBookingPage';
import PublicSchoolBookingPage from './pages/reservation/PublicSchoolBookingPage';
import PublicEventBookingPage from './pages/reservation/PublicEventBookingPage';
import CalendarAdminPage from './pages/CalendarAdminPage';
import ShiftMultiPage from './pages/ShiftMultiPage';
import { PageTitleBar } from './components/organisms/PageTitleBar';
import { Header } from './components/organisms/Header';
import { Sidebar } from './components/organisms/Sidebar';
import { ProfileDropdown } from './components/organisms/ProfileDropdown';
import { MobileCardMenu } from './components/organisms/MobileCardMenu';
import { Button } from './components/atoms/Button';
import { Loading } from './components/atoms/Loading';
import { Alert } from './components/atoms/Alert';

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
  haccp: ChecklistAdminPage,
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
  nfc_cleaning: NfcLocationsPage,
  switchbot: SwitchBotReadingsPage,
  customers: CustomersPage,
  calendar: CalendarAdminPage,
  reservation_table: ReservationTablePage,
  reservation_timeslot: ReservationTimeslotPage,
  reservation_school: ReservationSchoolPage,
  reservation_event: ReservationEventPage,
  settings: PluginSettingsPage,
};

interface PluginTab {
  name: string;
  label: string;
  icon: string;
}

// Sidebar category definitions for grouping navigation items
interface SidebarCategory {
  key: string;
  label: string;
  pluginNames: string[];
}

const SIDEBAR_CATEGORIES: SidebarCategory[] = [
  { key: 'daily', label: '日常業務', pluginNames: ['punch', 'attendance', 'attendance_admin', 'line_attendance', 'haccp', 'daily_report'] },
  { key: 'scheduling', label: 'シフト・予定', pluginNames: ['shift', 'shift_request', 'calendar', 'paid_leave'] },
  { key: 'staff_comm', label: 'スタッフ・連絡', pluginNames: ['staff', 'notice'] },
  { key: 'store_ops', label: '店舗管理', pluginNames: ['inventory', 'menu', 'sales_capture', 'expense'] },
  { key: 'monitoring', label: 'モニタリング', pluginNames: ['overtime_alert', 'consecutive_work'] },
  { key: 'reservation', label: '予約管理', pluginNames: ['reservation_table', 'reservation_timeslot', 'reservation_school', 'reservation_event'] },
  { key: 'customers', label: '顧客', pluginNames: ['customers', 'feedback'] },
  { key: 'devices', label: 'デバイス連携', pluginNames: ['kiosk', 'nfc_cleaning', 'switchbot'] },
  { key: 'system', label: 'システム', pluginNames: ['settings'] },
];

function groupTabsByCategory(tabs: PluginTab[]): { category: SidebarCategory; tabs: PluginTab[] }[] {
  const tabSet = new Set(tabs.map(t => t.name));
  const grouped: { category: SidebarCategory; tabs: PluginTab[] }[] = [];
  const assigned = new Set<string>();

  for (const cat of SIDEBAR_CATEGORIES) {
    const catTabs = cat.pluginNames
      .filter(name => tabSet.has(name) && !assigned.has(name))
      .map(name => tabs.find(t => t.name === name)!);
    if (catTabs.length > 0) {
      grouped.push({ category: cat, tabs: catTabs });
      catTabs.forEach(t => assigned.add(t.name));
    }
  }

  // Any tabs not assigned to a category go into a fallback group
  const unassigned = tabs.filter(t => !assigned.has(t.name));
  if (unassigned.length > 0) {
    grouped.push({ category: { key: 'other', label: 'その他', pluginNames: [] }, tabs: unassigned });
  }

  return grouped;
}

// キオスクモード: /kiosk?store=<storeId> でアクセス
function KioskApp() {
  const searchParams = new URLSearchParams(window.location.search);
  const storeIdFromUrl = searchParams.get('store') || '';

  const [kioskStoreId, setKioskStoreId] = useState<string>(() => {
    const saved = getKioskStore();
    // URL パラメータが明示的に指定されていて保存済みと異なる場合、旧セッションをクリア
    if (storeIdFromUrl && saved?.storeId && storeIdFromUrl !== saved.storeId) {
      clearKioskSession();
      return storeIdFromUrl;
    }
    return storeIdFromUrl || saved?.storeId || '';
  });
  const [kioskStoreName, setKioskStoreName] = useState<string>(() => {
    const saved = getKioskStore();
    if (storeIdFromUrl && saved?.storeId && storeIdFromUrl !== saved.storeId) {
      return '';
    }
    return saved?.storeName || '';
  });
  const [loggedIn, setLoggedIn] = useState<boolean>(() => {
    const token = getKioskToken();
    const saved = getKioskStore();
    // URL パラメータで別店舗を指定した場合はログアウト状態にする
    if (storeIdFromUrl && saved?.storeId && storeIdFromUrl !== saved.storeId) {
      return false;
    }
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

// ProfileDropdown extracted to components/organisms/ProfileDropdown.

export default function App() {
  const { user, loading, selectedStore, selectStore, signOut, stores, requiresPasswordChange, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState('');
  const [tabs, setTabs] = useState<PluginTab[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // モバイル判定（フックは早期returnより前に宣言）
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  const loadTabs = useCallback(async (background = false) => {
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
      const pluginMap = new Map<string, { config?: Record<string, unknown> }>(data.plugins.map((p: { name: string; config?: Record<string, unknown> }) => [p.name, p]));
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
  }, [selectedStore]);

  // プラグイン権限からタブを動的生成
  useEffect(() => {
    loadTabs();
  }, [loadTabs]);

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
  }, [loadTabs]);

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
      } catch (e: unknown) {
        if (!cancelled) {
          const err = e as { body?: { error?: string }; message?: string };
          setLiffMode({
            active: false,
            checked: true,
            error: err.body?.error || err.message || 'LINEログインの処理に失敗しました',
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
        } catch (e: unknown) {
          const err = e as { body?: { error?: string }; message?: string };
          if (!cancelled) {
            setLiffMode({
              active: false,
              checked: true,
              error: err.body?.error || err.message || 'LINEログインの開始に失敗しました',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // キオスクモード判定（フック呼び出し後に行う）
  if (window.location.pathname === '/kiosk') {
    return <KioskApp />;
  }

  // NFC チェック（認証不要の公開ページ）
  if (window.location.pathname === '/nfc/clean') {
    return <NfcCleanPage />;
  }

  // NFC 打刻（認証不要の公開ページ、PIN 認証）
  if (window.location.pathname === '/nfc/punch') {
    return <NfcPunchPage />;
  }

  // 公開テーブル予約（認証不要、slug ベース: /r/:slug/table）
  if (/^\/r\/[^/]+\/table/.test(window.location.pathname)) {
    return <PublicTableBookingPage />;
  }
  if (/^\/r\/[^/]+\/timeslot/.test(window.location.pathname)) {
    return <PublicTimeslotBookingPage />;
  }
  if (/^\/r\/[^/]+\/school/.test(window.location.pathname)) {
    return <PublicSchoolBookingPage />;
  }
  if (/^\/r\/[^/]+\/event/.test(window.location.pathname)) {
    return <PublicEventBookingPage />;
  }

  // 組織管理・プラットフォーム管理ルート
  const pathname = window.location.pathname;
  if (pathname === '/organizations' || pathname === '/platform' || pathname === '/shift-multi') {
    if (loading) {
      return <Loading />;
    }
    if (!user) {
      return <LoginPage />;
    }
    const displayName = user.user_metadata?.full_name || user.email || '';
    const pageContent = pathname === '/organizations'
      ? <OrganizationsPage />
      : pathname === '/shift-multi'
        ? <ShiftMultiPage />
        : <PlatformDashboard />;
    return (
      <div className="flex min-h-screen flex-col">
        <Header onLogoClick={() => { window.location.href = '/'; }}>
          <span className="mr-3 text-text-muted">{displayName}</span>
          <Button variant="secondary" size="sm" onClick={signOut}>ログアウト</Button>
        </Header>
        <main className="w-full min-w-0 max-w-[960px] flex-1 px-8 py-7">
          {pageContent}
        </main>
      </div>
    );
  }

  if (loading || !liffMode.checked) {
    return <Loading />;
  }

  // LINE Login 経由
  if (liffMode.active && liffMode.lineUserId && liffMode.storeId) {
    // lineUserId + storeId がある → 連携済み → 打刻ページ
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
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
      <div className="flex min-h-screen flex-col">
        <Header />
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
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="attendance-link-page">
          <div className="attendance-link-card">
            <h2 className="attendance-link-title">LINEログイン</h2>
            <Alert variant={liffMode.error ? 'error' : 'success'}>
              {liffMode.error || liffMode.message}
            </Alert>
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

  if (!selectedStore) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header>
          <ProfileDropdown
            displayName={displayName}
            picture={picture}
            showProfileMenu={showProfileMenu}
            setShowProfileMenu={setShowProfileMenu}
            profileRef={profileRef}
            user={user}
            selectedStore={selectedStore}
            selectStore={selectStore}
            signOut={signOut}
          />
        </Header>
        <StoreSelectPage />
      </div>
    );
  }

  const ActiveComponent = PLUGIN_COMPONENTS[activeTab];

  // モバイルでactiveTabが空 → カードメニュー表示
  const showMobileMenu = isMobile && !activeTab && !tabsLoading;

  // Categorized sidebar groups
  const categorizedTabs = groupTabsByCategory(tabs);

  // Active tab label for page title
  const activeTabObj = tabs.find(t => t.name === activeTab);

  return (
    <div className="flex min-h-screen flex-col">
      <Header>
        <button
          type="button"
          onClick={() => selectStore(null)}
          className="cursor-pointer bg-transparent text-[0.85rem] text-text-muted transition-colors hover:text-text"
        >
          {selectedStore.name}
        </button>
        <ProfileDropdown
          displayName={displayName}
          picture={picture}
          showProfileMenu={showProfileMenu}
          setShowProfileMenu={setShowProfileMenu}
          profileRef={profileRef}
          user={user}
          selectedStore={selectedStore}
          selectStore={selectStore}
          signOut={signOut}
        />
      </Header>

      {showMobileMenu ? (
        <MobileCardMenu
          greeting={
            <>
              {new Date().getHours() < 12 ? 'おはようございます' : new Date().getHours() < 18 ? 'お疲れさまです' : 'おつかれさまです'}、{displayName.split(/[\s@]/)[0]} さん
            </>
          }
          categorizedTabs={categorizedTabs}
          onSelect={handleCardClick}
        />
      ) : (
        /* 通常レイアウト */
        <div className="flex min-h-[calc(100vh-56px)] flex-1">
          {!isMobile && (
            <Sidebar
              categorizedTabs={categorizedTabs}
              activeTab={activeTab}
              onSelect={setActiveTab}
            />
          )}

          <main className="w-full min-w-0 max-w-[960px] flex-1 px-8 py-7">
            {isMobile && (
              <button
                type="button"
                onClick={handleBackToMenu}
                className="mb-3 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3.5 py-2 text-[0.85rem] font-medium text-[#475569] transition-colors hover:bg-[#e2e8f0]"
              >
                ← メニュー
              </button>
            )}
            {activeTabObj && (
              <PageTitleBar icon={activeTabObj.icon} title={activeTabObj.label} />
            )}
            {tabsLoading ? (
              <Loading minHeight="40vh" />
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
