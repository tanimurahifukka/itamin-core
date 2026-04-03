/**
 * 15分刻みのタイムピッカー（時:分 を select x2 で選択）
 */

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

interface TimePicker15Props {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

export default function TimePicker15({ value, onChange, style, ...rest }: TimePicker15Props) {
  const [h, rawM] = (value || '00:00').split(':');
  // 最も近い15分に丸める
  const mNum = parseInt(rawM || '0', 10);
  const m = String(Math.round(mNum / 15) * 15 % 60).padStart(2, '0');

  const selectStyle: React.CSSProperties = {
    padding: '8px 4px',
    border: '1px solid #d4d9df',
    borderRadius: 6,
    fontFamily: 'inherit',
    fontSize: '1rem',
    background: 'white',
    cursor: 'pointer',
    textAlign: 'center' as const,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, ...style }} data-testid={rest['data-testid']}>
      <select
        value={h}
        onChange={e => onChange(`${e.target.value}:${m}`)}
        style={{ ...selectStyle, width: 60 }}
      >
        {HOURS.map(hh => (
          <option key={hh} value={hh}>{hh}</option>
        ))}
      </select>
      <span style={{ fontWeight: 600, color: '#666' }}>:</span>
      <select
        value={m}
        onChange={e => onChange(`${h}:${e.target.value}`)}
        style={{ ...selectStyle, width: 56 }}
      >
        {MINUTES.map(mm => (
          <option key={mm} value={mm}>{mm}</option>
        ))}
      </select>
    </div>
  );
}
