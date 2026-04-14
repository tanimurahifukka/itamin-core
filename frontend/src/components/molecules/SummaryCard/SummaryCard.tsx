import { ReactNode, HTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export type SummaryCardVariant = 'default' | 'working' | 'finished' | 'hours' | 'labor';

export interface SummaryCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: SummaryCardVariant;
  /** カード上段に表示する数値（または ReactNode）。 */
  value: ReactNode;
  /** カード下段に表示するラベル。 */
  label: ReactNode;
  /** 数値表示部に追加で適用するクラス（フォントサイズや色のオーバーライド用）。 */
  valueClassName?: string;
}

// バリアント別の左ボーダー色（旧 .summary-card.* と一致）
const variantBorderClass: Record<SummaryCardVariant, string> = {
  default: 'border-l-transparent',
  working: 'border-l-[#22c55e]',
  finished: 'border-l-[#2563eb]',
  hours: 'border-l-[#f59e0b]',
  labor: 'border-l-[#8b5cf6]',
};

// バリアント別の数値色
const variantNumberColor: Record<SummaryCardVariant, string> = {
  default: 'text-text',
  working: 'text-[#16a34a]',
  finished: 'text-[#2563eb]',
  hours: 'text-[#d97706]',
  labor: 'text-[#7c3aed]',
};

/**
 * ダッシュボード上段の数値カード（勤務中 / 退勤済み / 合計時間 / 人件費 等）。
 * 旧 .summary-card / .summary-card.<variant> / .summary-number / .summary-label を統合。
 */
export const SummaryCard = ({
  variant = 'default',
  value,
  label,
  className,
  valueClassName,
  ...props
}: SummaryCardProps) => (
  <div
    className={cn(
      'rounded-xl border-l-4 bg-surface px-4 py-[18px] text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]',
      variantBorderClass[variant],
      className,
    )}
    {...props}
  >
    <div
      className={cn(
        'text-[1.8rem] font-bold leading-tight tabular-nums',
        variantNumberColor[variant],
        valueClassName,
      )}
    >
      {value}
    </div>
    <div className="mt-1 text-[0.8rem] text-[#888]">{label}</div>
  </div>
);
