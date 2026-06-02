"""Conflict resolution when the same node/edge arrives from multiple sources.

This is the heart of the "hybrid" data strategy: AI-generated facts, hand-curated
corrections, and external datasets all flow into the same graph, and this module
decides what to keep when they overlap.

Resolution order (first difference wins):
    1. higher source precedence (curated > external > ai)
    2. verified beats unverified
    3. higher confidence
    4. more recently updated

The winner's descriptive fields are kept, but aliases and attributes are unioned
so information is never lost, and ``created_at`` is preserved as the earliest seen.
"""

from __future__ import annotations

from .models import SOURCE_PRECEDENCE, Edge, Node, Provenance, utcnow


def _rank(p: Provenance) -> tuple[int, int, float, object]:
    return (
        SOURCE_PRECEDENCE.get(p.source, 0),
        1 if p.verified else 0,
        p.confidence,
        p.updated_at,
    )


def _merge_provenance(winner: Provenance, loser: Provenance) -> Provenance:
    return Provenance(
        source=winner.source,
        source_detail=winner.source_detail,
        confidence=winner.confidence,
        verified=winner.verified,
        created_at=min(winner.created_at, loser.created_at),
        updated_at=utcnow(),
    )


def merge_nodes(existing: Node | None, incoming: Node) -> Node:
    """Combine an incoming node with what's already stored (if anything)."""
    if existing is None:
        return incoming
    # Ties go to ``incoming`` so re-ingesting refreshes timestamps.
    if _rank(incoming.provenance) >= _rank(existing.provenance):
        winner, loser = incoming, existing
    else:
        winner, loser = existing, incoming
    aliases = sorted({*existing.aliases, *incoming.aliases, loser.name} - {winner.name})
    attributes = {**loser.attributes, **winner.attributes}
    return Node(
        id=winner.id,
        type=winner.type,
        name=winner.name,
        aliases=aliases,
        attributes=attributes,
        provenance=_merge_provenance(winner.provenance, loser.provenance),
    )


def merge_edges(existing: Edge | None, incoming: Edge) -> Edge:
    """Combine an incoming edge with what's already stored (if anything)."""
    if existing is None:
        return incoming
    if _rank(incoming.provenance) >= _rank(existing.provenance):
        winner, loser = incoming, existing
    else:
        winner, loser = existing, incoming
    attributes = {**loser.attributes, **winner.attributes}
    return Edge(
        src=winner.src,
        dst=winner.dst,
        type=winner.type,
        attributes=attributes,
        provenance=_merge_provenance(winner.provenance, loser.provenance),
    )
