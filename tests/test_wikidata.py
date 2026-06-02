from industrychain.models import EdgeType, NodeType, Source
from industrychain.providers.wikidata import build_query, parse_bindings


def _has_edge(sg, src, dst, etype):
    return any(e.src == src and e.dst == dst and e.type == etype for e in sg.edges)


def test_parse_bindings_maps_relationships():
    bindings = [
        {"rel": {"value": "made_from"}, "targetLabel": {"value": "lithium"}},
        {"rel": {"value": "has_part"}, "targetLabel": {"value": "cathode"}},
        {"rel": {"value": "manufacturer"}, "targetLabel": {"value": "CATL"}},
        {"rel": {"value": "industry"}, "targetLabel": {"value": "battery manufacturing"}},
        {"rel": {"value": "used_in"}, "targetLabel": {"value": "electric vehicle"}},
        {"rel": {"value": "made_from"}, "targetLabel": {"value": "Q42"}},  # unresolved -> skipped
    ]
    sg = parse_bindings(bindings, "lithium-ion battery", NodeType.PRODUCT)
    ids = {n.id for n in sg.nodes}
    assert {
        "product:lithium-ion-battery",
        "material:lithium",
        "product:cathode",
        "company:catl",
        "industry:battery-manufacturing",
        "product:electric-vehicle",
    } <= ids
    assert "material:q42" not in ids  # bare Q-number label dropped

    assert _has_edge(sg, "material:lithium", "product:lithium-ion-battery", EdgeType.INPUT_TO)
    assert _has_edge(sg, "product:lithium-ion-battery", "product:electric-vehicle", EdgeType.INPUT_TO)
    assert _has_edge(sg, "company:catl", "product:lithium-ion-battery", EdgeType.MANUFACTURES)
    # external data is tagged so merge ranks it below curated, above AI
    assert all(n.provenance.source == Source.EXTERNAL for n in sg.nodes)


def test_build_query_includes_qid_and_label_service():
    q = build_query("Q123")
    assert "wd:Q123" in q
    assert "wikibase:label" in q
