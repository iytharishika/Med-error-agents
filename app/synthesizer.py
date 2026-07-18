"""Recommendation synthesizer.

Takes every recommendation from the six agents + the deterministic engine, plus
the resolved conflicts, and produces one clinician-ready plan:
  * a de-duplicated, priority-ordered action list (the "Top of Mind" ordering
    from Prompt #2),
  * a consolidated monitoring plan,
  * a plain-language patient-facing summary.

Deterministic assembly always runs; the LLM (when configured) only writes the
two narrative summaries, so the ranked actions are reproducible.
"""
from __future__ import annotations

from . import llm
from .models import Conflict, Recommendation, SynthesizedPlan, Tier

_TIER_RANK = {Tier.critical: 0, Tier.high: 1, Tier.moderate: 2, Tier.low: 3, Tier.info: 4}


def _dedupe(recs: list[Recommendation]) -> list[Recommendation]:
    """Merge recommendations that hit the same target with the same action,
    keeping the highest-tier / highest-confidence instance and unioning evidence."""
    best: dict[tuple, Recommendation] = {}
    for r in recs:
        key = ((r.order_target or r.title).lower(), r.action.value)
        cur = best.get(key)
        if cur is None:
            best[key] = r.model_copy(deep=True)
            continue
        # merge into the stronger one
        keep, drop = (
            (cur, r)
            if (_TIER_RANK.get(cur.tier, 9), -cur.confidence)
            <= (_TIER_RANK.get(r.tier, 9), -r.confidence)
            else (r, cur)
        )
        merged = keep.model_copy(deep=True)
        seen = {(e.source, e.detail) for e in merged.evidence}
        for e in drop.evidence:
            if (e.source, e.detail) not in seen:
                merged.evidence.append(e)
        if drop.agent not in merged.tags:
            merged.tags = list(dict.fromkeys(merged.tags + [f"also:{drop.agent}"]))
        best[key] = merged
    return list(best.values())


def _prioritize(recs: list[Recommendation]) -> list[Recommendation]:
    return sorted(
        recs, key=lambda r: (_TIER_RANK.get(r.tier, 9), -r.confidence, r.agent)
    )


def _monitoring_plan(recs: list[Recommendation]) -> list[str]:
    items: list[str] = []
    seen = set()
    for r in recs:
        if r.action.value == "monitor" or "monitor" in r.title.lower():
            line = f"{r.title}"
            if line.lower() not in seen:
                seen.add(line.lower())
                items.append(line)
    return items


def _fallback_summary(ctx: dict, prioritized: list[Recommendation], conflicts) -> str:
    crit = [r for r in prioritized if r.tier in (Tier.critical, Tier.high)]
    head = f"{len(prioritized)} recommendations across {len({r.agent for r in prioritized})} engines"
    if crit:
        head += f"; {len(crit)} high-priority. Top action: {crit[0].title}."
    else:
        head += "; no critical items."
    if conflicts:
        head += f" {len(conflicts)} cross-agent conflict(s) reconciled."
    return head


def _fallback_patient(prioritized: list[Recommendation]) -> str:
    lines = ["Here is what your care team is reviewing about your medicines:"]
    for r in prioritized[:5]:
        verb = {
            "stop": "may stop", "start": "may add", "adjust_dose": "may adjust the dose of",
            "substitute": "may switch", "monitor": "will keep an eye on",
        }.get(r.action.value, "will review")
        tgt = r.order_target or "a medication"
        lines.append(f"- We {verb} {tgt}.")
    return "\n".join(lines)


async def synthesize(
    ctx: dict, ctx_digest: str, recs: list[Recommendation], conflicts: list[Conflict],
    use_llm: bool = True,
) -> SynthesizedPlan:
    deduped = _dedupe(recs)
    prioritized = _prioritize(deduped)
    monitoring = _monitoring_plan(deduped)

    summary = _fallback_summary(ctx, prioritized, conflicts)
    patient = _fallback_patient(prioritized)

    if use_llm and prioritized:
        try:
            top = "\n".join(
                f"- [{r.tier.value}] {r.action.value}: {r.title} — {r.rationale}"
                for r in prioritized[:10]
            )
            conflict_txt = "\n".join(f"- {c.description} -> {c.resolution}" for c in conflicts)
            data = await llm.complete_json(
                system=(
                    "You are the attending synthesizing a medication review for a busy "
                    "clinician. Given the ranked recommendations and resolved conflicts, "
                    'reply with JSON {"summary": "<=3 sentence clinician summary leading with '
                    'the single most consequential action>", "patient_summary": "<=5 short '
                    'lines at a 6th-grade reading level, one action each, reassuring and clear"}.'
                ),
                user=f"Patient:\n{ctx_digest}\n\nRanked recommendations:\n{top}\n\n"
                f"Conflicts:\n{conflict_txt or '(none)'}",
                max_tokens=700,
            )
            if isinstance(data, dict):
                summary = data.get("summary") or summary
                patient = data.get("patient_summary") or patient
        except Exception:  # noqa: BLE001 - keep deterministic fallback
            pass

    return SynthesizedPlan(
        summary=summary,
        prioritized_actions=prioritized,
        monitoring_plan=monitoring,
        patient_facing_summary=patient,
    )
