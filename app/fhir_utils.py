"""Normalize raw FHIR R4 records into a compact clinical context that agents
and calculators can reason over. We flatten the encounter's `related_resources`
plus the patient's longitudinal chart summary.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional


# ---- small helpers ---------------------------------------------------------

def _text(codeable: Optional[dict]) -> str:
    if not codeable:
        return ""
    if codeable.get("text"):
        return codeable["text"]
    for c in codeable.get("coding", []) or []:
        if c.get("display"):
            return c["display"]
        if c.get("code"):
            return str(c["code"])
    return ""


def _codes(codeable: Optional[dict]) -> list[dict[str, str]]:
    out = []
    for c in (codeable or {}).get("coding", []) or []:
        out.append(
            {
                "system": c.get("system", ""),
                "code": str(c.get("code", "")),
                "display": c.get("display", ""),
            }
        )
    return out


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _age(birth_date: Optional[str], as_of: Optional[str]) -> Optional[int]:
    if not birth_date:
        return None
    try:
        b = date.fromisoformat(birth_date[:10])
    except ValueError:
        return None
    ref = _parse_dt(as_of)
    ref_d = ref.date() if ref else date.today()
    return ref_d.year - b.year - ((ref_d.month, ref_d.day) < (b.month, b.day))


# ---- observation / lab extraction -----------------------------------------

def _observation(obs: dict) -> dict[str, Any]:
    vq = obs.get("valueQuantity") or {}
    value: Any = vq.get("value")
    unit = vq.get("unit", "")
    if value is None and "valueCodeableConcept" in obs:
        value = _text(obs["valueCodeableConcept"])
    if value is None and "valueString" in obs:
        value = obs["valueString"]
    # blood pressure & other panels use components
    components = []
    for comp in obs.get("component", []) or []:
        cvq = comp.get("valueQuantity") or {}
        components.append(
            {
                "label": _text(comp.get("code")),
                "value": cvq.get("value"),
                "unit": cvq.get("unit", ""),
            }
        )
    return {
        "label": _text(obs.get("code")),
        "loinc": next(
            (c["code"] for c in _codes(obs.get("code")) if "loinc" in c["system"]), ""
        ),
        "value": value,
        "unit": unit,
        "effective": obs.get("effectiveDateTime") or obs.get("issued"),
        "category": _text((obs.get("category") or [{}])[0])
        if obs.get("category")
        else "",
        "components": components,
    }


# LOINC codes for labs the calculators need.
LAB_LOINC = {
    "creatinine": {"2160-0", "38483-4"},
    "egfr": {"48642-3", "48643-1", "77147-7", "62238-1", "33914-3"},
    "potassium": {"2823-3", "6298-4"},
    "sodium": {"2951-2", "2947-0"},
    "hba1c": {"4548-4", "17856-6"},
    "ldl": {"18262-6", "13457-7", "2089-1"},
    "bilirubin": {"1975-2", "42719-5"},
    "albumin": {"1751-7"},
    "inr": {"6301-6", "34714-6"},
    "ast": {"1920-8"},
    "alt": {"1742-6"},
    "glucose": {"2339-0", "2345-7"},
    "bnp": {"30934-4", "33762-6", "42637-9"},
    "hemoglobin": {"718-7"},
    "platelet": {"777-3"},
}


def _classify_lab(loinc: str, label: str) -> Optional[str]:
    for key, codes in LAB_LOINC.items():
        if loinc in codes:
            return key
    low = label.lower()
    for key in LAB_LOINC:
        if key in low:
            return key
    if "estimated glomerular" in low or "gfr" in low:
        return "egfr"
    if "hemoglobin a1c" in low or "a1c" in low:
        return "hba1c"
    return None


# ---- top-level normalizer --------------------------------------------------

def normalize(record: dict) -> dict[str, Any]:
    meta = record["metadata"]
    pctx = record.get("patient_context", {})
    patient = pctx.get("patient", {})
    long_summary = pctx.get("longitudinal_summary", {})
    encounter = record.get("encounter_fhir", {})
    related: dict[str, list] = encounter.get("related_resources", {})

    as_of = meta.get("date")
    name = ""
    for n in patient.get("name", []) or []:
        given = " ".join(n.get("given", []) or [])
        name = f"{given} {n.get('family', '')}".strip()
        if name:
            break

    # observations / labs / vitals
    observations = [_observation(o) for o in related.get("Observation", [])]
    labs: dict[str, dict] = {}
    vitals: list[dict] = []
    for o in observations:
        key = _classify_lab(o["loinc"], o["label"])
        unit = (o.get("unit") or "").lower()
        # serum creatinine is mg/dL; a urine creatinine ratio (mg/g) must not be
        # used for CKD-EPI, so reject it here.
        if key == "creatinine" and ("/g" in unit or "mg/g" in unit):
            key = None
        if key and o["value"] is not None:
            # keep most recent per key
            prev = labs.get(key)
            if prev is None or (o["effective"] or "") >= (prev.get("effective") or ""):
                labs[key] = o
        if o["category"] == "Vital signs" or o["components"]:
            vitals.append(o)

    # conditions
    conditions = []
    for c in related.get("Condition", []):
        conditions.append(
            {
                "label": _text(c.get("code")),
                "codes": _codes(c.get("code")),
                "clinical_status": _text(c.get("clinicalStatus")),
                "onset": c.get("onsetDateTime"),
            }
        )

    # medications (encounter-level requests/statements + chart labels)
    meds = []
    for res_type in ("MedicationRequest", "MedicationStatement", "Medication"):
        for m in related.get(res_type, []):
            label = _text(m.get("medicationCodeableConcept")) or _text(m.get("code"))
            dosage = ""
            for d in m.get("dosageInstruction", []) or []:
                dosage = d.get("text", "")
                if dosage:
                    break
            meds.append(
                {
                    "label": label,
                    "status": m.get("status", ""),
                    "dosage": dosage,
                    "codes": _codes(
                        m.get("medicationCodeableConcept") or m.get("code")
                    ),
                    "source": res_type,
                }
            )
    # merge in longitudinal medication labels the encounter didn't restate
    seen = {m["label"].lower() for m in meds if m["label"]}
    for label in long_summary.get("medication_labels", []) or []:
        if label.lower() not in seen:
            meds.append(
                {
                    "label": label,
                    "status": "active",
                    "dosage": "",
                    "codes": [],
                    "source": "chart_summary",
                }
            )

    # allergies
    allergies = []
    for a in related.get("AllergyIntolerance", []):
        allergies.append(
            {
                "label": _text(a.get("code")),
                "criticality": a.get("criticality", ""),
            }
        )

    return {
        "patient_id": meta["patient_id"],
        "encounter_id": meta["encounter_id"],
        "name": name,
        "gender": patient.get("gender", ""),
        "birth_date": patient.get("birthDate"),
        "age": _age(patient.get("birthDate"), as_of),
        "visit_title": meta.get("visit_title", ""),
        "visit_type": meta.get("visit_type", ""),
        "encounter_class": (encounter.get("encounter", {}) or {})
        .get("class", {})
        .get("code", ""),
        "date": as_of,
        "conditions": conditions,
        "chart_condition_labels": long_summary.get("condition_labels", []),
        "medications": meds,
        "labs": labs,
        "vitals": vitals,
        "allergies": allergies,
        "resource_counts": long_summary.get("resource_counts", {}),
    }


def lab_value(ctx: dict, key: str) -> Optional[float]:
    entry = ctx.get("labs", {}).get(key)
    if not entry:
        return None
    try:
        return float(entry["value"])
    except (TypeError, ValueError):
        return None


def clinical_digest(ctx: dict, max_chars: int = 4000) -> str:
    """Compact, human-readable context block handed to each agent's prompt."""
    lines = [
        f"Patient: {ctx['name'] or 'Unknown'} | {ctx['gender']} | "
        f"age {ctx['age']} | visit: {ctx['visit_title']}",
        f"Encounter type: {ctx['visit_type']} (class {ctx['encounter_class']}) "
        f"on {ctx['date']}",
    ]
    conds = [c["label"] for c in ctx["conditions"] if c["label"]]
    chart = [c for c in ctx["chart_condition_labels"] if c not in conds]
    if conds:
        lines.append("Encounter conditions: " + "; ".join(conds))
    if chart:
        lines.append("Chart problem list: " + "; ".join(chart[:20]))
    if ctx["medications"]:
        med_lines = []
        for m in ctx["medications"][:30]:
            d = f" [{m['dosage']}]" if m["dosage"] else ""
            med_lines.append(f"{m['label']}{d} ({m['status']})")
        lines.append("Medications: " + "; ".join(med_lines))
    if ctx["allergies"]:
        lines.append(
            "Allergies: " + "; ".join(a["label"] for a in ctx["allergies"] if a["label"])
        )
    if ctx["labs"]:
        lab_lines = []
        for key, o in ctx["labs"].items():
            lab_lines.append(f"{key}={o['value']}{o['unit']}")
        lines.append("Recent labs: " + "; ".join(lab_lines))
    if ctx["vitals"]:
        vlines = []
        for v in ctx["vitals"][:8]:
            if v["components"]:
                parts = ", ".join(
                    f"{c['label']} {c['value']}{c['unit']}" for c in v["components"]
                )
                vlines.append(f"{v['label']}: {parts}")
            elif v["value"] is not None:
                vlines.append(f"{v['label']} {v['value']}{v['unit']}")
        if vlines:
            lines.append("Vitals: " + "; ".join(vlines))
    return "\n".join(lines)[:max_chars]
