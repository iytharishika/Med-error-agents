"""Evidence resolver.

Maps every evidence *label* used by the reasoning engine / agents to a verified
external source (PubMed record, FDA page, guideline publisher, Choosing Wisely).
Nothing here is fabricated: each URL points at a real, authoritative record. The
resolver also grades the *basis* in plain English (guideline vs RCT vs cohort)
as Prompt #2 requests.

If a label is not in the registry, `resolve()` returns a PubMed *search* URL for
the label rather than inventing a specific citation — the UI can still open a
real page, and we never display a fake PMID.
"""
from __future__ import annotations

import urllib.parse
from typing import Optional

from pydantic import BaseModel


class EvidenceSource(BaseModel):
    label: str
    title: str
    url: str
    kind: str            # guideline | rct | cohort | fda | criteria | society
    basis: str           # plain-English strength label (Prompt #2 #5)


# Curated registry. URLs are real records on PubMed / FDA / publisher sites.
_REGISTRY: dict[str, EvidenceSource] = {}


def _reg(label, title, url, kind, basis):
    _REGISTRY[label.lower()] = EvidenceSource(
        label=label, title=title, url=url, kind=kind, basis=basis
    )


# --- Guidelines -------------------------------------------------------------
_reg("Beers 2023", "2023 AGS Beers Criteria for PIMs in Older Adults",
     "https://pubmed.ncbi.nlm.nih.gov/37139824/", "criteria", "High (expert consensus criteria)")
_reg("STOPP/START v3", "STOPP/START version 3 criteria",
     "https://pubmed.ncbi.nlm.nih.gov/37256289/", "criteria", "High (expert consensus criteria)")
_reg("Choosing Wisely", "Choosing Wisely recommendations",
     "https://www.choosingwisely.org/clinician-lists/", "society", "Moderate (society recommendation)")
_reg("ACC/AHA HF 2022", "2022 AHA/ACC/HFSA Heart Failure Guideline",
     "https://pubmed.ncbi.nlm.nih.gov/35363499/", "guideline", "High (guideline)")
_reg("ADA Standards of Care", "ADA Standards of Care in Diabetes",
     "https://pubmed.ncbi.nlm.nih.gov/38078589/", "guideline", "High (guideline)")
_reg("KDIGO 2024 CKD", "KDIGO 2024 Clinical Practice Guideline for CKD",
     "https://pubmed.ncbi.nlm.nih.gov/38490803/", "guideline", "High (guideline)")
_reg("KDIGO Diabetes CKD", "KDIGO 2022 Diabetes in CKD Guideline",
     "https://pubmed.ncbi.nlm.nih.gov/36272764/", "guideline", "High (guideline)")
_reg("ESC AFib 2020", "2020 ESC Guidelines for Atrial Fibrillation",
     "https://pubmed.ncbi.nlm.nih.gov/32860505/", "guideline", "High (guideline)")
_reg("ACC/AHA Cholesterol 2018", "2018 AHA/ACC Cholesterol Guideline",
     "https://pubmed.ncbi.nlm.nih.gov/30586774/", "guideline", "High (guideline)")

# --- Landmark trials --------------------------------------------------------
_reg("DAPA-HF", "DAPA-HF: Dapagliflozin in HFrEF (NEJM 2019)",
     "https://pubmed.ncbi.nlm.nih.gov/31535829/", "rct", "High (landmark RCT)")
_reg("EMPEROR-Reduced", "EMPEROR-Reduced: Empagliflozin in HFrEF (NEJM 2020)",
     "https://pubmed.ncbi.nlm.nih.gov/32865377/", "rct", "High (landmark RCT)")
_reg("PARADIGM-HF", "PARADIGM-HF: Sacubitril/Valsartan vs Enalapril (NEJM 2014)",
     "https://pubmed.ncbi.nlm.nih.gov/25176015/", "rct", "High (landmark RCT)")
_reg("RALES", "RALES: Spironolactone in severe HF (NEJM 1999)",
     "https://pubmed.ncbi.nlm.nih.gov/10471456/", "rct", "High (landmark RCT)")
_reg("DAPA-CKD", "DAPA-CKD: Dapagliflozin in CKD (NEJM 2020)",
     "https://pubmed.ncbi.nlm.nih.gov/32970396/", "rct", "High (landmark RCT)")
_reg("CREDENCE", "CREDENCE: Canagliflozin in diabetic nephropathy (NEJM 2019)",
     "https://pubmed.ncbi.nlm.nih.gov/30990260/", "rct", "High (landmark RCT)")
_reg("EMPA-REG OUTCOME", "EMPA-REG OUTCOME: Empagliflozin CV outcomes (NEJM 2015)",
     "https://pubmed.ncbi.nlm.nih.gov/26378978/", "rct", "High (landmark RCT)")
_reg("FIDELIO-DKD", "FIDELIO-DKD: Finerenone in CKD/T2DM (NEJM 2020)",
     "https://pubmed.ncbi.nlm.nih.gov/33165261/", "rct", "High (landmark RCT)")

# --- FDA / safety -----------------------------------------------------------
_reg("FDA metformin renal", "FDA: Metformin use in reduced kidney function",
     "https://www.fda.gov/drugs/drug-safety-and-availability/fda-drug-safety-communication-fda-revises-warnings-regarding-use-diabetes-medicine-metformin-certain",
     "fda", "High (FDA label)")
_reg("FDA QT drug list", "CredibleMeds QTdrugs list",
     "https://crediblemeds.org/", "society", "Moderate (curated drug list)")
_reg("HAS-BLED", "HAS-BLED bleeding risk score (Chest 2010)",
     "https://pubmed.ncbi.nlm.nih.gov/20299623/", "cohort", "Moderate (validated score)")
_reg("CHA2DS2-VASc", "CHA2DS2-VASc stroke risk score (Chest 2010)",
     "https://pubmed.ncbi.nlm.nih.gov/19762550/", "cohort", "Moderate (validated score)")
_reg("CKD-EPI 2021", "CKD-EPI 2021 creatinine equation (NEJM 2021)",
     "https://pubmed.ncbi.nlm.nih.gov/34554658/", "cohort", "High (validated equation)")


def resolve(label: str) -> EvidenceSource:
    src = _REGISTRY.get((label or "").lower())
    if src:
        return src
    q = urllib.parse.quote(label or "clinical evidence")
    return EvidenceSource(
        label=label,
        title=f"PubMed search: {label}",
        url=f"https://pubmed.ncbi.nlm.nih.gov/?term={q}",
        kind="society",
        basis="Unverified — opens a PubMed search (no specific citation asserted)",
    )


def resolve_many(labels: list[str]) -> list[EvidenceSource]:
    seen: set[str] = set()
    out: list[EvidenceSource] = []
    for lbl in labels:
        key = (lbl or "").lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(resolve(lbl))
    return out


def known_labels() -> list[str]:
    return sorted(s.label for s in _REGISTRY.values())
