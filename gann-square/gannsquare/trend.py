"""Uptrend (上升趋势) and downtrend (下降趋势) cells from a pivot.

The same trend lines as ganninvestor.com, worked out by clicking every cell of its
square headlessly:

1. The pivot faces a diagonal when it sits within a few cells of a ring corner
   (1 cell on rings 2–5, 2 on rings 6–7, 3 from ring 8 out); otherwise it faces its
   side of the square (W, N, E or S).
2. Line 1 runs from the pivot straight inward, across the square.
3. Line 2 is the centre line at right angles to it, from where they cross, towards
   the side 90° clockwise of the pivot for an uptrend (the way the numbers grow) or
   90° counter-clockwise for a downtrend.
4. On a square of numbers the lines are cut where the site cuts them: an uptrend
   keeps cells up to one full turn past the pivot (n + 8k), a downtrend the cells
   below the pivot.

On a square of dates (``full=True``) neither line is cut: both run on to the edge
of the square. Time only runs forward, so the useful dates are the ones after the
pivot, and most of those lie past the site's cut-off.
"""

from __future__ import annotations

import math

from .spiral import coords, index_in_ring, number_at, ring_of

OUTWARD = {
    "W": (-1, 0),
    "NW": (-1, 1),
    "N": (0, 1),
    "NE": (1, 1),
    "E": (1, 0),
    "SE": (1, -1),
    "S": (0, -1),
    "SW": (-1, -1),
}


def corner_zone(k: int) -> int:
    """How many cells either side of a corner still count as facing the diagonal."""
    return 0 if k <= 1 else min(3, max(1, (k - 2) // 2))


def facing(n: int) -> str | None:
    """Direction the pivot cell faces: a corner (diagonal) or a side (cross)."""
    k = ring_of(n)
    if k == 0:
        return None
    i, h = index_in_ring(n), corner_zone(k)
    for corner, name in ((0, "SW"), (2 * k, "NW"), (4 * k, "NE"), (6 * k, "SE"), (8 * k, "SW")):
        if abs(i - corner) <= h:
            return name
    return ("W", "N", "E", "S")[(i - 1) // (2 * k)]


def trend_paths(
    n: int, rings: int, direction: str, *, full: bool = False
) -> tuple[list[int], list[int]]:
    """The two lines of a trend from pivot ``n``, each listed away from where it starts.

    ``full=True`` (date squares) runs both lines to the edge of the square uncut.
    """
    if direction not in ("up", "down"):
        raise ValueError("direction must be 'up' or 'down'")
    k = ring_of(n)
    if k == 0:
        return [], []
    (px, py), (ox, oy) = coords(n), OUTWARD[facing(n)]
    rx, ry = (oy, -ox) if direction == "up" else (-oy, ox)  # 90° clockwise / counter-clockwise
    limit = n + 8 * k if direction == "up" else n - 1

    def keep(m: int) -> bool:
        return full or m <= limit

    def inside(x: int, y: int) -> bool:
        return max(abs(x), abs(y)) <= rings

    line1, line2 = [], []
    t = 1
    while inside(px - t * ox, py - t * oy):
        m = number_at(px - t * ox, py - t * oy)
        if keep(m):
            line1.append(m)
        t += 1
    # Line 2 starts just past where line 1 crosses it.
    s = math.floor((px * oy - py * ox) / (rx * oy - ry * ox)) + 1
    while inside(s * rx, s * ry):
        m = number_at(s * rx, s * ry)
        if keep(m):
            line2.append(m)
        s += 1
    return line1, line2


def trend_cells(n: int, rings: int, direction: str, *, full: bool = False) -> list[int]:
    """Cells marked by an ``"up"`` or ``"down"`` trend from pivot ``n`` on a square of ``rings``."""
    line1, line2 = trend_paths(n, rings, direction, full=full)
    return sorted(set(line1) | set(line2))
