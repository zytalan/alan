"""The copy served by GitHub Pages (docs/gann-square/index.html) must match the tool."""

from pathlib import Path

import pytest

from gannsquare.render import render_document

PUBLISHED = Path(__file__).resolve().parents[2] / "docs" / "gann-square" / "index.html"


@pytest.mark.skipif(not PUBLISHED.exists(), reason="published copy is not in this checkout")
def test_published_copy_is_current():
    published = PUBLISHED.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert published == render_document(), (
        "docs/gann-square/index.html is out of date; "
        "run: gann render -o ../docs/gann-square/index.html"
    )
