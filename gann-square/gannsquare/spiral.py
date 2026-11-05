"""The Square of Nine spiral.

Laid out like the classic chart (and the generator on ganninvestor.com): cell 1 is
in the centre, cell 2 directly left of it, the numbers wind outward clockwise, and
the odd squares (9, 25, 49 …) run down the lower-left diagonal::

    13 14 15 16 17
    12  3  4  5 18
    11  2  1  6 19
    10  9  8  7 20
    25 24 23 22 21

Coordinates: ``x`` grows to the right, ``y`` grows upward, the centre is (0, 0).
Ring *k* holds the 8·k cells from (2k−1)²+1 to (2k+1)².

Degrees are measured around each ring, clockwise, starting from the odd-square
diagonal (lower-left, 0°). That matches the square-root rule in ``levels``: on the
outer rings ((√n − 1)·180) mod 360 converges to the same angle.
"""

from __future__ import annotations

import math

MAX_RINGS = 75

# Index j = position-in-ring / ring  →  the line a cell sits on.
LINE_NAMES = (
    "SW diagonal",  # 0° (odd squares)
    "W cross",  # 45°
    "NW diagonal",  # 90°
    "N cross",  # 135°
    "NE diagonal",  # 180°
    "E cross",  # 225°
    "SE diagonal",  # 270°
    "S cross",  # 315°
    "SW diagonal",  # 360°
)


def _ceil_sqrt(n: int) -> int:
    r = math.isqrt(n)
    return r if r * r == n else r + 1


def ring_of(n: int) -> int:
    """Ring that cell ``n`` sits on (0 for the centre)."""
    if n < 1:
        raise ValueError("cell numbers start at 1")
    return _ceil_sqrt(n) // 2


def index_in_ring(n: int) -> int:
    """1-based position of ``n`` within its ring (0 for the centre)."""
    k = ring_of(n)
    return n - (2 * k - 1) ** 2 if k else 0


def coords(n: int) -> tuple[int, int]:
    """(x, y) of cell ``n``."""
    k = ring_of(n)
    if k == 0:
        return (0, 0)
    i = index_in_ring(n)
    if i <= 2 * k:  # left side, going up
        return (-k, -k + i)
    if i <= 4 * k:  # top side, going right
        return (-k + (i - 2 * k), k)
    if i <= 6 * k:  # right side, going down
        return (k, k - (i - 4 * k))
    return (k - (i - 6 * k), -k)  # bottom side, going left


def number_at(x: int, y: int) -> int:
    """Cell number at (x, y)."""
    k = max(abs(x), abs(y))
    if k == 0:
        return 1
    if x == -k and y > -k:
        i = y + k
    elif y == k and x > -k:
        i = 2 * k + (x + k)
    elif x == k and y < k:
        i = 4 * k + (k - y)
    else:
        i = 6 * k + (k - x)
    return (2 * k - 1) ** 2 + i


def degree(n: int) -> float:
    """Angle of cell ``n`` around its ring, clockwise from the odd-square diagonal."""
    k = ring_of(n)
    if k == 0:
        return 0.0
    return (index_in_ring(n) / (8 * k) * 360) % 360


def line_at(n: int) -> str | None:
    """Name of the cross or diagonal that cell ``n`` sits on, if any."""
    k = ring_of(n)
    if k == 0:
        return "centre"
    i = index_in_ring(n)
    return LINE_NAMES[i // k] if i % k == 0 else None


def between(n: int) -> tuple[str, str]:
    """The two lines cell ``n`` sits between (the same name twice if it is on one)."""
    k = ring_of(n)
    if k == 0:
        return ("centre", "centre")
    j = index_in_ring(n) / k
    return (LINE_NAMES[math.floor(j)], LINE_NAMES[math.ceil(j)])


def rings_for(count: int) -> int:
    """Smallest number of rings whose square holds ``count`` cells (at least 1)."""
    return max(1, ring_of(max(1, count)))


def grid(rings: int) -> list[list[int]]:
    """Cell numbers row by row, top row first."""
    return [
        [number_at(x, y) for x in range(-rings, rings + 1)] for y in range(rings, -rings - 1, -1)
    ]
