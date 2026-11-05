# Gann Square

A personal **Gann Square of Nine** tool: price support/resistance levels, time
projections from pivots, and an interactive picture of the square. It runs
offline and doesn't need an API key.

Status: **Phase 0 (scaffold)**. See [`docs/PLAN.md`](docs/PLAN.md) for the math
and the roadmap.

## Install

```powershell
cd gann-square
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
gann --version
pytest
```

(On macOS/Linux, use `source .venv/bin/activate` instead of the Activate.ps1 line.)

## Planned usage

```powershell
gann levels 2650.5                 # levels above/below at 45° steps
gann where 2650.5                  # ring, degree, nearest cross line
gann square --size 9               # print the square, crosses colored
gann time 2026-03-15               # projected dates from a pivot
gann render -o square.html         # interactive square in your browser
```
