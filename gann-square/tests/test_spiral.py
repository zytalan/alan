from gannsquare import spiral

# The 5×5 square exactly as ganninvestor.com draws it.
REFERENCE_5x5 = [
    [13, 14, 15, 16, 17],
    [12, 3, 4, 5, 18],
    [11, 2, 1, 6, 19],
    [10, 9, 8, 7, 20],
    [25, 24, 23, 22, 21],
]


def test_matches_reference_layout():
    assert spiral.grid(2) == REFERENCE_5x5


def test_coords_and_number_at_round_trip():
    for n in range(1, 5000):
        assert spiral.number_at(*spiral.coords(n)) == n


def test_odd_squares_run_down_lower_left_diagonal():
    for k in range(1, 30):
        assert spiral.coords((2 * k + 1) ** 2) == (-k, -k)
        assert spiral.line_at((2 * k + 1) ** 2) == "SW diagonal"


def test_rings():
    assert [spiral.ring_of(n) for n in (1, 2, 9, 10, 25, 26, 49)] == [0, 1, 1, 2, 2, 3, 3]
    assert spiral.rings_for(81) == 4
    assert spiral.rings_for(82) == 5
    assert spiral.rings_for(4901) == 35  # 100 … 5000 with step 1


def test_cross_and_diagonal_lines():
    # Ring 1: 2 W, 3 NW, 4 N, 5 NE, 6 E, 7 SE, 8 S, 9 SW
    names = [spiral.line_at(n) for n in range(2, 10)]
    assert names == list(spiral.LINE_NAMES[1:])
    assert spiral.line_at(11) == "W cross"
    assert spiral.line_at(10) is None
    assert spiral.between(10) == ("SW diagonal", "W cross")


def test_degrees():
    assert spiral.degree(1) == 0
    assert spiral.degree(2) == 45
    assert spiral.degree(4) == 135
    assert spiral.degree(9) == 0
    assert spiral.degree(10) == 22.5
