import { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export interface MonthNavigationProps {
  label: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  prevTestId?: string;
  nextTestId?: string;
  /** 中央寄せ版（attendance pages）か左詰め版（DashboardPage）か。 */
  align?: 'center' | 'start';
  className?: string;
}

/**
 * 月ナビゲーションバー（前月 ◀ / 年月ラベル / 翌月 ▶）。
 * 旧 .month-nav + .month-nav-btn + .month-nav-label と
 * .attendance-month-nav + .attendance-month-label を統合。
 */
export const MonthNavigation = ({
  label,
  onPrev,
  onNext,
  prevTestId,
  nextTestId,
  align = 'start',
  className,
}: MonthNavigationProps) => (
  <div
    className={cn(
      'mb-4 flex items-center',
      align === 'center' ? 'justify-center gap-4' : 'gap-3',
      className,
    )}
  >
    <button
      type="button"
      onClick={onPrev}
      data-testid={prevTestId}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-[0.9rem] font-sans transition-colors hover:bg-[#f0f2f5]"
      aria-label="前月"
    >
      ◀
    </button>
    <span
      className={cn(
        'text-center',
        align === 'center'
          ? 'text-base font-semibold'
          : 'min-w-[100px] text-[0.95rem] font-medium',
      )}
    >
      {label}
    </span>
    <button
      type="button"
      onClick={onNext}
      data-testid={nextTestId}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-[0.9rem] font-sans transition-colors hover:bg-[#f0f2f5]"
      aria-label="翌月"
    >
      ▶
    </button>
  </div>
);
