"""Write the interactive square as one standalone HTML file."""

from __future__ import annotations

import json
from importlib import resources

INIT_TAG = '<script id="gann-init" type="application/json">{}</script>'

SKELETON = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
{body}
</body>
</html>
"""


def page_fragment() -> str:
    """The page as shipped (also what gets published as the online version)."""
    return (resources.files("gannsquare") / "web" / "square.html").read_text(encoding="utf-8")


def render_document(settings: dict | None = None) -> str:
    """A complete HTML document; ``settings`` pre-fills the page's controls."""
    body = page_fragment()
    if settings:
        payload = json.dumps(settings).replace("</", "<\\/")
        body = body.replace(
            INIT_TAG, f'<script id="gann-init" type="application/json">{payload}</script>'
        )
    return SKELETON.format(body=body)
