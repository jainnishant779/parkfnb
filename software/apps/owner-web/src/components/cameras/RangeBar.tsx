import { dayAgo } from '../../lib/format';
import '../../styles/cameras.css';

/** A date range for a page: the quick choices (Today, Yesterday, 7 days, 30 days), two date boxes, and optionally "All time". */
export interface Range {
  from: string;
  to: string;
}

const PRESETS: { name: string; from: number; to: number }[] = [
  { name: 'Today', from: 0, to: 0 },
  { name: 'Yesterday', from: 1, to: 1 },
  { name: '7 days', from: 6, to: 0 },
  { name: '30 days', from: 29, to: 0 },
];

export const todayRange = (): Range => ({ from: dayAgo(0), to: dayAgo(0) });

export default function RangeBar({ value, onChange, allowAll }: {
  value: Range;
  onChange: (range: Range) => void;
  /** adds "All time": no dates at all */
  allowAll?: boolean;
}) {
  const active = (() => {
    if (!value.from) return 'All';
    const hit = PRESETS.find((p) => value.from === dayAgo(p.from) && value.to === dayAgo(p.to));
    return hit ? hit.name : 'custom';
  })();

  const custom = (from: string, to: string) => {
    let f = from;
    let t = to || from;
    if (f && t && f > t) [f, t] = [t, f]; // "from" after "to": the person meant the other way round
    if (!f) {
      if (allowAll) onChange({ from: '', to: '' }); // cleared: all time, not a silent nothing
      return;
    }
    onChange({ from: f, to: t });
  };

  return (
    <div className="cam-range">
      <div className="seg" role="group">
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className={active === p.name ? 'on' : ''} aria-pressed={active === p.name}
            onClick={() => onChange({ from: dayAgo(p.from), to: dayAgo(p.to) })}>
            {p.name}
          </button>
        ))}
        {allowAll ? (
          <button type="button" className={active === 'All' ? 'on' : ''} aria-pressed={active === 'All'} onClick={() => onChange({ from: '', to: '' })}>
            All time
          </button>
        ) : null}
      </div>
      <input type="date" aria-label="From" value={value.from} onChange={(e) => custom(e.target.value, value.to)} />
      <span className="muted">to</span>
      <input type="date" aria-label="To" value={value.to} onChange={(e) => custom(value.from, e.target.value)} />
    </div>
  );
}
