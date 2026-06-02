from pathlib import Path

from industrychain import IndustryGraph, SQLiteStore
from industrychain import viz
from industrychain.providers.curated import load_file

SAMPLE = Path(__file__).parents[1] / "industrychain" / "data" / "sample_lithium_battery.yaml"


def test_to_html_writes_self_contained_page(tmp_path):
    g = IndustryGraph(SQLiteStore(":memory:"))
    g.ingest(load_file(SAMPLE))
    battery = g.resolve("lithium-ion battery")
    sub = g.chain_subgraph(battery.id, depth=2)

    out = tmp_path / "chain.html"
    viz.to_html(sub, out, title="test chain")
    html = out.read_text(encoding="utf-8")

    assert "<title>test chain</title>" in html
    assert "vis-network" in html              # CDN script reference present
    assert "new vis.Network" in html
    assert "lithium-ion battery" in html      # a node label made it into the page
    assert "const rawNodes = [" in html       # node data injected as JSON
    assert "function chainSet" in html        # click-to-highlight interactivity
    assert "applyFilters" in html             # type filtering
