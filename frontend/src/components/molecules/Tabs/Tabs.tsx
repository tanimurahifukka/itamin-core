import { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  /** E2E テスト用に個別の data-testid を付ける場合に指定。 */
  dataTestId?: string;
}

export type TabsVariant = 'segmented' | 'underline';

export interface TabsProps<T extends string = string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 'segmented' = グレーパッド + 白カード（旧 .view-mode-tab）、
   *  'underline' = 下線移動型（旧 .attendance-*-tab）。 */
  variant?: TabsVariant;
  className?: string;
}

/**
 * 旧 .view-mode-tabs / .view-mode-tab (segmented) と
 * .attendance-staff-tabs / .attendance-admin-tabs (underline) を統合。
 */
export const Tabs = <T extends string>({
  items,
  value,
  onChange,
  variant = 'segmented',
  className,
}: TabsProps<T>) => {
  if (variant === 'underline') {
    return (
      <div
        className={cn(
          'mb-4 flex gap-1 overflow-x-auto border-b-2 border-[#e5e7eb]',
          className,
        )}
      >
        {items.map(item => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              data-testid={item.dataTestId}
              className={cn(
                'cursor-pointer whitespace-nowrap border-none border-b-2 border-transparent bg-transparent px-4 py-2 font-sans text-sm transition-colors -mb-0.5',
                active
                  ? 'border-b-primary font-semibold text-primary'
                  : 'text-[#6b7280]',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'mb-4 inline-flex w-fit gap-1 rounded-lg bg-[#e8edf3] p-[3px]',
        className,
      )}
    >
      {items.map(item => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            data-testid={item.dataTestId}
            className={cn(
              'cursor-pointer rounded-md border-none px-5 py-2 font-sans text-[0.85rem] font-medium transition-all',
              active
                ? 'bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                : 'bg-transparent text-text-muted',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
};
