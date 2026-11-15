/**
 * Procedural city-map generator. Returns an array of SVG path strings
 * that, when stroked, look like a real top-down city: concentric ring
 * roads, radial spokes, highway curves, and dense rectilinear grids
 * filling the wedges in between.
 *
 * Generation is deterministic — a seeded PRNG (mulberry32) means the
 * same map renders on every cold start. Run once at module load.
 *
 * Coordinate space: 720x720 viewport with the centre at (360, 360).
 */

const VIEW = 720;
const CX = VIEW / 2;
const CY = VIEW / 2;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1729);
const r = (min, max) => min + rand() * (max - min);

// Distance from centre, used by the renderer to delay each path's draw
// in proportion to how far from centre it lives — produces the "wave
// expanding outward" reveal.
function pathMaxDist(d) {
  // Quick pass: max distance from centre across the path's M/L/Q/C points.
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return 0;
  let max = 0;
  for (let i = 0; i < nums.length - 1; i += 2) {
    const x = parseFloat(nums[i]);
    const y = parseFloat(nums[i + 1]);
    const dx = x - CX;
    const dy = y - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > max) max = dist;
  }
  return max;
}

function makePaths() {
  const paths = [];

  // ─── Concentric ring roads ──────────────────────────────────────────
  // Each ring is a slightly noisy circle so it doesn't read as a perfect
  // geometry — looks like a real beltway.
  const ringRadii = [80, 150, 230, 310];
  for (const baseR of ringRadii) {
    const segments = 64;
    let d = '';
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const noise = Math.sin(a * 3 + baseR * 0.05) * 4 + Math.cos(a * 5) * 2;
      const rr = baseR + noise;
      const x = CX + Math.cos(a) * rr;
      const y = CY + Math.sin(a) * rr;
      d += i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    paths.push({ d, w: baseR > 250 ? 2.4 : 3.0, kind: 'ring' });
  }

  // ─── Radial spokes ──────────────────────────────────────────────────
  const spokes = 10;
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2 + r(-0.04, 0.04);
    const len = r(280, 360);
    const x2 = CX + Math.cos(angle) * len;
    const y2 = CY + Math.sin(angle) * len;
    // Slight bend mid-spoke for character.
    const midR = len * 0.55;
    const bendA = angle + r(-0.08, 0.08);
    const xm = CX + Math.cos(bendA) * midR;
    const ym = CY + Math.sin(bendA) * midR;
    paths.push({
      d: `M${CX} ${CY} Q${xm.toFixed(1)} ${ym.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      w: 3.4,
      kind: 'spoke',
    });
  }

  // ─── Highway curves ─────────────────────────────────────────────────
  // Long bezier arcs slicing across — these are the thicker dark roads
  // visible in the reference image.
  for (let i = 0; i < 4; i++) {
    const a1 = r(0, Math.PI * 2);
    const a2 = a1 + Math.PI + r(-0.6, 0.6);
    const r1 = r(220, 340);
    const r2 = r(220, 340);
    const x1 = CX + Math.cos(a1) * r1;
    const y1 = CY + Math.sin(a1) * r1;
    const x2 = CX + Math.cos(a2) * r2;
    const y2 = CY + Math.sin(a2) * r2;
    const cx1 = CX + r(-100, 100);
    const cy1 = CY + r(-100, 100);
    const cx2 = CX + r(-100, 100);
    const cy2 = CY + r(-100, 100);
    paths.push({
      d: `M${x1.toFixed(1)} ${y1.toFixed(1)} C${cx1.toFixed(1)} ${cy1.toFixed(1)} ${cx2.toFixed(1)} ${cy2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      w: 2.4,
      kind: 'highway',
    });
  }

  // ─── Grid clusters ──────────────────────────────────────────────────
  // A handful of small rectilinear neighborhood grids. We keep this
  // small (was 28; older devices could not animate 200+ Skia paths
  // smoothly).
  const clusters = 8;
  for (let i = 0; i < clusters; i++) {
    const cellAngle = r(0, Math.PI * 2);
    const cellR = r(95, 290);
    const ccx = CX + Math.cos(cellAngle) * cellR;
    const ccy = CY + Math.sin(cellAngle) * cellR;
    if (Math.hypot(ccx - CX, ccy - CY) > 320) continue;

    const size = r(40, 70);
    const lines = 3; // 3 verticals + 3 horizontals = 6 paths each
    const step = size / (lines - 1);
    const rot = cellAngle + Math.PI / 2;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const tx = (lx, ly) => [
      ccx + lx * cos - ly * sin,
      ccy + lx * sin + ly * cos,
    ];

    for (let c = 0; c < lines; c++) {
      const lx = -size / 2 + c * step;
      const [x1, y1] = tx(lx, -size / 2);
      const [x2, y2] = tx(lx, size / 2);
      paths.push({
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`,
        w: 1.4,
        kind: 'grid',
      });
    }
    for (let rr = 0; rr < lines; rr++) {
      const ly = -size / 2 + rr * step;
      const [x1, y1] = tx(-size / 2, ly);
      const [x2, y2] = tx(size / 2, ly);
      paths.push({
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`,
        w: 1.4,
        kind: 'grid',
      });
    }
  }

  // ─── Compute reveal-distance for every path ─────────────────────────
  // The renderer uses this so paths near the centre draw first and the
  // wavefront moves outward.
  return paths.map((p) => ({ ...p, dist: pathMaxDist(p.d) }));
}

export const CITY_MAP = makePaths();
export const CITY_VIEW = VIEW;
export const CITY_MAX_DIST = Math.max(...CITY_MAP.map((p) => p.dist));
