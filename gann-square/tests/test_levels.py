import pytest

from gannsquare import levels as lv


def test_worked_example_from_100():
    assert lv.level(100, 90) == pytest.approx(110.25)
    assert lv.level(100, 180) == pytest.approx(121)
    assert lv.level(100, 360) == pytest.approx(144)
    assert lv.level(100, -180) == pytest.approx(81)
    assert lv.level(100, -360) == pytest.approx(64)


def test_level_past_zero_is_none():
    assert lv.level(1, -360) is None


def test_levels_table():
    rows = lv.levels(100, every=90, turns=1)
    assert [r.deg for r in rows] == [90, 180, 270, 360]
    assert rows[1].up == pytest.approx(121)
    assert rows[1].down == pytest.approx(81)
    assert len(lv.levels(100, every=22.5, turns=2)) == 32


def test_sqrt_degree():
    assert lv.sqrt_degree(9) == pytest.approx(0)
    assert lv.sqrt_degree(4) == pytest.approx(180)
    assert lv.sqrt_degree(100) == pytest.approx(180)


@pytest.mark.parametrize(
    "price, exponent",
    [(1.085, 2), (45.3, 1), (100, 0), (5000, 0), (9999, 0), (10000, -1), (98000, -1), (0.0042, 5)],
)
def test_auto_exponent(price, exponent):
    assert lv.auto_exponent(price) == exponent


def test_scaled_levels():
    rows = lv.levels(1.0, every=180, turns=1, exponent=2)  # 1.00 → 100 for the rule
    assert rows[0].up == pytest.approx(1.21)
    assert rows[0].down == pytest.approx(0.81)
