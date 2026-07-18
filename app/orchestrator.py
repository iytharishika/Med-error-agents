"""Top-level orchestration: event -> router -> (deterministic engine + LLM agents)
-> conflict resolver -> synthesizer -> unified analysis response.
"""
from __future__ import annotations

import asyncio
import time
from typing import Optional

from . import calculators as calc
from . import conflict_resolver, engine, evidence, fhir_utils as fu, synthesizer
from . import router as routing
from .agents import AGENTS_BY_NAME
from .config import get_settings
from .engine import Finding
from .models import (
    Action, AgentResult, AnalysisResponse, Evidence, Recommendation, Tier,
)

_SEV_TIER = {
    "contraindicated": Tier.critical, "major": Tier.high, "moderate": Tier.moderate,
    "minor": Tier.low, "info": Tier.info,
}
_SEV_CONF = {
    "contraindicated": 0.95, "major": 0.9, "moderate": 0.85, "minor": 0.8, "info": 0.7,
}

# specialty -> which agents a clinician in that specialty should see (Prompt #3).
SPECIALTY_AGENTS = {
    "primary_care": None,  # sees all
    "cardiology": {"gdmt_optimization", "dose_intelligence", "risk_monitoring", "drug_supplement"},
    "nephrology": {"dose_intelligence", "gdmt_optimization", "risk_monitoring"},
    "geriatrics": {"polypharmacy", "dose_intelligence", "risk_monitoring", "drug_supplement"},
    "pharmacy": None,
    "endocrinology": {"gdmt_optimization", "dose_intelligence", "risk_monitoring"},
}


def _action_from_text(text: str) -> Action:
    t = (text or "").lower()
    if any(w in t for w in ("discontinue", "avoid", "hold", "do not", "stop")):
        return Action.stop
    if any(w in t for w in ("adjust", "reduce", "cap", "titrate", "dose")):
        return Action.adjust_dose
    if any(w in t for w in ("switch", "alternative", "consider praval", "substitute")):
        return Action.substitute
    if any(w in t for w in ("initiate", "start", "add ")):
        return Action.start
    if "monitor" in t or "recheck" in t:
        return Action.monitor
    if "consolidate" in t or "review" in t or "reassess" in t:
        return Action.stop
    return Action.monitor


def finding_to_rec(f: Finding) -> Recommendation:
    ev = []
    for src in evidence.resolve_many(f.evidence):
        ev.append(Evidence(source=src.label, detail=src.title, citation=src.url))
    return Recommendation(
        agent="deterministic_engine",
        specialty="Deterministic Rules",
        tier=_SEV_TIER.get(f.severity, Tier.moderate),
        action=_action_from_text(f.action),
        title=f.finding,
        rationale=f"{f.patient_rationale} Mechanism: {f.mechanism}. Recommended: {f.action}.",
        order_target=(f.drugs[0] if f.drugs else None),
        confidence=_SEV_CONF.get(f.severity, 0.85),
        evidence=ev,
        tags=[f.kind] + ([m for m in f.monitoring] and ["has_monitoring"] or []),
    )


async def _run_agents(agents, ctx, calcs) -> list[AgentResult]:
    sem = asyncio.Semaphore(get_settings().kapsule_max_concurrency)

    async def _one(agent):
        async with sem:
            return await agent.run(ctx, calcs)

    return list(await asyncio.gather(*[_one(a) for a in agents]))


async def analyze_record(
    record: dict, event: Optional[str] = None, specialty: str = "primary_care"
) -> AnalysisResponse:
    start = time.time()
    settings = get_settings()
    ctx = fu.normalize(record)
    digest = fu.clinical_digest(ctx)

    calcs = await calc.auto_calculators(ctx)

    # deterministic engine always runs (reproducible source of truth)
    findings = engine.analyze(ctx)
    engine_result = AgentResult(
        agent="deterministic_engine",
        recommendations=[finding_to_rec(f) for f in findings],
        calculators={"health_score_delta": engine.health_score_delta(findings)},
    )

    # route + run the LLM agents
    selected = routing.route(ctx, event)
    allowed = SPECIALTY_AGENTS.get(specialty)
    if allowed is not None:
        selected = [a for a in selected if a.name in allowed]
    agent_results = await _run_agents(selected, ctx, calcs) if settings.has_llm else [
        AgentResult(agent=a.name, ran=False, error="LLM unavailable (no API key)")
        for a in selected
    ]

    all_results = [engine_result] + agent_results
    all_recs: list[Recommendation] = []
    for r in all_results:
        all_recs.extend(r.recommendations)

    conflicts = await conflict_resolver.resolve(
        all_recs, digest, use_llm=settings.has_llm
    )
    plan = await synthesizer.synthesize(
        ctx, digest, all_recs, conflicts, use_llm=settings.has_llm
    )

    routed = ["deterministic_engine"] + [a.name for a in selected]
    return AnalysisResponse(
        patient_id=ctx["patient_id"],
        encounter_id=ctx["encounter_id"],
        visit_title=ctx["visit_title"],
        routed_agents=routed,
        agent_results=all_results,
        conflicts=conflicts,
        plan=plan,
        llm_enabled=settings.has_llm,
        total_latency_ms=int((time.time() - start) * 1000),
    )


async def run_single_agent(record: dict, agent_name: str) -> AgentResult:
    agent = AGENTS_BY_NAME.get(agent_name)
    if not agent:
        raise KeyError(agent_name)
    ctx = fu.normalize(record)
    calcs = await calc.auto_calculators(ctx)
    if not get_settings().has_llm:
        return AgentResult(agent=agent_name, ran=False, error="LLM unavailable (no API key)",
                           calculators=agent.relevant_calculators(calcs))
    return await agent.run(ctx, calcs)
