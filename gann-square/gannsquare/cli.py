"""Command-line interface: ``gann``.

Only ``--version`` exists for now; ``levels``, ``square``, ``where``, ``time`` and
``render`` are added in later phases (see ``docs/PLAN.md``).
"""

from __future__ import annotations

import typer

from . import __version__

app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="Gann Square of Nine — price and time levels.",
)


@app.callback(invoke_without_command=True)
def main(
    version: bool = typer.Option(False, "--version", help="Show the version and exit."),
) -> None:
    if version:
        typer.echo(__version__)
        raise typer.Exit()


def run() -> None:
    app()
