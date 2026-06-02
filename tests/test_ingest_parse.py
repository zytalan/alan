from industrychain import Provenance, subgraph_from_dict
from industrychain.models import EdgeType, Source
from industrychain.providers.ai import parse_response


def _ids(subgraph):
    return {n.id for n in subgraph.nodes}


def _has_edge(subgraph, src, dst, etype):
    return any(e.src == src and e.dst == dst and e.type == etype for e in subgraph.edges)


def test_subgraph_from_dict_builds_expected_nodes_and_edges():
    data = {
        "name": "lithium-ion battery",
        "type": "product",
        "industries": ["energy storage"],
        "upstream": [{"name": "lithium", "type": "material", "via": "cathode"}],
        "downstream": [{"name": "electric vehicle", "type": "product"}],
        "companies": [{"name": "CATL", "industry": "battery manufacturing"}],
    }
    sg = subgraph_from_dict(data, provenance=Provenance(source=Source.AI))

    assert {
        "product:lithium-ion-battery",
        "material:lithium",
        "product:electric-vehicle",
        "company:catl",
        "industry:energy-storage",
        "industry:battery-manufacturing",
    } <= _ids(sg)

    # upstream item points INTO the root; downstream points OUT of it
    assert _has_edge(sg, "material:lithium", "product:lithium-ion-battery", EdgeType.INPUT_TO)
    assert _has_edge(sg, "product:lithium-ion-battery", "product:electric-vehicle", EdgeType.INPUT_TO)
    assert _has_edge(sg, "company:catl", "product:lithium-ion-battery", EdgeType.MANUFACTURES)
    assert _has_edge(sg, "company:catl", "industry:battery-manufacturing", EdgeType.OPERATES_IN)
    assert _has_edge(sg, "product:lithium-ion-battery", "industry:energy-storage", EdgeType.BELONGS_TO)

    via_edge = next(e for e in sg.edges if e.src == "material:lithium")
    assert via_edge.attributes.get("via") == "cathode"


def test_parse_response_handles_markdown_fence_and_defaults_type():
    text = '```json\n{"name": "x", "upstream": [{"name": "y", "type": "material"}]}\n```'
    sg = parse_response(text)
    assert "product:x" in _ids(sg)  # root defaults to product
    assert "material:y" in _ids(sg)
    assert all(n.provenance.source == Source.AI for n in sg.nodes)


def test_parse_response_extracts_json_from_prose():
    text = 'Sure, here it is:\n{"name": "widget"}\nHope that helps!'
    sg = parse_response(text)
    assert "product:widget" in _ids(sg)
