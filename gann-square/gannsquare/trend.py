"""Uptrend (上升趋势) and downtrend (下降趋势) cells from a pivot.

Built on the trend lines of ganninvestor.com, with one deliberate change: an
uptrend only marks cells numbered above the pivot (bigger numbers, later dates)
and a downtrend only cells numbered below it.

1. The pivot faces a diagonal when it sits within a few cells of a ring corner
   (1 cell on rings 2–5, 2 on rings 6–7, 3 from ring 8 out); otherwise it faces its
   side of the square (W, N, E or S).
2. Downtrend (the same cells the site marks): line 1 runs from the pivot straight
   inward, across the square; line 2 is the centre line at right angles to it, from
   where they cross, towards the side 90° counter-clockwise of the pivot. Cells
   numbered below the pivot are kept.
3. Uptrend: line 1 runs from the pivot straight outward to the edge of the square;
   line 2 is the same centre line towards the side 90° clockwise of the pivot, the
   way the numbers grow. Cells numbered above the pivot are kept.

On a square of dates (``after=True``) both trends keep only the cells after the
pivot instead, because time only runs forward: the next support or resistance
date is always a later one. The uptrend is unchanged by this; the downtrend keeps
the part of its lines past the pivot, mostly where line 1 reaches the far side of
the square and further out along line 2.

The site's own 上升趋势 runs inward too and keeps every cell up to one turn past
the pivot, so most of what it marks is below the pivot.
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
    n: int, rings: int, direction: str, *, after: bool = False
) -> tuple[list[int], list[int]]:
    """The two lines of a trend from pivot ``n``, each listed away from where it starts.

    ``after=True`` keeps only cells after the pivot for both directions (dates).
    """
    if direction not in ("up", "down"):
        raise ValueError("direction must be 'up' or 'down'")
    k = ring_of(n)
    if k == 0:
        return [], []
    up = direction == "up"
    (px, py), (ox, oy) = coords(n), OUTWARD[facing(n)]
    dx, dy = (ox, oy) if up else (-ox, -oy)  # outward for an uptrend, inward for a downtrend
    rx, ry = (oy, -ox) if up else (-oy, ox)  # 90° clockwise / counter-clockwise

    def keep(m: int) -> bool:
        return m > n if up or after else m < n

    def inside(x: int, y: int) -> bool:
        return max(abs(x), abs(y)) <= rings

    line1, line2 = [], []
    t = 1
    while inside(px + t * dx, py + t * dy):
        m = number_at(px + t * dx, py + t * dy)
        if keep(m):
            line1.append(m)
        t += 1
    # Line 2 starts just past where the line through the pivot crosses it.
    s = math.floor((px * oy - py * ox) / (rx * oy - ry * ox)) + 1
    while inside(s * rx, s * ry):
        m = number_at(s * rx, s * ry)
        if keep(m):
            line2.append(m)
        s += 1
    return line1, line2


def trend_cells(n: int, rings: int, direction: str, *, after: bool = False) -> list[int]:
    """Cells marked by an ``"up"`` or ``"down"`` trend from pivot ``n`` on a square of ``rings``."""
    line1, line2 = trend_paths(n, rings, direction, after=after)
    return sorted(set(line1) | set(line2))
