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

// 旧 .line-menu-* の代替。LINE 用アイコン+ラベル 2 段タブ。
const LINE_TABS =
  'flex touch-pan-x gap-0.5 overflow-x-auto whitespace-nowrap bg-background-subtle px-1 pt-1';
const LINE_TAB_BASE =
  'inline-flex min-w-[52px] flex-shrink-0 cursor-pointer flex-col items-center gap-0.5 whitespace-nowrap border-none border-b-2 border-transparent bg-transparent px-2.5 py-2 text-[11px] text-sumi-600 font-sans';
const LINE_TAB_ACTIVE =
  'border-b-primary bg-surface font-semibold text-primary';

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
    <div className="min-h-[80vh]">
      <div className={LINE_TABS} data-testid="line-menu-tabs">
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`${LINE_TAB_BASE}${active ? ` ${LINE_TAB_ACTIVE}` : ''}`}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`line-tab-${tab.key}`}
            >
              <span className="text-[18px]">{tab.icon}</span>
              <span className="text-[10px]">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div>
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
