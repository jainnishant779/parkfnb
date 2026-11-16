/**
 * Charts drawn as plain SVG with the console's own chart classes (.chart, .line, .guide, .hov ...), so they look the same in light and
 * dark and carry no chart library. Ported from console.js `lineChart`.
 */
import { useId, useState } from 'react';

export interface OccupancyBucket {
  label: string; // ISO local time of the bucket start, e.g. "2026-11-15T13:00"
  occupancy_pct: number | null;
  future?: boolean;
}

/**
 * Occupancy per bucket, as a line with a soft fill. A gap (no data) breaks the line instead of falling to zero, and the part of today
 * that has not happened is marked "now" so the empty right-hand side reads as "still to come", not "empty". Point at it (or touch it)
 * to read a time and a value. `wide` draws it for a full-width card.
 */
export function LineChart({ buckets, wide, label = 'Occupancy over time', xlabel }: {
  buckets: OccupancyBucket[];
  wide?: boolean;
  label?: string;
  xlabel?: (b: OccupancyBucket) => string;
}) {
  const gid = `pfg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [hover, setHover] = useState<number | null>(null);
  const W = wide ? 1200 : 720;
  const H = wide ? 260 : 240;
  const L = 40;
  const R = 12;
  const T = 16;
  const B = 28;
  const n = buckets.length;
  const xs = (i: number) => L + (n <= 1 ? 0 : ((W - L - R) * i) / (n - 1));
  const ys = (v: number) => T + (H - T - B) * (1 - v / 100);
  const text = (b: OccupancyBucket) => (xlabel ? xlabel(b) : b.label.slice(11, 16));

  // runs of points with data, so a gap breaks the line
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  buckets.forEach((b, i) => {
    if (b.future || b.occupancy_pct === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push([xs(i), ys(b.occupancy_pct)]);
    }
  });
  if (run.length) runs.push(run);

  const step = Math.max(1, Math.ceil(n / 8));
  let lastPast = -1;
  buckets.forEach((b, i) => {
    if (!b.future) lastPast = i;
  });

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    const r = svg?.getBoundingClientRect();
    if (!r || !r.width || n < 1) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - L) / (W - L - R)) * (n - 1))));
    setHover(buckets[i] && !buckets[i].future ? i : null);
  };

  const hb = hover !== null ? buckets[hover] : null;
  const has = hb ? hb.occupancy_pct !== null : false;
  const cx = hover !== null ? xs(hover) : 0;
  const cy = hb && hb.occupancy_pct !== null ? ys(hb.occupancy_pct) : ys(0);
  const hoverText = hb ? `${text(hb)} · ${has ? `${hb.occupancy_pct}% occupied` : 'no data'}` : '';
  const bw = hoverText.length * 6.6 + 24;
  const bx = Math.max(L, Math.min(W - R - bw, cx - bw / 2));
  const by = Math.max(0, cy - 40);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--blue)', stopOpacity: 0.28 }} />
          <stop offset="1" style={{ stopColor: 'var(--blue)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={ys(g)} y2={ys(g)} className={g ? 'guide' : 'base'} />
          <text x={L - 8} y={ys(g) + 4} textAnchor="end">{g}%</text>
        </g>
      ))}
      {buckets.map((b, i) => (
        <g key={i}>
          {i % step === 0 && <text x={xs(i)} y={H - 8} textAnchor="middle">{text(b)}</text>}
          {!b.future && b.occupancy_pct === null && <rect x={xs(i) - 2} y={ys(0) - 6} width={4} height={6} rx={1} className="gap" />}
        </g>
      ))}
      {runs.map((seg, k) => {
        if (seg.length === 1) return <circle key={k} cx={seg[0][0]} cy={seg[0][1]} r={3} className="pt" />;
        const d = seg.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
        const last = seg[seg.length - 1];
        return (
          <g key={k}>
            <path d={`${d} L${last[0].toFixed(1)} ${ys(0)} L${seg[0][0].toFixed(1)} ${ys(0)} Z`} fill={`url(#${gid})`} />
            <path d={d} className="line" />
          </g>
        );
      })}
      {lastPast >= 0 && lastPast < n - 1 && (
        <g>
          <line x1={xs(lastPast)} x2={xs(lastPast)} y1={T} y2={ys(0)} className="now" />
          <text x={xs(lastPast) + 6} y={T + 10} className="nowlbl">now</text>
        </g>
      )}
      {hb && (
        <g className="hov">
          <line x1={cx} x2={cx} y1={T} y2={ys(0)} />
          {has && <circle cx={cx} cy={cy} r={5} />}
          <rect x={bx} y={by} width={bw} height={26} rx={13} />
          <text x={bx + bw / 2} y={by + 17}>{hoverText}</text>
        </g>
      )}
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
    </svg>
  );
}

/** Horizontal bars: a label, a bar filled to `pct` of the track, and a value. */
export function HBars({ rows }: { rows: { label: string; pct: number | null; value: string }[] }) {
  return (
    <>
      {rows.map((r) => (
        <div className="hbar" key={r.label}>
          <span>{r.label}</span>
          <span className="t"><i style={{ width: `${Math.max(0, Math.min(100, r.pct ?? 0))}%` }} /></span>
          <span className="num">{r.value}</span>
        </div>
      ))}
    </>
  );
}
