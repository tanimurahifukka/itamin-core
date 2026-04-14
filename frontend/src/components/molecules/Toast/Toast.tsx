import { useEffect, useState } from 'react';
import { cn } from '../../../lib/cn';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
let addToastFn: ((item: ToastItem) => void) | null = null;

export function showToast(message: string, type: ToastType = 'info') {
  addToastFn?.({ id: ++toastId, message, type });
}

// バリアント別の背景・テキスト・ボーダー（旧 .toast-success/error/info の配色を踏襲）
const toastClass: Record<ToastType, string> = {
  success: 'bg-success-bg text-success-fg border border-green-500',
  error: 'bg-error-bg text-error-fg border border-red-200',
  info: 'bg-info-bg text-info-fg border border-blue-200',
};

const iconClass: Record<ToastType, string> = {
  success: 'bg-green-500 text-white',
  error: 'bg-error-fill text-white',
  info: 'bg-blue-500 text-white',
};

const iconChar: Record<ToastType, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    addToastFn = (item) => setToasts(prev => [...prev, item]);
    return () => { addToastFn = null; };
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts(prev => prev.slice(1));
    }, 3000);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        'fixed top-[68px] right-5 z-[9999] flex flex-col gap-2 pointer-events-none',
        // モバイルでは下中央寄せ（旧 .toast-container メディアクエリ相当）
        'max-md:top-auto max-md:bottom-5 max-md:left-3 max-md:right-3',
      )}
    >
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-2.5 rounded-[10px] px-5 py-3 text-[0.9rem] font-medium shadow-[0_4px_16px_rgba(0,0,0,0.12)]',
            'pointer-events-auto max-w-[360px] max-md:max-w-full',
            'animate-[toastSlideIn_0.3s_ease,toastFadeOut_0.4s_ease_2.6s_forwards]',
            toastClass[t.type],
          )}
        >
          <span
            className={cn(
              'flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-[0.75rem] font-bold',
              iconClass[t.type],
            )}
          >
            {iconChar[t.type]}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
