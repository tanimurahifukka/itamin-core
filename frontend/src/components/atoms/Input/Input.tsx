import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

// 既存 .form-input / .break-input / .invite-input 等を単一コンポーネントに収束
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid = false, className, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-md border bg-surface px-3 py-2 text-[15px] text-text',
        'placeholder:text-text-subtle',
        'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid ? 'border-error' : 'border-border',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
