import { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export interface HeaderProps {
  onLogoClick?: () => void;
  /** ヘッダー右側に表示するコンテンツ（ユーザーメニュー等）。 */
  children?: ReactNode;
  className?: string;
}

/**
 * アプリ全体で使う共通ヘッダー。旧 .header / .header-logo / .header-user を束ねる。
 * ロゴの MIN 部分を #2563eb 強調、高さ 56px、下線 #d4d9df を維持。
 */
export const Header = ({ onLogoClick, children, className }: HeaderProps) => {
  const logoClickable = typeof onLogoClick === 'function';
  return (
    <header
      className={cn(
        'sticky top-0 z-[100] flex h-14 items-center justify-between border-b border-border bg-surface text-text',
        'px-3.5 py-2.5 md:px-6 md:py-3',
        className,
      )}
    >
      <div
        className={cn(
          'text-[1.1rem] font-bold tracking-[2px] text-text md:text-[1.25rem]',
          logoClickable && 'cursor-pointer',
        )}
        onClick={onLogoClick}
        role={logoClickable ? 'button' : undefined}
      >
        ITA<span className="text-primary">MIN</span>
      </div>
      {children && (
        <div className="flex items-center gap-3">{children}</div>
      )}
    </header>
  );
};
