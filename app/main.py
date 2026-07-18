"""Kapsule medication-intelligence backend — FastAPI surface.

Run:  uvicorn app.main:app --reload
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import data, drug_library, engine, evidence, fhir_utils as fu, orchestrator
from .agents import ALL_AGENTS
from .chart import ChartPatient, context_from_chart
from .config import get_settings

app = FastAPI(
    title="Kapsule Medication Intelligence API",
    version="0.1.0",
    description=(
        "EHR-embedded medication reasoning: six specialized agents + a deterministic "
        "rules engine, reconciled by a conflict resolver and merged by a recommendation "
        "synthesizer. Grounded in synthetic ambient-FHIR encounters."
    ),
)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# ---- meta ------------------------------------------------------------------
@app.get("/health")
def health():
    s = get_settings()
    return {
        "status": "ok",
        "llm_enabled": s.has_llm,
        "model": s.kapsule_model,
        "encounters": len(data.list_encounters()),
        "drugs": len(drug_library.all_drugs()),
        "interaction_rules": len(engine.RULES),
    }


@app.get("/agents")
def agents():
    return [
        {"name": a.name, "specialty": a.specialty, "description": a.description}
        for a in ALL_AGENTS
    ] + [
        {
            "name": "deterministic_engine",
            "specialty": "Deterministic Rules",
            "description": "Reproducible interaction / burden / duplicate / caution / "
            "indication findings.",
        }
    ]


# ---- patients / encounters -------------------------------------------------
@app.get("/patients")
def patients():
    return data.list_encounters()


@app.get("/patients/{patient_id}")
def patient(patient_id: str):
    rec = data.get_record(patient_id)
    if not rec:
        raise HTTPException(404, f"No record for {patient_id}")
    ctx = fu.normalize(rec)
    return {
        "context": ctx,
        "digest": fu.clinical_digest(ctx),
        "deterministic_findings": [f.model_dump() for f in engine.analyze(ctx)],
    }


class AnalyzeBody(BaseModel):
    event: Optional[str] = None  # encounter | new_lab | new_order | admit | discharge | med_rec
    specialty: str = "primary_care"


@app.post("/patients/{patient_id}/analyze")
async def analyze(patient_id: str, body: AnalyzeBody | None = None):
    rec = data.get_record(patient_id)
    if not rec:
        raise HTTPException(404, f"No record for {patient_id}")
    body = body or AnalyzeBody()
    return await orchestrator.analyze_record(rec, body.event, body.specialty)


@app.post("/patients/{patient_id}/agents/{agent_name}")
async def run_agent(patient_id: str, agent_name: str):
    rec = data.get_record(patient_id)
    if not rec:
        raise HTTPException(404, f"No record for {patient_id}")
    try:
        return await orchestrator.run_single_agent(rec, agent_name)
    except KeyError:
        raise HTTPException(404, f"Unknown agent {agent_name}")


# ---- frontend chart analysis (the UI's own mock patients) ------------------
class AnalyzeChartBody(BaseModel):
    patient: ChartPatient
    event: Optional[str] = None
    specialty: str = "primary_care"


@app.post("/analyze-chart")
async def analyze_chart(body: AnalyzeChartBody):
    """Run the full agentic loop over a patient chart supplied by the frontend."""
    ctx = context_from_chart(body.patient)
    return await orchestrator.analyze_context(ctx, body.event, body.specialty)


class DrugCheckChartBody(BaseModel):
    patient: ChartPatient
    candidate_drugs: list[str]


@app.post("/drug-check-chart")
def drug_check_chart(body: DrugCheckChartBody):
    """Deterministic New-Med Simulator over a frontend chart (fast, no LLM)."""
    ctx = context_from_chart(body.patient)
    return engine.drug_check(ctx, body.candidate_drugs)


# ---- drug library / deterministic checks -----------------------------------
@app.get("/drugs/search")
def drug_search(q: str = Query("", description="generic, brand, or class"), limit: int = 20):
    return drug_library.search(q, limit)


@app.get("/drugs/{name}")
def drug_lookup(name: str):
    entry = drug_library.lookup(name)
    if not entry:
        raise HTTPException(404, f"No drug matching {name}")
    return entry


class DrugCheckBody(BaseModel):
    patient_id: str
    candidate_drugs: list[str]


@app.post("/drug-check")
def drug_check(body: DrugCheckBody):
    """Deterministic New-Med Simulator: candidates vs active meds + patient."""
    rec = data.get_record(body.patient_id)
    if not rec:
        raise HTTPException(404, f"No record for {body.patient_id}")
    ctx = fu.normalize(rec)
    return engine.drug_check(ctx, body.candidate_drugs)


# ---- evidence resolver -----------------------------------------------------
@app.get("/evidence/{label}")
def evidence_resolve(label: str):
    return evidence.resolve(label).model_dump()


@app.get("/evidence")
def evidence_labels():
    return {"known_labels": evidence.known_labels()}
