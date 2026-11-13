import pytest

from gannsquare.spiral import coords
from gannsquare.trend import OUTWARD, corner_zone, facing, trend_cells, trend_paths

# (pivot, 上升趋势 cells, 下降趋势 cells) as marked by ganninvestor.com on a 14-ring square.
REFERENCE = [
    (2, [1, 4, 6], [1]),
    (9, [1, 3, 5, 13, 17], [1, 5, 7]),
    (12, [1, 2, 5, 8, 17, 22], [2, 8, 9]),
    (
        121,
        [1, 3, 5, 9, 13, 17, 25, 31, 37, 49, 57, 65, 81, 91, 101, 133, 145],
        [1, 5, 7, 9, 17, 21, 25, 37, 43, 49, 65, 73, 81, 101, 111],
    ),
    (
        172,
        [1, 4, 8, 15, 23, 34, 46, 61, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 96, 110, 123, 139]
        + [155, 190, 208],
        [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 110, 116, 123, 155, 163],
    ),
    (
        183,
        [1, 3, 5, 7, 13, 17, 21, 31, 37, 43, 57, 65, 73, 91, 101, 111, 133, 145, 157, 197, 211],
        [1, 3, 7, 9, 13, 21, 25, 31, 43, 49, 57, 73, 81, 91, 111, 121, 133, 157, 169],
    ),
    (
        200,
        [1, 4, 8, 15, 23, 34, 46, 57, 58, 59, 60, 61, 62, 63, 64, 65, 77, 90, 102, 116, 131, 147]
        + [163, 180, 218, 237],
        [57, 58, 59, 60, 61, 62, 63, 64, 65, 90, 96, 102, 131, 139, 147, 180, 190],
    ),
    (
        210,
        [1, 4, 6, 9, 14, 20, 25, 32, 42, 49, 58, 72, 81, 92, 110, 121, 134, 156, 169, 184, 225]
        + [242],
        [4, 5, 6, 14, 17, 20, 32, 37, 42, 58, 65, 72, 92, 101, 110, 134, 145, 156, 184, 197],
    ),
]


@pytest.mark.parametrize("pivot, up, down", REFERENCE)
def test_numbers_match_site(pivot, up, down):
    assert trend_cells(pivot, 14, "up") == up
    assert trend_cells(pivot, 14, "down") == down


def test_lines_run_from_the_pivot():
    # 172 faces W: line 1 is its row, running right across the square; line 2 is the
    # N half of the centre column for an uptrend and the S half for a downtrend.
    line1, line2 = trend_paths(172, 10, "up")
    assert line1 == [123, 82, 81, 80, 79, 78, 77, 76, 75, 74, 73, 110, 155, 208]
    assert line2 == [46, 23, 8, 1, 4, 15, 34, 61, 96, 139, 190]
    line1, line2 = trend_paths(172, 10, "down")
    assert line1 == [123, 82, 81, 80, 79, 78, 77, 76, 75, 74, 73, 110, 155]
    assert line2 == [116, 163]


def test_dates_run_to_the_edge():
    row = [123, 82, 81, 80, 79, 78, 77, 76, 75, 74, 73, 110, 155, 208, 269, 338, 415]
    assert trend_paths(172, 10, "up", full=True) == (
        row,
        [46, 23, 8, 1, 4, 15, 34, 61, 96, 139, 190, 249, 316, 391],
    )
    assert trend_paths(172, 10, "down", full=True) == (row, [116, 163, 218, 281, 352, 431])
    rings = 10
    for n in range(2, (2 * rings + 1) ** 2 + 1):
        for d in ("up", "down"):
            full = trend_cells(n, rings, d, full=True)
            # Uncut lines keep everything the site marks, plus the later cells it drops.
            assert set(trend_cells(n, rings, d)) <= set(full), (n, d)
            line1, _ = trend_paths(n, rings, d, full=True)
            (x, y), (ox, oy) = coords(n), OUTWARD[facing(n)]
            steps = 0
            while max(abs(x - (steps + 1) * ox), abs(y - (steps + 1) * oy)) <= rings:
                steps += 1
            assert len(line1) == steps, (n, d)  # every cell to the edge, no gaps


def test_corner_zone():
    assert [corner_zone(k) for k in range(1, 12)] == [0, 1, 1, 1, 1, 2, 2, 3, 3, 3, 3]


def test_facing():
    assert facing(1) is None
    assert facing(170) == "SW"  # one cell above the SW corner of ring 7
    assert facing(172) == "W"
    assert facing(183) == "NW"
    assert facing(190) == "N"


def test_centre_and_edges():
    assert trend_cells(1, 5, "up") == []
    # Outer ring: the uptrend is clipped to the square instead of failing like the site.
    assert max(trend_cells(120, 5, "up")) <= 121


def test_bad_direction():
    with pytest.raises(ValueError):
        trend_cells(10, 5, "sideways")
