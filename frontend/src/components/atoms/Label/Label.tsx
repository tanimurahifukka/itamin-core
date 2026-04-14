import { LabelHTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

// 既存 .form-label / .invite-label / .checklist-text-label の代替
export const Label = ({ required = false, className, children, ...props }: LabelProps) => (
  <label
    className={cn(
      'block text-sm font-semibold text-text',
      className,
    )}
    {...props}
  >
    {children}
    {required && <span className="ml-1 text-error" aria-hidden="true">*</span>}
  </label>
);
