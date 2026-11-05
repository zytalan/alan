# Plan

## Goal

A personal Gann **Square of Nine** tool: type a price (or a date), get the Gann
support/resistance levels and time projections, and see the square itself with
the number highlighted. It runs offline. Other Gann squares (144, 90, 52,
hexagon) come later, only if needed.

## The math it is built on

**The spiral.** The center cell holds the start value (default 1). Numbers wind
outward one cell at a time. Ring *k* holds 8·*k* cells, so ring 1 ends at 9, ring 2
at 25, ring 3 at 49: the odd squares, which sit on one diagonal. The two crosses
through the center are the **cardinal cross** (0/90/180/270°) and the **ordinal
cross** (45/135/225/315°). Published charts differ in direction (clockwise or
counter-clockwise) and in which way the first step goes, so both are settings.

**Price ↔ degrees.** One full turn (360°) adds 2 to √price. So the level θ degrees
away from a price *P* is

    up:   (√P + θ/180)²
    down: (√P − θ/180)²

Example, *P* = 100: +90° → 110.25, +180° → 121, +360° → 144; −180° → 81,
−360° → 64. A price's own angle on the square is `((√P − 1) × 180) mod 360`.

**Scaling.** The square works best when the price falls roughly between 10 and
10 000. A price unit factor handles the rest (×100 for 1.0850, ÷100 for 98 000).
The tool always shows which factor it used.

**Time.** A count of days, weeks or bars from a pivot goes on the same square and
uses the same angle math, which gives projected turn dates. The calendar
divisions of the year (45, 90, 120, 135, 180, 225, 240, 270, 315, 360 days) come
alongside. "Squaring price and time" is flagged when the time count and the
(scaled) price move land on the same degree.

## Layout

```
gann-square/
  gannsquare/
    spiral.py       # number ↔ (ring, x, y, angle); crosses; grid of any size
    levels.py       # price ↔ degrees, level tables, scaling
    timecycles.py   # date projections from a pivot
    render.py       # writes the interactive HTML square
    cli.py          # the `gann` command
  tests/            # golden values (e.g. 100 → 121 at +180°) + layout checks
  docs/PLAN.md
```

The only dependencies are typer and rich, the same CLI stack as the
industry-chain tool in this repo. There is no numpy, no web framework and no
build step.

## Phases

**Phase 0: Scaffold** ✅ Package, `gann --version` and a smoke test.

**Phase 1: Core math.** `spiral.py` and `levels.py`: the start value, step,
direction and start side are all settings; levels for any list of angles over N
turns; cardinal and ordinal values for each ring; the scale factor. Tested
against values worked out by hand.

**Phase 2: CLI.**
- `gann levels 2650.5`: a table of the levels above and below at 45° steps,
  marking the 90/180/360° ones.
- `gann where 2650.5`: the ring, the degree, and the nearest cross line.
- `gann square --size 9 --center 1`: the square printed in the terminal with
  both crosses colored and an optional highlighted price.
- `gann time 2026-03-15 --pivot high`: projected dates from a pivot.

**Phase 3: Interactive HTML square.** `gann render -o square.html` writes one
self-contained file that you open by double-clicking. It has a price input box
that highlights the cell and draws its angle lines, a levels table that updates
as you type, hover tooltips, zoom, and a light/dark theme. The page needs the
two formulas in JavaScript. The Python tests write a golden-values file, and a
browser test checks that the page gives the same numbers.

**Phase 4: Optional, pick what's useful.**
- Other squares: 144, 90, 52 (weekly), and the hexagon.
- Load an OHLC CSV (exported from your broker or charting tool) and draw the
  levels and time projections on a price chart, starting from pivots it finds.
- Gann angles / fan (1×1, 2×1, 1×2 …) from a chosen pivot.
- Saved presets for each instrument: scale factor, step, and favourite angles.

## Open decisions

1. Which instruments and price ranges you use it on. This sets the default
   scaling.
2. The orientation of your reference chart, if you have one (direction, and
   where 2 sits relative to 1).
3. Whether time projections should count calendar days, trading days, or bars.
4. Whether you want both the CLI and the HTML page, or only the page.
