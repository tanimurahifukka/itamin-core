import { HTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export type InlineToastType = 'success' | 'error';

export interface InlineToastProps extends HTMLAttributes<HTMLDivElement> {
  /** ページの toast.type をそのまま渡せるよう string も許容（不明値は error 扱い）。 */
  type: InlineToastType | (string & {});
}

const typeClass: Record<InlineToastType, string> = {
  success: 'bg-success-bg text-success-fg',
  error: 'bg-error-bg text-error-fg',
};

/**
 * ページ上部に絶対配置で一時表示するトースト。
 * 旧 .attendance-toast / .attendance-toast.success / .attendance-toast.error の代替。
 * グローバルな ToastContainer とは別の、画面ローカルな単発バナーに使う。
 * 親側で表示/非表示を制御する想定（自動消去ロジックは持たない）。
 */
export const InlineToast = ({ type, className, ...props }: InlineToastProps) => {
  const resolved = typeClass[type as InlineToastType] ?? typeClass.error;
  return (
    <div
      role="status"
      className={cn(
        'fixed left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-lg px-6 py-3 font-semibold',
        'animate-[toastIn_0.3s_ease]',
        resolved,
        className,
      )}
      {...props}
    />
  );
};
