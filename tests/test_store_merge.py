from industrychain import Edge, Node, Provenance, SQLiteStore
from industrychain.models import EdgeType, NodeType, Source


def _store():
    return SQLiteStore(":memory:")


def test_curated_overrides_ai_and_unions_aliases():
    store = _store()
    store.upsert_node(
        Node.create(NodeType.PRODUCT, "Steel", provenance=Provenance(source=Source.AI, confidence=0.4))
    )
    merged = store.upsert_node(
        Node.create(
            NodeType.PRODUCT,
            "steel",  # same slug -> same id
            provenance=Provenance(source=Source.CURATED, confidence=0.9, verified=True),
        )
    )
    assert merged.provenance.source == Source.CURATED
    assert merged.provenance.verified is True
    # the loser's spelling is preserved as an alias
    assert "Steel" in merged.aliases

    # persisted value reflects the merge
    reloaded = store.get_node("product:steel")
    assert reloaded.provenance.source == Source.CURATED


def test_lower_precedence_does_not_override():
    store = _store()
    store.upsert_node(
        Node.create(NodeType.PRODUCT, "Steel", provenance=Provenance(source=Source.CURATED, verified=True))
    )
    store.upsert_node(
        Node.create(NodeType.PRODUCT, "Steel", provenance=Provenance(source=Source.AI, confidence=0.99))
    )
    assert store.get_node("product:steel").provenance.source == Source.CURATED


def test_edge_upsert_merges_not_duplicates():
    store = _store()
    a, b = "material:lithium", "product:battery"
    store.upsert_edge(Edge(src=a, dst=b, type=EdgeType.INPUT_TO, provenance=Provenance(source=Source.AI)))
    store.upsert_edge(
        Edge(src=a, dst=b, type=EdgeType.INPUT_TO, provenance=Provenance(source=Source.CURATED, verified=True))
    )
    assert len(store.edges()) == 1
    assert store.edges()[0].provenance.source == Source.CURATED


def test_find_nodes_by_type_and_name():
    store = _store()
    store.upsert_node(Node.create(NodeType.MATERIAL, "Lithium"))
    store.upsert_node(Node.create(NodeType.COMPANY, "CATL"))
    assert {n.id for n in store.find_nodes(type=NodeType.MATERIAL)} == {"material:lithium"}
    assert store.find_nodes(name="catl")[0].type == NodeType.COMPANY
