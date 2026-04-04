/**
 * LINE打刻 スタッフメインページ
 * S01〜S05 をタブ/ナビゲーションで切り替える
 */
import { useState, useCallback } from 'react';
import AttendanceHomePage from './attendance/AttendanceHomePage';
import AttendanceHistoryPage from './attendance/AttendanceHistoryPage';
import CorrectionRequestPage from './attendance/CorrectionRequestPage';
import AccountPage from './attendance/AccountPage';

type SubPage = 'home' | 'history' | 'correction' | 'account';

export default function AttendanceStaffPage() {
  const [subPage, setSubPage] = useState<SubPage>('home');
  const [correctionRecord, setCorrectionRecord] = useState<any>(null);

  const handleNavigate = useCallback((page: string, data?: any) => {
    if (page === 'correction' && data?.record) {
      setCorrectionRecord(data.record);
    } else {
      setCorrectionRecord(null);
    }
    setSubPage(page as SubPage);
  }, []);

  const tabs: { key: SubPage; label: string }[] = [
    { key: 'home', label: '打刻' },
    { key: 'history', label: '履歴' },
    { key: 'account', label: 'アカウント' },
  ];

  return (
    <div className="attendance-staff-page">
      <div className="attendance-staff-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`attendance-staff-tab ${subPage === tab.key ? 'active' : ''}`}
            onClick={() => handleNavigate(tab.key)}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="attendance-staff-content">
        {subPage === 'home' && (
          <AttendanceHomePage onNavigate={handleNavigate} />
        )}
        {subPage === 'history' && (
          <AttendanceHistoryPage onNavigate={handleNavigate} />
        )}
        {subPage === 'correction' && (
          <CorrectionRequestPage
            record={correctionRecord}
            onSubmitted={() => handleNavigate('home')}
          />
        )}
        {subPage === 'account' && (
          <AccountPage />
        )}
      </div>
    </div>
  );
}
