"""Persistence layer.

``GraphStore`` is the interface every storage backend implements; ``SQLiteStore``
is the default (file-based, zero-setup, easy to inspect). Keeping callers behind
the interface means we can swap in a real graph database (Neo4j, DuckDB) later
without touching the rest of the system.

All writes go through ``merge``, so re-ingesting data or layering a new source on
top of an existing graph resolves conflicts instead of blindly overwriting.
"""

from __future__ import annotations

import json
import sqlite3
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path

from .merge import merge_edges, merge_nodes
from .models import Edge, EdgeType, Node, NodeType, Provenance, Source, utcnow

_SCHEMA = """
CREATE TABLE IF NOT EXISTS nodes (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    name          TEXT NOT NULL,
    aliases       TEXT NOT NULL DEFAULT '[]',
    attributes    TEXT NOT NULL DEFAULT '{}',
    source        TEXT NOT NULL,
    source_detail TEXT,
    confidence    REAL NOT NULL,
    verified      INTEGER NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS edges (
    id            TEXT PRIMARY KEY,
    src           TEXT NOT NULL,
    dst           TEXT NOT NULL,
    type          TEXT NOT NULL,
    attributes    TEXT NOT NULL DEFAULT '{}',
    source        TEXT NOT NULL,
    source_detail TEXT,
    confidence    REAL NOT NULL,
    verified      INTEGER NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
"""


class GraphStore(ABC):
    @abstractmethod
    def upsert_node(self, node: Node) -> Node: ...

    @abstractmethod
    def upsert_edge(self, edge: Edge) -> Edge: ...

    @abstractmethod
    def get_node(self, node_id: str) -> Node | None: ...

    @abstractmethod
    def get_edge(self, edge_id: str) -> Edge | None: ...

    @abstractmethod
    def nodes(self) -> list[Node]: ...

    @abstractmethod
    def edges(self) -> list[Edge]: ...

    @abstractmethod
    def edges_from(self, node_id: str) -> list[Edge]: ...

    @abstractmethod
    def edges_to(self, node_id: str) -> list[Edge]: ...

    @abstractmethod
    def find_nodes(self, name: str | None = None, type: NodeType | None = None) -> list[Node]: ...

    @abstractmethod
    def mark_node_verified(
        self, node_id: str, verified: bool = True, confidence: float | None = None
    ) -> None: ...

    @abstractmethod
    def delete_node(self, node_id: str) -> int: ...

    def close(self) -> None:  # pragma: no cover - trivial
        pass


def _prov_columns(p: Provenance) -> tuple:
    return (
        p.source.value,
        p.source_detail,
        p.confidence,
        1 if p.verified else 0,
        p.created_at.isoformat(),
        p.updated_at.isoformat(),
    )


def _prov_from_row(row: sqlite3.Row) -> Provenance:
    return Provenance(
        source=Source(row["source"]),
        source_detail=row["source_detail"],
        confidence=row["confidence"],
        verified=bool(row["verified"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _node_row(n: Node) -> tuple:
    return (n.id, n.type.value, n.name, json.dumps(n.aliases), json.dumps(n.attributes), *_prov_columns(n.provenance))


def _node_from_row(row: sqlite3.Row) -> Node:
    return Node(
        id=row["id"],
        type=NodeType(row["type"]),
        name=row["name"],
        aliases=json.loads(row["aliases"]),
        attributes=json.loads(row["attributes"]),
        provenance=_prov_from_row(row),
    )


def _edge_row(e: Edge) -> tuple:
    return (e.id, e.src, e.dst, e.type.value, json.dumps(e.attributes), *_prov_columns(e.provenance))


def _edge_from_row(row: sqlite3.Row) -> Edge:
    return Edge(
        src=row["src"],
        dst=row["dst"],
        type=EdgeType(row["type"]),
        attributes=json.loads(row["attributes"]),
        provenance=_prov_from_row(row),
    )


class SQLiteStore(GraphStore):
    def __init__(self, path: str | Path = ":memory:"):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    def upsert_node(self, node: Node) -> Node:
        merged = merge_nodes(self.get_node(node.id), node)
        self.conn.execute(
            "INSERT OR REPLACE INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)", _node_row(merged)
        )
        self.conn.commit()
        return merged

    def upsert_edge(self, edge: Edge) -> Edge:
        merged = merge_edges(self.get_edge(edge.id), edge)
        self.conn.execute(
            "INSERT OR REPLACE INTO edges VALUES (?,?,?,?,?,?,?,?,?,?,?)", _edge_row(merged)
        )
        self.conn.commit()
        return merged

    def get_node(self, node_id: str) -> Node | None:
        row = self.conn.execute("SELECT * FROM nodes WHERE id=?", (node_id,)).fetchone()
        return _node_from_row(row) if row else None

    def get_edge(self, edge_id: str) -> Edge | None:
        row = self.conn.execute("SELECT * FROM edges WHERE id=?", (edge_id,)).fetchone()
        return _edge_from_row(row) if row else None

    def nodes(self) -> list[Node]:
        return [_node_from_row(r) for r in self.conn.execute("SELECT * FROM nodes")]

    def edges(self) -> list[Edge]:
        return [_edge_from_row(r) for r in self.conn.execute("SELECT * FROM edges")]

    def edges_from(self, node_id: str) -> list[Edge]:
        rows = self.conn.execute("SELECT * FROM edges WHERE src=?", (node_id,))
        return [_edge_from_row(r) for r in rows]

    def edges_to(self, node_id: str) -> list[Edge]:
        rows = self.conn.execute("SELECT * FROM edges WHERE dst=?", (node_id,))
        return [_edge_from_row(r) for r in rows]

    def find_nodes(self, name: str | None = None, type: NodeType | None = None) -> list[Node]:
        clauses, params = [], []
        if type is not None:
            clauses.append("type=?")
            params.append(type.value)
        if name is not None:
            clauses.append("LOWER(name)=?")
            params.append(name.strip().lower())
        sql = "SELECT * FROM nodes"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        return [_node_from_row(r) for r in self.conn.execute(sql, params)]

    def mark_node_verified(
        self, node_id: str, verified: bool = True, confidence: float | None = None
    ) -> None:
        sets = ["verified=?", "updated_at=?"]
        params: list = [1 if verified else 0, utcnow().isoformat()]
        if confidence is not None:
            sets.append("confidence=?")
            params.append(confidence)
        params.append(node_id)
        self.conn.execute(f"UPDATE nodes SET {', '.join(sets)} WHERE id=?", params)
        self.conn.commit()

    def delete_node(self, node_id: str) -> int:
        """Delete a node and every edge touching it; returns the edge count removed."""
        removed = self.conn.execute(
            "DELETE FROM edges WHERE src=? OR dst=?", (node_id, node_id)
        ).rowcount
        self.conn.execute("DELETE FROM nodes WHERE id=?", (node_id,))
        self.conn.commit()
        return removed

    def close(self) -> None:
        self.conn.close()
