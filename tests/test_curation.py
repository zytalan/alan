from industrychain import IndustryGraph, Node, Provenance, SQLiteStore, subgraph_from_dict
from industrychain.models import NodeType, Source


def _graph() -> IndustryGraph:
    return IndustryGraph(SQLiteStore(":memory:"))


def test_verify_marks_node_verified():
    g = _graph()
    g.store.upsert_node(
        Node.create(NodeType.PRODUCT, "widget", provenance=Provenance(source=Source.AI))
    )
    assert g.resolve("widget").provenance.verified is False
    g.verify(g.resolve("widget").id)
    assert g.resolve("widget").provenance.verified is True


def test_forget_removes_node_and_its_edges():
    g = _graph()
    g.ingest(
        subgraph_from_dict(
            {"name": "battery", "upstream": [{"name": "lithium", "type": "material"}]},
            provenance=Provenance(source=Source.AI),
        )
    )
    battery = g.resolve("battery")
    removed = g.forget(battery.id)
    assert removed >= 1  # the input_to edge was deleted too
    assert g.resolve("battery") is None
    assert all(battery.id not in (e.src, e.dst) for e in g.store.edges())


def test_unverified_lists_ai_not_curated():
    g = _graph()
    g.ingest(subgraph_from_dict({"name": "chip"}, provenance=Provenance(source=Source.AI)))
    g.ingest(
        subgraph_from_dict(
            {"name": "steel"}, provenance=Provenance(source=Source.CURATED, verified=True)
        )
    )
    names = {n.name for n in g.unverified(source=Source.AI)}
    assert "chip" in names
    assert "steel" not in names
