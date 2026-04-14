import { cn } from '../../../lib/cn';

export interface SidebarTab {
  name: string;
  label: string;
  icon: string;
}

export interface SidebarCategory {
  key: string;
  label: string;
}

export interface SidebarCategorizedTabs {
  category: SidebarCategory;
  tabs: SidebarTab[];
}

export interface SidebarProps {
  categorizedTabs: SidebarCategorizedTabs[];
  activeTab: string;
  onSelect: (tabName: string) => void;
  className?: string;
}

/**
 * カテゴリ別タブを表示するメインナビゲーション。
 * 旧 .sidebar / .sidebar-category / .sidebar-nav / .sidebar-nav-item + .active ::before を束ねる。
 */
export const Sidebar = ({ categorizedTabs, activeTab, onSelect, className }: SidebarProps) => (
  <nav
    className={cn(
      'sticky top-14 h-[calc(100vh-56px)] w-[230px] flex-shrink-0 overflow-y-auto border-r border-border bg-surface py-3',
      className,
    )}
  >
    {categorizedTabs.map(({ category, tabs }) => (
      <div key={category.key} className="mb-1">
        <div className="px-5 pb-1 pt-2 text-[0.7rem] font-bold uppercase leading-none tracking-[0.08em] text-text-subtle">
          {category.label}
        </div>
        <ul className="flex flex-col gap-px px-2">
          {tabs.map(tab => {
            const active = activeTab === tab.name;
            return (
              <li key={tab.name}>
                <button
                  type="button"
                  onClick={() => onSelect(tab.name)}
                  className={cn(
                    'relative flex w-full items-center gap-2 rounded-md border-none bg-transparent px-3 py-2 text-left text-[0.88rem] font-medium leading-[1.5] tracking-[0.04em] text-text-muted transition-colors',
                    'hover:bg-[#f0f2f5] hover:text-text',
                    active && 'bg-primary-bg text-primary-hover font-semibold',
                    active &&
                      'before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-sm before:bg-primary',
                  )}
                >
                  <span className="w-5 flex-shrink-0 text-center text-base leading-none">
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ))}
  </nav>
);
