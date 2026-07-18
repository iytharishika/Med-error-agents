# Kapsule — Medication Intelligence Backend

EHR-embedded medication reasoning for the Abridge × Anthropic hackathon.

Kapsule reviews a patient's diagnoses, medications, allergies, labs, and renal/
hepatic function and returns safer, evidence-grounded regimen recommendations. It
combines two complementary layers:

1. **A deterministic reasoning engine** — reproducible, rule-based findings
   (drug interactions, cumulative burden, duplicate therapy, patient-specific
   cautions, positive indications). Same inputs always produce the same output.
2. **Six specialized LLM agents** (Anthropic API) — guideline-grounded reasoning
   that adds narrative rationale, taper plans, GDMT gaps, and monitoring plans.

A **router** dispatches only the relevant agents per event, a **conflict
resolver** reconciles contradictory recommendations safety-first, and a
**recommendation synthesizer** merges everything into one prioritized, clinician-
ready plan plus a patient-facing summary.

Grounded in the `synthetic-ambient-fhir-25` dataset (25 synthetic FHIR
R4 encounters). All patient data is synthetic.

## Architecture

```
             ┌──────────────── /patients/{id}/analyze ────────────────┐
             │                                                         │
  FHIR record ─► normalize ─► calculators ──┬─► deterministic engine ──┤
  (data.py)     (fhir_utils)  (calculators)  │   (engine.py, 53 rules) │
                                             │                          ├─► conflict
                              router.py ─────┴─► 6 LLM agents ──────────┤   resolver ─► synthesizer ─► AnalysisResponse
                              (event → agents)   (agents/, Anthropic)   │  (safety-first)  (one plan)
                                                                        │
                             calculators: CKD-EPI eGFR, CHA₂DS₂-VASc,   │
                             HAS-BLED, ACB, Child-Pugh (local) +        │
                             MELD-Na, Wells, Caprini (OpenMedCalc API)  │
```

### The six agents (`app/agents/specialists.py`)

| Agent | Specialty | What it does |
|-------|-----------|--------------|
| `polypharmacy` | Deprescribing / Geriatrics | Beers 2023 / STOPP-START v3 PIMs, duplication, cascades, taper plans |
| `gdmt_optimization` | Cardiology / Endo / Nephro | Missing/sub-target GDMT for HFrEF, T2DM, CAD, CKD, AFib with NNT/ARR |
| `dose_intelligence` | Clinical Pharmacology | Renal/hepatic/age/weight dose validation before order sign-off |
| `risk_monitoring` | Patient Safety | Composite QT / bleed / hyperkalemia / hypoglycemia / fall monitoring |
| `drug_supplement` | Med Reconciliation | Drug–supplement/OTC interactions graded by mechanism + severity |
| `cost_optimization` | Pharmacy Benefit | Therapeutically-equivalent, formulary-preferred lower-cost switches |

Every agent emits the normalized **Recommendation** contract:
`tier · specialty · action · confidence · order_target · evidence[]`.

### Deterministic engine (`app/engine.py`)

Reproducible `Finding`s — `kind · severity · finding · patient_rationale ·
mechanism · action · monitoring · evidence`. Severity ∈ {contraindicated, major,
moderate, minor, info}. Covers 53 curated interaction rules (RAAS/K, NSAID+ACEi+
diuretic AKI, bleeding stacks, QT, CNS/respiratory depression, CYP3A/P-gp,
serotonin, hypoglycemia, digoxin, statin+macrolide, nitrate+PDE5, warfarin+TMP-
SMX, drug–supplement, …), cumulative burden (QT / anticholinergic [escalated ≥65]
/ CNS-depressant), duplicate therapy, patient-specific cautions (metformin/eGFR,
NSAID/CKD, dabigatran/CrCl, K≥5 blocks RAAS/MRA, Beers in elders, …), and positive
indications (SGLT2i for HFrEF/CKD/T2DM, high-intensity statin for ASCVD).

`drug_check` powers the New-Med Simulator: candidate drugs vs active meds +
patient, with a projected health-score delta
(contraindicated −15, major −8, moderate −4, minor −1, info +2).

### Evidence resolver (`app/evidence.py`)

Every evidence label maps to a **verified** external record — landmark trials and
guidelines to PubMed, drug safety to FDA, plus Choosing Wisely and CredibleMeds.
Unknown labels return a PubMed *search* URL rather than a fabricated citation. No
citation is ever invented.

## Setup

```bash
cd kapsule-backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...

uvicorn app.main:app --reload
# → http://localhost:8000/docs  (interactive OpenAPI)
```

Without an API key the service still boots: the deterministic engine, calculators,
conflict resolver, and synthesizer run, and the LLM agents report `ran: false`.
Set the key to activate the six agents.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Status, LLM enabled, counts |
| GET | `/agents` | The six agents + deterministic engine |
| GET | `/patients` | List all 25 encounters |
| GET | `/patients/{id}` | Normalized context, digest, deterministic findings |
| POST | `/patients/{id}/analyze` | **Full loop** → routed agents, conflicts, synthesized plan. Body: `{event, specialty}` |
| POST | `/patients/{id}/agents/{agent}` | Run one agent |
| GET | `/drugs/search?q=` | Fuzzy drug search (generic/brand/class) |
| GET | `/drugs/{name}` | Drug monograph |
| POST | `/drug-check` | New-Med Simulator. Body: `{patient_id, candidate_drugs[]}` |
| GET | `/evidence/{label}` | Resolve an evidence label to a verified source |

`event` ∈ `encounter · new_lab · new_order · admit · discharge · med_rec`
(controls routing). `specialty` ∈ `primary_care · cardiology · nephrology ·
geriatrics · endocrinology · pharmacy` (filters which agents are shown).

### Example

```bash
curl -X POST localhost:8000/patients/74919836-2db2-2f73-d2cf-5287a180b0ff/analyze \
  -H 'content-type: application/json' \
  -d '{"event":"encounter","specialty":"cardiology"}'

curl -X POST localhost:8000/drug-check -H 'content-type: application/json' \
  -d '{"patient_id":"74919836-2db2-2f73-d2cf-5287a180b0ff","candidate_drugs":["sildenafil"]}'
# → contraindicated (nitrate + PDE5), projected health-score delta -15
```

## Verify

```bash
python smoke_test.py    # offline: engine determinism, drug-check, all 25 encounters
```

## Notes

- **Synthetic data only.** Not a validated clinical tool; no real PHI.
- The OpenMedCalc client is built against the live `api.openmedcalc.org` OpenAPI
  schema (MELD, MELD-Na, Caprini, Wells, PSI). If the API is unreachable the call
  degrades gracefully and the local calculators still run.
- `KAPSULE_MODEL` in `.env` selects the Claude model for all agents.
