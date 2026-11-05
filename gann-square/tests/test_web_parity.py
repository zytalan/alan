"""The page's JavaScript math must give the same answers as the Python package.

Runs the page's ``gann-core`` script in Node.js; skipped when Node isn't installed.
"""

import json
import re
import shutil
import subprocess
from datetime import date

import pytest

from gannsquare import levels as lv
from gannsquare import spiral
from gannsquare.render import page_fragment
from gannsquare.square import Square, cell_for_date, date_at, decimals_of, long_date, short_date
from gannsquare.trend import corner_zone, facing, trend_cells

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="needs Node.js")

HELPERS = """
const P = (s) => Gann.parseISO(s);
const X = Object.assign({}, Gann, {
  dateISO: (s, n, u) => Gann.iso(Gann.dateAt(P(s), n, u)),
  cellForDateISO: (s, d, u, c) => Gann.cellForDate(P(s), P(d), u, c),
  shortDateISO: (s, u) => Gann.shortDate(P(s), u),
  longDateISO: (s, u) => Gann.longDate(P(s), u),
});
"""


def run_js(calls):
    core = re.search(r'<script id="gann-core">(.*?)</script>', page_fragment(), re.DOTALL).group(1)
    script = (
        core
        + HELPERS
        + f"const calls = {json.dumps(calls)};\n"
        + "process.stdout.write(JSON.stringify(calls.map(([f, a]) => X[f](...a))));\n"
    )
    out = subprocess.run([NODE], input=script, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_layout_matches():
    ns = list(range(1, 3000, 7))
    calls = (
        [["coords", [n]] for n in ns]
        + [["degree", [n]] for n in ns]
        + [["lineAt", [n]] for n in ns]
    )
    calls += [["between", [n]] for n in ns] + [["ringOf", [n]] for n in ns]
    calls += [["numberAt", [x, y]] for x in range(-6, 7) for y in range(-6, 7)]
    expected = [list(spiral.coords(n)) for n in ns] + [spiral.degree(n) for n in ns]
    expected += [spiral.line_at(n) for n in ns] + [list(spiral.between(n)) for n in ns]
    expected += [spiral.ring_of(n) for n in ns]
    expected += [spiral.number_at(x, y) for x in range(-6, 7) for y in range(-6, 7)]
    assert run_js(calls) == expected


def test_levels_match():
    cases = [
        (100, 45, 1, 0),
        (1234.5, 22.5, 2, 0),
        (1.085, 30, 1, 2),
        (98000, 90, 3, -1),
        (7, 45, 2, 0),
    ]
    got = run_js([["levels", list(c)] for c in cases])
    for (p, every, turns, e), js_rows in zip(cases, got):
        py_rows = lv.levels(p, every, turns, e)
        assert len(js_rows) == len(py_rows)
        for js, py in zip(js_rows, py_rows):
            assert js["deg"] == pytest.approx(py.deg)
            for side in ("up", "down"):
                a, b = js[side], getattr(py, side)
                assert (a is None and b is None) or a == pytest.approx(b, rel=1e-12)
    prices = [0.0042, 1.085, 45.3, 100, 9999, 10000, 98000]
    assert run_js([["autoExponent", [p]] for p in prices]) == [lv.auto_exponent(p) for p in prices]
    assert run_js([["sqrtDegree", [p]] for p in prices]) == pytest.approx(
        [lv.sqrt_degree(p) for p in prices]
    )


def test_square_values_match():
    xs = [1, 1.5, 0.25, 0.001, 1e-7, 100.0, 1234.5678]
    assert run_js([["decimalsOf", [x]] for x in xs]) == [decimals_of(x) for x in xs]
    ranges = [(1, 1681, 1), (100, 5000, 1), (1.05, 1.25, 0.01), (1, 10**7, 1), (0.5, 0.5, 0.5)]
    js = run_js([["spanning", list(r)] for r in ranges])
    for r, got in zip(ranges, js):
        sq = Square.spanning(*r)
        assert got == {"rings": sq.rings, "capped": sq.capped}
    sq = Square.spanning(1.05, 9.99, 0.01)
    ns = [1, 2, 3, 77, 500, sq.cells]
    assert run_js([["valueLabel", [n, sq.start, sq.step, sq.decimals]] for n in ns]) == [
        sq.label(n) for n in ns
    ]
    vals = [1.0, 1.05, 1.07, 1.074, 1.075, 5.5, 99.0]
    got = run_js([["cellFor", [v, sq.start, sq.step, sq.cells]] for v in vals])
    assert got == [sq.cell_for(v) for v in vals]


def test_dates_match():
    starts = ["2026-01-01", "2026-01-02", "2026-01-03", "2024-02-29", "2026-01-31"]
    units = ["day", "trading", "week", "month", "year"]
    ns = [1, 2, 5, 6, 13, 100, 729]
    calls, expected = [], []
    for s in starts:
        d0 = date.fromisoformat(s)
        for u in units:
            for n in ns:
                calls.append(["dateISO", [s, n, u]])
                expected.append(date_at(d0, n, u).isoformat())
            calls.append(["shortDateISO", [s, u]])
            expected.append(short_date(d0, u))
            calls.append(["longDateISO", [s, u]])
            expected.append(long_date(d0, u))
            for target in ["2026-03-15", "2026-01-01", "2027-07-04"]:
                calls.append(["cellForDateISO", [s, target, u, 441]])
                expected.append(cell_for_date(d0, date.fromisoformat(target), u, 441))
    assert run_js(calls) == expected


def test_trend_matches():
    cases = [
        (n, rings, d)
        for rings in (3, 14, 40)
        for n in range(1, (2 * rings + 1) ** 2 + 1, 37)
        for d in ("up", "down")
    ]
    cases += [
        (n, 14, d) for n in (2, 9, 119, 121, 172, 183, 200, 210, 222, 840) for d in ("up", "down")
    ]
    got = run_js([["trendCells", list(c)] for c in cases])
    assert got == [trend_cells(*c) for c in cases]
    ns = list(range(1, 2000, 3))
    assert run_js([["facing", [n]] for n in ns]) == [facing(n) for n in ns]
    assert run_js([["cornerZone", [k]] for k in range(80)]) == [corner_zone(k) for k in range(80)]


def test_trend_paths_cover_trend_cells():
    cases = [(n, 14, d) for n in range(2, 841, 13) for d in ("up", "down")]
    got = run_js([["trendPaths", list(c)] for c in cases])
    for (n, rings, d), paths in zip(cases, got):
        assert sorted(set(paths["line1"] + paths["line2"])) == trend_cells(n, rings, d)
