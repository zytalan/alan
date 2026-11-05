"""Square-root price levels.

One full turn of the square adds 2 to √price, so a price θ degrees away from P is
(√P ± θ/180)². Prices far outside 100–10 000 are scaled by a power of ten first.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


def sqrt_degree(p: float) -> float:
    """Where ``p`` falls on the square: ((√p − 1)·180) mod 360."""
    return ((math.sqrt(p) - 1) * 180) % 360


def level(p: float, deg: float) -> float | None:
    """The price ``deg`` degrees from ``p`` (negative ``deg`` = below). None if past zero."""
    r = math.sqrt(p) + deg / 180
    return None if r < 0 else r * r


@dataclass(frozen=True)
class Level:
    deg: float
    up: float | None
    down: float | None


def levels(p: float, every: float = 45, turns: int = 1, exponent: int = 0) -> list[Level]:
    """Levels above and below ``p`` every ``every`` degrees for ``turns`` full turns.

    ``exponent`` scales the price by 10**exponent before the square-root rule and
    scales the results back afterwards.
    """
    if p <= 0:
        raise ValueError("price must be positive")
    if every <= 0:
        raise ValueError("degree step must be positive")
    scaled = scale(p, exponent)
    rows = []
    for j in range(1, int(360 * turns / every + 1e-9) + 1):
        deg = every * j
        up, down = level(scaled, deg), level(scaled, -deg)
        rows.append(
            Level(
                deg,
                None if up is None else unscale(up, exponent),
                None if down is None else unscale(down, exponent),
            )
        )
    return rows


def auto_exponent(p: float) -> int:
    """Power of ten that brings ``p`` into 100 ≤ p < 10 000."""
    if p <= 0:
        raise ValueError("price must be positive")
    e = 0
    while scale(p, e) < 100:
        e += 1
    while scale(p, e) >= 10000:
        e -= 1
    return e


def scale(p: float, exponent: int) -> float:
    return p * 10**exponent if exponent >= 0 else p / 10**-exponent


def unscale(p: float, exponent: int) -> float:
    return scale(p, -exponent)
