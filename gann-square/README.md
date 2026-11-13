# Gann Square

A personal **Gann Square of Nine**. It has an adjustable range (for example 100 →
5000), cells that can show numbers or dates (days, trading days, weeks, months,
years), and the square-root price and time levels from any cell. It runs
offline. See [`docs/PLAN.md`](docs/PLAN.md) for the math and the roadmap.

## Install

```powershell
cd gann-square
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
pytest
```

(On macOS/Linux, use `source .venv/bin/activate` instead of the Activate.ps1 line.)

## The interactive square

```powershell
gann render --open                                   # writes gann-square.html and opens it
gann render --start 100 --end 5000 -o s.html         # pre-filled range
gann render --dates 2026-01-02 --unit trading --open # open in date mode
```

On the page:

- **Range**: Start (centre), End and Step. The square grows to the rings it needs.
- **Cells show**: Numbers, or Dates from a centre date, adding 1 day, trading day,
  week, month or year per cell. Numbers can stay under the dates.
- **Click a cell** to select it. The panel shows its ring and angle and the levels
  every 45° (or 15°–180°), and rings those levels on the square: red above, green
  below. Switch to *Marks it* to color cells instead.
- **Trend (上升/下降趋势)**: in the toolbar, choose *Up*, *Down*, *Both* or *Off*. The
  selected cell is the pivot (yellow, thick border). The cells marked are the ones
  ganninvestor.com marks: a line from the pivot straight across the square, plus the
  centre line at right angles to it (90° clockwise for Up, counter-clockwise for Down).
  Uptrend cells are solid red, downtrend solid green, cells on both half and half.
  When cells show dates, the lines run on to the edge of the square so the dates after
  the pivot show too; those are solid, and the earlier part of each line is pale.
  Arrows along the cell edges show which way each line runs (*Arrows* switches them
  off). The panel lists the next marked values, or the next dates after the pivot.
- **Find** jumps to a number or a date (YYYY-MM-DD).
- **View**: angle lines, diagonals through the pivot, level rings on/off, ring shading,
  zoom. *Fit* sizes the cells so the whole square fits on screen.

Your settings and marks are kept in that browser.

## Command line

```powershell
gann levels 1234.5                  # levels above/below every 45°
gann levels 1.0850 --scale 10000    # small prices: pick the scale or leave it on auto
gann where 1234 --start 100         # cell, ring, angle, nearest line
gann square --end 49 --mark 30      # print the square, cross blue, diagonals red
gann square --end 81 --mark 50 --trend both  # up / down / both trends from pivot 50
gann square --end 25 --dates 2026-01-01 --unit month
gann time 2026-01-02 --unit trading # dates on the crosses/diagonals from a pivot
```

## Publishing it as a website

`docs/gann-square/index.html` (at the repo root) is a ready-to-serve copy of the page.
With GitHub Pages set to deploy `main` from `/docs`, it is live at
`https://zytalan.github.io/alan/gann-square/`.

After changing the page, refresh that copy (a test fails if you forget):

```powershell
gann render -o ../docs/gann-square/index.html
```
