"""Thin wrapper around the Anthropic Messages API.

All reasoning agents call `complete_json` to get back a parsed JSON object.
If no API key is configured the wrapper raises `LLMUnavailable`, which callers
turn into a graceful "agent skipped" result so the service still boots and the
FHIR/calculator layers can be demoed without a key.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Optional

from .config import get_settings


class LLMUnavailable(RuntimeError):
    pass


_client = None


def _get_client():
    global _client
    settings = get_settings()
    if not settings.has_llm:
        raise LLMUnavailable("ANTHROPIC_API_KEY not set")
    if _client is None:
        from anthropic import AsyncAnthropic

        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


_JSON_BLOCK = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _extract_json(text: str):
    """Best-effort parse of a JSON object/array from a model response."""
    text = text.strip()
    m = _JSON_BLOCK.search(text)
    if m:
        text = m.group(1).strip()
    elif text.startswith("```"):
        text = text.split("\n", 1)[-1]        # drop an unclosed ```json fence
    # 1. straight parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # 2. first balanced object / array
    for open_c, close_c in (("{", "}"), ("[", "]")):
        start = text.find(open_c)
        end = text.rfind(close_c)
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                continue
    # 3. salvage complete objects from a truncated array
    salvaged = _salvage_objects(text)
    if salvaged:
        return {"recommendations": salvaged}
    raise ValueError(f"Could not parse JSON from model output: {text[:200]}")


def _salvage_objects(text: str):
    """Recover every complete {...} object from a possibly-truncated array."""
    key = text.find('"recommendations"')
    arr = text.find("[", key) if key != -1 else text.find("[")
    if arr == -1:
        return []
    objs, depth, start, in_str, esc = [], 0, None, False, False
    for i in range(arr + 1, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            if depth == 0:
                start = i
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    objs.append(json.loads(text[start:i + 1]))
                except json.JSONDecodeError:
                    pass
                start = None
    return objs


async def complete_json(
    system: str,
    user: str,
    *,
    max_tokens: int = 2000,
    model: Optional[str] = None,
) -> Any:
    settings = get_settings()
    client = _get_client()
    resp = await client.messages.create(
        model=model or settings.kapsule_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(
        block.text for block in resp.content if getattr(block, "type", None) == "text"
    )
    return _extract_json(text)


async def complete_text(
    system: str, user: str, *, max_tokens: int = 1500, temperature: float = 0.3
) -> str:
    settings = get_settings()
    client = _get_client()
    resp = await client.messages.create(
        model=settings.kapsule_model,
        max_tokens=max_tokens,   
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(
        b.text for b in resp.content if getattr(b, "type", None) == "text"
    ).strip()
