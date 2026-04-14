import { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  text?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * リストや表が空のときに表示するブロック。
 * 旧 .empty-state / .empty-state-icon / .empty-state-text / .empty-state-hint を内包。
 * children が指定された場合はそちらが優先される。
 */
export const EmptyState = ({ icon, text, hint, className, children }: EmptyStateProps) => (
  <div className={cn('px-5 py-10 text-center', className)}>
    {children ?? (
      <>
        {icon && <div className="mb-3 text-[2.5rem] opacity-60">{icon}</div>}
        {text && <p className="mb-1.5 text-[0.95rem] text-text-muted">{text}</p>}
        {hint && <p className="text-[0.8rem] text-text-subtle">{hint}</p>}
      </>
    )}
  </div>
);
