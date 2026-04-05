/**
 * LINE リッチメニューから開くメインページ
 * 打刻・シフト・チェックリスト等の全機能をタブ切り替えで提供
 */
import { useState } from 'react';
import LinePunchPage from './LinePunchPage';
import LineShiftPage from './LineShiftPage';
import LineShiftRequestPage from './LineShiftRequestPage';
import LineHistoryPage from './LineHistoryPage';
import LineChecklistPage from './LineChecklistPage';
import LineNoticePage from './LineNoticePage';
import LineDailyReportPage from './LineDailyReportPage';

type Tab = 'punch' | 'shift' | 'shift_request' | 'history' | 'checklist' | 'notice' | 'daily_report';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'punch', label: '打刻', icon: '🕐' },
  { key: 'shift', label: 'シフト', icon: '📅' },
  { key: 'shift_request', label: 'シフト希望', icon: '✋' },
  { key: 'checklist', label: 'チェック', icon: '✅' },
  { key: 'notice', label: '連絡', icon: '📢' },
  { key: 'history', label: '履歴', icon: '📊' },
  { key: 'daily_report', label: '日報', icon: '📝' },
];

interface Props {
  lineUserId: string;
  storeId: string;
  displayName?: string;
  pictureUrl?: string;
  initialTab?: Tab;
}

export default function LineMenuPage({ lineUserId, storeId, displayName, pictureUrl, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'punch');

  return (
    <div className="line-menu-page">
      <div className="line-menu-tabs" data-testid="line-menu-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`line-menu-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`line-tab-${tab.key}`}
          >
            <span className="line-menu-tab-icon">{tab.icon}</span>
            <span className="line-menu-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="line-menu-content">
        {activeTab === 'punch' && <LinePunchPage lineUserId={lineUserId} storeId={storeId} displayName={displayName} pictureUrl={pictureUrl} />}
        {activeTab === 'shift' && <LineShiftPage lineUserId={lineUserId} storeId={storeId} />}
        {activeTab === 'shift_request' && <LineShiftRequestPage lineUserId={lineUserId} storeId={storeId} />}
        {activeTab === 'history' && <LineHistoryPage lineUserId={lineUserId} storeId={storeId} />}
        {activeTab === 'checklist' && <LineChecklistPage lineUserId={lineUserId} storeId={storeId} />}
        {activeTab === 'notice' && <LineNoticePage lineUserId={lineUserId} storeId={storeId} />}
        {activeTab === 'daily_report' && <LineDailyReportPage lineUserId={lineUserId} storeId={storeId} />}
      </div>
    </div>
  );
}
