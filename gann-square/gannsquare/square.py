"""What each cell shows: a number (start + (n−1)·step) or a date (start date + n−1 units)."""

from __future__ import annotations

import calendar
import math
from dataclasses import dataclass
from datetime import date, timedelta

from .spiral import MAX_RINGS, rings_for

UNITS = ("day", "trading", "week", "month", "year")
UNIT_LABELS = {
    "day": "calendar days",
    "trading": "trading days (Mon–Fri)",
    "week": "weeks",
    "month": "months",
    "year": "years",
}
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def decimals_of(x: float) -> int:
    s = repr(float(x))
    if "e" in s or "E" in s:
        mantissa, exp = s.lower().split("e")
        frac = len(mantissa.split(".")[1].rstrip("0")) if "." in mantissa else 0
        return max(0, frac - int(exp))
    frac = s.split(".")[1].rstrip("0") if "." in s else ""
    return len(frac)


@dataclass(frozen=True)
class Square:
    """A square of ``rings`` rings whose centre holds ``start`` and grows by ``step``."""

    start: float = 1
    step: float = 1
    rings: int = 4
    capped: bool = False

    @classmethod
    def spanning(cls, start: float, end: float, step: float = 1) -> Square:
        """The smallest full square that reaches ``end`` (capped at MAX_RINGS)."""
        if step <= 0:
            raise ValueError("step must be positive")
        if end < start:
            raise ValueError("end must not be below start")
        count = int((end - start) / step + 1e-9) + 1
        rings = rings_for(count)
        return cls(start, step, min(rings, MAX_RINGS), rings > MAX_RINGS)

    @property
    def size(self) -> int:
        return 2 * self.rings + 1

    @property
    def cells(self) -> int:
        return self.size**2

    @property
    def decimals(self) -> int:
        return max(decimals_of(self.start), decimals_of(self.step))

    def value(self, n: int) -> float:
        return round(self.start + (n - 1) * self.step, self.decimals)

    def label(self, n: int) -> str:
        return f"{self.start + (n - 1) * self.step:.{self.decimals}f}"

    def cell_for(self, value: float) -> int | None:
        """Nearest cell holding ``value``, or None if it is off the square."""
        n = math.floor((value - self.start) / self.step + 0.5 + 1e-9) + 1
        return n if 1 <= n <= self.cells else None


def _add_months(d: date, months: int) -> date:
    t = d.month - 1 + months
    y, m = d.year + t // 12, t % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def _add_weekdays(d: date, k: int) -> date:
    if k <= 0:
        return d
    if d.weekday() >= 5:  # a weekend start steps to Monday first
        d += timedelta(days=7 - d.weekday())
        k -= 1
    weeks, rem = divmod(k, 5)
    d += timedelta(days=7 * weeks)
    while rem:
        d += timedelta(days=1)
        if d.weekday() < 5:
            rem -= 1
    return d


def date_at(start: date, n: int, unit: str) -> date:
    """Date shown in cell ``n`` when cell 1 is ``start``."""
    k = n - 1
    if unit == "day":
        return start + timedelta(days=k)
    if unit == "week":
        return start + timedelta(weeks=k)
    if unit == "trading":
        return _add_weekdays(start, k)
    if unit == "month":
        return _add_months(start, k)
    if unit == "year":
        return _add_months(start, 12 * k)
    raise ValueError(f"unknown unit {unit!r}; use one of {', '.join(UNITS)}")


def cell_for_date(start: date, d: date, unit: str, cells: int) -> int | None:
    """Cell whose date is nearest to ``d`` (ties go to the earlier cell)."""
    if d < start or d > date_at(start, cells, unit):
        return None
    lo, hi = 1, cells
    while lo < hi:  # first cell on or after d
        mid = (lo + hi) // 2
        if date_at(start, mid, unit) < d:
            lo = mid + 1
        else:
            hi = mid
    if lo > 1 and (d - date_at(start, lo - 1, unit)) <= (date_at(start, lo, unit) - d):
        return lo - 1
    return lo


def short_date(d: date, unit: str) -> str:
    """Compact label that fits in a cell."""
    if unit == "year":
        return str(d.year)
    if unit == "month":
        return f"{MONTHS[d.month - 1]}’{d.year % 100:02d}"
    return f"{d.month}/{d.day}"


def long_date(d: date, unit: str) -> str:
    if unit == "year":
        return str(d.year)
    if unit == "month":
        return f"{MONTHS[d.month - 1]} {d.year}"
    return f"{WEEKDAYS[d.weekday()]} {d.isoformat()}"
