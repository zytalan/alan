"""industrychain: a small knowledge graph of the economy.

Nodes are products, materials, industries and companies; edges are directed
relationships between them (``input_to``, ``manufactures``, ``operates_in`` ...).
Upstream/downstream analysis is graph traversal over those edges.

The public library API is :class:`IndustryGraph`.
"""

from .graph import IndustryGraph
from .models import Edge, EdgeType, Node, NodeType, Provenance, Source
from .providers.base import SubGraph, subgraph_from_dict
from .store import GraphStore, SQLiteStore

__all__ = [
    "IndustryGraph",
    "GraphStore",
    "SQLiteStore",
    "Node",
    "Edge",
    "NodeType",
    "EdgeType",
    "Source",
    "Provenance",
    "SubGraph",
    "subgraph_from_dict",
]

__version__ = "0.1.0"
