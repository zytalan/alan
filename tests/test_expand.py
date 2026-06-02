from industrychain import Provenance, subgraph_from_dict
from industrychain.expand import expand_tree
from industrychain.models import NodeType, Source
from industrychain.providers.base import Provider


class StubProvider(Provider):
    """A Provider that returns canned subgraphs, so recursion is testable offline."""

    def __init__(self, mapping):
        self.mapping = mapping
        self.calls: list[str] = []

    def expand(self, name, node_type=NodeType.PRODUCT):
        self.calls.append(name)
        data = self.mapping.get(name, {"name": name})
        return subgraph_from_dict(data, provenance=Provenance(source=Source.AI))


def test_expand_tree_depth_one_is_a_single_call():
    sp = StubProvider(
        {"battery": {"name": "battery", "upstream": [{"name": "cathode", "type": "product"}]}}
    )
    sg = expand_tree(sp, "battery", NodeType.PRODUCT, depth=1)
    assert sp.calls == ["battery"]
    assert {"product:battery", "product:cathode"} <= {n.id for n in sg.nodes}


def test_expand_tree_recurses_into_products_only():
    mapping = {
        "battery": {"name": "battery", "upstream": [{"name": "cathode", "type": "product"}]},
        "cathode": {"name": "cathode", "upstream": [{"name": "lithium", "type": "material"}]},
    }
    sp = StubProvider(mapping)
    sg = expand_tree(sp, "battery", NodeType.PRODUCT, depth=2)

    assert "battery" in sp.calls and "cathode" in sp.calls  # recursed into the product
    assert "lithium" not in sp.calls                         # raw material is not expanded
    ids = {n.id for n in sg.nodes}
    assert {"product:battery", "product:cathode", "material:lithium"} <= ids
