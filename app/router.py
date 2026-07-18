"""Router agent — dispatches a patient/encounter to the relevant subset of the
six reasoning agents instead of running all six on every change.

Routing is driven by (a) each agent's own `applies()` predicate over the
normalized context and (b) the triggering event type when one is supplied
(new_lab, new_order, admit, discharge, med_rec).
"""
from __future__ import annotations

from typing import Optional

from .agents import ALL_AGENTS, AGENTS_BY_NAME
from .agents.base import BaseAgent

# Which agents an event type should prioritize. Empty => use applies() only.
EVENT_AGENTS = {
    "new_order": {"dose_intelligence", "drug_supplement", "risk_monitoring", "cost_optimization"},
    "new_lab": {"dose_intelligence", "risk_monitoring", "gdmt_optimization"},
    "admit": {"polypharmacy", "dose_intelligence", "risk_monitoring", "drug_supplement"},
    "discharge": {"polypharmacy", "gdmt_optimization", "cost_optimization", "drug_supplement"},
    "med_rec": {"drug_supplement", "polypharmacy", "cost_optimization"},
    "encounter": set(),  # full loop, gated by applies()
}


def route(ctx: dict, event: Optional[str] = None) -> list[BaseAgent]:
    event = (event or "encounter").lower()
    event_set = EVENT_AGENTS.get(event, set())
    selected: list[BaseAgent] = []
    for agent in ALL_AGENTS:
        if not agent.applies(ctx):
            continue
        if event_set and agent.name not in event_set:
            continue
        selected.append(agent)
    # Safety net: dose + risk monitoring always run when any med exists.
    if not selected:
        for name in ("dose_intelligence", "risk_monitoring"):
            a = AGENTS_BY_NAME[name]
            if a.applies(ctx):
                selected.append(a)
    return selected
