"""Interactive HTML visualization of the industry chain.

Writes a self-contained HTML page that renders the graph with vis-network
(loaded from a CDN), colour-coded by node type with directed edges. This is the
closest thing to a visual "terminal" view until there's a full web UI: open the
file in any browser, drag nodes around, hover for details.

No extra Python dependency — the JavaScript loads from a CDN when the page opens.
"""

from __future__ import annotations

import json
from pathlib import Path

import networkx as nx

# Same palette as the DOT/GraphML exporters.
_TYPE_COLOR = {
    "product": "#1f77b4",
    "material": "#8c564b",
    "industry": "#2ca02c",
    "company": "#d62728",
}

_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>__TITLE__</title>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<style>
  body { margin: 0; font-family: "Segoe UI", Helvetica, Arial, sans-serif; background: #0e0e10; }
  #header { padding: 10px 16px; color: #f0f0f0; font-size: 16px; }
  #legend { padding: 4px 16px 10px; color: #bbb; font-size: 13px; }
  .chip { display: inline-block; padding: 2px 9px; margin-right: 8px; border-radius: 11px; color: #fff; }
  #net { width: 100vw; height: calc(100vh - 84px); border-top: 1px solid #2a2a2a; }
</style>
</head>
<body>
<div id="header"><b>__TITLE__</b></div>
<div id="legend">
  <span class="chip" style="background:#1f77b4">product</span>
  <span class="chip" style="background:#8c564b">material</span>
  <span class="chip" style="background:#2ca02c">industry</span>
  <span class="chip" style="background:#d62728">company</span>
  &nbsp;&mdash;&nbsp; arrows point downstream (raw material &rarr; product &rarr; finished good)
</div>
<div id="net"></div>
<script>
  const nodes = new vis.DataSet(__NODES__);
  const edges = new vis.DataSet(__EDGES__);
  new vis.Network(
    document.getElementById("net"),
    { nodes: nodes, edges: edges },
    {
      nodes: { shape: "dot", scaling: { min: 10, max: 42 },
               font: { color: "#e6e6e6", size: 14, face: "Segoe UI" } },
      edges: { arrows: "to", color: { color: "#5a5a5a", highlight: "#aaaaaa" },
               smooth: { type: "dynamic" },
               font: { size: 10, color: "#9a9a9a", strokeWidth: 0, align: "middle" } },
      physics: { stabilization: true,
                 barnesHut: { gravitationalConstant: -9000, springLength: 130, springConstant: 0.03 } },
      interaction: { hover: true, tooltipDelay: 120, navigationButtons: true, keyboard: true }
    }
  );
</script>
</body>
</html>
"""


def to_html(graph: nx.MultiDiGraph, path: str | Path, *, title: str = "Industry chain") -> None:
    """Render ``graph`` to a standalone interactive HTML file at ``path``."""
    nodes = []
    for node_id, data in graph.nodes(data=True):
        node_type = data.get("type", "")
        name = data.get("name", node_id)
        tooltip = f"{name} ({node_type})"
        if data.get("source"):
            tooltip += f" - source: {data['source']}"
        nodes.append(
            {
                "id": node_id,
                "label": name,
                "group": node_type,
                "value": graph.degree(node_id),  # hubs render larger
                "color": _TYPE_COLOR.get(node_type, "#777777"),
                "title": tooltip,
            }
        )

    edges = []
    for src, dst, key, data in graph.edges(keys=True, data=True):
        etype = data.get("type", key)
        # Keep the upstream/downstream backbone clean; only label edges that carry
        # extra meaning (a component name, or a non-input_to relationship).
        label = data.get("via") or ("" if etype == "input_to" else str(etype).replace("_", " "))
        edges.append({"from": src, "to": dst, "label": label})

    html = (
        _TEMPLATE.replace("__TITLE__", title)
        .replace("__NODES__", json.dumps(nodes))
        .replace("__EDGES__", json.dumps(edges))
    )
    Path(path).write_text(html, encoding="utf-8")
