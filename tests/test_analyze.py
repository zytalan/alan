from pathlib import Path

import pytest

from industrychain import IndustryGraph, SQLiteStore
from industrychain import analyze
from industrychain.providers.curated import load_file

SAMPLE = Path(__file__).parents[1] / "industrychain" / "data" / "sample_lithium_battery.yaml"


@pytest.fixture
def graph():
    g = IndustryGraph(SQLiteStore(":memory:"))
    g.ingest(load_file(SAMPLE))
    return g


def test_choke_points_surface_raw_materials(graph):
    cp = analyze.choke_points(graph, top=5)
    names = [r.node.name for r in cp]
    assert "lithium" in names
    # a raw material feeds several downstream products
    assert cp[0].score >= 4


def test_key_companies_ranks_byd_first(graph):
    kc = analyze.key_companies(graph, top=5)
    assert kc[0].node.name == "BYD"   # makes both the battery and the EV
    assert kc[0].score == 2


def test_hubs_sorted_by_degree(graph):
    h = analyze.hubs(graph, top=3)
    assert len(h) == 3
    assert h[0].score >= h[1].score >= h[2].score
