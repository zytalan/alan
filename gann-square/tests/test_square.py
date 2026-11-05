from datetime import date

import pytest

from gannsquare.spiral import MAX_RINGS
from gannsquare.square import (
    Square,
    cell_for_date,
    date_at,
    decimals_of,
    long_date,
    short_date,
)


def test_range_100_to_5000():
    sq = Square.spanning(100, 5000, 1)
    assert sq.rings == 35
    assert sq.cells == 71 * 71
    assert sq.value(1) == 100
    assert sq.value(sq.cells) == 5140
    assert not sq.capped


def test_decimal_steps():
    sq = Square.spanning(1.05, 1.25, 0.01)
    assert sq.decimals == 2
    assert sq.label(3) == "1.07"
    assert sq.cell_for(1.07) == 3
    assert sq.cell_for(1.0) is None


def test_capped():
    sq = Square.spanning(1, 10**7, 1)
    assert sq.rings == MAX_RINGS and sq.capped


def test_bad_range():
    with pytest.raises(ValueError):
        Square.spanning(10, 5, 1)
    with pytest.raises(ValueError):
        Square.spanning(1, 5, 0)


def test_decimals_of():
    assert [decimals_of(x) for x in (1, 1.5, 0.25, 0.001, 1e-7, 100.0)] == [0, 1, 2, 3, 7, 0]


def test_calendar_and_week_dates():
    d0 = date(2026, 1, 1)
    assert date_at(d0, 1, "day") == d0
    assert date_at(d0, 365, "day") == date(2026, 12, 31)
    assert date_at(d0, 3, "week") == date(2026, 1, 15)


def test_trading_days_skip_weekends():
    fri = date(2026, 1, 2)
    assert date_at(fri, 2, "trading") == date(2026, 1, 5)  # Monday
    assert date_at(fri, 6, "trading") == date(2026, 1, 9)  # next Friday
    sat = date(2026, 1, 3)
    assert date_at(sat, 2, "trading") == date(2026, 1, 5)
    assert date_at(sat, 7, "trading") == date(2026, 1, 12)


def test_months_and_years_clamp_month_end():
    assert date_at(date(2026, 1, 31), 2, "month") == date(2026, 2, 28)
    assert date_at(date(2026, 1, 31), 3, "month") == date(2026, 3, 31)
    assert date_at(date(2024, 2, 29), 2, "year") == date(2025, 2, 28)
    assert date_at(date(2026, 11, 15), 3, "month") == date(2027, 1, 15)


def test_cell_for_date():
    d0 = date(2026, 1, 1)
    assert cell_for_date(d0, date(2026, 3, 15), "day", 400) == 74
    assert cell_for_date(d0, date(2026, 1, 9), "week", 100) == 2  # 8 days in: nearer week 2
    assert cell_for_date(d0, date(2025, 12, 31), "day", 400) is None


def test_date_labels():
    d = date(2026, 3, 15)
    assert short_date(d, "day") == "3/15"
    assert short_date(d, "month") == "Mar’26"
    assert short_date(d, "year") == "2026"
    assert long_date(d, "trading") == "Sun 2026-03-15"
    assert long_date(d, "month") == "Mar 2026"
