/*
 * Geometry for the bay editor (occupancy.html), kept apart from the page so it can be tested.
 * Plain functions on [[x, y], ...] polygons in picture pixels; no DOM.
 *
 *   splitRow       one row of N equal stalls from the 4 outer corners, correct under perspective
 *   validateBay    the same checks the server makes (bay_validation.py), shown while drawing
 *   hitTest        which corner / bay is under the mouse
 *   duplicateBay   a copy of a bay moved one stall along its row
 *   uniqueId       a bay id that is not taken
 */
(function (root) {
  'use strict';

  // ---------- projective transform

  /** 3x3 matrix H (row-major, 9 numbers) with H*src[i] = dst[i] for 4 point pairs, or null. */
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solve(A, b);
    return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null;
  }

  /** Gaussian elimination with partial pivoting; null when singular. */
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }

  function applyH(H, p) {
    const w = H[6] * p[0] + H[7] * p[1] + H[8];
    return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w];
  }

  // ---------- ordering

  /** 4 points in clockwise screen order starting at the top-left: [TL, TR, BR, BL]. */
  function orderQuad(pts) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const sorted = pts.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    // screen y points down, so increasing atan2 is clockwise already
    let tl = 0, best = Infinity;
    sorted.forEach((p, i) => { const s = p[0] + p[1]; if (s < best) { best = s; tl = i; } });
    return [0, 1, 2, 3].map(k => sorted[(tl + k) % 4]);
  }

  // ---------- the row tool

  /**
   * Split the quadrilateral `quad` (the 4 outer corners of a row of stalls, clicked in any order)
   * into n stalls of equal ground width.  The quadrilateral is mapped to a flat strip [0,n] x [0,1]
   * by a homography and each stall is carried back, so stalls nearer the camera are wider on the
   * picture and far ones narrower, exactly as painted stalls are.  `gap` is the space between
   * stalls as a share of one stall (0 = they touch).  Returns n polygons [TL, TR, BR, BL], or null
   * when the corners cannot form a row.
   */
  function splitRow(quad, n, gap) {
    n = Math.floor(n);
    if (!quad || quad.length !== 4 || !(n >= 1)) return null;
    gap = Math.min(0.5, Math.max(0, gap || 0));
    const q = orderQuad(quad);
    const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along = (d(q[0], q[1]) + d(q[3], q[2])) >= (d(q[1], q[2]) + d(q[0], q[3]));
    // strip corners for [TL, TR, BR, BL]; the row runs along the longer pair of edges
    const strip = along ? [[0, 0], [n, 0], [n, 1], [0, 1]] : [[0, 0], [0, 1], [n, 1], [n, 0]];
    const H = homography(strip, q);
    if (!H) return null;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = i + gap / 2, b = i + 1 - gap / 2;
      const corners = along ? [[a, 0], [b, 0], [b, 1], [a, 1]]         // TL, TR, BR, BL
                            : [[a, 0], [a, 1], [b, 1], [b, 0]];
      out.push(corners.map(c => applyH(H, c)));
    }
    // the vertical case yields [near-top, far-top...]: put each stall in TL, TR, BR, BL screen order
    return out.map(p => orderQuad(p).map(pt => [Math.round(pt[0]), Math.round(pt[1])]));
  }

  // ---------- polygons

  function area(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  function centroid(poly) {
    return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  }

  function segmentsCross(p1, p2, p3, p4) {
    const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  /** True when no two non-neighbouring edges cross. */
  function isSimple(poly) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        if (segmentsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
      }
    }
    return true;
  }

  function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function isConvex(poly) {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (cr !== 0) { if (sign && Math.sign(cr) !== sign) return false; sign = Math.sign(cr); }
    }
    return true;
  }

  /** Area where convex polygon `a` overlaps convex polygon `b` (Sutherland-Hodgman). */
  function convexOverlap(a, b) {
    const orient = area2(a) >= 0 ? 1 : -1;
    let out = a;
    for (let i = 0; i < b.length && out.length; i++) {
      const p = b[i], q = b[(i + 1) % b.length];
      const inside = pt => orient * ((q[0] - p[0]) * (pt[1] - p[1]) - (q[1] - p[1]) * (pt[0] - p[0])) >= 0;
      const input = out; out = [];
      for (let k = 0; k < input.length; k++) {
        const cur = input[k], prev = input[(k + input.length - 1) % input.length];
        const ci = inside(cur), pi = inside(prev);
        if (ci !== pi) {
          const x1 = prev[0], y1 = prev[1], x2 = cur[0], y2 = cur[1];
          const x3 = p[0], y3 = p[1], x4 = q[0], y4 = q[1];
          const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
          if (den !== 0) {
            const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
            out.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
          }
        }
        if (ci) out.push(cur);
      }
    }
    return out.length >= 3 ? area(out) : 0;
  }

  function area2(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return s;
  }

  // ---------- validation (mirrors bay_validation.py)

  const MIN_AREA_PX = 25, MIN_AREA_FRAC = 0.0005, OUTSIDE_WARN_FRAC = 0.02, OVERLAP_WARN = 0.30, MIN_POINTS = 3;

  /** {errors: [...], warnings: [...]} for one bay; `size` = [width, height] of the picture, if known. */
  function validateBay(id, poly, size) {
    const errors = [], warnings = [];
    if (!Array.isArray(poly) || poly.some(p => !Array.isArray(p) || p.length !== 2 || !isFinite(p[0]) || !isFinite(p[1]))) {
      return { errors: ['corners must be [x, y] numbers'], warnings };
    }
    if (poly.length < MIN_POINTS) return { errors: ['needs at least ' + MIN_POINTS + ' corners'], warnings };
    const a = area(poly);
    const w = size ? size[0] : 0, h = size ? size[1] : 0;
    const minArea = Math.max(MIN_AREA_PX, MIN_AREA_FRAC * w * h);
    if (!isSimple(poly)) { errors.push('the outline crosses itself'); return { errors, warnings }; }
    if (a < minArea) { errors.push('too small (' + Math.round(a) + ' px², at least ' + Math.round(minArea) + ')'); return { errors, warnings }; }
    if (size && w > 0 && h > 0) {
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      if (maxX < 0 || maxY < 0 || minX > w || minY > h) { errors.push('it is outside the picture'); return { errors, warnings }; }
      const far = Math.max((-minX) / w, (maxX - w) / w, (-minY) / h, (maxY - h) / h);
      if (far > OUTSIDE_WARN_FRAC) warnings.push('a corner is ' + Math.round(far * 100) + '% outside the picture');
    }
    return { errors, warnings };
  }

  /** {id: {errors, warnings}} for every bay, adding overlap warnings between neighbours. */
  function validateAll(bays, size) {
    const out = {};
    const ids = Object.keys(bays);
    ids.forEach(id => { out[id] = validateBay(id, bays[id], size); });
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = bays[ids[i]], b = bays[ids[j]];
        if (out[ids[i]].errors.length || out[ids[j]].errors.length || !isConvex(a) || !isConvex(b)) continue;
        const share = convexOverlap(a, b) / Math.min(area(a), area(b));
        if (share > OVERLAP_WARN) {
          const msg = 'overlaps ' + ids[j] + ' by ' + Math.round(share * 100) + '%';
          out[ids[i]].warnings.push(msg);
          out[ids[j]].warnings.push('overlaps ' + ids[i] + ' by ' + Math.round(share * 100) + '%');
        }
      }
    }
    return out;
  }

  // ---------- editing

  /** What is under (x, y): {id, vertex} for a corner within `r` px, {id, vertex: null} inside a bay, or null. */
  function hitTest(bays, x, y, r) {
    r = r || 10;
    let bestV = null, bestD = r;
    for (const id of Object.keys(bays)) {
      bays[id].forEach((p, i) => {
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d <= bestD) { bestD = d; bestV = { id: id, vertex: i }; }
      });
    }
    if (bestV) return bestV;
    let hit = null, hitArea = Infinity;                  // smallest bay wins where bays overlap
    for (const id of Object.keys(bays)) {
      if (pointInPoly([x, y], bays[id]) && area(bays[id]) < hitArea) { hit = { id: id, vertex: null }; hitArea = area(bays[id]); }
    }
    return hit;
  }

  function translate(poly, dx, dy) { return poly.map(p => [p[0] + dx, p[1] + dy]); }

  /** `base` if free, else base-2, base-3 ... */
  function uniqueId(taken, base) {
    if (!(base in taken)) return base;
    let n = 2;
    while ((base + '-' + n) in taken) n++;
    return base + '-' + n;
  }

  /** "A-07" -> "A-08"; ids with no number get "-2". */
  function nextId(taken, id) {
    const m = /^(.*?)(\d+)$/.exec(id);
    if (!m) return uniqueId(taken, id + '-2');
    let n = parseInt(m[2], 10) + 1;
    const width = m[2].length;
    let cand;
    do { cand = m[1] + String(n).padStart(width, '0'); n++; } while (cand in taken);
    return cand;
  }

  /**
   * A copy of bay `id` moved one stall along its row.  The direction is taken from the nearest
   * other bay (so the copy lands beside it, not on top); with no neighbour it moves right by one width.
   */
  function duplicateBay(bays, id) {
    const poly = bays[id];
    const c = centroid(poly);
    let best = null, bestD = Infinity;
    for (const other of Object.keys(bays)) {
      if (other === id) continue;
      const o = centroid(bays[other]);
      const d = Math.hypot(o[0] - c[0], o[1] - c[1]);
      if (d < bestD) { bestD = d; best = o; }
    }
    let dx, dy;
    if (best) { dx = best[0] - c[0]; dy = best[1] - c[1]; }
    else { const xs = poly.map(p => p[0]); dx = -(Math.max(...xs) - Math.min(...xs)); dy = 0; }
    // the copy goes on the far side of this bay, away from the neighbour (so right when alone)
    return translate(poly, -dx, -dy).map(p => [Math.round(p[0]), Math.round(p[1])]);
  }

  /**
   * Inserts a bay adjacent to `id`. If there is an open gap to a neighbour along the row,
   * the new bay interpolates into that gap. Otherwise it steps along the row direction.
   */
  function insertBay(bays, id) {
    const poly = bays[id];
    if (!poly || poly.length < 3) return null;
    const c = centroid(poly);
    let best = null, bestId = null, bestD = Infinity;
    for (const other of Object.keys(bays)) {
      if (other === id) continue;
      const o = centroid(bays[other]);
      const d = Math.hypot(o[0] - c[0], o[1] - c[1]);
      if (d < bestD) { bestD = d; best = o; bestId = other; }
    }
    if (bestId && bays[bestId]) {
      const other = bays[bestId];
      const w1 = Math.max(...poly.map(p => p[0])) - Math.min(...poly.map(p => p[0]));
      if (bestD > 1.35 * w1 && poly.length === other.length) {
        return poly.map((pt, i) => [
          Math.round((pt[0] + other[i][0]) / 2),
          Math.round((pt[1] + other[i][1]) / 2)
        ]);
      }
    }
    return duplicateBay(bays, id);
  }

  const api = { homography, applyH, orderQuad, splitRow, area, centroid, isSimple, pointInPoly, isConvex,
                convexOverlap, validateBay, validateAll, hitTest, translate, uniqueId, nextId, duplicateBay, insertBay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BayGeometry = api;
})(typeof window !== 'undefined' ? window : this);
