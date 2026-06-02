from industrychain.models import NodeType, make_node_id, slugify
from industrychain import Node


def test_slugify_normalises():
    assert slugify("  Lithium-Ion Battery! ") == "lithium-ion-battery"
    assert slugify("R&D / Steel") == "r-d-steel"


def test_make_node_id():
    assert make_node_id(NodeType.PRODUCT, "Lithium-ion Battery") == "product:lithium-ion-battery"


def test_node_create_sets_id_and_strips_name():
    node = Node.create(NodeType.MATERIAL, "  Cobalt ")
    assert node.id == "material:cobalt"
    assert node.name == "Cobalt"
    assert node.type == NodeType.MATERIAL
