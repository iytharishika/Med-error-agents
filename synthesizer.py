"""
Recommendation synthesizer.

Takes the conflict resolver's output plus the raw agent findings and
produces the final structured object the clinician review UI renders.
Every recommendation keeps its rationale and cautions attached — nothing
is summarized away before the human sees it.
"""


def synthesize(snapshot, polypharmacy_finding: dict, gdmt_finding: dict,
               cost_finding: dict, resolved: dict) -> dict:
    return {
        "patient_id": snapshot.patient_id,
        "encounter_id": snapshot.encounter_id,
        "visit_title": snapshot.visit_title,
        "generated_at_visit": snapshot.visit_date,
        "recommendations": resolved["recommendations"],
        "agent_summaries": {
            "polypharmacy": polypharmacy_finding["summary"],
            "gdmt": gdmt_finding["summary"],
            "cost": cost_finding["summary"],
        },
        "raw_findings": {
            "polypharmacy": polypharmacy_finding,
            "gdmt": gdmt_finding,
            "cost": cost_finding,
        },
        "conflict_resolver_considered": resolved["considered"],
        "status": "pending_clinician_review",
    }
