"""Uptrend (上升趋势) and downtrend (下降趋势) cells from a pivot.

Reproduces the trend marking on ganninvestor.com:

1. The pivot faces a diagonal when it sits within a few cells of a ring corner
   (1 cell on rings 2–5, 2 on rings 6–7, 3 from ring 8 out); otherwise it faces its
   side of the square (W, N, E or S).
2. Line 1 runs from the pivot straight inward, across the whole square.
3. Line 2 is the centre line at right angles to it. It is taken from where it
   crosses line 1, towards the side 90° clockwise of the pivot for an uptrend (the
   way the numbers grow) or 90° counter-clockwise for a downtrend.
4. An uptrend keeps cells numbered up to one full turn past the pivot (n + 8k); a
   downtrend keeps the cells numbered below the pivot.
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


def trend_cells(n: int, rings: int, direction: str) -> list[int]:
    """Cells marked by an ``"up"`` or ``"down"`` trend from pivot ``n`` on a square of ``rings``."""
    if direction not in ("up", "down"):
        raise ValueError("direction must be 'up' or 'down'")
    k = ring_of(n)
    if k == 0:
        return []
    (px, py), (ox, oy) = coords(n), OUTWARD[facing(n)]
    rx, ry = (oy, -ox) if direction == "up" else (-oy, ox)
    limit = n + 8 * k if direction == "up" else n - 1
    found: set[int] = set()

    def add(x: int, y: int) -> bool:
        if max(abs(x), abs(y)) > rings:
            return False
        m = number_at(x, y)
        if m <= limit:
            found.add(m)
        return True

    t = 1
    while add(px - t * ox, py - t * oy):
        t += 1
    # Line 2 starts just past where it crosses line 1.
    cross_po = px * oy - py * ox
    cross_ro = rx * oy - ry * ox
    s = math.floor(cross_po / cross_ro) + 1
    while add(s * rx, s * ry):
        s += 1
    return sorted(found)
