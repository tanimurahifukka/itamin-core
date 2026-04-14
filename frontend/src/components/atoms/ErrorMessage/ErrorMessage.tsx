import { HTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export interface ErrorMessageProps extends HTMLAttributes<HTMLDivElement> {}

/**
 * 赤系背景のエラー通知ブロック。旧 .error-msg の置き換え。
 * フォーム内エラー表示等に使う。単一行のインライン注釈には使わない。
 */
export const ErrorMessage = ({ className, children, ...props }: ErrorMessageProps) => (
  <div
    role="alert"
    className={cn(
      'my-3 rounded-lg bg-[#fff0f0] px-4 py-3 text-[0.9rem] text-[#e94560]',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
