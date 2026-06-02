from pathlib import Path

from industrychain import IndustryGraph, SQLiteStore
from industrychain.providers.curated import load_file

DATA = Path(__file__).parents[1] / "industrychain" / "data"


def _all_samples_graph() -> IndustryGraph:
    g = IndustryGraph(SQLiteStore(":memory:"))
    for f in sorted(DATA.glob("*.yaml")):
        g.ingest(load_file(f))
    return g


def test_samples_interconnect_across_domains():
    g = _all_samples_graph()
    silicon = g.resolve("silicon")
    lithium = g.resolve("lithium")
    assert silicon is not None and lithium is not None

    chain = [n.name for n in g.path(silicon.id, lithium.id)]
    assert chain and chain[0] == "silicon" and chain[-1] == "lithium"
    # the path must bridge the semiconductor side and the battery side; both of
    # these are cut vertices on any silicon -> lithium route
    assert "system-on-chip" in chain
    assert "lithium-ion battery" in chain


def test_search_finds_by_substring():
    g = _all_samples_graph()
    assert "OLED display" in {n.name for n in g.search("display")}
    # type filter narrows the results
    companies = g.search("samsung", type=None)
    assert any(n.name == "Samsung Electronics" for n in companies)
