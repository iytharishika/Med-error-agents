"""Shared data models — mirrors the normalized `Recommendation` contract
that every agent emits (tier, specialty, confidence, orderTarget, evidence[]).
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class Tier(str, Enum):
    """Clinical urgency / severity tier."""
    critical = "critical"      # act before signing the order
    high = "high"
    moderate = "moderate"
    low = "low"
    info = "info"


class Action(str, Enum):
    start = "start"
    stop = "stop"
    adjust_dose = "adjust_dose"
    substitute = "substitute"
    monitor = "monitor"
    continue_ = "continue"
    counsel = "counsel"
    refer = "refer"


class Evidence(BaseModel):
    source: str = Field(..., description="Guideline / trial / calculator name")
    detail: str = Field("", description="What the source says, grounded in this patient")
    citation: Optional[str] = None


class Recommendation(BaseModel):
    agent: str
    tier: Tier
    specialty: str
    action: Action
    title: str
    rationale: str
    order_target: Optional[str] = Field(
        None, description="Drug / lab / order the recommendation acts on"
    )
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    evidence: list[Evidence] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class AgentResult(BaseModel):
    agent: str
    ran: bool = True
    error: Optional[str] = None
    recommendations: list[Recommendation] = Field(default_factory=list)
    calculators: dict[str, Any] = Field(default_factory=dict)
    latency_ms: int = 0


class Conflict(BaseModel):
    kind: Literal["contradiction", "duplication", "sequencing", "safety_override"]
    description: str
    order_target: Optional[str] = None
    agents_involved: list[str] = Field(default_factory=list)
    recommendation_titles: list[str] = Field(default_factory=list)
    resolution: str
    winning_action: Optional[str] = None
    tier: Tier = Tier.moderate


class SynthesizedPlan(BaseModel):
    summary: str
    prioritized_actions: list[Recommendation] = Field(default_factory=list)
    monitoring_plan: list[str] = Field(default_factory=list)
    patient_facing_summary: str = ""


class AnalysisResponse(BaseModel):
    patient_id: str
    encounter_id: str
    visit_title: str
    routed_agents: list[str]
    agent_results: list[AgentResult]
    conflicts: list[Conflict]
    plan: SynthesizedPlan
    llm_enabled: bool
    total_latency_ms: int
