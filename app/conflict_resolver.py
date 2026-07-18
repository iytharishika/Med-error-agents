"""Conflict resolver.

Different agents can recommend contradictory or overlapping actions on the same
drug (e.g., GDMT wants to *start* an MRA while Risk Monitoring flags hyperkalemia
and wants to *hold* potassium-raising agents; Polypharmacy and Dose Intelligence
both flag the same drug). This module:

  1. groups recommendations by the drug/lab they target,
  2. deterministically classifies each group as contradiction / duplication /
     sequencing / safety_override,
  3. resolves it — safety-first by rule, with an optional LLM pass to write the
     clinical reconciliation narrative when a key is configured.
"""
from __future__ import annotations

import re
from typing import Optional

from . import drug_library as dl
from . import llm
from .models import Action, Conflict, Recommendation, Tier

# lower rank = higher clinical priority when actions collide
_ACTION_PRIORITY = {
    Action.stop: 0,
    Action.adjust_dose: 1,
    Action.substitute: 2,
    Action.monitor: 3,
    Action.refer: 4,
    Action.counsel: 5,
    Action.continue_: 6,
    Action.start: 7,
}
_TIER_RANK = {Tier.critical: 0, Tier.high: 1, Tier.moderate: 2, Tier.low: 3, Tier.info: 4}

_OPPOSING = {
    frozenset({Action.start, Action.stop}),
    frozenset({Action.continue_, Action.stop}),
    frozenset({Action.start, Action.substitute}),
}


def _target_key(rec: Recommendation) -> Optional[str]:
    raw = rec.order_target or ""
    generic = dl.normalize_name(raw)
    if generic:
        return generic
    tok = re.sub(r"[^a-z0-9 ]", "", raw.lower()).strip()
    return tok or None


def _detect_groups(recs: list[Recommendation]) -> dict[str, list[Recommendation]]:
    groups: dict[str, list[Recommendation]] = {}
    for r in recs:
        key = _target_key(r)
        if key:
            groups.setdefault(key, []).append(r)
    return {k: v for k, v in groups.items() if len(v) >= 2}


def _classify(group: list[Recommendation]) -> Optional[str]:
    actions = {r.action for r in group}
    agents = {r.agent for r in group}
    for pair in _OPPOSING:
        if pair.issubset(actions):
            has_safety = any(
                r.action == Action.stop
                and r.tier in (Tier.critical, Tier.high)
                for r in group
            )
            return "safety_override" if has_safety else "contradiction"
    if len(actions) == 1 and len(agents) >= 2:
        return "duplication"
    if {Action.start, Action.adjust_dose} & actions and Action.monitor in actions:
        return "sequencing"
    if len(actions) >= 2:
        return "contradiction"
    return None


def _winner(group: list[Recommendation]) -> Recommendation:
    return sorted(
        group,
        key=lambda r: (
            _TIER_RANK.get(r.tier, 9),
            _ACTION_PRIORITY.get(r.action, 9),
            -r.confidence,
        ),
    )[0]


def _deterministic_resolution(kind: str, group: list[Recommendation], win: Recommendation) -> str:
    if kind == "duplication":
        return (
            f"{len(group)} agents independently recommend the same action "
            f"('{win.action.value}') — merged into one item, reasons combined."
        )
    if kind == "safety_override":
        return (
            f"Safety takes precedence: {win.agent}'s '{win.action.value}' "
            f"({win.tier.value}) overrides the opposing optimization. Address the "
            "safety issue first, then reconsider the deferred recommendation."
        )
    if kind == "sequencing":
        return (
            f"Sequence the actions: perform '{win.action.value}' with the paired "
            "monitoring rather than treating them as competing."
        )
    return (
        f"Conflicting actions on the same target. Preferred: {win.agent}'s "
        f"'{win.action.value}' ({win.tier.value}, confidence {win.confidence:.0%}); "
        "the alternative should be revisited afterward."
    )


async def _llm_resolution(kind, group, win, ctx_digest) -> Optional[str]:
    try:
        payload = "\n".join(
            f"- [{r.agent} / {r.tier.value}] {r.action.value}: {r.title} — {r.rationale}"
            for r in group
        )
        data = await llm.complete_json(
            system=(
                "You are a chief pharmacist adjudicating conflicting medication "
                "recommendations. Reconcile safety-first. Reply with JSON "
                '{"resolution": "2-3 sentences", "winning_action": "start|stop|adjust_dose|'
                'substitute|monitor|continue|counsel|refer"}.'
            ),
            user=f"Patient:\n{ctx_digest}\n\nConflict type: {kind}\nRecommendations:\n{payload}",
            max_tokens=400,
        )
        if isinstance(data, dict) and data.get("resolution"):
            return data["resolution"]
    except Exception:  # noqa: BLE001 - fall back to deterministic text
        return None
    return None


async def resolve(
    recs: list[Recommendation], ctx_digest: str = "", use_llm: bool = True
) -> list[Conflict]:
    conflicts: list[Conflict] = []
    for key, group in _detect_groups(recs).items():
        kind = _classify(group)
        if not kind:
            continue
        win = _winner(group)
        resolution = None
        if use_llm:
            resolution = await _llm_resolution(kind, group, win, ctx_digest)
        if not resolution:
            resolution = _deterministic_resolution(kind, group, win)
        conflicts.append(
            Conflict(
                kind=kind,
                description=f"{len(group)} recommendations target '{key}' "
                f"({', '.join(sorted({r.agent for r in group}))}).",
                order_target=key,
                agents_involved=sorted({r.agent for r in group}),
                recommendation_titles=[r.title for r in group],
                resolution=resolution,
                winning_action=win.action.value,
                tier=win.tier,
            )
        )
    conflicts.sort(key=lambda c: _TIER_RANK.get(c.tier, 9))
    return conflicts
