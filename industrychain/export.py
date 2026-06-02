"""Export a (sub)graph to standard formats.

This is your "view" until there's a real UI: GraphML and GEXF open in Gephi/yEd,
DOT renders with Graphviz (``dot -Tpng x.dot -o x.png``), and JSON is handy for
notebooks or a future web frontend.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import networkx as nx

_TYPE_COLOR = {
    "product": "#1f77b4",
    "material": "#8c564b",
    "industry": "#2ca02c",
    "company": "#d62728",
}


def _scalar(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)):
        return value
    if value is None:
        return ""
    return json.dumps(value, default=str)


def to_json(graph: nx.MultiDiGraph) -> str:
    return json.dumps(nx.node_link_data(graph), indent=2, default=str)


def to_graphml(graph: nx.MultiDiGraph, path: str | Path) -> None:
    # GraphML only accepts scalar attribute values, so coerce everything.
    clean = nx.MultiDiGraph()
    for node, data in graph.nodes(data=True):
        clean.add_node(node, **{k: _scalar(v) for k, v in data.items()})
    for u, v, key, data in graph.edges(keys=True, data=True):
        clean.add_edge(u, v, key=str(key), **{k: _scalar(v) for k, v in data.items()})
    nx.write_graphml(clean, str(path))


def to_dot(graph: nx.MultiDiGraph, path: str | Path) -> None:
    lines = [
        "digraph industrychain {",
        "  rankdir=LR;",
        '  node [shape=box, style="rounded,filled", fillcolor="#ffffff", fontname="Helvetica"];',
    ]
    for node, data in graph.nodes(data=True):
        label = str(data.get("name", node)).replace('"', "'")
        color = _TYPE_COLOR.get(data.get("type"), "#333333")
        lines.append(f'  "{node}" [label="{label}", color="{color}"];')
    for u, v, key, _data in graph.edges(keys=True, data=True):
        lines.append(f'  "{u}" -> "{v}" [label="{key}"];')
    lines.append("}")
    Path(path).write_text("\n".join(lines) + "\n")
