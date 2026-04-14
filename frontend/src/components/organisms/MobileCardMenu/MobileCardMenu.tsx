import { ReactNode } from 'react';

interface MenuTab {
  name: string;
  label: string;
  icon: string;
}

interface CategorizedTabs {
  category: { key: string; label: string };
  tabs: MenuTab[];
}

export interface MobileCardMenuProps {
  greeting: ReactNode;
  categorizedTabs: CategorizedTabs[];
  onSelect: (tabName: string) => void;
}

/**
 * モバイル時にトップ階層に表示するカードグリッドメニュー。
 * 旧 .mobile-card-menu / .mobile-greeting / .mobile-category-section /
 * .mobile-category-label / .mobile-card-grid / .mobile-card /
 * .mobile-card-icon / .mobile-card-label の代替。
 */
export const MobileCardMenu = ({
  greeting,
  categorizedTabs,
  onSelect,
}: MobileCardMenuProps) => (
  <div className="mx-auto max-w-[500px] px-4 py-5">
    <div className="mb-5 px-1 text-[1.1rem] font-semibold text-[#1a1a2e]">
      {greeting}
    </div>

    {categorizedTabs.map(({ category, tabs }) => (
      <div key={category.key} className="mb-4">
        <div className="mb-2 px-1 text-[0.75rem] font-bold uppercase tracking-[0.06em] text-text-subtle">
          {category.label}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {tabs.map(tab => (
            <button
              key={tab.name}
              type="button"
              onClick={() => onSelect(tab.name)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-border-light bg-surface px-3 py-3.5 text-left font-sans transition-all hover:border-[#cbd5e1] hover:bg-[#f8fafc] active:scale-[0.98]"
            >
              <span className="flex-shrink-0 text-[1.3rem] leading-none">{tab.icon}</span>
              <span className="text-[0.88rem] font-semibold leading-tight text-[#1a1a2e]">
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);
