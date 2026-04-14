import { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  /** E2E テスト用に個別の data-testid を付ける場合に指定。 */
  dataTestId?: string;
}

export interface TabsProps<T extends string = string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * 旧 .view-mode-tabs / .view-mode-tab / .view-mode-tab.active のセグメント型タブ。
 * 親フレームに薄いグレー背景、選択中のみ白背景 + 影で浮き上がる UI。
 */
export const Tabs = <T extends string>({
  items,
  value,
  onChange,
  className,
}: TabsProps<T>) => (
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
