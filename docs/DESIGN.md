# Design

## What this is

A directed **property graph** of the economy. Everything reduces to nodes and
edges; "upstream / downstream industry chain" is just traversal over the
`input_to` edge.

## Data model

### Nodes
`id` (e.g. `product:lithium-ion-battery`), `type` (`product` | `material` |
`industry` | `company`), `name`, `aliases`, `attributes`, `provenance`.

Identity is `(type, slug(name))`, so different spellings collapse onto one node
regardless of which source introduced it.

### Edges
`src`, `dst`, `type`, `attributes`, `provenance`.

| Edge | Meaning | Direction |
|------|---------|-----------|
| `input_to` | src is an input to dst | upstream → downstream |
| `manufactures` | company makes product | company → product |
| `operates_in` | company in industry | company → industry |
| `belongs_to` | product/material in industry | node → industry |
| `supplies` | supplier relationship | company → company |
| `part_of` | sub-industry of | industry → industry |

**Traversal:** `upstream(X)` walks `input_to` edges *into* X; `downstream(X)`
walks them *out of* X.

### Provenance (first-class)
Every node and edge carries `source` (`ai` / `curated` / `external`),
`source_detail`, `confidence`, `verified`, and timestamps. Conflict resolution
order: **source precedence (curated > external > ai) → verified → confidence →
recency**. The winner's fields are kept; aliases and attributes are unioned so
nothing is lost. This is what makes the hybrid data strategy safe.

## Architecture

```
providers/ (ai, curated, external…)  ->  subgraph_from_dict  ->  SubGraph
                                                                    │ ingest
                                              merge  <-  GraphStore (SQLite)
                                                              │
                                            IndustryGraph (traversal, networkx)
                                              │              │
                                            CLI (ic)     export (GraphML/DOT/JSON)
```

Every data source emits the **same** subgraph shape, so adding a source is
"write a new provider," not a rewrite. Storage sits behind `GraphStore`, so
SQLite can be swapped for a real graph DB later.

## Roadmap

- **Phase 0 — Scaffold** ✅ models, SQLite store + merge, provenance, tests.
- **Phase 1 — AI ingestion** ✅ `AIProvider`, `ic expand`, exports.
- **Phase 2 — Traversal & analysis** ✅ upstream/downstream/path/chain (next:
  centrality, choke-point detection, richer analytics).
- **Phase 3 — Curation** partial: curated YAML/JSON + merge precedence done;
  next are `verify` / `edit` commands and conflict reporting.
- **Phase 4 — External data** add one real adapter (e.g. Wikidata, IBISWorld,
  MSCI) behind the provider interface.
- **Phase 5 — API + UI** (deferred) FastAPI + web graph visualization.
