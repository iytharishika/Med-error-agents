"""Deterministic medication reasoning engine.

Same inputs -> same outputs, always (no LLM, no randomness). Produces structured
`Finding` objects: kind, severity, finding, patient-specific rationale, mechanism,
recommended action, monitoring plan, evidence labels. Covers:
  * pairwise interaction rules (RAAS/K, NSAID+ACEi+diuretic AKI, bleeding stacks,
    QT, CNS/respiratory depression, CYP3A/P-gp, serotonin, hypoglycemia, digoxin,
    statin+macrolide, nitrate+PDE5, warfarin+TMP-SMX, drug-supplement, ...)
  * cumulative burden (QT, anticholinergic [escalated >=65], CNS-depressant)
  * duplicate therapy (same class)
  * patient-specific cautions keyed to eGFR / potassium / hemoglobin / age
  * positive indications (SGLT2i for HFrEF/CKD/T2DM; high-intensity statin for ASCVD)

`drug_check()` evaluates active meds + optional simulated candidates against each
other and the patient, and projects a health-score delta.
"""
from __future__ import annotations

from itertools import combinations
from typing import Any, Optional

from pydantic import BaseModel

from . import drug_library as dl
from . import fhir_utils as fu

SEVERITY_ORDER = {"contraindicated": 0, "major": 1, "moderate": 2, "minor": 3, "info": 4}
HEALTH_DELTA = {"contraindicated": -15, "major": -8, "moderate": -4, "minor": -1, "info": 2}


class Finding(BaseModel):
    kind: str                       # interaction | burden | duplicate | caution | indication | dose
    severity: str                   # contraindicated | major | moderate | minor | info
    finding: str
    patient_rationale: str
    mechanism: str
    action: str
    monitoring: list[str] = []
    evidence: list[str] = []
    drugs: list[str] = []

    def sort_key(self):
        return (SEVERITY_ORDER.get(self.severity, 9), self.finding)


# ---------------------------------------------------------------------------
# Pairwise interaction rules: (tag_a, tag_b, severity, finding, mechanism,
# action, monitoring[], evidence[]). Order-independent; a rule fires when two
# DISTINCT drugs carry the two tags.
# ---------------------------------------------------------------------------
RULES: list[tuple] = [
    ("raas", "raas", "major", "RAAS double-blockade",
     "Combined ACEi/ARB/ARNI blockade raises hyperkalemia and AKI risk without added benefit",
     "Avoid combining two RAAS agents; keep one", ["potassium", "creatinine"], ["KDIGO 2024 CKD"]),
    ("raas", "mra", "major", "RAAS + MRA hyperkalemia risk",
     "Additive potassium retention from RAAS inhibition plus mineralocorticoid blockade",
     "Continue if HFrEF-indicated but monitor K closely", ["potassium", "creatinine"], ["RALES", "ACC/AHA HF 2022"]),
    ("raas", "potassium_sparing", "major", "RAAS + K-sparing hyperkalemia risk",
     "Additive potassium retention", "Monitor potassium; avoid supplemental K", ["potassium"], []),
    ("raas", "potassium_raising", "major", "RAAS + potassium-raising agent",
     "Additive hyperkalemia (e.g., K supplement, salt substitute, TMP-SMX)",
     "Avoid unless K monitored; reassess need", ["potassium"], []),
    ("mra", "potassium_raising", "major", "MRA + potassium-raising agent hyperkalemia",
     "Additive potassium retention", "Avoid combination; monitor K", ["potassium"], []),
    ("nsaid", "raas", "major", "NSAID + RAAS nephrotoxicity",
     "NSAID reduces afferent flow while RAAS dilates efferent arteriole -> AKI, hyperkalemia",
     "Avoid NSAID; use acetaminophen/topical", ["creatinine", "potassium"], ["Beers 2023"]),
    ("nsaid", "diuretic", "major", "NSAID + diuretic 'triple whammy' component",
     "NSAID blunts diuretic effect and impairs renal autoregulation",
     "Avoid NSAID in patients on diuretics", ["creatinine"], []),
    ("nsaid", "anticoagulant", "major", "NSAID + anticoagulant bleeding risk",
     "Additive GI/systemic bleeding plus antiplatelet effect of NSAID",
     "Avoid NSAID; gastroprotection if unavoidable", ["hemoglobin"], []),
    ("nsaid", "antiplatelet", "moderate", "NSAID + antiplatelet bleeding risk",
     "Additive GI bleeding and mucosal injury", "Avoid or add PPI", ["hemoglobin"], []),
    ("anticoagulant", "antiplatelet", "major", "Anticoagulant + antiplatelet bleeding",
     "Combined hemostatic impairment markedly raises major bleeding",
     "Confirm indication for combined therapy; time-limit if possible", ["hemoglobin"], ["HAS-BLED"]),
    ("anticoagulant", "anticoagulant", "contraindicated", "Two anticoagulants",
     "Overlapping anticoagulation without bridging indication",
     "Do not co-prescribe two anticoagulants", ["hemoglobin"], []),
    ("antiplatelet", "antiplatelet", "moderate", "Dual antiplatelet therapy",
     "Additive bleeding; justified only for defined DAPT window",
     "Confirm DAPT indication and planned duration", ["hemoglobin"], []),
    ("warfarin", "tmp_smx", "major", "Warfarin + TMP-SMX INR elevation",
     "TMP-SMX inhibits CYP2C9 and displaces warfarin -> supratherapeutic INR/bleeding",
     "Avoid; if needed, reduce warfarin and recheck INR in 3-5 days", ["inr"], []),
    ("warfarin", "macrolide", "moderate", "Warfarin + macrolide INR elevation",
     "CYP3A4 inhibition raises warfarin exposure", "Monitor INR closely", ["inr"], []),
    ("statin", "macrolide", "major", "Statin + macrolide myopathy risk",
     "CYP3A4 inhibition raises statin (esp. simvastatin) levels -> myopathy/rhabdomyolysis",
     "Hold simvastatin/atorvastatin during macrolide course", ["ck", "alt"], []),
    ("statin", "cyp3a4_inhibitor", "moderate", "CYP3A4-metabolized statin + inhibitor",
     "Raised statin exposure increases myopathy risk", "Consider pravastatin/rosuvastatin", ["ck"], []),
    ("qt_prolonging", "qt_prolonging", "major", "Additive QT prolongation",
     "Two or more QT-prolonging agents raise torsades risk",
     "Minimize count; baseline and follow-up ECG", ["qtc", "potassium", "magnesium"], ["FDA QT drug list"]),
    ("opioid", "benzodiazepine", "contraindicated", "Opioid + benzodiazepine",
     "Additive CNS/respiratory depression - FDA boxed warning",
     "Avoid combination; if unavoidable use lowest doses, counsel, consider naloxone", ["sedation", "respiratory rate"], ["Beers 2023"]),
    ("opioid", "cns_depressant", "major", "Opioid + CNS depressant",
     "Additive sedation and respiratory depression", "Minimize concurrent CNS depressants", ["sedation", "respiratory rate"], []),
    ("benzodiazepine", "cns_depressant", "major", "Benzodiazepine + CNS depressant",
     "Additive sedation, falls, respiratory depression", "Deprescribe where possible", ["sedation"], ["Beers 2023"]),
    ("serotonergic", "serotonergic", "major", "Serotonin syndrome risk",
     "Two or more serotonergic agents raise serotonin syndrome risk",
     "Avoid stacking; counsel on symptoms", ["mental status", "clonus"], []),
    ("nitrate", "pde5", "contraindicated", "Nitrate + PDE5 inhibitor",
     "Synergistic vasodilation -> severe hypotension",
     "Absolute contraindication; separate by drug-specific washout", ["blood pressure"], []),
    ("digoxin", "loop_diuretic", "moderate", "Digoxin + loop diuretic toxicity risk",
     "Diuretic-induced hypokalemia potentiates digoxin toxicity",
     "Monitor potassium and digoxin level", ["potassium", "digoxin level"], []),
    ("digoxin", "macrolide", "moderate", "Digoxin + macrolide toxicity",
     "P-gp inhibition raises digoxin levels", "Monitor digoxin level", ["digoxin level"], []),
    ("sulfonylurea", "insulin", "moderate", "Sulfonylurea + insulin hypoglycemia",
     "Additive glucose lowering", "Reassess need for both; monitor glucose", ["glucose"], []),
    ("cyp3a4_inhibitor", "doac", "moderate", "CYP3A4/P-gp inhibitor + DOAC",
     "Raised DOAC exposure increases bleeding", "Review dose per interaction", ["hemoglobin"], []),
    ("potassium_raising", "potassium_raising", "moderate", "Multiple potassium-raising agents",
     "Additive hyperkalemia", "Consolidate; monitor K", ["potassium"], []),
    ("bleeding_risk", "bleeding_risk", "moderate", "Multiple agents raising bleeding risk",
     "Cumulative bleeding risk across the regimen", "Review necessity of each", ["hemoglobin"], []),
    # --- additional curated class-pair rules ---
    ("ssri", "nsaid", "moderate", "SSRI + NSAID GI bleeding risk",
     "SSRI-impaired platelet serotonin plus NSAID mucosal injury raises GI bleed risk",
     "Avoid NSAID or add gastroprotection", ["hemoglobin"], []),
    ("ssri", "anticoagulant", "moderate", "SSRI + anticoagulant bleeding risk",
     "Additive bleeding from impaired platelet function", "Monitor for bleeding", ["hemoglobin"], []),
    ("ssri", "antiplatelet", "moderate", "SSRI + antiplatelet bleeding risk",
     "Impaired platelet serotonin uptake adds to antiplatelet effect", "Monitor for bleeding", ["hemoglobin"], []),
    ("snri", "nsaid", "moderate", "SNRI + NSAID GI bleeding risk",
     "Serotonergic platelet effect plus NSAID injury", "Avoid NSAID or gastroprotect", ["hemoglobin"], []),
    ("beta_blocker", "digoxin", "moderate", "Beta blocker + digoxin bradycardia risk",
     "Additive AV-nodal slowing", "Monitor heart rate/rhythm", ["heart rate"], []),
    ("thiazide", "digoxin", "moderate", "Diuretic-induced hypokalemia + digoxin",
     "Thiazide hypokalemia potentiates digoxin toxicity", "Monitor K and digoxin level",
     ["potassium", "digoxin level"], []),
    ("loop_diuretic", "thiazide", "moderate", "Loop + thiazide sequential nephron blockade",
     "Profound diuresis and electrolyte depletion", "Monitor electrolytes and volume closely",
     ["potassium", "sodium", "creatinine"], []),
    ("corticosteroid", "nsaid", "moderate", "Corticosteroid + NSAID peptic ulcer risk",
     "Additive GI mucosal injury and bleeding", "Add gastroprotection or avoid", ["hemoglobin"], []),
    ("corticosteroid", "thiazide", "minor", "Corticosteroid + thiazide hypokalemia",
     "Additive potassium wasting", "Monitor potassium", ["potassium"], []),
    ("corticosteroid", "loop_diuretic", "minor", "Corticosteroid + loop diuretic hypokalemia",
     "Additive potassium wasting", "Monitor potassium", ["potassium"], []),
    ("sglt2", "loop_diuretic", "moderate", "SGLT2 inhibitor + loop diuretic volume depletion",
     "Additive diuresis can cause hypotension/AKI, esp. at initiation",
     "Reassess diuretic dose at SGLT2i start; monitor volume", ["creatinine", "blood pressure"], []),
    ("sglt2", "insulin", "minor", "SGLT2 inhibitor + insulin hypoglycemia/DKA",
     "Additive glucose lowering; euglycemic DKA risk", "Counsel; consider insulin adjustment", ["glucose"], []),
    ("insulin", "beta_blocker", "moderate", "Insulin + beta blocker masked hypoglycemia",
     "Beta blockade blunts adrenergic hypoglycemia warning signs", "Counsel on glucose monitoring", ["glucose"], []),
    ("sulfonylurea", "beta_blocker", "minor", "Sulfonylurea + beta blocker masked hypoglycemia",
     "Blunted hypoglycemia awareness", "Counsel on glucose monitoring", ["glucose"], []),
    ("ppi", "antiplatelet", "moderate", "PPI + clopidogrel reduced activation",
     "CYP2C19 inhibition (omeprazole/esomeprazole) may reduce clopidogrel activation",
     "Prefer pantoprazole or an H2RA with clopidogrel", [], []),
    ("sulfonylurea", "fluoroquinolone", "moderate", "Sulfonylurea + fluoroquinolone dysglycemia",
     "Fluoroquinolones can cause hypo- or hyperglycemia", "Monitor glucose", ["glucose"], []),
    ("sulfonylurea", "tmp_smx", "moderate", "Sulfonylurea + TMP-SMX hypoglycemia",
     "TMP-SMX inhibits CYP2C9 metabolism of sulfonylureas", "Monitor glucose", ["glucose"], []),
    ("warfarin", "urate_lowering", "moderate", "Warfarin + allopurinol INR elevation",
     "Allopurinol can potentiate warfarin effect", "Monitor INR", ["inr"], []),
    ("iron", "ppi", "minor", "Oral iron + PPI reduced absorption",
     "Reduced gastric acid impairs iron absorption", "Separate dosing; monitor response", ["hemoglobin"], []),
    ("iron", "fluoroquinolone", "moderate", "Oral iron + fluoroquinolone chelation",
     "Iron chelates fluoroquinolone reducing absorption/efficacy", "Separate by >=2-6 hours", [], []),
    ("thyroid", "iron", "minor", "Levothyroxine + iron reduced absorption",
     "Iron binds levothyroxine reducing absorption", "Separate by >=4 hours", ["tsh"], []),
    ("thyroid", "ppi", "minor", "Levothyroxine + PPI reduced absorption",
     "Reduced acid impairs levothyroxine absorption", "Monitor TSH; separate dosing", ["tsh"], []),
    ("antipsychotic", "cns_depressant", "moderate", "Antipsychotic + CNS depressant",
     "Additive sedation and fall risk", "Minimize concurrent sedatives", ["sedation"], ["Beers 2023"]),
    ("gabapentinoid", "opioid", "major", "Gabapentinoid + opioid respiratory depression",
     "Additive CNS/respiratory depression - increased overdose risk", "Minimize combination; counsel",
     ["sedation", "respiratory rate"], ["Beers 2023"]),
    ("fluoroquinolone", "corticosteroid", "moderate", "Fluoroquinolone + corticosteroid tendon rupture",
     "Additive tendinopathy/rupture risk, esp. in older adults", "Avoid if alternative exists",
     ["tendon pain"], []),
]


def _tag_index(meds: list[dict]) -> list[tuple[str, dict]]:
    """(display_name, drug_entry) for meds that map to the library."""
    out = []
    for m in meds:
        entry = dl.lookup(m.get("label", "") if isinstance(m, dict) else m)
        if entry:
            name = m.get("label") if isinstance(m, dict) else m
            out.append((name or entry["generic"], entry))
    return out


def _has_tag(entry: dict, tag: str) -> bool:
    return tag in entry["class_tags"]


def interaction_findings(indexed: list[tuple[str, dict]]) -> list[Finding]:
    findings: list[Finding] = []
    for (name_a, a), (name_b, b) in combinations(indexed, 2):
        if a["generic"] == b["generic"]:
            continue
        for tag1, tag2, sev, fnd, mech, action, mon, ev in RULES:
            hit = (_has_tag(a, tag1) and _has_tag(b, tag2)) or (
                _has_tag(a, tag2) and _has_tag(b, tag1)
            )
            if not hit:
                continue
            # for same-tag rules require both to carry it and be distinct
            if tag1 == tag2 and not (_has_tag(a, tag1) and _has_tag(b, tag1)):
                continue
            findings.append(
                Finding(
                    kind="interaction", severity=sev, finding=fnd,
                    patient_rationale=f"{name_a} + {name_b} both present in the regimen.",
                    mechanism=mech, action=action, monitoring=mon, evidence=ev,
                    drugs=[a["generic"], b["generic"]],
                )
            )
    return findings


def burden_findings(indexed: list[tuple[str, dict]], age: Optional[int]) -> list[Finding]:
    findings = []
    buckets = {
        "qt_prolonging": ("QT-prolonging", "qtc", ["FDA QT drug list"]),
        "anticholinergic": ("anticholinergic", "cognition/fall risk", ["Beers 2023"]),
        "cns_depressant": ("CNS-depressant", "sedation/fall risk", []),
    }
    for tag, (label, mon, ev) in buckets.items():
        contributors = [n for n, e in indexed if _has_tag(e, tag)]
        if len(contributors) >= 2:
            sev = "moderate"
            note = ""
            if tag == "anticholinergic" and (age or 0) >= 65:
                sev = "major"
                note = " Escalated: patient >=65 (heightened anticholinergic sensitivity)."
            findings.append(
                Finding(
                    kind="burden", severity=sev,
                    finding=f"Cumulative {label} burden ({len(contributors)} agents)",
                    patient_rationale=f"Contributing agents: {', '.join(contributors)}.{note}",
                    mechanism=f"Additive {label} effect across multiple drugs",
                    action=f"Reduce total {label} load where clinically possible",
                    monitoring=[mon], evidence=ev, drugs=contributors,
                )
            )
    return findings


def duplicate_findings(indexed: list[tuple[str, dict]]) -> list[Finding]:
    by_class: dict[str, list[str]] = {}
    for name, entry in indexed:
        by_class.setdefault(entry["drug_class"], []).append(entry["generic"])
    findings = []
    for klass, generics in by_class.items():
        uniq = sorted(set(generics))
        if len(uniq) >= 2:
            findings.append(
                Finding(
                    kind="duplicate", severity="moderate",
                    finding=f"Therapeutic duplication: {klass}",
                    patient_rationale=f"{' and '.join(uniq)} are both {klass}.",
                    mechanism="Two agents of the same class rarely add benefit and compound risk",
                    action="Consolidate to a single agent unless intentional",
                    monitoring=[], evidence=["Choosing Wisely"], drugs=uniq,
                )
            )
    return findings


def caution_findings(indexed, ctx) -> list[Finding]:
    findings = []
    age = ctx.get("age") or 0
    egfr = None
    labs = ctx.get("labs", {})
    if labs.get("egfr") is not None:
        try:
            egfr = float(labs["egfr"]["value"])
        except (TypeError, ValueError, KeyError):
            egfr = None
    k = fu.lab_value(ctx, "potassium")
    hgb = fu.lab_value(ctx, "hemoglobin")
    names = {e["generic"]: n for n, e in indexed}
    tags_present = {t for _, e in indexed for t in e["class_tags"]}

    def has(generic):
        return generic in names

    if egfr is not None:
        if has("metformin") and egfr < 30:
            findings.append(Finding(kind="caution", severity="contraindicated",
                finding="Metformin contraindicated at eGFR <30",
                patient_rationale=f"eGFR {egfr}; metformin present.",
                mechanism="Reduced clearance raises lactic acidosis risk",
                action="Discontinue metformin", monitoring=["egfr"],
                evidence=["FDA metformin renal"], drugs=["metformin"]))
        elif has("metformin") and egfr < 45:
            findings.append(Finding(kind="caution", severity="moderate",
                finding="Metformin caution at eGFR 30-45",
                patient_rationale=f"eGFR {egfr}; do not exceed 1000 mg/day and do not initiate.",
                mechanism="Reduced clearance", action="Cap dose; monitor renal function",
                monitoring=["egfr"], evidence=["FDA metformin renal"], drugs=["metformin"]))
        if "nsaid" in tags_present and egfr < 30:
            findings.append(Finding(kind="caution", severity="major",
                finding="NSAID in severe CKD",
                patient_rationale=f"eGFR {egfr}; NSAID present.",
                mechanism="Prostaglandin-dependent renal perfusion is critical in CKD",
                action="Avoid NSAIDs", monitoring=["creatinine"], evidence=["Beers 2023"],
                drugs=[g for g in names if _entry(g) and "nsaid" in _entry(g)["class_tags"]]))
        if has("dabigatran") and egfr < 30:
            findings.append(Finding(kind="caution", severity="contraindicated",
                finding="Dabigatran below CrCl 30",
                patient_rationale=f"eGFR {egfr}; dabigatran is renally cleared.",
                mechanism="Accumulation raises bleeding risk", action="Avoid dabigatran; select alternative",
                monitoring=["creatinine"], evidence=["ESC AFib 2020"], drugs=["dabigatran"]))
        if "thiazide" in tags_present and egfr < 30:
            findings.append(Finding(kind="caution", severity="minor",
                finding="Thiazide less effective at eGFR <30",
                patient_rationale=f"eGFR {egfr}.", mechanism="Reduced distal sodium delivery",
                action="Consider loop diuretic for volume/BP", monitoring=[], evidence=[],
                drugs=[g for g in names if _entry(g) and "thiazide" in _entry(g)["class_tags"]]))
        if "sglt2" in tags_present and egfr < 20:
            findings.append(Finding(kind="caution", severity="moderate",
                finding="SGLT2 inhibitor not initiated below eGFR 20",
                patient_rationale=f"eGFR {egfr}.", mechanism="Reduced glycemic efficacy; initiation threshold",
                action="Do not newly initiate; continuation may be reasonable", monitoring=["egfr"],
                evidence=["KDIGO Diabetes CKD"], drugs=[g for g in names if _entry(g) and "sglt2" in _entry(g)["class_tags"]]))
        if "gabapentinoid" in tags_present and egfr < 60:
            findings.append(Finding(kind="dose", severity="minor",
                finding="Gabapentinoid renal dose adjustment",
                patient_rationale=f"eGFR {egfr}.", mechanism="Renal clearance; accumulation -> sedation",
                action="Adjust dose to CrCl", monitoring=["sedation"], evidence=[],
                drugs=[g for g in names if _entry(g) and "gabapentinoid" in _entry(g)["class_tags"]]))

    if k is not None and k >= 5.0:
        blockers = [g for g in names if _entry(g) and (
            {"raas", "mra", "potassium_sparing", "potassium_raising"} & set(_entry(g)["class_tags"]))]
        if blockers:
            findings.append(Finding(kind="caution", severity="major",
                finding=f"Potassium {k} — hold/avoid potassium-raising agents",
                patient_rationale=f"Serum K {k} mEq/L with {', '.join(blockers)} on board.",
                mechanism="Further potassium retention risks dangerous hyperkalemia",
                action="Hold RAAS/MRA/K initiation until K normalizes",
                monitoring=["potassium"], evidence=["KDIGO 2024 CKD"], drugs=blockers))

    if hgb is not None and hgb < 10:
        risky = [g for g in names if _entry(g) and (
            {"nsaid", "antiplatelet", "anticoagulant"} & set(_entry(g)["class_tags"]))]
        if risky:
            findings.append(Finding(kind="caution", severity="moderate",
                finding=f"Low hemoglobin ({hgb}) with antithrombotic/NSAID",
                patient_rationale=f"Hgb {hgb} g/dL with {', '.join(risky)}.",
                mechanism="Bleeding on a low baseline is less tolerated; consider occult blood loss",
                action="Reassess necessity; evaluate for bleeding source",
                monitoring=["hemoglobin"], evidence=[], drugs=risky))

    if age >= 65:
        beers = [e["generic"] for _, e in indexed if e["beers_flag"]]
        if beers:
            findings.append(Finding(kind="caution", severity="moderate",
                finding="Beers Criteria medications in older adult",
                patient_rationale=f"Age {age}; potentially inappropriate: {', '.join(sorted(set(beers)))}.",
                mechanism="Elevated risk of adverse drug events in older adults",
                action="Review for deprescribing / safer alternatives",
                monitoring=[], evidence=["Beers 2023"], drugs=sorted(set(beers))))
    return findings


def indication_findings(indexed, ctx) -> list[Finding]:
    findings = []
    conds = " ".join(
        [c["label"].lower() for c in ctx["conditions"]]
        + [c.lower() for c in ctx["chart_condition_labels"]]
    )
    tags_present = {t for _, e in indexed for t in e["class_tags"]}
    hf = any(k in conds for k in ("heart failure", "hfref", "reduced ejection"))
    ckd = "chronic kidney" in conds or "ckd" in conds
    t2dm = "diabetes mellitus type 2" in conds or "type 2 diabetes" in conds
    ascvd = any(k in conds for k in ("coronary", "ischemic heart", "myocardial", "atherosclerotic", "peripheral arterial"))

    if (hf or ckd or t2dm) and "sglt2" not in tags_present:
        ev = ["DAPA-HF"] if hf else (["DAPA-CKD"] if ckd else ["EMPA-REG OUTCOME"])
        findings.append(Finding(kind="indication", severity="info",
            finding="Consider SGLT2 inhibitor (guideline-indicated, not on regimen)",
            patient_rationale=f"Diagnosis supports SGLT2i benefit ({'HFrEF' if hf else 'CKD' if ckd else 'T2DM'}); none present.",
            mechanism="SGLT2 inhibition reduces HF hospitalization and CKD progression",
            action="Initiate SGLT2 inhibitor if eGFR permits and no contraindication",
            monitoring=["egfr", "volume status"], evidence=ev, drugs=[]))
    if ascvd:
        statins = [e for _, e in indexed if "statin" in e["class_tags"]]
        high_intensity = any(
            e["generic"] in ("atorvastatin", "rosuvastatin") for e in statins
        )
        if not statins:
            findings.append(Finding(kind="indication", severity="moderate",
                finding="ASCVD without a statin",
                patient_rationale="Atherosclerotic disease present; no statin on regimen.",
                mechanism="Statins reduce recurrent CV events in ASCVD",
                action="Start high-intensity statin", monitoring=["ldl", "alt"],
                evidence=["ACC/AHA Cholesterol 2018"], drugs=[]))
        elif not high_intensity:
            findings.append(Finding(kind="indication", severity="minor",
                finding="ASCVD on non-high-intensity statin",
                patient_rationale="Consider intensifying to high-intensity statin.",
                mechanism="Greater LDL lowering yields greater event reduction in ASCVD",
                action="Intensify to atorvastatin 40-80 or rosuvastatin 20-40",
                monitoring=["ldl"], evidence=["ACC/AHA Cholesterol 2018"], drugs=[]))
    return findings


def _entry(generic: str) -> Optional[dict]:
    return dl.library().get(generic)


def analyze(ctx: dict, extra_meds: Optional[list[str]] = None) -> list[Finding]:
    meds = list(ctx.get("medications", []))
    for m in extra_meds or []:
        meds.append({"label": m, "status": "simulated"})
    indexed = _tag_index(meds)
    findings: list[Finding] = []
    findings += interaction_findings(indexed)
    findings += burden_findings(indexed, ctx.get("age"))
    findings += duplicate_findings(indexed)
    findings += caution_findings(indexed, ctx)
    findings += indication_findings(indexed, ctx)
    # dedupe identical findings, keep deterministic order
    seen = set()
    uniq = []
    for f in sorted(findings, key=lambda x: x.sort_key()):
        key = (f.kind, f.finding, tuple(sorted(f.drugs)))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(f)
    return uniq


def health_score_delta(findings: list[Finding]) -> int:
    return sum(HEALTH_DELTA.get(f.severity, 0) for f in findings)


def drug_check(
    ctx: dict, candidate_drugs: list[str]
) -> dict[str, Any]:
    """Evaluate candidate meds against active meds + patient. Returns per-candidate
    findings and a projected health-score change (Prompt #1 New Med Simulator)."""
    baseline = analyze(ctx)
    combined = analyze(ctx, extra_meds=candidate_drugs)
    baseline_keys = {(f.kind, f.finding, tuple(sorted(f.drugs))) for f in baseline}
    new_findings = [
        f for f in combined
        if (f.kind, f.finding, tuple(sorted(f.drugs))) not in baseline_keys
    ]
    return {
        "candidates": candidate_drugs,
        "new_findings": [f.model_dump() for f in new_findings],
        "overall_severity": min(
            (f.severity for f in new_findings),
            key=lambda s: SEVERITY_ORDER.get(s, 9), default="info",
        ),
        "projected_health_score_delta": health_score_delta(new_findings),
        "all_findings_with_candidate": [f.model_dump() for f in combined],
    }
