import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

// バリアントごとの見た目。既存 16 種の btn クラスを 4 バリアントに収束させる。
const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'bg-surface text-text border border-border hover:bg-bg',
  danger: 'bg-error text-white hover:brightness-110',
  ghost: 'bg-transparent text-text hover:bg-bg',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1 text-sm',
  md: 'px-4 py-2 text-[15px]',
  lg: 'px-6 py-3 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', fullWidth = false, className, type, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        variantClass[variant],
        sizeClass[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
