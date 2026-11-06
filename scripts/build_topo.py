"""Build public/topo.svg: a seamless tile of topographic contour lines.

The terrain is a periodic function (sums of sines whose wave numbers divide the tile), so the
contours meet themselves at every edge and never cross. Marching squares traces each level;
segments are joined into paths and simplified. The SVG is used as a CSS mask, so its colour
comes from the page (see .topo in src/index.css).

    python scripts/build_topo.py
"""
import math
from pathlib import Path

W = 720                      # tile size in px
N = 120                      # grid cells per side
LEVELS = 13
TOL = 0.9                    # simplification tolerance in px
OUT = Path(__file__).resolve().parent.parent / "public" / "topo.svg"

# (kx, ky, amplitude, phase): integer wave numbers keep the field periodic over the tile.
WAVES = [(1, 0, 1.0, 0.3), (0, 1, 0.9, 1.7), (1, 1, 0.75, 2.4), (1, -1, 0.6, 0.9), (2, 1, 0.38, 4.1),
         (1, 2, 0.33, 5.2), (2, -1, 0.26, 3.3), (3, 1, 0.14, 1.1), (1, 3, 0.12, 2.0), (3, -2, 0.08, 0.4)]


def field(x: float, y: float) -> float:
    return sum(a * math.sin(2 * math.pi * (kx * x + ky * y) / W + p) for kx, ky, a, p in WAVES)


def trace(level: float, grid: list[list[float]], step: float) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    segs = []
    for j in range(N):
        for i in range(N):
            # corners: a (top-left), b (top-right), c (bottom-right), d (bottom-left); wrap at the edges
            a, b = grid[j][i], grid[j][(i + 1) % N]
            c, d = grid[(j + 1) % N][(i + 1) % N], grid[(j + 1) % N][i]
            x0, y0 = i * step, j * step
            pts = []

            def edge(p, q, pa, pb):
                if (p - level) * (q - level) < 0:
                    t = (level - p) / (q - p)
                    pts.append((pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t))

            edge(a, b, (x0, y0), (x0 + step, y0))
            edge(b, c, (x0 + step, y0), (x0 + step, y0 + step))
            edge(c, d, (x0 + step, y0 + step), (x0, y0 + step))
            edge(d, a, (x0, y0 + step), (x0, y0))
            if len(pts) == 2:
                segs.append((pts[0], pts[1]))
            elif len(pts) == 4:                       # saddle: pair by the centre value
                centre = (a + b + c + d) / 4
                if (centre - level) * (a - level) > 0:
                    segs += [(pts[0], pts[3]), (pts[1], pts[2])]
                else:
                    segs += [(pts[0], pts[1]), (pts[2], pts[3])]
    return segs


def join(segs):
    key = lambda p: (round(p[0], 3), round(p[1], 3))
    ends: dict = {}
    for s in segs:
        for e in (0, 1):
            ends.setdefault(key(s[e]), []).append(s)
    used = set()
    paths = []
    for s in segs:
        if id(s) in used:
            continue
        used.add(id(s))
        path = [s[0], s[1]]
        for direction in (1, -1):
            while True:
                tip = path[-1] if direction == 1 else path[0]
                nxt = next((t for t in ends.get(key(tip), []) if id(t) not in used), None)
                if not nxt:
                    break
                used.add(id(nxt))
                other = nxt[1] if key(nxt[0]) == key(tip) else nxt[0]
                if direction == 1:
                    path.append(other)
                else:
                    path.insert(0, other)
        paths.append(path)
    return paths


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    far, idx = 0.0, 0
    for k in range(1, len(pts) - 1):
        d = abs(dy * pts[k][0] - dx * pts[k][1] + x2 * y1 - y2 * x1) / norm
        if d > far:
            far, idx = d, k
    if far <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def smooth(pts) -> str:
    """Quadratic curves through the midpoints: smooth lines from few points."""
    f = lambda p: f"{p[0]:.0f} {p[1]:.0f}"
    if len(pts) == 2:
        return f"M{f(pts[0])}L{f(pts[1])}"
    d = [f"M{f(pts[0])}"]
    for k in range(1, len(pts) - 1):
        mid = ((pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2)
        d.append(f"Q{f(pts[k])} {f(mid)}")
    d.append(f"L{f(pts[-1])}")
    return "".join(d)


def main() -> None:
    step = W / N
    grid = [[field(i * step, j * step) for i in range(N)] for j in range(N)]
    lo, hi = min(map(min, grid)), max(map(max, grid))
    out = []
    for k in range(1, LEVELS + 1):
        level = lo + (hi - lo) * k / (LEVELS + 1)
        for path in join(trace(level, grid, step)):
            pts = simplify(path, TOL)
            if len(pts) < 2:
                continue
            # Paths that wrap across an edge are split where they jump to the other side.
            chunks, cur = [], [pts[0]]
            for p in pts[1:]:
                if abs(p[0] - cur[-1][0]) > W / 2 or abs(p[1] - cur[-1][1]) > W / 2:
                    chunks.append(cur)
                    cur = [p]
                else:
                    cur.append(p)
            chunks.append(cur)
            for ch in chunks:
                length = sum(math.dist(ch[k], ch[k + 1]) for k in range(len(ch) - 1))
                if len(ch) < 2 or length < 12:          # drop specks left by tiny closed loops
                    continue
                out.append(smooth(ch))
    width = 1.6 if LEVELS < 10 else 1.3
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{W}" viewBox="0 0 {W} {W}">'
           f'<path fill="none" stroke="#000" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round" d="'
           + " ".join(out) + '"/></svg>\n')
    OUT.write_text(svg)
    print(f"{OUT.relative_to(OUT.parent.parent)}: {len(out)} paths, {len(svg) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
