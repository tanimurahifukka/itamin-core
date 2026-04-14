import { HTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export type StatusDotState = 'not_clocked_in' | 'working' | 'on_break' | 'completed';

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  state: StatusDotState;
}

// 既存 .status-* の配色を継承（styles.css 3002-3005 行目由来）
const stateClass: Record<StatusDotState, string> = {
  not_clocked_in: 'bg-[color:var(--color-bg)]',
  working: 'bg-success-bg',
  on_break: 'bg-warn-bg',
  completed: 'bg-info-bg',
};

export const StatusDot = ({ state, className, ...props }: StatusDotProps) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-block h-2.5 w-2.5 rounded-full',
      stateClass[state],
      className,
    )}
    {...props}
  />
);
