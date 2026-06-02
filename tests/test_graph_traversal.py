from pathlib import Path

import pytest

from industrychain import IndustryGraph, Node, SQLiteStore
from industrychain.models import NodeType
from industrychain.providers.curated import load_file
from industrychain import export as export_mod

SAMPLE = Path(__file__).parents[1] / "industrychain" / "data" / "sample_lithium_battery.yaml"


@pytest.fixture
def graph():
    g = IndustryGraph(SQLiteStore(":memory:"))
    g.ingest(load_file(SAMPLE))
    return g


def _names(hops):
    return {h.node.name for h in hops}


def test_resolve_by_name_and_slug(graph):
    node = graph.resolve("Lithium-Ion Battery")
    assert node is not None and node.type == NodeType.PRODUCT


def test_resolve_prefers_product_over_other_types():
    g = IndustryGraph(SQLiteStore(":memory:"))
    g.store.upsert_node(Node.create(NodeType.INDUSTRY, "foo"))
    g.store.upsert_node(Node.create(NodeType.PRODUCT, "foo"))
    assert g.resolve("foo").type == NodeType.PRODUCT


def test_upstream_depth_one_and_two(graph):
    battery = graph.resolve("lithium-ion battery")
    direct = _names(graph.upstream(battery.id, depth=1))
    assert {"cathode", "anode", "electrolyte", "copper"} <= direct

    deep = _names(graph.upstream(battery.id, depth=2))
    # lithium/cobalt/nickel are inputs to the cathode -> two hops from the battery
    assert {"lithium", "cobalt", "nickel", "graphite"} <= deep


def test_downstream_and_companies(graph):
    battery = graph.resolve("lithium-ion battery")
    assert {"electric vehicle", "smartphone"} <= _names(graph.downstream(battery.id, depth=1))
    company_names = {c.name for c in graph.companies(battery.id)}
    assert {"CATL", "BYD"} <= company_names


def test_path_connects_material_to_downstream_product(graph):
    lithium = graph.resolve("lithium")
    ev = graph.resolve("electric vehicle")
    chain = [n.name for n in graph.path(lithium.id, ev.id)]
    assert chain[0] == "lithium" and chain[-1] == "electric vehicle"
    assert "lithium-ion battery" in chain


def test_curated_data_is_verified(graph):
    assert graph.resolve("lithium-ion battery").provenance.verified is True


def test_exports_write_all_formats(graph, tmp_path):
    battery = graph.resolve("lithium-ion battery")
    sub = graph.chain_subgraph(battery.id, depth=2)
    assert sub.number_of_nodes() > 5

    graphml = tmp_path / "g.graphml"
    dot = tmp_path / "g.dot"
    export_mod.to_graphml(sub, graphml)
    export_mod.to_dot(sub, dot)
    json_str = export_mod.to_json(sub)

    assert graphml.exists() and graphml.stat().st_size > 0
    assert dot.read_text().startswith("digraph")
    assert "lithium-ion battery" in json_str
