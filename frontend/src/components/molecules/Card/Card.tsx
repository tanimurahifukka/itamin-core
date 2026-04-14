import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  children: ReactNode;
}

const paddingClass: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

// 汎用カード。既存 .summary-card / .daily-report-card / .store-card / .invite-card /
// .mobile-card / .staff-item-card の代替として使う。
export const Card = ({ padding = 'md', className, children, ...props }: CardProps) => (
  <div
    className={cn(
      'rounded-lg border border-border-light bg-surface shadow-sm',
      paddingClass[padding],
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
