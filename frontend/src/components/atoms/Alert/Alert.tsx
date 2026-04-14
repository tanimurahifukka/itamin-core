import { HTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export type AlertVariant = 'success' | 'error' | 'info' | 'warning';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

const variantClass: Record<AlertVariant, string> = {
  success: 'bg-success-bg text-success-fg',
  error: 'bg-error-bg text-error-fg',
  info: 'bg-info-bg text-info-fg',
  warning: 'bg-warn-bg text-warn-fg',
};

/**
 * バナー型の通知ブロック。旧 .alert .alert-error / .alert-success は
 * styles.css に定義がなく実質スタイル無しだったため、本コンポーネントで
 * 正式に色を当てる。フォーム内の単一エラー注釈には ErrorMessage を使う。
 */
export const Alert = ({ variant = 'info', className, ...props }: AlertProps) => (
  <div
    role={variant === 'error' ? 'alert' : 'status'}
    className={cn(
      'my-3 rounded-md px-4 py-3 text-[0.9rem]',
      variantClass[variant],
      className,
    )}
    {...props}
  />
);
