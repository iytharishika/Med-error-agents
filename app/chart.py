"""Build a normalized reasoning context from a lightweight *frontend* patient
chart (meds / labs / diagnoses), so the same engine + agents that run on the
FHIR dataset can analyze the UI's own mock patients.

The output dict matches what `fhir_utils.normalize()` produces, so everything
downstream (engine, calculators, agents, resolver, synthesizer) works unchanged.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from . import fhir_utils as fu


# ---- request models (what the frontend POSTs) ------------------------------

class ChartMed(BaseModel):
    name: str
    dose: str = ""
    status: str = "active"


class ChartLab(BaseModel):
    name: str
    value: Any
    unit: str = ""
    date: Optional[str] = None


class ChartCondition(BaseModel):
    label: str
    code: Optional[str] = None


class ChartPatient(BaseModel):
    id: str = "chart-patient"
    name: str = ""
    gender: str = ""            # 'M' | 'F' | 'X' | 'male' | 'female'
    dob: Optional[str] = None   # ISO date; used to compute age
    age: Optional[int] = None
    conditions: list[ChartCondition] = Field(default_factory=list)
    medications: list[ChartMed] = Field(default_factory=list)
    labs: list[ChartLab] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    visit_title: str = "Medication review"


def _age(dob: Optional[str], age: Optional[int]) -> Optional[int]:
    if age is not None:
        return age
    if not dob:
        return None
    try:
        b = date.fromisoformat(dob[:10])
    except ValueError:
        return None
    t = date.today()
    return t.year - b.year - ((t.month, t.day) < (b.month, b.day))


def _gender(g: str) -> str:
    g = (g or "").lower()
    if g.startswith("m"):
        return "male"
    if g.startswith("f"):
        return "female"
    return g or "unknown"


def context_from_chart(p: ChartPatient) -> dict[str, Any]:
    now = datetime.now().isoformat()

    # labs: classify each by name into the engine's keys (creatinine, egfr, ...)
    labs: dict[str, dict] = {}
    for lab in p.labs:
        key = fu._classify_lab("", lab.name)
        unit = (lab.unit or "").lower()
        if key == "creatinine" and ("/g" in unit or "mg/g" in unit):
            key = None  # urine ratio, not serum
        try:
            val = float(lab.value)
        except (TypeError, ValueError):
            val = None
        if key and val is not None:
            labs[key] = {
                "label": lab.name, "loinc": "", "value": val,
                "unit": lab.unit, "effective": lab.date or now,
                "category": "", "components": [],
            }

    meds = [
        {"label": m.name, "status": m.status, "dosage": m.dose, "codes": [],
         "source": "chart"}
        for m in p.medications if m.name
    ]
    conditions = [
        {"label": c.label, "codes": [], "clinical_status": "active", "onset": None}
        for c in p.conditions if c.label
    ]
    cond_labels = [c.label for c in p.conditions if c.label]

    return {
        "patient_id": p.id,
        "encounter_id": f"{p.id}-chart",
        "name": p.name,
        "gender": _gender(p.gender),
        "birth_date": p.dob,
        "age": _age(p.dob, p.age),
        "visit_title": p.visit_title,
        "visit_type": "Medication review",
        "encounter_class": "AMB",
        "date": now,
        "conditions": conditions,
        "chart_condition_labels": cond_labels,
        "medications": meds,
        "labs": labs,
        "vitals": [],
        "allergies": [{"label": a, "criticality": ""} for a in p.allergies],
        "resource_counts": {},
    }
