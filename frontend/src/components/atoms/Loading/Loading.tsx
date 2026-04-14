import { HTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export interface LoadingProps extends HTMLAttributes<HTMLDivElement> {
  /** カスタム最小高さ（'40vh' 等）。指定なしでフルスクリーン高さ。 */
  minHeight?: string;
  message?: string;
}

/**
 * ローディング表示。スピナー + メッセージを縦並びに中央配置。
 * 旧 .loading（min-height: 100vh + ::before スピナー）の置き換え。
 * 既存の `.loading-spin` keyframes（styles.css）を arbitrary value で参照する。
 */
export const Loading = ({
  minHeight,
  message = '読み込み中...',
  className,
  style,
  ...props
}: LoadingProps) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center bg-bg text-[0.95rem] text-[#888]',
      !minHeight && 'min-h-screen',
      className,
    )}
    style={minHeight ? { minHeight, ...style } : style}
    {...props}
  >
    <span
      aria-hidden="true"
      className="mb-4 h-9 w-9 rounded-full border-[3px] border-border-light border-t-[#e94560] animate-[loading-spin_0.7s_linear_infinite]"
    />
    {message}
  </div>
);
