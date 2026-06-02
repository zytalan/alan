"""Provider interface plus the single shared mapping from a "subgraph dict" to
graph nodes/edges.

A subgraph dict is the common interchange shape produced by the AI provider and
accepted by curated files, so there is exactly ONE place that decides how domain
facts become nodes and edges:

    {
      "name": "lithium-ion battery",
      "type": "product",
      "industries": ["battery manufacturing"],
      "upstream":   [{"name": "lithium", "type": "material", "via": "cathode"}],
      "downstream": [{"name": "electric vehicle", "type": "product"}],
      "companies":  [{"name": "CATL", "industry": "battery manufacturing"}]
    }

Edge direction convention: ``INPUT_TO`` always points upstream -> downstream
(raw material -> intermediate -> finished good).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field

from ..models import Edge, EdgeType, Node, NodeType, Provenance


class SubGraph(BaseModel):
    """A bundle of nodes and edges emitted by a provider, ready to ingest."""

    nodes: list[Node] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)


class Provider(ABC):
    @abstractmethod
    def expand(self, name: str, node_type: NodeType = NodeType.PRODUCT) -> SubGraph:
        """Return the industry-chain subgraph for ``name``."""


def _coerce_type(value: Any, default: NodeType) -> NodeType:
    if not value:
        return default
    try:
        return NodeType(str(value).strip().lower())
    except ValueError:
        return default


def _item(item: Any, default_type: NodeType) -> tuple[str | None, NodeType, str | None]:
    """Normalise a list entry that may be a bare string or a dict."""
    if isinstance(item, str):
        return item, default_type, None
    if isinstance(item, dict):
        name = item.get("name") or item.get("product") or item.get("material") or item.get("company")
        return name, _coerce_type(item.get("type"), default_type), item.get("via")
    return None, default_type, None


def subgraph_from_dict(data: dict, *, provenance: Provenance) -> SubGraph:
    """Map a subgraph dict onto nodes and edges, tagging everything with ``provenance``.

    Unknown/missing fields are tolerated; entries without a name are skipped.
    """
    name = data.get("name")
    if not name:
        raise ValueError("subgraph dict requires a 'name'")

    nodes: dict[str, Node] = {}

    def add(node_name: str | None, node_type: NodeType) -> Node | None:
        if not node_name:
            return None
        node = Node.create(node_type, node_name, provenance=provenance.model_copy())
        return nodes.setdefault(node.id, node)

    edges: list[Edge] = []

    def link(src: str, dst: str, etype: EdgeType, **attrs: Any) -> None:
        edges.append(
            Edge(src=src, dst=dst, type=etype, attributes=attrs, provenance=provenance.model_copy())
        )

    root = add(name, _coerce_type(data.get("type"), NodeType.PRODUCT))
    assert root is not None  # name is truthy

    for ind in data.get("industries") or []:
        iname, _, _ = _item(ind, NodeType.INDUSTRY)
        node = add(iname, NodeType.INDUSTRY)
        if node:
            link(root.id, node.id, EdgeType.BELONGS_TO)

    for raw in data.get("upstream") or []:
        uname, utype, via = _item(raw, NodeType.MATERIAL)
        node = add(uname, utype)
        if node:
            # upstream item is an INPUT_TO the root
            link(node.id, root.id, EdgeType.INPUT_TO, **({"via": via} if via else {}))

    for raw in data.get("downstream") or []:
        dname, dtype, via = _item(raw, NodeType.PRODUCT)
        node = add(dname, dtype)
        if node:
            # root is an INPUT_TO the downstream item
            link(root.id, node.id, EdgeType.INPUT_TO, **({"via": via} if via else {}))

    for raw in data.get("companies") or []:
        cname, _, _ = _item(raw, NodeType.COMPANY)
        company = add(cname, NodeType.COMPANY)
        if not company:
            continue
        link(company.id, root.id, EdgeType.MANUFACTURES)
        industry = raw.get("industry") if isinstance(raw, dict) else None
        inode = add(industry, NodeType.INDUSTRY)
        if inode:
            link(company.id, inode.id, EdgeType.OPERATES_IN)

    return SubGraph(nodes=list(nodes.values()), edges=edges)
