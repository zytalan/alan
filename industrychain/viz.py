"""Interactive HTML visualization of the industry chain.

Writes a self-contained HTML page that renders the graph with vis-network
(loaded from a CDN), colour-coded by node type with directed edges. Interactions:

* click a node to highlight just its upstream+downstream chain (everything else dims)
* toggle node types on/off with the legend checkboxes
* reset view button, hover tooltips, zoom/pan, drag

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
  body { margin:0; font-family:"Segoe UI",Helvetica,Arial,sans-serif; background:#0e0e10; color:#ddd; }
  #header { padding:10px 16px 4px; color:#f0f0f0; font-size:16px; }
  #controls { padding:6px 16px 10px; font-size:13px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .chip { display:inline-flex; align-items:center; gap:5px; padding:2px 10px; border-radius:11px; color:#fff; cursor:pointer; user-select:none; }
  .chip input { margin:0; }
  #reset { background:#333; color:#ddd; border:1px solid #555; border-radius:6px; padding:3px 10px; cursor:pointer; }
  #reset:hover { background:#444; }
  #sel { color:#9a9a9a; margin-left:6px; }
  #net { width:100vw; height:calc(100vh - 92px); border-top:1px solid #2a2a2a; }
</style>
</head>
<body>
<div id="header"><b>__TITLE__</b></div>
<div id="controls">
  <label class="chip" style="background:#1f77b4"><input type="checkbox" class="tf" value="product" checked>product</label>
  <label class="chip" style="background:#8c564b"><input type="checkbox" class="tf" value="material" checked>material</label>
  <label class="chip" style="background:#2ca02c"><input type="checkbox" class="tf" value="industry" checked>industry</label>
  <label class="chip" style="background:#d62728"><input type="checkbox" class="tf" value="company" checked>company</label>
  <button id="reset">reset view</button>
  <span id="sel">click a node to highlight its chain &middot; arrows point downstream</span>
</div>
<div id="net"></div>
<script>
  const rawNodes = __NODES__;
  const rawEdges = __EDGES__;
  const nodes = new vis.DataSet(rawNodes);
  const edges = new vis.DataSet(rawEdges);

  const origColor = {};
  rawNodes.forEach(n => origColor[n.id] = n.color);

  // adjacency: the input_to supply backbone (both directions) plus any-edge neighbours
  const upIn = {}, downIn = {}, anyNbr = {};
  rawEdges.forEach(e => {
    (anyNbr[e.from] = anyNbr[e.from] || []).push(e.to);
    (anyNbr[e.to]   = anyNbr[e.to]   || []).push(e.from);
    if (e.rel === 'input_to') {
      (downIn[e.from] = downIn[e.from] || []).push(e.to);
      (upIn[e.to]     = upIn[e.to]     || []).push(e.from);
    }
  });

  function chainSet(start) {
    const set = new Set([start]);
    const walk = (adj) => {
      const stack = [start];
      while (stack.length) {
        const n = stack.pop();
        (adj[n] || []).forEach(m => { if (!set.has(m)) { set.add(m); stack.push(m); } });
      }
    };
    walk(upIn); walk(downIn);
    (anyNbr[start] || []).forEach(m => set.add(m));  // directly attached companies/industries
    return set;
  }

  function highlight(set) {
    nodes.update(rawNodes.map(n => ({
      id: n.id,
      color: set.has(n.id) ? origColor[n.id] : '#2b2b2b',
      font: { color: set.has(n.id) ? '#e6e6e6' : '#555' }
    })));
    edges.update(rawEdges.map(e => ({
      id: e.id,
      color: { color: (set.has(e.from) && set.has(e.to)) ? '#b0b0b0' : '#242424' }
    })));
  }

  function reset() {
    nodes.update(rawNodes.map(n => ({ id: n.id, color: origColor[n.id], font: { color: '#e6e6e6' } })));
    edges.update(rawEdges.map(e => ({ id: e.id, color: { color: '#5a5a5a' } })));
  }

  function applyFilters() {
    const active = new Set(Array.from(document.querySelectorAll('.tf:checked')).map(c => c.value));
    nodes.update(rawNodes.map(n => ({ id: n.id, hidden: !active.has(n.group) })));
  }

  const sel = document.getElementById('sel');
  const network = new vis.Network(
    document.getElementById('net'),
    { nodes: nodes, edges: edges },
    {
      nodes: { shape: 'dot', scaling: { min: 10, max: 42 }, font: { color: '#e6e6e6', size: 14 } },
      edges: { arrows: 'to', color: { color: '#5a5a5a' }, smooth: { type: 'dynamic' },
               font: { size: 10, color: '#9a9a9a', strokeWidth: 0 } },
      physics: { stabilization: true,
                 barnesHut: { gravitationalConstant: -9000, springLength: 130, springConstant: 0.03 } },
      interaction: { hover: true, tooltipDelay: 120, navigationButtons: true, keyboard: true }
    }
  );

  network.on('click', params => {
    if (params.nodes.length) {
      const id = params.nodes[0];
      highlight(chainSet(id));
      sel.textContent = 'chain of: ' + nodes.get(id).label;
    } else {
      reset();
      sel.textContent = 'click a node to highlight its chain';
    }
  });

  document.getElementById('reset').addEventListener('click', () => {
    reset();
    document.querySelectorAll('.tf').forEach(c => c.checked = true);
    applyFilters();
    sel.textContent = 'click a node to highlight its chain';
  });
  document.querySelectorAll('.tf').forEach(c => c.addEventListener('change', applyFilters));
</script>
</body>
</html>
"""


def to_html(graph: nx.MultiDiGraph, path: str | Path, *, title: str = "Industry chain") -> None:
    """Render ``graph`` to a standalone, interactive HTML file at ``path``."""
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
    for i, (src, dst, key, data) in enumerate(graph.edges(keys=True, data=True)):
        etype = data.get("type", key)
        # Keep the backbone clean; only label edges that carry extra meaning.
        label = data.get("via") or ("" if etype == "input_to" else str(etype).replace("_", " "))
        edges.append({"id": i, "from": src, "to": dst, "label": label, "rel": etype})

    html = (
        _TEMPLATE.replace("__TITLE__", title)
        .replace("__NODES__", json.dumps(nodes))
        .replace("__EDGES__", json.dumps(edges))
    )
    Path(path).write_text(html, encoding="utf-8")
