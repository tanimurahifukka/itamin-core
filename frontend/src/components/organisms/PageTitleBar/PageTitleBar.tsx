import { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export interface PageTitleBarProps {
  icon?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}

// 既存 .page-title-bar / .page-title-icon / .page-title を Organism に束ねる。
// actions スロットを追加し、将来的にページ右上にボタンを置く余地を残す。
export const PageTitleBar = ({ icon, title, actions, className }: PageTitleBarProps) => (
  <div
    className={cn(
      'mb-4 flex items-center gap-2 border-b border-border-light pb-3',
      className,
    )}
  >
    {icon && <span className="text-[1.3rem] leading-none">{icon}</span>}
    <h1 className="m-0 flex-1 text-[1.2rem] font-bold tracking-[0.02em] text-text-body">
      {title}
    </h1>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);
