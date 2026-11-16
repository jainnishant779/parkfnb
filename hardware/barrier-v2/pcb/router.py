"""Small grid router: 2 layers (F, B), 8-direction A*, vias, per-net track width.

GND is not routed: the bottom layer carries a GND plane and every GND pad is through-hole.
Foreign copper is respected with CLEARANCE; same-net copper may be shared."""
import heapq
import math

import numpy as np

from design import (BOARD_W, BOARD_H, GRID, CLEARANCE, NET_W, DEFAULT_W, VIA_D)

EDGE_CLR = 0.5               # copper to board edge
VIA_COST = 9.0
B_PENALTY = 1.3              # keep the bottom plane as whole as possible
SQ2 = math.sqrt(2.0)


class Elem:
    """Copper element.  kind: 'c' circle (x, y, r), 'r' rect (x0, y0, x1, y1), 's' segment (x0, y0, x1, y1, hw)."""
    __slots__ = ("net", "layers", "kind", "p", "extra")

    def __init__(self, net, layers, kind, p, extra=CLEARANCE):
        self.net, self.layers, self.kind, self.p, self.extra = net, layers, kind, p, extra


class Router:
    def __init__(self, parts, keepout, order=None):
        self.NX = int(BOARD_W / GRID) + 1
        self.NY = int(BOARD_H / GRID) + 1
        xs = np.arange(self.NX) * GRID
        ys = np.arange(self.NY) * GRID
        self.X, self.Y = np.meshgrid(xs, ys, indexing="ij")
        self.elems = []
        self.tracks = []            # (net, layer, x0, y0, x1, y1, w)
        self.vias = []              # (net, x, y)
        self.pads = {}              # net -> list of Pad
        self.failed = []
        for pt in parts:
            for pd in pt.pads:
                if pd.drill and pd.size == 0:
                    continue
                if pd.shape == "r":
                    e = Elem(pd.net, "FB", "r", (pd.x - pd.size / 2, pd.y - pd.size / 2, pd.x + pd.size / 2, pd.y + pd.size / 2))
                else:
                    e = Elem(pd.net, "FB", "c", (pd.x, pd.y, pd.size / 2))
                self.elems.append(e)
                if pd.net:
                    self.pads.setdefault(pd.net, []).append(pd)
            if pt.fp == "MOUNT":
                self.elems.append(Elem("#hole", "FB", "c", (pt.x, pt.y, 3.0), extra=0.25))
        x0, y0, x1, y1 = keepout
        self.elems.append(Elem("#keepout", "FB", "r", (x0, y0, x1, y1), extra=0.1))

    # ---------------------------------------------------------------- masks
    def _dist(self, e, sl):
        X, Y = self.X[sl], self.Y[sl]
        if e.kind == "c":
            cx, cy, r = e.p
            return np.hypot(X - cx, Y - cy) - r
        if e.kind == "r":
            x0, y0, x1, y1 = e.p
            dx = np.maximum(np.maximum(x0 - X, 0), X - x1)
            dy = np.maximum(np.maximum(y0 - Y, 0), Y - y1)
            return np.hypot(dx, dy)
        x0, y0, x1, y1, hw = e.p
        vx, vy = x1 - x0, y1 - y0
        L2 = vx * vx + vy * vy
        t = np.clip(((X - x0) * vx + (Y - y0) * vy) / L2, 0, 1) if L2 > 0 else 0
        return np.hypot(X - (x0 + t * vx), Y - (y0 + t * vy)) - hw

    def _bbox(self, e, m):
        if e.kind == "c":
            cx, cy, r = e.p
            lo, hi = (cx - r, cy - r), (cx + r, cy + r)
        elif e.kind == "r":
            lo, hi = (e.p[0], e.p[1]), (e.p[2], e.p[3])
        else:
            hw = e.p[4]
            lo = (min(e.p[0], e.p[2]) - hw, min(e.p[1], e.p[3]) - hw)
            hi = (max(e.p[0], e.p[2]) + hw, max(e.p[1], e.p[3]) + hw)
        i0 = max(int((lo[0] - m) / GRID) - 1, 0)
        i1 = min(int((hi[0] + m) / GRID) + 2, self.NX)
        j0 = max(int((lo[1] - m) / GRID) - 1, 0)
        j1 = min(int((hi[1] + m) / GRID) + 2, self.NY)
        return slice(i0, i1), slice(j0, j1)

    def masks(self, net, w):
        """Blocked arrays for layer F, layer B and for a via, for a track of width w belonging to net."""
        bl = {"F": np.zeros((self.NX, self.NY), bool), "B": np.zeros((self.NX, self.NY), bool)}
        bv = np.zeros((self.NX, self.NY), bool)
        for e in self.elems:
            if e.net == net:
                continue
            for lay in e.layers:
                m = e.extra + w / 2 + 0.03
                sl = self._bbox(e, m)
                bl[lay][sl] |= self._dist(e, sl) < m
            m = e.extra + VIA_D / 2 + 0.03
            sl = self._bbox(e, m)
            bv[sl] |= self._dist(e, sl) < m
        # board edge
        for lay in "FB":
            m = EDGE_CLR + w / 2
            bl[lay][self.X < m] = True
            bl[lay][self.X > BOARD_W - m] = True
            bl[lay][self.Y < m] = True
            bl[lay][self.Y > BOARD_H - m] = True
        m = EDGE_CLR + VIA_D / 2
        bv |= (self.X < m) | (self.X > BOARD_W - m) | (self.Y < m) | (self.Y > BOARD_H - m)
        return bl, bv

    # ---------------------------------------------------------------- search
    def _astar(self, srcs, tgt, bl, bv):
        NX, NY = self.NX, self.NY
        INF = 1e18
        g = {0: np.full((NX, NY), INF), 1: np.full((NX, NY), INF)}
        par = {0: np.full((NX, NY, 3), -1, np.int32), 1: np.full((NX, NY, 3), -1, np.int32)}
        lay = {"F": 0, "B": 1}
        blk = {0: bl["F"], 1: bl["B"]}
        ti, tj = tgt
        h = lambda i, j: (max(abs(i - ti), abs(j - tj)) + (SQ2 - 1) * min(abs(i - ti), abs(j - tj)))
        heap = []
        for (l, i, j) in srcs:
            g[l][i, j] = 0.0
            heapq.heappush(heap, (h(i, j), 0.0, l, i, j))
        dirs = [(1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0),
                (1, 1, SQ2), (1, -1, SQ2), (-1, 1, SQ2), (-1, -1, SQ2)]
        while heap:
            f, gc, l, i, j = heapq.heappop(heap)
            if gc > g[l][i, j] + 1e-9:
                continue
            if i == ti and j == tj:
                path = [(l, i, j)]
                while par[l][i, j, 0] >= 0:
                    l, i, j = par[l][i, j]
                    path.append((l, i, j))
                return path[::-1]
            b = blk[l]
            pen = B_PENALTY if l == 1 else 1.0
            for di, dj, c in dirs:
                ni, nj = i + di, j + dj
                if ni < 0 or nj < 0 or ni >= NX or nj >= NY or b[ni, nj]:
                    continue
                if di and dj and (b[i + di, j] or b[i, j + dj]):
                    continue
                ng = gc + c * pen
                if ng < g[l][ni, nj]:
                    g[l][ni, nj] = ng
                    par[l][ni, nj] = (l, i, j)
                    heapq.heappush(heap, (ng + h(ni, nj), ng, l, ni, nj))
            ol = 1 - l
            if not bv[i, j] and not blk[ol][i, j]:
                ng = gc + VIA_COST
                if ng < g[ol][i, j]:
                    g[ol][i, j] = ng
                    par[ol][i, j] = (l, i, j)
                    heapq.heappush(heap, (ng + h(i, j), ng, ol, i, j))
        return None

    # ---------------------------------------------------------------- nets
    def cell(self, x, y):
        return int(round(x / GRID)), int(round(y / GRID))

    def route_net(self, net):
        pads = self.pads.get(net, [])
        if len(pads) < 2:
            return True
        w = NET_W.get(net, DEFAULT_W)
        bl, bv = self.masks(net, w)
        connected = [pads[0]]
        remaining = pads[1:]
        own_cells = set()                       # (layer, i, j) of routed copper
        ok = True
        while remaining:
            best = min(remaining, key=lambda q: min(math.hypot(q.x - c.x, q.y - c.y) for c in connected))
            srcs = set(own_cells)
            for c in connected:
                i, j = self.cell(c.x, c.y)
                srcs.add((0, i, j))
                srcs.add((1, i, j))
            tgt = self.cell(best.x, best.y)
            path = self._astar(srcs, tgt, bl, bv)
            if path is None:
                self.failed.append(net)
                ok = False
                remaining.remove(best)
                continue
            self._commit(net, w, path, connected, best)
            for (l, i, j) in path:
                own_cells.add((l, i, j))
            connected.append(best)
            remaining.remove(best)
        return ok

    def _commit(self, net, w, path, connected, tgt_pad):
        def xy(i, j):
            return i * GRID, j * GRID

        # (pad centres that are a few 0.01 mm off the grid are still inside the pad copper)
        segs = []
        start = 0
        for k in range(1, len(path) + 1):
            if k == len(path) or path[k][0] != path[k - 1][0]:
                run = path[start:k]
                if k < len(path):
                    i, j = path[k - 1][1], path[k - 1][2]
                    self.vias.append((net, *xy(i, j)))
                    self.elems.append(Elem(net, "FB", "c", (*xy(i, j), VIA_D / 2)))
                # merge collinear points
                pts = [run[0]]
                for q in range(1, len(run) - 1):
                    a, b, c = run[q - 1], run[q], run[q + 1]
                    if (b[1] - a[1], b[2] - a[2]) != (c[1] - b[1], c[2] - b[2]):
                        pts.append(b)
                pts.append(run[-1])
                lname = "F" if run[0][0] == 0 else "B"
                for a, b in zip(pts[:-1], pts[1:]):
                    segs.append((lname, *xy(a[1], a[2]), *xy(b[1], b[2])))
                start = k
        for (lname, x0, y0, x1, y1) in segs:
            if abs(x0 - x1) < 1e-6 and abs(y0 - y1) < 1e-6:
                continue
            self.tracks.append((net, lname, x0, y0, x1, y1, w))
            self.elems.append(Elem(net, lname, "s", (x0, y0, x1, y1, w / 2)))

    def route_all(self, order):
        for net in order:
            self.route_net(net)
