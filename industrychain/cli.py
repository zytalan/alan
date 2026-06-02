"""Command-line interface: ``ic``.

No GUI yet — this CLI plus the Python API and graph-file exports are how you use
the tool for now. Run ``ic --help`` to see all commands.
"""

from __future__ import annotations

import os
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table
from rich.tree import Tree

from . import export as export_mod
from .graph import Hop, IndustryGraph
from .models import NodeType
from .providers.ai import AIProvider
from .providers.curated import load_file
from .store import SQLiteStore

app = typer.Typer(
    add_completion=False,
    help="Industry Chain Graph — map upstream/downstream connections between "
    "products, materials, industries and companies.",
)
console = Console()

DEFAULT_DB = os.environ.get("IC_DB", "data/industrychain.db")
SAMPLE_FILE = Path(__file__).parent / "data" / "sample_lithium_battery.yaml"

_state = {"db": DEFAULT_DB}


@app.callback()
def main(db: str = typer.Option(DEFAULT_DB, help="Path to the SQLite graph database.")) -> None:
    _state["db"] = db


def _graph() -> IndustryGraph:
    return IndustryGraph(SQLiteStore(_state["db"]))


def _resolve_or_exit(graph: IndustryGraph, name: str, type: NodeType | None = None):
    node = graph.resolve(name, type)
    if node is None:
        console.print(f"[yellow]Not found:[/yellow] {name}  (try `ic stats` or `ic load-sample`)")
        raise typer.Exit(1)
    return node


# --------------------------------------------------------------------------
# Ingestion commands
# --------------------------------------------------------------------------
@app.command()
def expand(
    name: str,
    type: NodeType = typer.Option(NodeType.PRODUCT, "--type", "-t", help="Entity type."),
    model: str = typer.Option(None, "--model", help="Override the Claude model."),
) -> None:
    """Use Claude to expand NAME into its industry-chain subgraph and store it."""
    graph = _graph()
    provider = AIProvider(model=model) if model else AIProvider()
    try:
        subgraph = provider.expand(name, type)
    except RuntimeError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1)
    graph.ingest(subgraph)
    console.print(
        f"[green]Ingested[/green] {len(subgraph.nodes)} nodes, "
        f"{len(subgraph.edges)} edges for [bold]{name}[/bold]."
    )
    _print_overview(graph, name)


@app.command()
def load(path: Path = typer.Argument(..., help="A curated subgraph file (JSON or YAML).")) -> None:
    """Load a curated subgraph file into the graph (overrides AI data on conflict)."""
    graph = _graph()
    subgraph = load_file(path)
    graph.ingest(subgraph)
    console.print(
        f"[green]Loaded[/green] {len(subgraph.nodes)} nodes, {len(subgraph.edges)} edges from {path}."
    )


@app.command("load-sample")
def load_sample() -> None:
    """Load the bundled lithium-ion battery example (no API key required)."""
    graph = _graph()
    subgraph = load_file(SAMPLE_FILE)
    graph.ingest(subgraph)
    console.print(
        f"[green]Loaded sample[/green]: {len(subgraph.nodes)} nodes, {len(subgraph.edges)} edges. "
        "Try `ic upstream 'lithium-ion battery'`."
    )


# --------------------------------------------------------------------------
# Query commands
# --------------------------------------------------------------------------
@app.command()
def show(name: str) -> None:
    """Show a node and its immediate connections."""
    _print_overview(_graph(), name)


@app.command()
def upstream(name: str, depth: int = typer.Option(2, "--depth", "-d")) -> None:
    """Show the raw materials and inputs that go INTO making NAME."""
    _print_tree(name, "upstream", depth)


@app.command()
def downstream(name: str, depth: int = typer.Option(2, "--depth", "-d")) -> None:
    """Show the products and sectors that NAME feeds into."""
    _print_tree(name, "downstream", depth)


@app.command()
def companies(name: str) -> None:
    """List companies associated with NAME."""
    graph = _graph()
    node = _resolve_or_exit(graph, name)
    found = graph.companies(node.id)
    if not found:
        console.print(f"[yellow]No companies recorded for {node.name}.[/yellow]")
        return
    for company in found:
        console.print(f"  - [red]{company.name}[/red]  [dim]({company.provenance.source.value})[/dim]")


@app.command()
def path(a: str, b: str) -> None:
    """Show how two entities are connected through the chain."""
    graph = _graph()
    na = _resolve_or_exit(graph, a)
    nb = _resolve_or_exit(graph, b)
    chain = graph.path(na.id, nb.id)
    if not chain:
        console.print(f"[yellow]No connection found between {a} and {b}.[/yellow]")
        return
    console.print(" -> ".join(f"[cyan]{n.name}[/cyan]" for n in chain))


@app.command()
def export(
    name: str,
    format: str = typer.Option("graphml", "--format", "-f", help="graphml | dot | json"),
    out: Path = typer.Option(None, "--out", "-o", help="Output path."),
    depth: int = typer.Option(2, "--depth", "-d"),
) -> None:
    """Export NAME's industry chain to a graph file (GraphML / DOT / JSON)."""
    graph = _graph()
    node = _resolve_or_exit(graph, name)
    sub = graph.chain_subgraph(node.id, depth=depth)
    out = out or Path(f"{node.id.replace(':', '_')}.{format}")
    if format == "json":
        out.write_text(export_mod.to_json(sub))
    elif format == "graphml":
        export_mod.to_graphml(sub, out)
    elif format == "dot":
        export_mod.to_dot(sub, out)
    else:
        console.print(f"[red]Unknown format: {format}[/red] (use graphml, dot or json)")
        raise typer.Exit(1)
    console.print(
        f"[green]Wrote[/green] {out}  ({sub.number_of_nodes()} nodes, {sub.number_of_edges()} edges)"
    )


@app.command()
def stats() -> None:
    """Show counts of what's in the graph."""
    graph = _graph()
    counts: dict[str, int] = {}
    for node in graph.store.nodes():
        counts[node.type.value] = counts.get(node.type.value, 0) + 1
    table = Table(title="Industry chain graph")
    table.add_column("node type")
    table.add_column("count", justify="right")
    for node_type, count in sorted(counts.items()):
        table.add_row(node_type, str(count))
    console.print(table)
    console.print(f"edges: {len(graph.store.edges())}")


# --------------------------------------------------------------------------
# Rendering helpers
# --------------------------------------------------------------------------
def _print_overview(graph: IndustryGraph, name: str) -> None:
    node = _resolve_or_exit(graph, name)
    prov = node.provenance
    console.print(
        f"\n[bold]{node.name}[/bold] [dim]({node.type.value})[/dim]  id=[cyan]{node.id}[/cyan]"
    )
    console.print(
        f"[dim]source={prov.source.value} confidence={prov.confidence} verified={prov.verified}[/dim]"
    )
    industries = graph.industries(node.id)
    ups = graph.upstream(node.id, depth=1)
    downs = graph.downstream(node.id, depth=1)
    comps = graph.companies(node.id)
    if industries:
        console.print("  [green]industries[/green]: " + ", ".join(i.name for i in industries))
    if ups:
        console.print("  [magenta]upstream[/magenta] (inputs): " + ", ".join(h.node.name for h in ups))
    if downs:
        console.print("  [blue]downstream[/blue] (uses): " + ", ".join(h.node.name for h in downs))
    if comps:
        console.print("  [red]companies[/red]: " + ", ".join(c.name for c in comps))


def _print_tree(name: str, direction: str, depth: int) -> None:
    graph = _graph()
    node = _resolve_or_exit(graph, name)
    hops: list[Hop] = getattr(graph, direction)(node.id, depth=depth)
    root = Tree(f"[bold]{node.name}[/bold] [dim]({direction}, depth {depth})[/dim]")
    branches = {node.id: root}
    for hop in hops:
        parent = branches.get(hop.parent, root)
        via = f" [dim]via {hop.via.value}[/dim]" if hop.via.value != "input_to" else ""
        branches[hop.node.id] = parent.add(
            f"{hop.node.name} [dim]({hop.node.type.value})[/dim]{via}"
        )
    if not hops:
        root.add("[dim](nothing recorded yet)[/dim]")
    console.print(root)


def run() -> None:
    app()


if __name__ == "__main__":
    run()
