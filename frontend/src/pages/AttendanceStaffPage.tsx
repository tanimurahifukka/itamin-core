/**
 * LINE打刻 スタッフメインページ
 * S01〜S05 をタブ/ナビゲーションで切り替える
 */
import { useState, useCallback } from 'react';
import AttendanceHomePage from './attendance/AttendanceHomePage';
import AttendanceHistoryPage from './attendance/AttendanceHistoryPage';
import CorrectionRequestPage from './attendance/CorrectionRequestPage';
import AccountPage from './attendance/AccountPage';
import { Tabs } from '../components/molecules/Tabs';

type SubPage = 'home' | 'history' | 'correction' | 'account';

export default function AttendanceStaffPage() {
  const [subPage, setSubPage] = useState<SubPage>('home');
  const [correctionRecord, setCorrectionRecord] = useState<{ id?: string; businessDate?: string; clockInAt?: string; clockOutAt?: string } | undefined>(undefined);

  const handleNavigate = useCallback((page: string, data?: { record?: { id?: string; businessDate?: string; clockInAt?: string; clockOutAt?: string | null } }) => {
    if (page === 'correction' && data?.record) {
      const { clockOutAt, ...rest } = data.record;
      setCorrectionRecord({ ...rest, clockOutAt: clockOutAt ?? undefined });
    } else {
      setCorrectionRecord(undefined);
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
      <Tabs
        variant="underline"
        value={subPage}
        onChange={(key) => handleNavigate(key)}
        items={tabs.map(t => ({ value: t.key, label: t.label, dataTestId: `tab-${t.key}` }))}
      />

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
