"""The six Kapsule reasoning agents (specs in specialised_agents.txt)."""
from __future__ import annotations

from .base import BaseAgent


def _conditions_text(ctx: dict) -> str:
    return " ".join(
        [c["label"].lower() for c in ctx["conditions"]]
        + [c.lower() for c in ctx["chart_condition_labels"]]
    )


def _med_count(ctx: dict) -> int:
    return len([m for m in ctx["medications"] if m["label"]])


class PolypharmacyAgent(BaseAgent):
    name = "polypharmacy"
    specialty = "Deprescribing / Geriatrics"
    description = (
        "Detects unnecessary, duplicate, or harm-prone meds and produces a ranked "
        "deprescribing plan with taper schedules."
    )

    def _applies(self, ctx: dict) -> bool:
        return _med_count(ctx) >= 5 or (ctx.get("age") or 0) >= 65

    def relevant_calculators(self, all_calcs):
        return {k: v for k, v in all_calcs.items() if k in ("acb", "egfr")}

    def system_prompt(self) -> str:
        return (
            "You are a clinical pharmacist specializing in deprescribing. Apply Beers 2023, "
            "STOPP/START v3, and Choosing Wisely. Identify: (1) potentially inappropriate "
            "medications for the patient's age/renal function, (2) therapeutic duplication "
            "within a drug class, (3) prescribing cascades (a drug treating another drug's "
            "side effect), and (4) drugs raising anticholinergic burden or fall risk. For each, "
            "recommend stop/adjust with a concrete taper where abrupt cessation is unsafe. "
            "Weigh the anticholinergic burden score if provided. Be conservative: never "
            "recommend stopping guideline-indicated therapy without a clear reason."
        )


class GDMTAgent(BaseAgent):
    name = "gdmt_optimization"
    specialty = "Cardiology / Endocrinology / Nephrology"
    description = (
        "Compares the regimen to guideline-directed medical therapy for HFrEF, T2DM, CAD, "
        "CKD, AFib and flags missing therapies with expected benefit."
    )

    def _applies(self, ctx: dict) -> bool:
        t = _conditions_text(ctx)
        return any(
            k in t
            for k in (
                "heart failure", "hfref", "diabetes", "coronary", "ischemic heart",
                "myocardial", "chronic kidney", "ckd", "atrial fibrillation",
                "hypertension", "hyperlipidemia", "metabolic syndrome",
            )
        )

    def relevant_calculators(self, all_calcs):
        return {k: v for k, v in all_calcs.items() if k in ("egfr", "cha2ds2_vasc")}

    def system_prompt(self) -> str:
        return (
            "You are a cardiologist and internist optimizing guideline-directed medical therapy. "
            "Use ACC/AHA heart failure, ADA diabetes, KDIGO CKD, and ESC AFib guidelines. "
            "For each relevant diagnosis: check whether each pillar of GDMT is present and at "
            "target dose (e.g., HFrEF: ARNI/ACEi/ARB, beta-blocker, MRA, SGLT2i; T2DM+ASCVD/CKD: "
            "SGLT2i or GLP-1; CKD+albuminuria: ACEi/ARB + SGLT2i; ASCVD: high-intensity statin + "
            "antiplatelet). Flag missing therapies and sub-target dosing. Quantify benefit with "
            "NNT/ARR from landmark trials when you cite them. Respect contraindications implied by "
            "labs (e.g., eGFR, potassium) and allergies."
        )


class DoseIntelligenceAgent(BaseAgent):
    name = "dose_intelligence"
    specialty = "Clinical Pharmacology"
    description = (
        "Validates every dose against renal, hepatic, age, and weight parameters and "
        "recommends adjusted doses before the order is signed."
    )
    always_run = True  # dosing safety applies to any patient on medications

    def _applies(self, ctx: dict) -> bool:
        return _med_count(ctx) >= 1

    def relevant_calculators(self, all_calcs):
        return {
            k: v for k, v in all_calcs.items()
            if k in ("egfr", "child_pugh", "meld_na")
        }

    def system_prompt(self) -> str:
        return (
            "You are a clinical pharmacologist doing pre-order dose verification. For each active "
            "medication, check the dose against the patient's renal function (use the provided "
            "eGFR), hepatic function (Child-Pugh / MELD-Na if provided), age, and weight. Flag "
            "renally-cleared drugs that need reduction or avoidance at the patient's eGFR "
            "(e.g., metformin, DOACs, gabapentin, many antibiotics), hepatically-metabolized drugs "
            "needing caution, and any absolute contraindication. Recommend a specific adjusted dose "
            "or interval. Only flag a drug you can see in the medication list."
        )


class RiskMonitoringAgent(BaseAgent):
    name = "risk_monitoring"
    specialty = "Patient Safety"
    description = (
        "Scores composite adverse-event risk (QT, bleeding, hyperkalemia, sedation, "
        "hypoglycemia, fall) and generates a patient-specific monitoring plan."
    )
    always_run = True

    def relevant_calculators(self, all_calcs):
        return {
            k: v for k, v in all_calcs.items()
            if k in ("has_bled", "cha2ds2_vasc", "acb", "egfr")
        }

    def system_prompt(self) -> str:
        return (
            "You are a patient-safety pharmacist building a medication monitoring plan. Assess "
            "composite adverse-event risks arising from the regimen + labs: QT prolongation "
            "(stacked QT-prolonging drugs), bleeding (antithrombotic stacks, HAS-BLED), "
            "hyperkalemia (RAASi + K-sparing + CKD + measured potassium), hypoglycemia "
            "(insulin/sulfonylureas), sedation/falls (anticholinergic burden, opioids, "
            "benzodiazepines), and serotonin syndrome. For each real risk, output a monitoring "
            "recommendation: WHAT to monitor, WHEN, and the threshold that should trigger action. "
            "Ground every risk in a drug or lab that is actually present. Prefer 'monitor' actions."
        )


class DrugSupplementAgent(BaseAgent):
    name = "drug_supplement"
    specialty = "Medication Reconciliation"
    description = (
        "Reconciles prescribed meds with OTC drugs and supplements, grades interaction "
        "severity, and gives mechanism-grounded recommendations."
    )
    always_run = True

    def relevant_calculators(self, all_calcs):
        return {k: v for k, v in all_calcs.items() if k in ("has_bled",)}

    def build_user_prompt(self, ctx: dict, calcs: dict) -> str:
        # This agent also mines the transcript/notes for patient-reported supplements.
        base = super().build_user_prompt(ctx, calcs)
        return base

    def system_prompt(self) -> str:
        return (
            "You are a medication-reconciliation pharmacist focused on drug–supplement and "
            "drug–OTC interactions. From the medication list and any patient-reported OTC or "
            "supplement use, identify interactions and grade each as contraindicated / major / "
            "moderate / monitor, always naming the MECHANISM (e.g., additive bleeding risk, "
            "CYP3A4/CYP2C9 inhibition, serotonergic load, additive QT). Pay special attention to "
            "bleeding stacks (warfarin/DOAC/antiplatelet + fish oil, ginkgo, vitamin E, NSAIDs), "
            "serotonergic stacks (SSRI + St John's Wort + tramadol), and potassium-raising "
            "combinations. If no supplements are documented, note the reconciliation gap and "
            "recommend capturing an OTC/supplement history."
        )


class CostOptimizationAgent(BaseAgent):
    name = "cost_optimization"
    specialty = "Pharmacy Benefit / Value"
    description = (
        "Finds therapeutically-equivalent, formulary-preferred alternatives and ranks by "
        "clinical equivalence, adherence risk, and out-of-pocket cost."
    )

    def _applies(self, ctx: dict) -> bool:
        return _med_count(ctx) >= 2

    def relevant_calculators(self, all_calcs):
        return {}

    def system_prompt(self) -> str:
        return (
            "You are a pharmacy-benefits pharmacist optimizing cost without sacrificing outcomes. "
            "For the active regimen, identify branded or higher-cost agents that have a "
            "therapeutically-equivalent, lower-cost, typically formulary-preferred alternative in "
            "the same class (e.g., brand -> generic, non-preferred -> preferred generic, "
            "therapeutic interchange within class). For each, recommend the substitution, note that "
            "clinical equivalence must be confirmed for the indication, and flag when a switch could "
            "hurt adherence or requires prior authorization. Only suggest switches that are "
            "clinically reasonable; never trade away a guideline-preferred agent purely for cost."
        )


ALL_AGENTS = [
    PolypharmacyAgent(),
    GDMTAgent(),
    DoseIntelligenceAgent(),
    RiskMonitoringAgent(),
    DrugSupplementAgent(),
    CostOptimizationAgent(),
]

AGENTS_BY_NAME = {a.name: a for a in ALL_AGENTS}
