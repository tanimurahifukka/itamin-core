import { HTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export type StatusDotState =
  | 'not_clocked_in'
  | 'working'
  | 'on_break'
  | 'completed'
  /** 旧 .status-dot (緑 + パルス) 相当。勤務中アイコンとして使う。 */
  | 'working_pulse';

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  state: StatusDotState;
}

// 旧 .status-* と .status-dot の配色・サイズ・アニメーションを継承
const stateClass: Record<StatusDotState, string> = {
  not_clocked_in: 'h-2.5 w-2.5 bg-[color:var(--color-bg)]',
  working: 'h-2.5 w-2.5 bg-success-bg',
  on_break: 'h-2.5 w-2.5 bg-warn-bg',
  completed: 'h-2.5 w-2.5 bg-info-bg',
  working_pulse: 'h-2 w-2 bg-green-500 animate-[dotPulse_2s_ease-in-out_infinite]',
};

export const StatusDot = ({ state, className, ...props }: StatusDotProps) => (
  <span
    aria-hidden="true"
    className={cn('inline-block rounded-full', stateClass[state], className)}
    {...props}
  />
);
