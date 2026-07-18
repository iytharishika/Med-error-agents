"""Clinical calculators.

Two sources of truth:
  * Local, deterministic implementations for scores OpenMedCalc does not expose
    (CKD-EPI 2021 eGFR, CHA2DS2-VASc, HAS-BLED, anticholinergic burden, Child-Pugh).
  * The OpenMedCalc open-source API for MELD, MELD-Na, Caprini VTE, Wells DVT, PSI.

Every function returns a small dict {score, interpretation, inputs} so agents can
attach it as `Evidence` without re-deriving anything.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .config import get_settings
from . import fhir_utils as fu


# --------------------------------------------------------------------------
# Local deterministic calculators
# --------------------------------------------------------------------------

def ckd_epi_2021(creatinine_mg_dl: float, age: int, sex: str) -> dict[str, Any]:
    """CKD-EPI 2021 creatinine equation (race-free)."""
    female = sex.lower().startswith("f")
    kappa = 0.7 if female else 0.9
    alpha = -0.241 if female else -0.302
    scr_k = creatinine_mg_dl / kappa
    egfr = (
        142
        * (min(scr_k, 1) ** alpha)
        * (max(scr_k, 1) ** -1.200)
        * (0.9938 ** age)
        * (1.012 if female else 1.0)
    )
    egfr = round(egfr, 1)
    if egfr >= 90:
        stage = "G1 (normal)"
    elif egfr >= 60:
        stage = "G2 (mildly decreased)"
    elif egfr >= 45:
        stage = "G3a"
    elif egfr >= 30:
        stage = "G3b"
    elif egfr >= 15:
        stage = "G4 (severely decreased)"
    else:
        stage = "G5 (kidney failure)"
    return {
        "name": "CKD-EPI 2021 eGFR",
        "score": egfr,
        "unit": "mL/min/1.73m2",
        "interpretation": f"eGFR {egfr} — CKD {stage}",
        "inputs": {"creatinine": creatinine_mg_dl, "age": age, "sex": sex},
    }


def cha2ds2_vasc(
    *,
    age: int,
    sex: str,
    chf: bool,
    hypertension: bool,
    diabetes: bool,
    stroke_tia: bool,
    vascular_disease: bool,
) -> dict[str, Any]:
    pts = 0
    if age >= 75:
        pts += 2
    elif age >= 65:
        pts += 1
    if sex.lower().startswith("f"):
        pts += 1
    pts += int(chf) + int(hypertension) + int(diabetes) + int(vascular_disease)
    pts += 2 * int(stroke_tia)
    risk = {0: "0.2%", 1: "0.6%", 2: "2.2%", 3: "3.2%", 4: "4.8%",
            5: "7.2%", 6: "9.7%", 7: "11.2%", 8: "10.8%", 9: "12.2%"}
    return {
        "name": "CHA2DS2-VASc",
        "score": pts,
        "interpretation": f"Annual stroke risk ~{risk.get(pts, '>12%')}; "
        f"anticoagulation {'recommended' if pts >= 2 else 'consider/optional'}",
        "inputs": {"age": age, "sex": sex},
    }


def has_bled(
    *,
    hypertension: bool,
    renal_disease: bool,
    liver_disease: bool,
    stroke: bool,
    bleeding_history: bool,
    labile_inr: bool,
    age_over_65: bool,
    drugs: bool,
    alcohol: bool,
) -> dict[str, Any]:
    pts = sum(
        [
            hypertension, renal_disease, liver_disease, stroke, bleeding_history,
            labile_inr, age_over_65, drugs, alcohol,
        ]
    )
    return {
        "name": "HAS-BLED",
        "score": pts,
        "interpretation": f"Major bleeding risk {'high (>=3)' if pts >= 3 else 'lower'}; "
        "score >=3 warrants caution and closer review on anticoagulation",
        "inputs": {},
    }


# Anticholinergic Cognitive Burden — common offenders (ACB scale).
ACB_SCORES = {
    "diphenhydramine": 3, "hydroxyzine": 3, "oxybutynin": 3, "tolterodine": 3,
    "amitriptyline": 3, "nortriptyline": 3, "paroxetine": 3, "promethazine": 3,
    "chlorpheniramine": 3, "cyclobenzaprine": 2, "cetirizine": 1, "loratadine": 1,
    "ranitidine": 1, "furosemide": 1, "metoprolol": 1, "trazodone": 1,
    "risperidone": 1, "quetiapine": 1, "digoxin": 1, "prednisone": 1,
}


def anticholinergic_burden(med_labels: list[str]) -> dict[str, Any]:
    total = 0
    hits = []
    for label in med_labels:
        low = label.lower()
        for drug, pts in ACB_SCORES.items():
            if drug in low:
                total += pts
                hits.append(f"{drug} (+{pts})")
    return {
        "name": "Anticholinergic Cognitive Burden (ACB)",
        "score": total,
        "interpretation": (
            f"ACB {total}: {'clinically relevant (>=3) — raises fall/cognitive risk' if total >= 3 else 'low'}"
        ),
        "inputs": {"contributors": hits},
    }


def child_pugh(
    *,
    bilirubin: float,
    albumin: float,
    inr: float,
    ascites: str = "none",
    encephalopathy: str = "none",
) -> dict[str, Any]:
    pts = 0
    pts += 1 if bilirubin < 2 else (2 if bilirubin <= 3 else 3)
    pts += 1 if albumin > 3.5 else (2 if albumin >= 2.8 else 3)
    pts += 1 if inr < 1.7 else (2 if inr <= 2.3 else 3)
    pts += {"none": 1, "mild": 2, "moderate": 3, "severe": 3}.get(ascites, 1)
    pts += {"none": 1, "grade1-2": 2, "grade3-4": 3}.get(encephalopathy, 1)
    cls = "A" if pts <= 6 else ("B" if pts <= 9 else "C")
    return {
        "name": "Child-Pugh",
        "score": pts,
        "interpretation": f"Class {cls} — "
        + {"A": "well-compensated", "B": "significant impairment", "C": "decompensated"}[cls],
        "inputs": {"bilirubin": bilirubin, "albumin": albumin, "inr": inr},
    }


def bmi(weight_kg: Optional[float], height_cm: Optional[float]) -> Optional[dict[str, Any]]:
    if not weight_kg or not height_cm:
        return None
    m = height_cm / 100
    val = round(weight_kg / (m * m), 1)
    cat = (
        "underweight" if val < 18.5 else
        "normal" if val < 25 else
        "overweight" if val < 30 else "obese"
    )
    return {"name": "BMI", "score": val, "interpretation": f"BMI {val} ({cat})", "inputs": {}}


# --------------------------------------------------------------------------
# OpenMedCalc API client
# --------------------------------------------------------------------------

async def _openmedcalc(endpoint: str, payload: dict) -> Optional[dict[str, Any]]:
    base = get_settings().openmedcalc_base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(f"{base}/{endpoint}", json=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception:  # noqa: BLE001 - network/proxy/parse issues degrade gracefully
        return None
    return {
        "name": endpoint,
        "score": data.get("score"),
        "interpretation": data.get("message") or data.get("additional_info") or "",
        "inputs": payload,
        "source": "openmedcalc.org",
    }


async def meld_na(creatinine, bilirubin, inr, sodium, on_dialysis=False):
    return await _openmedcalc(
        "meld-na",
        {
            "creatinine": min(creatinine, 9.99),
            "bilirubin": min(bilirubin, 9.99),
            "inr": min(inr, 9.99),
            "sodium": max(110.1, min(sodium, 159.9)),
            "is_on_dialysis": on_dialysis,
        },
    )


async def wells_dvt(**flags) -> Optional[dict[str, Any]]:
    return await _openmedcalc("wells-dvt", flags)


async def caprini_vte(**kwargs) -> Optional[dict[str, Any]]:
    return await _openmedcalc("caprini-vte", kwargs)


# --------------------------------------------------------------------------
# Convenience: derive whatever calculators the context supports
# --------------------------------------------------------------------------

def _has_condition(ctx: dict, *needles: str) -> bool:
    hay = " ".join(
        [c["label"].lower() for c in ctx["conditions"]]
        + [c.lower() for c in ctx["chart_condition_labels"]]
    )
    return any(n in hay for n in needles)


async def auto_calculators(ctx: dict) -> dict[str, Any]:
    """Run every calculator the patient's data actually supports."""
    out: dict[str, Any] = {}
    age = ctx.get("age") or 0
    sex = ctx.get("gender", "M")

    scr = fu.lab_value(ctx, "creatinine")
    reported_egfr = ctx.get("labs", {}).get("egfr")
    if scr and age:
        out["egfr"] = ckd_epi_2021(scr, age, sex)
    elif reported_egfr and reported_egfr.get("value") is not None:
        # No usable serum creatinine, but the chart already carries a reported eGFR.
        try:
            val = round(float(reported_egfr["value"]), 1)
            out["egfr"] = {
                "name": "Reported eGFR (chart)",
                "score": val,
                "unit": reported_egfr.get("unit", "mL/min/1.73m2"),
                "interpretation": f"Charted eGFR {val}",
                "inputs": {"source": "observation"},
            }
        except (TypeError, ValueError):
            pass

    bili = fu.lab_value(ctx, "bilirubin")
    alb = fu.lab_value(ctx, "albumin")
    inr = fu.lab_value(ctx, "inr")
    if bili and alb and inr:
        out["child_pugh"] = child_pugh(bilirubin=bili, albumin=alb, inr=inr)
        na = fu.lab_value(ctx, "sodium") or 137
        res = await meld_na(scr or 1.0, bili, inr, na)
        if res:
            out["meld_na"] = res

    med_labels = [m["label"] for m in ctx["medications"] if m["label"]]
    acb = anticholinergic_burden(med_labels)
    if acb["score"] > 0:
        out["acb"] = acb

    if _has_condition(ctx, "atrial fibrillation", "afib", "atrial flutter"):
        out["cha2ds2_vasc"] = cha2ds2_vasc(
            age=age,
            sex=sex,
            chf=_has_condition(ctx, "heart failure", "hfref", "chf"),
            hypertension=_has_condition(ctx, "hypertension"),
            diabetes=_has_condition(ctx, "diabetes"),
            stroke_tia=_has_condition(ctx, "stroke", "tia"),
            vascular_disease=_has_condition(
                ctx, "myocardial", "coronary", "peripheral arterial", "vascular"
            ),
        )
        out["has_bled"] = has_bled(
            hypertension=_has_condition(ctx, "hypertension"),
            renal_disease=(out.get("egfr", {}).get("score", 99) < 60),
            liver_disease=_has_condition(ctx, "cirrhosis", "liver disease"),
            stroke=_has_condition(ctx, "stroke", "tia"),
            bleeding_history=_has_condition(ctx, "bleed", "hemorrhage"),
            labile_inr=False,
            age_over_65=age >= 65,
            drugs=any(
                "aspirin" in m.lower() or "nsaid" in m.lower() or "ibuprofen" in m.lower()
                for m in med_labels
            ),
            alcohol=_has_condition(ctx, "alcohol"),
        )
    return out
