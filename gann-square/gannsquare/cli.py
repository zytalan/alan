"""Command-line interface: ``gann``. Run ``gann --help`` for the commands."""

from __future__ import annotations

import math
import webbrowser
from datetime import date
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table
from rich.text import Text

from . import __version__, spiral
from . import levels as lv
from .render import render_document
from .square import UNIT_LABELS, UNITS, Square, date_at, decimals_of, long_date, short_date
from .trend import trend_cells

app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="Gann Square of Nine — price and time levels.",
)
console = Console()
DEFAULT_OUTPUT = Path("gann-square.html")


@app.callback(invoke_without_command=True)
def main(
    version: bool = typer.Option(False, "--version", help="Show the version and exit."),
) -> None:
    if version:
        typer.echo(__version__)
        raise typer.Exit()


def _fail(message: str) -> None:
    console.print(f"[red]{message}[/red]")
    raise typer.Exit(1)


def _parse_date(text: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError:
        _fail(f"{text!r} is not a date; use YYYY-MM-DD.")
        raise  # unreachable


def _check_unit(unit: str) -> None:
    if unit not in UNITS:
        _fail(f"Unknown unit {unit!r}; use one of: {', '.join(UNITS)}.")


def _exponent(price: float, scale: str) -> int:
    if scale == "auto":
        return lv.auto_exponent(price)
    try:
        factor = float(scale)
        e = round(math.log10(factor))
    except ValueError:
        e = None
    if e is None or not math.isclose(factor, 10.0**e):
        _fail("--scale must be 'auto' or a power of ten such as 100 or 0.01.")
    return e


@app.command()
def levels(
    price: float = typer.Argument(..., help="Price to measure from."),
    every: float = typer.Option(45, help="Degrees between levels."),
    turns: int = typer.Option(1, help="Full 360° turns to list."),
    scale: str = typer.Option("auto", help="'auto' or a power of ten, e.g. 100 or 0.01."),
) -> None:
    """Support/resistance levels above and below a price: (√P ± angle/180)²."""
    if price <= 0:
        _fail("Price must be above 0.")
    e = _exponent(price, scale)
    dec = max(2, min(8, decimals_of(price)))
    table = Table(title=f"Levels from {price:,.{dec}f}", title_justify="left")
    table.add_column("Angle", justify="right")
    table.add_column("Above", justify="right", style="green")
    table.add_column("Below", justify="right", style="magenta")
    for row in lv.levels(price, every, turns, e):
        style = "bold" if abs(row.deg % 90) < 1e-9 else None
        table.add_row(
            f"{row.deg:g}°",
            "—" if row.up is None else f"{row.up:,.{dec}f}",
            "—" if row.down is None else f"{row.down:,.{dec}f}",
            style=style,
        )
    console.print(table)
    if e:
        console.print(f"[dim]Scaled by 10^{e} for the rule, then scaled back.[/dim]")


@app.command()
def where(
    value: float = typer.Argument(..., help="Number to locate on the square."),
    start: float = typer.Option(1, help="Number in the centre cell."),
    step: float = typer.Option(1, help="Increase from one cell to the next."),
) -> None:
    """Where a number sits on the square: cell, ring, angle and nearest line."""
    sq = Square(start, step, spiral.MAX_RINGS * 100)
    n = sq.cell_for(value)
    if n is None:
        _fail(f"{value:g} is below the centre value {start:g}.")
    x, y = spiral.coords(n)
    line = spiral.line_at(n)
    a, b = spiral.between(n)
    console.print(
        f"[bold]{sq.label(n)}[/bold] is cell {n:,} at ({x}, {y}), ring {spiral.ring_of(n)}"
    )
    console.print(
        f"On the square: {spiral.degree(n):.1f}° — "
        + (f"on the {line}" if line else f"between {a} and {b}")
    )
    if value > 0:
        console.print(f"√ degree of {value:g}: {lv.sqrt_degree(value):.1f}°")


@app.command()
def square(
    start: float = typer.Option(1, help="Number in the centre cell."),
    end: float = typer.Option(81, help="Last number the square must reach."),
    step: float = typer.Option(1, help="Increase from one cell to the next."),
    dates: str | None = typer.Option(
        None, "--dates", help="Show dates instead, starting at this YYYY-MM-DD."
    ),
    unit: str = typer.Option("day", help=f"Date step per cell: {', '.join(UNITS)}."),
    mark: float | None = typer.Option(None, help="Highlight the cell holding this number."),
    trend: str | None = typer.Option(
        None,
        help="With --mark: show the 'up' (上升), 'down' (下降) or 'both' trends from that cell.",
    ),
) -> None:
    """Print the square in the terminal: cross in blue, diagonals in red."""
    _check_unit(unit)
    if trend not in (None, "up", "down", "both"):
        _fail("--trend must be 'up', 'down' or 'both'.")
    if trend and mark is None:
        _fail("--trend needs --mark to choose the pivot cell.")
    try:
        sq = Square.spanning(start, end, step)
    except ValueError as exc:
        _fail(str(exc))
    if sq.rings > 15:
        console.print(
            f"[yellow]{sq.rings} rings is wide for a terminal; try `gann render` for this one.[/yellow]"
        )
    d0 = _parse_date(dates) if dates else None
    labels = {
        n: short_date(date_at(d0, n, unit), unit) if d0 else sq.label(n)
        for n in range(1, sq.cells + 1)
    }
    width = max(len(s) for s in labels.values())
    marked = sq.cell_for(mark) if mark is not None else None
    if mark is not None and marked is None:
        _fail(f"{mark:g} is not on this square.")
    up = set(trend_cells(marked, sq.rings, "up")) if trend in ("up", "both") else set()
    down = set(trend_cells(marked, sq.rings, "down")) if trend in ("down", "both") else set()
    out = Text()
    for row in spiral.grid(sq.rings):
        for col, n in enumerate(row):
            line = spiral.line_at(n)
            style = ""
            if n == marked and trend:
                style = "reverse bold"
            elif n in up:
                style = "bold white on red"
            elif n in down:
                style = "bold white on green"
            elif n == 1:
                style = "bold"
            elif trend:
                style = ""
            elif line and "cross" in line:
                style = "bold blue"
            elif line and "diagonal" in line:
                style = "bold red"
            if n == marked:
                style = "reverse bold yellow"
            out.append(labels[n].rjust(width), style=style or None)
            out.append(" " if col < len(row) - 1 else "\n")
    console.print(out, end="")
    if sq.capped:
        console.print(f"[yellow]Capped at {spiral.MAX_RINGS} rings.[/yellow]")


@app.command()
def time(
    pivot: str = typer.Argument(..., help="Pivot date (YYYY-MM-DD); it becomes cell 1."),
    unit: str = typer.Option("day", help=f"What one cell counts: {', '.join(UNITS)}."),
    rings: int = typer.Option(4, help="How many rings out to list."),
) -> None:
    """Dates that land on the crosses and diagonals when the pivot is the centre."""
    _check_unit(unit)
    d0 = _parse_date(pivot)
    table = Table(
        title=f"From {long_date(d0, unit)}, counting {UNIT_LABELS[unit]}", title_justify="left"
    )
    for col in ("Ring", "Cell", "Line", "Angle", "Date"):
        table.add_column(col, justify="right" if col in ("Ring", "Cell", "Angle") else "left")
    for k in range(1, rings + 1):
        for j in range(1, 9):
            n = (2 * k - 1) ** 2 + j * k
            line = spiral.LINE_NAMES[j]
            style = "blue" if "cross" in line else "red"
            table.add_row(
                str(k),
                f"{n:,}",
                Text(line, style=style),
                f"{spiral.degree(n):g}°",
                long_date(date_at(d0, n, unit), unit),
            )
        if k < rings:
            table.add_section()
    console.print(table)


@app.command()
def render(
    output: Path = typer.Option(DEFAULT_OUTPUT, "-o", "--output", help="File to write."),
    start: float | None = typer.Option(None, help="Centre number."),
    end: float | None = typer.Option(None, help="Last number."),
    step: float | None = typer.Option(None, help="Increase per cell."),
    dates: str | None = typer.Option(
        None, "--dates", help="Open in date mode from this YYYY-MM-DD."
    ),
    unit: str | None = typer.Option(None, help=f"Date step per cell: {', '.join(UNITS)}."),
    open_: bool = typer.Option(False, "--open", help="Open it in your browser."),
) -> None:
    """Write the interactive square as one HTML file (works offline)."""
    settings: dict = {}
    for key, value in (("start", start), ("end", end), ("step", step)):
        if value is not None:
            settings[key] = value
    if dates:
        _parse_date(dates)
        settings.update(mode="date", startDate=dates)
    if unit:
        _check_unit(unit)
        settings["unit"] = unit
    output.write_text(render_document(settings), encoding="utf-8")
    console.print(f"Wrote [bold]{output}[/bold]")
    if open_:
        webbrowser.open(output.resolve().as_uri())


def run() -> None:
    app()
