import { ReactNode, useId } from 'react';
import { cn } from '../../../lib/cn';
import { Label } from '../../atoms/Label';

export interface FormFieldProps {
  label: ReactNode;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: (ids: { inputId: string; errorId?: string; describedBy?: string }) => ReactNode;
}

// Label + input + エラー/ヒント表示を一貫して組み立てる Molecule。
// children は render prop で input の id / aria-describedby を受け取る。
export const FormField = ({
  label,
  required = false,
  error,
  hint,
  className,
  children,
}: FormFieldProps) => {
  const inputId = useId();
  const messageId = error || hint ? `${inputId}-msg` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={inputId} required={required}>
        {label}
      </Label>
      {children({ inputId, errorId: error ? messageId : undefined, describedBy: messageId })}
      {error ? (
        <p id={messageId} className="text-sm text-error-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-sm text-text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
};
