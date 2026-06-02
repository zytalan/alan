"""Load hand-authored subgraph files (JSON or YAML).

Curated data is marked ``verified`` with high confidence, so by the merge rules
it outranks AI-generated data — this is how you correct the AI and make the fix
stick. A file may contain a single subgraph dict or a list of them.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..models import Provenance, Source
from .base import SubGraph, subgraph_from_dict


def load_file(path: str | Path) -> SubGraph:
    p = Path(path)
    raw = p.read_text()
    if p.suffix.lower() in {".yaml", ".yml"}:
        import yaml

        data = yaml.safe_load(raw)
    else:
        data = json.loads(raw)

    prov = Provenance(source=Source.CURATED, source_detail=p.name, confidence=0.9, verified=True)
    documents = data if isinstance(data, list) else [data]

    combined = SubGraph()
    for doc in documents:
        part = subgraph_from_dict(doc, provenance=prov.model_copy())
        combined.nodes.extend(part.nodes)
        combined.edges.extend(part.edges)
    return combined
