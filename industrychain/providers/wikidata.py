"""External data provider: Wikidata.

Pulls real industry-chain relationships from Wikidata's public SPARQL endpoint —
no API key and no extra dependency (stdlib ``urllib``). As with the AI provider,
the network call and the mapping are separated: ``parse_bindings`` is a pure
function from SPARQL result rows to a :class:`SubGraph` and is unit-tested with a
fixture; only the methods that hit the network are untested.

Wikidata properties used:
  P186 made from material        -> upstream input (material)
  P527 has part(s)               -> upstream component (product)
  P176 manufacturer              -> company that makes it
  P452 industry                  -> industry it belongs to
  reverse P186 (X made from this) -> downstream use (product)
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request

from ..models import NodeType, Provenance, Source
from .base import Provider, SubGraph, subgraph_from_dict

_USER_AGENT = "industrychain/0.1 (https://github.com/zytalan/alan; supply-chain graph)"
_SPARQL_URL = "https://query.wikidata.org/sparql"
_SEARCH_URL = "https://www.wikidata.org/w/api.php"
_QID_RE = re.compile(r"^Q\d+$")


def build_query(qid: str) -> str:
    """SPARQL that gathers a handful of chain relationships for one entity."""
    return (
        "SELECT ?rel ?targetLabel WHERE {\n"
        f"  {{ wd:{qid} wdt:P186 ?target. BIND('made_from' AS ?rel) }}\n"
        f"  UNION {{ wd:{qid} wdt:P527 ?target. BIND('has_part' AS ?rel) }}\n"
        f"  UNION {{ wd:{qid} wdt:P176 ?target. BIND('manufacturer' AS ?rel) }}\n"
        f"  UNION {{ wd:{qid} wdt:P452 ?target. BIND('industry' AS ?rel) }}\n"
        f"  UNION {{ ?target wdt:P186 wd:{qid}. BIND('used_in' AS ?rel) }}\n"
        "  SERVICE wikibase:label { bd:serviceParam wikibase:language 'en'. }\n"
        "} LIMIT 60"
    )


def parse_bindings(
    bindings: list,
    root_name: str,
    root_type: NodeType = NodeType.PRODUCT,
    *,
    confidence: float = 0.7,
) -> SubGraph:
    """Map SPARQL result rows onto a SubGraph (pure; safe to unit test)."""
    data: dict = {
        "name": root_name,
        "type": root_type.value,
        "industries": [],
        "upstream": [],
        "downstream": [],
        "companies": [],
    }
    for row in bindings:
        rel = row.get("rel", {}).get("value")
        label = row.get("targetLabel", {}).get("value")
        if not rel or not label or _QID_RE.match(label):
            # Skip rows whose label failed to resolve (still a bare Q-number).
            continue
        if rel == "made_from":
            data["upstream"].append({"name": label, "type": "material"})
        elif rel == "has_part":
            data["upstream"].append({"name": label, "type": "product"})
        elif rel == "used_in":
            data["downstream"].append({"name": label, "type": "product"})
        elif rel == "manufacturer":
            data["companies"].append({"name": label})
        elif rel == "industry":
            data["industries"].append(label)

    prov = Provenance(source=Source.EXTERNAL, source_detail="wikidata", confidence=confidence)
    return subgraph_from_dict(data, provenance=prov)


class WikidataProvider(Provider):
    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout

    def _get_json(self, url: str) -> dict:
        request = urllib.request.Request(
            url, headers={"User-Agent": _USER_AGENT, "Accept": "application/json"}
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def search_entity(self, name: str) -> tuple[str | None, str | None]:
        """Resolve a name to its top Wikidata (QID, label)."""
        params = urllib.parse.urlencode(
            {
                "action": "wbsearchentities",
                "search": name,
                "language": "en",
                "format": "json",
                "type": "item",
                "limit": 1,
            }
        )
        hits = self._get_json(f"{_SEARCH_URL}?{params}").get("search", [])
        if not hits:
            return None, None
        return hits[0]["id"], hits[0].get("label", name)

    def run_sparql(self, query: str) -> list:
        params = urllib.parse.urlencode({"query": query, "format": "json"})
        data = self._get_json(f"{_SPARQL_URL}?{params}")
        return data.get("results", {}).get("bindings", [])

    def expand(self, name: str, node_type: NodeType = NodeType.PRODUCT) -> SubGraph:
        qid, label = self.search_entity(name)
        if not qid:
            raise RuntimeError(f"no Wikidata entity found for '{name}'")
        bindings = self.run_sparql(build_query(qid))
        return parse_bindings(bindings, label or name, node_type)
