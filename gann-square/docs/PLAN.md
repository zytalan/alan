# Plan

## Goal

A personal Gann **Square of Nine** you can use on any instrument. It shows the
square itself with any range of numbers or dates in the cells, and gives the
square-root price and time levels from any cell. It runs offline.

## Decisions

- **Layout** follows the generator on ganninvestor.com: 1 in the centre, 2 directly
  left of it, numbers winding clockwise, and odd squares (9, 25, 49 …) on the
  lower-left diagonal.
- **Range** is adjustable. Start (the centre value), End and Step decide the
  numbers, for example 100 → 5000 with step 1, which takes 35 rings. The square
  is always completed to a full ring and is capped at 75 rings (22,801 cells).
- **Dates** can replace the numbers. Pick a centre date and what each cell adds:
  a calendar day, a trading day (Mon–Fri), a week, a month or a year. The
  numbers can stay underneath the dates.
- Both tools are built: the **interactive page** and the **`gann` CLI**.

## The math

**Spiral.** Ring *k* holds the 8·*k* cells from (2k−1)²+1 to (2k+1)². Degrees run
clockwise around each ring from the odd-square diagonal (0°). That puts the W, N,
E and S cross at 45°, 135°, 225° and 315°, and the NW, NE and SE diagonals at 90°,
180° and 270°.

**Price levels.** One full turn adds 2 to √price, so the level θ° away from *P* is
(√P ± θ/180)². From 100: +90° → 110.25, +180° → 121, +360° → 144, −180° → 81.
Prices outside 100–10,000 are scaled by a power of ten first (Auto), or by a
factor you choose.

**Time levels.** In date mode the same rule runs on the cell number *n* and
converts the answer back to a date: (√n ± θ/180)² cells from the centre date.
`gann time` lists the dates that land on the crosses and diagonals when a pivot
date is the centre.

**Trends (上升趋势 / 下降趋势).** These reproduce the marking on ganninvestor.com,
which I worked out by clicking every cell of its square headlessly:

1. The pivot faces a diagonal if it sits within a few cells of a corner (1 cell
   on rings 2–5, 2 on rings 6–7, 3 from ring 8 out). Otherwise it faces its side.
2. Line 1 runs from the pivot straight inward, across the square.
3. Line 2 is the centre line at right angles to it, taken from where they cross,
   towards the side 90° clockwise of the pivot for an uptrend (the way the numbers
   grow) or 90° counter-clockwise for a downtrend.
4. An uptrend keeps cells up to one full turn past the pivot (n + 8k). A
   downtrend keeps the cells numbered below the pivot.

On a 14-ring and a 30-ring square this matches the site cell for cell, except
for cells 119 and 222, where the site's hand-written cases are lopsided. The
site also fails on uptrends from its outermost ring; here they are clipped to
the square.

## Layout

```
gann-square/
  gannsquare/
    spiral.py      # cell number ↔ (x, y), rings, degrees, cross/diagonal lines
    levels.py      # square-root levels, auto scaling
    trend.py       # uptrend / downtrend cells from a pivot
    square.py      # Start/End/Step values; date labels (day, trading, week, month, year)
    render.py      # writes the page as a standalone HTML file
    cli.py         # the `gann` command
    web/square.html  # the interactive page (its math mirrors the Python modules)
  tests/           # reference layout, worked values, dates, CLI, JS-vs-Python parity
```

`tests/test_web_parity.py` runs the page's own JavaScript in Node.js and checks
that it gives the same answers as the Python modules. The test is skipped if
Node.js isn't installed.

## Phases

- **Phase 0: Scaffold** ✅
- **Phase 1: Core math** ✅ Spiral, levels, ranges and date labels, all tested.
- **Phase 2: CLI** ✅ `levels`, `where`, `square`, `time`, `render`.
- **Phase 3: Interactive page** ✅ Adjustable range, number or date cells, angle
  lines, ring shading, find, select (shows the levels and rings them on the
  square), colour marks, diagonals through the selection, zoom. Settings and marks
  are remembered in the browser.
- **Phase 3b: Trends** ✅ Up / down / both from the selected cell, with solid fills,
  split cells where they overlap, and direction arrows (page), plus
  `gann square --mark N --trend up|down|both` (terminal).
- **Phase 4: Next, pick what's useful**
  - Several pivots at once (e.g. uptrend from a low and downtrend from a high).
  - Chinese interface.
  - Mirror cells (the reference site's 镜像) and more angle-line options.
  - Other squares: 144, 90, 52 (weekly), and the hexagon.
  - Load an OHLC CSV and draw the levels and time projections on a price chart.
  - Gann fan angles (1×1, 2×1, 1×2 …) from a pivot.
  - Saved presets for each instrument.
