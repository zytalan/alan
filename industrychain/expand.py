"""Recursive AI expansion.

Expand an entity, then optionally expand the intermediate *products* it reveals,
up to a depth. Each level is another round of provider calls, so ``depth > 1``
costs proportionally more API calls. Raw materials are not expanded further
(they're already the root of the chain).

The recursion takes any :class:`Provider`, so it's fully testable with a stub —
no API key required.
"""

from __future__ import annotations

from .models import NodeType, slugify
from .providers.base import Provider, SubGraph


def expand_tree(
    provider: Provider,
    name: str,
    node_type: NodeType = NodeType.PRODUCT,
    depth: int = 1,
) -> SubGraph:
    """Expand ``name`` and (for depth > 1) the products it reveals, breadth-first.

    Returns one merged :class:`SubGraph`; ingesting it de-duplicates via the
    store's merge step.
    """
    seen: set[tuple] = set()
    combined = SubGraph()
    frontier: list[tuple[str, NodeType]] = [(name, node_type)]

    for _ in range(max(1, depth)):
        nxt: list[tuple[str, NodeType]] = []
        for current_name, current_type in frontier:
            key = (current_type, slugify(current_name))
            if key in seen:
                continue
            seen.add(key)

            subgraph = provider.expand(current_name, current_type)
            combined.nodes.extend(subgraph.nodes)
            combined.edges.extend(subgraph.edges)

            # Queue newly-seen intermediate products for the next level.
            for node in subgraph.nodes:
                node_key = (node.type, slugify(node.name))
                if node.type == NodeType.PRODUCT and node_key not in seen:
                    nxt.append((node.name, node.type))
        frontier = nxt
        if not frontier:
            break

    return combined
