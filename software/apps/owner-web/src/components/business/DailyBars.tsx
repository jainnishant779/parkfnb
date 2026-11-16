import { money } from '../../lib/format';
import type { DayTotal } from '../../lib/business/earnings';
import '../../styles/business.css';

/** A round upper limit for the axis: 1, 2, 2.5 or 5 times a power of ten. */
function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const compact = (n: number): string => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/**
 * Earnings per day as bars, in the console's chart classes (.chart, .guide, .base) with the same blue the occupancy line uses. Quiet
 * days are drawn as gaps in the row of bars, not left out. Each bar carries its figure as a tooltip and for screen readers.
 */
export default function DailyBars({ days, wide }: { days: DayTotal[]; wide?: boolean }) {
  const W = wide ? 1200 : 720;
  const H = wide ? 260 : 240;
  const L = 48;
  const R = 12;
  const T = 16;
  const B = 28;
  const n = days.length;
  const max = niceMax(Math.max(0, ...days.map((d) => d.total)));
  const slot = n ? (W - L - R) / n : 0;
  const bw = Math.min(44, slot * 0.7);
  const ys = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = Math.max(1, Math.ceil(n / 8));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Earnings per day">
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={ys(max * g)} y2={ys(max * g)} className={g ? 'guide' : 'base'} />
          <text x={L - 8} y={ys(max * g) + 4} textAnchor="end">₹{compact(max * g)}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const cx = L + slot * i + slot / 2;
        const h = Math.max(0, ys(0) - ys(d.total));
        return (
          <g key={d.key}>
            {i % step === 0 && <text x={cx} y={H - 8} className="bar-label">{d.label}</text>}
            <rect x={cx - slot / 2} y={T} width={slot} height={H - T - B} className="bar-hit" />
            {d.total > 0 && <rect x={cx - bw / 2} y={ys(d.total)} width={bw} height={h} rx={Math.min(6, bw / 2)} className="bar-fill" />}
            <title>{`${d.label}: ${money(d.total)}${d.count ? ` · ${d.count} ${d.count === 1 ? 'booking' : 'bookings'}` : ' · no earnings'}`}</title>
          </g>
        );
      })}
    </svg>
  );
}
