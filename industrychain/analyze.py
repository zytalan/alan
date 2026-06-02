"""Analytics over the industry-chain graph.

The connections answer "what's related to what"; this layer answers "what matters
most" — which inputs are systemic choke-points, which nodes are the most
connected, and which companies touch the most of the chain.
"""

from __future__ import annotations

from dataclasses import dataclass

from .graph import IndustryGraph
from .models import EdgeType, Node, NodeType


@dataclass
class Ranked:
    node: Node
    score: int
    detail: str = ""


def _downstream_nodes(graph: IndustryGraph, node_id: str, types=None) -> list[Node]:
    # A depth equal to the node count is effectively unbounded; the BFS stops
    # early once it runs out of new nodes, and its seen-set prevents cycles.
    depth = max(1, len(graph.store.nodes()))
    nodes = [hop.node for hop in graph.downstream(node_id, depth=depth)]
    if types is not None:
        nodes = [n for n in nodes if n.type in types]
    return nodes


def choke_points(graph: IndustryGraph, top: int = 10) -> list[Ranked]:
    """Inputs (materials and intermediate goods) ranked by the number of distinct
    downstream products that transitively depend on them. A high score means many
    finished goods are affected if that input's supply is disrupted."""
    ranked: list[Ranked] = []
    for node in graph.store.nodes():
        if node.type not in (NodeType.MATERIAL, NodeType.PRODUCT):
            continue
        products = _downstream_nodes(graph, node.id, types={NodeType.PRODUCT})
        if products:
            sample = ", ".join(sorted(n.name for n in products)[:4])
            ranked.append(Ranked(node=node, score=len(products), detail=sample))
    ranked.sort(key=lambda r: (-r.score, r.node.name))
    return ranked[:top]


def hubs(graph: IndustryGraph, top: int = 10) -> list[Ranked]:
    """Nodes ranked by total number of connections (degree)."""
    g = graph.to_networkx()
    ranked: list[Ranked] = []
    for node_id in g.nodes():
        node = graph.store.get_node(node_id)
        if node is not None:
            ranked.append(Ranked(node=node, score=g.degree(node_id), detail=node.type.value))
    ranked.sort(key=lambda r: (-r.score, r.node.name))
    return ranked[:top]


def key_companies(graph: IndustryGraph, top: int = 10) -> list[Ranked]:
    """Companies ranked by how many products they manufacture."""
    ranked: list[Ranked] = []
    for node in graph.store.nodes():
        if node.type != NodeType.COMPANY:
            continue
        made = [
            graph.store.get_node(e.dst)
            for e in graph.store.edges_from(node.id)
            if e.type == EdgeType.MANUFACTURES
        ]
        made = [n for n in made if n is not None]
        if made:
            ranked.append(
                Ranked(node=node, score=len(made), detail=", ".join(sorted(n.name for n in made)))
            )
    ranked.sort(key=lambda r: (-r.score, r.node.name))
    return ranked[:top]
