import { cn } from '../../../lib/cn';

export interface BreakMinutesFieldProps {
  value: number;
  onChange: (minutes: number) => void;
  presets?: readonly number[];
  max?: number;
  inputTestId?: string;
  className?: string;
}

const DEFAULT_PRESETS = [0, 15, 30, 45, 60] as const;

// 休憩時間を数値入力 + プリセットチップで選ばせる Molecule。
// 旧 .break-input-row / .break-input / .break-unit / .break-presets / .break-preset を統合。
export const BreakMinutesField = ({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  max = 480,
  inputTestId,
  className,
}: BreakMinutesFieldProps) => (
  <div className={cn('flex flex-col gap-4', className)}>
    <div className="flex items-center justify-center gap-2">
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        data-testid={inputTestId}
        className="w-[100px] rounded-[10px] border-2 border-border-light px-3 py-3 text-center text-2xl font-semibold text-text-body focus:border-magenta-500 focus:outline-none"
      />
      <span className="text-lg text-text-muted">分</span>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      {presets.map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            'rounded-full border px-3.5 py-2 text-sm transition-colors',
            value === m
              ? 'border-magenta-500 bg-magenta-500 text-white'
              : 'border-border-light bg-surface text-text-muted hover:border-magenta-500 hover:text-magenta-500',
          )}
        >
          {m}分
        </button>
      ))}
    </div>
  </div>
);
