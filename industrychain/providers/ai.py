"""AIProvider: expand an entity into an industry-chain subgraph using Claude.

Design note: the network call and the parsing are deliberately separated.
``build_prompt`` and ``parse_response`` are pure functions and are unit-tested
with fixtures; only ``AIProvider.expand`` touches the network. This keeps the
schema-mapping logic fully testable without an API key.
"""

from __future__ import annotations

import json
import os
import re

from ..models import NodeType, Provenance, Source
from .base import Provider, SubGraph, subgraph_from_dict

DEFAULT_MODEL = os.environ.get("IC_MODEL", "claude-sonnet-4-6")

SYSTEM_PROMPT = (
    "You are an industrial supply-chain analyst. Given an entity, map its place "
    "in the industry chain: the raw materials and intermediate goods that go INTO "
    "it (upstream), what it is used to make (downstream), the industries it belongs "
    "to, and notable companies involved. Respond with ONLY a JSON object, no prose."
)


def build_prompt(name: str, node_type: NodeType) -> str:
    return f"""Map the industry chain for this {node_type.value}: "{name}".

Return ONLY a JSON object with this exact shape:
{{
  "name": "{name}",
  "type": "{node_type.value}",
  "industries": ["..."],
  "upstream":   [{{"name": "...", "type": "material|product", "via": "optional component"}}],
  "downstream": [{{"name": "...", "type": "product"}}],
  "companies":  [{{"name": "...", "industry": "..."}}]
}}

Guidance:
- upstream = inputs, raw materials and components required to make it.
- downstream = products or sectors that consume it.
- Aim for 4-10 items per list; prefer well-known, verifiable connections.
- Use "material" for raw commodities and "product" for manufactured goods."""


def _extract_json(text: str) -> dict:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("AI response did not contain a JSON object")
        return json.loads(match.group(0))


def parse_response(text: str, *, confidence: float = 0.5, model: str | None = None) -> SubGraph:
    """Turn a raw model response into a SubGraph (pure; safe to unit test)."""
    data = _extract_json(text)
    prov = Provenance(source=Source.AI, source_detail=model, confidence=confidence, verified=False)
    return subgraph_from_dict(data, provenance=prov)


class AIProvider(Provider):
    def __init__(self, model: str = DEFAULT_MODEL, api_key: str | None = None):
        self.model = model
        self._api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")

    def expand(self, name: str, node_type: NodeType = NodeType.PRODUCT) -> SubGraph:
        if not self._api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Export it to use AI expansion, or use "
                "`ic load-sample` / `ic load <file>` to work with offline data."
            )
        try:
            from anthropic import Anthropic
        except ImportError as exc:  # pragma: no cover - import guard
            raise RuntimeError("The 'anthropic' package is required for AI expansion.") from exc

        client = Anthropic(api_key=self._api_key)
        message = client.messages.create(
            model=self.model,
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": build_prompt(name, node_type)}],
        )
        text = "".join(
            block.text for block in message.content if getattr(block, "type", None) == "text"
        )
        return parse_response(text, model=self.model)
