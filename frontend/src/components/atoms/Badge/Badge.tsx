import { HTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export type BadgeVariant =
  | 'neutral'
  | 'working'
  | 'on_break'
  | 'completed'
  | 'needs_review'
  | 'cancelled'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'inactive';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

// 既存 .badge-* クラスと同じ配色マッピング（styles.css 3123-3133 行目由来）
const variantClass: Record<BadgeVariant, string> = {
  neutral: 'bg-[color:var(--color-bg)] text-text-subtle',
  working: 'bg-success-bg text-success-fg',
  on_break: 'bg-warn-bg text-warn-fg',
  completed: 'bg-info-bg text-info-fg',
  needs_review: 'bg-error-bg text-error-fg',
  cancelled: 'bg-[color:var(--color-bg)] text-text-subtle',
  pending: 'bg-warn-bg text-warn-fg',
  approved: 'bg-success-bg text-success-fg',
  rejected: 'bg-error-bg text-error-fg',
  active: 'bg-success-bg text-success-fg',
  inactive: 'bg-[color:var(--color-bg)] text-text-subtle',
};

export const Badge = ({ variant = 'neutral', className, ...props }: BadgeProps) => (
  <span
    className={cn(
      'inline-block rounded-[10px] px-[10px] py-[2px] text-xs font-semibold',
      variantClass[variant],
      className,
    )}
    {...props}
  />
);
