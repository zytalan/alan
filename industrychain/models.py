"""Core domain models: nodes, edges, and provenance.

Everything in the graph is either a :class:`Node` (a product, material, industry
or company) or an :class:`Edge` (a directed relationship between two nodes).
Every node and edge carries :class:`Provenance` so that facts from different
sources (AI, curated, external datasets) can be merged with predictable,
explainable conflict resolution.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    """Timezone-aware current time (UTC)."""
    return datetime.now(timezone.utc)


class NodeType(str, Enum):
    PRODUCT = "product"
    MATERIAL = "material"
    INDUSTRY = "industry"
    COMPANY = "company"


class EdgeType(str, Enum):
    # ``src`` is an input to ``dst`` -> src is UPSTREAM of dst. This is the
    # backbone edge for upstream/downstream traversal.
    INPUT_TO = "input_to"
    # company -> industry
    OPERATES_IN = "operates_in"
    # company -> product
    MANUFACTURES = "manufactures"
    # company -> company
    SUPPLIES = "supplies"
    # product/material -> industry
    BELONGS_TO = "belongs_to"
    # industry -> industry (a sub-industry is PART_OF a parent industry)
    PART_OF = "part_of"


class Source(str, Enum):
    AI = "ai"
    CURATED = "curated"
    EXTERNAL = "external"


# When two sources describe the same node/edge, the higher precedence wins.
# Curated (human) data beats external datasets, which beat AI-generated data.
SOURCE_PRECEDENCE: dict[Source, int] = {
    Source.AI: 0,
    Source.EXTERNAL: 1,
    Source.CURATED: 2,
}


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    """Normalise a name into a stable slug used for node identity."""
    return _SLUG_RE.sub("-", text.strip().lower()).strip("-")


def make_node_id(node_type: NodeType, name: str) -> str:
    """Canonical node id, e.g. ``product:lithium-ion-battery``.

    Identity is (type, slug(name)) so different spellings of the same thing
    collapse onto one node regardless of which source introduced it.
    """
    return f"{node_type.value}:{slugify(name)}"


class Provenance(BaseModel):
    """Where a fact came from and how much we trust it."""

    source: Source = Source.AI
    source_detail: str | None = None  # e.g. model name or "wikidata"
    confidence: float = 0.5  # 0..1
    verified: bool = False  # has a human checked it?
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Node(BaseModel):
    id: str
    type: NodeType
    name: str
    aliases: list[str] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(default_factory=dict)
    provenance: Provenance = Field(default_factory=Provenance)

    @classmethod
    def create(
        cls,
        node_type: NodeType,
        name: str,
        *,
        provenance: Provenance | None = None,
        aliases: list[str] | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> "Node":
        return cls(
            id=make_node_id(node_type, name),
            type=node_type,
            name=name.strip(),
            aliases=aliases or [],
            attributes=attributes or {},
            provenance=provenance or Provenance(),
        )


class Edge(BaseModel):
    src: str  # source node id
    dst: str  # destination node id
    type: EdgeType
    attributes: dict[str, Any] = Field(default_factory=dict)
    provenance: Provenance = Field(default_factory=Provenance)

    @property
    def id(self) -> str:
        # An edge is uniquely identified by its endpoints and relationship type.
        return f"{self.src}|{self.type.value}|{self.dst}"
