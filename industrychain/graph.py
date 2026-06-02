"""IndustryGraph: the public library API.

Wraps a :class:`GraphStore`, ingests subgraphs, and answers the questions this
tool exists for: what's upstream of X, what's downstream, which companies make
it, and how are two things connected. A networkx view is built on demand for
path-finding and export.
"""

from __future__ import annotations

from dataclasses import dataclass

import networkx as nx

from .models import Edge, EdgeType, Node, NodeType, slugify
from .providers.base import SubGraph
from .store import GraphStore


@dataclass
class Hop:
    """One step away from the start node during a traversal."""

    node: Node
    level: int  # distance from the start (1 = direct neighbour)
    parent: str  # id of the node we reached this one from
    via: EdgeType  # relationship type traversed


# When a name is ambiguous across types, prefer the more "concrete" entity.
_RESOLVE_ORDER = {
    NodeType.PRODUCT: 0,
    NodeType.MATERIAL: 1,
    NodeType.COMPANY: 2,
    NodeType.INDUSTRY: 3,
}


def _node_data(n: Node) -> dict:
    # Only scalars, so the graph exports cleanly to GraphML/JSON.
    return {
        "name": n.name,
        "type": n.type.value,
        "source": n.provenance.source.value,
        "confidence": n.provenance.confidence,
        "verified": n.provenance.verified,
    }


def _edge_data(e: Edge) -> dict:
    data = {"type": e.type.value, "source": e.provenance.source.value}
    if e.attributes.get("via"):
        data["via"] = e.attributes["via"]
    return data


class IndustryGraph:
    def __init__(self, store: GraphStore):
        self.store = store

    # ---- ingestion -------------------------------------------------------
    def ingest(self, subgraph: SubGraph) -> None:
        for node in subgraph.nodes:
            self.store.upsert_node(node)
        for edge in subgraph.edges:
            self.store.upsert_edge(edge)

    # ---- name resolution -------------------------------------------------
    def resolve(self, name: str, type: NodeType | None = None) -> Node | None:
        """Find a node by id, exact name, slug, or alias."""
        direct = self.store.get_node(name)
        if direct is not None:
            return direct

        target = slugify(name)
        matches: list[Node] = []
        for node in self.store.nodes():
            if type is not None and node.type != type:
                continue
            if slugify(node.name) == target or target in {slugify(a) for a in node.aliases}:
                matches.append(node)
        if not matches:
            return None
        matches.sort(key=lambda n: _RESOLVE_ORDER.get(n.type, 9))
        return matches[0]

    def search(self, query: str, type: NodeType | None = None) -> list[Node]:
        """Find nodes whose name or alias contains ``query`` (case-insensitive)."""
        needle = query.strip().lower()
        matches: list[Node] = []
        for node in self.store.nodes():
            if type is not None and node.type != type:
                continue
            haystacks = [node.name.lower(), *(a.lower() for a in node.aliases)]
            if any(needle in h for h in haystacks):
                matches.append(node)
        matches.sort(key=lambda n: (n.type.value, n.name))
        return matches

    # ---- traversal -------------------------------------------------------
    def upstream(self, node_id: str, depth: int = 2) -> list[Hop]:
        """Inputs that go into making this node (follows INPUT_TO backwards)."""
        return self._traverse(node_id, EdgeType.INPUT_TO, incoming=True, depth=depth)

    def downstream(self, node_id: str, depth: int = 2) -> list[Hop]:
        """Products/sectors this node feeds into (follows INPUT_TO forwards)."""
        return self._traverse(node_id, EdgeType.INPUT_TO, incoming=False, depth=depth)

    def _traverse(self, start_id: str, edge_type: EdgeType, *, incoming: bool, depth: int) -> list[Hop]:
        if self.store.get_node(start_id) is None:
            return []
        seen = {start_id}
        frontier = [start_id]
        hops: list[Hop] = []
        for level in range(1, depth + 1):
            nxt: list[str] = []
            for current in frontier:
                if incoming:
                    edges = [(e.src, e) for e in self.store.edges_to(current) if e.type == edge_type]
                else:
                    edges = [(e.dst, e) for e in self.store.edges_from(current) if e.type == edge_type]
                for neighbour_id, edge in edges:
                    if neighbour_id in seen:
                        continue
                    seen.add(neighbour_id)
                    node = self.store.get_node(neighbour_id)
                    if node is not None:
                        hops.append(Hop(node=node, level=level, parent=current, via=edge.type))
                        nxt.append(neighbour_id)
            frontier = nxt
            if not frontier:
                break
        return hops

    def companies(self, node_id: str) -> list[Node]:
        out = []
        for edge in self.store.edges_to(node_id):
            if edge.type == EdgeType.MANUFACTURES:
                node = self.store.get_node(edge.src)
                if node is not None:
                    out.append(node)
        return out

    def industries(self, node_id: str) -> list[Node]:
        out = []
        for edge in self.store.edges_from(node_id):
            if edge.type in (EdgeType.BELONGS_TO, EdgeType.OPERATES_IN):
                node = self.store.get_node(edge.dst)
                if node is not None:
                    out.append(node)
        return out

    def path(self, a_id: str, b_id: str) -> list[Node]:
        """Shortest connection between two nodes, ignoring edge direction."""
        graph = self.to_networkx()
        try:
            ids = nx.shortest_path(graph.to_undirected(as_view=True), a_id, b_id)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []
        return [n for n in (self.store.get_node(i) for i in ids) if n is not None]

    # ---- networkx view / export -----------------------------------------
    def to_networkx(self) -> nx.MultiDiGraph:
        graph = nx.MultiDiGraph()
        for node in self.store.nodes():
            graph.add_node(node.id, **_node_data(node))
        for edge in self.store.edges():
            graph.add_edge(edge.src, edge.dst, key=edge.type.value, **_edge_data(edge))
        return graph

    def chain_subgraph(self, node_id: str, depth: int = 2) -> nx.MultiDiGraph:
        """The neighbourhood worth exporting: the full up/downstream chain plus
        the center node's industries and companies."""
        ids = {node_id}
        ids |= {h.node.id for h in self.upstream(node_id, depth)}
        ids |= {h.node.id for h in self.downstream(node_id, depth)}
        ids |= {n.id for n in self.companies(node_id)}
        ids |= {n.id for n in self.industries(node_id)}
        return self.to_networkx().subgraph(ids).copy()
