import { MouseEvent, ReactNode, useEffect } from 'react';
import { cn } from '../../../lib/cn';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
}

const sizeClass: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

// 既存 .break-modal / .checklist-modal / .remove-modal / .clock-out-report-modal の
// 4 種類のモーダル構造を単一 Molecule に統合する。
export const Modal = ({
  open,
  onClose,
  title,
  children,
  actions,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) => {
  // Esc キーで閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const stop = (e: MouseEvent) => e.stopPropagation();
  const handleBackdrop = closeOnBackdrop ? onClose : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleBackdrop}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'w-full rounded-lg bg-surface p-6 shadow-xl',
          sizeClass[size],
        )}
        onClick={stop}
      >
        {title && (
          <h2 className="mb-4 text-lg font-semibold text-text">{title}</h2>
        )}
        <div className="mb-4 text-text">{children}</div>
        {actions && <div className="flex justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
};
