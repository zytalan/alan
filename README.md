# Industry Chain Graph

A small **knowledge graph of the economy**, in the spirit of a Bloomberg-terminal
supply-chain view — but focused purely on *connections*: the raw materials and
intermediate goods that go into a product (**upstream**), what it is used to make
(**downstream**), the **industries** it belongs to, and the **companies** involved.

No GUI (yet). You use it through a CLI, a Python library, and graph-file exports
you can open in Gephi/yEd or render with Graphviz.

## Concepts

- **Nodes**: `product`, `material`, `industry`, `company`
- **Edges**: `input_to` (the upstream→downstream backbone), `manufactures`,
  `operates_in`, `belongs_to`, `supplies`, `part_of`
- **Provenance**: every fact records its `source` (ai / curated / external),
  `confidence`, and whether it's been `verified`. When sources disagree, curated
  beats external beats AI — so you can correct the AI and the fix sticks.

## Install

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

(On macOS/Linux: `source .venv/bin/activate` instead of the Activate.ps1 line.)

## Quick start (offline, no API key)

```powershell
ic load-sample                         # load the bundled lithium-ion battery chain
ic upstream "lithium-ion battery"      # what goes into it (depth 2)
ic downstream "lithium"                # what lithium feeds into
ic companies "lithium-ion battery"     # CATL, LG Energy Solution, ...
ic path "lithium" "electric vehicle"   # how are these connected?
ic export "lithium-ion battery" -f dot -o battery.dot
ic stats
```

## AI expansion (needs an Anthropic API key)

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
ic expand "smartphone"                 # Claude builds & stores its subgraph
ic upstream "smartphone"
```

The graph lives in `data/industrychain.db` (override with `--db` or `IC_DB`).

## Library use

```python
from industrychain import IndustryGraph, SQLiteStore
from industrychain.providers.curated import load_file

g = IndustryGraph(SQLiteStore("data/industrychain.db"))
g.ingest(load_file("industrychain/data/sample_lithium_battery.yaml"))

battery = g.resolve("lithium-ion battery")
for hop in g.upstream(battery.id, depth=2):
    print("  " * hop.level, hop.node.name)
```

See [`docs/DESIGN.md`](docs/DESIGN.md) for the data model and the project roadmap.
