/**
 * LINE打刻 管理者メインページ
 * A01〜A06 をタブ切り替え
 */
import { useState, useCallback } from 'react';
import TodayBoardPage from './admin/attendance/TodayBoardPage';
import MonthlyListPage from './admin/attendance/MonthlyListPage';
import StaffDetailPage from './admin/attendance/StaffDetailPage';
import CorrectionApprovalPage from './admin/attendance/CorrectionApprovalPage';
import LineLinkManagePage from './admin/attendance/LineLinkManagePage';
import PolicySettingsPage from './admin/attendance/PolicySettingsPage';

type SubPage = 'today' | 'monthly' | 'staff_detail' | 'corrections' | 'line_links' | 'policy';

export default function AttendanceAdminPage() {
  const [subPage, setSubPage] = useState<SubPage>('today');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const handleSelectStaff = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setSubPage('staff_detail');
  }, []);

  const tabs: { key: SubPage; label: string }[] = [
    { key: 'today', label: '今日の出勤' },
    { key: 'monthly', label: '月次一覧' },
    { key: 'corrections', label: '修正申請' },
    { key: 'line_links', label: 'LINE連携' },
    { key: 'policy', label: 'ポリシー' },
  ];

  return (
    <div className="attendance-admin-page">
      <div className="attendance-admin-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`attendance-admin-tab ${subPage === tab.key ? 'active' : ''}`}
            onClick={() => { setSubPage(tab.key); setSelectedUserId(null); }}
            data-testid={`admin-tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="attendance-admin-content">
        {subPage === 'today' && <TodayBoardPage onSelectStaff={handleSelectStaff} />}
        {subPage === 'monthly' && <MonthlyListPage onSelectStaff={handleSelectStaff} />}
        {subPage === 'staff_detail' && selectedUserId && (
          <StaffDetailPage userId={selectedUserId} onBack={() => setSubPage('today')} />
        )}
        {subPage === 'corrections' && <CorrectionApprovalPage />}
        {subPage === 'line_links' && <LineLinkManagePage />}
        {subPage === 'policy' && <PolicySettingsPage />}
      </div>
    </div>
  );
}
