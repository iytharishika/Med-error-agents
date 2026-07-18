"""Offline smoke test — exercises the whole pipeline without an API key.

Run: python smoke_test.py
"""
import asyncio
import json

from fastapi.testclient import TestClient

from app import data, engine, fhir_utils as fu, orchestrator
from app.main import app

client = TestClient(app)


def test_health_and_lists():
    h = client.get("/health").json()
    assert h["status"] == "ok"
    assert h["encounters"] == 25
    assert h["interaction_rules"] >= 25
    assert len(client.get("/patients").json()) == 25
    assert len(client.get("/agents").json()) == 7
    print(f"health ok — {h['drugs']} drugs, {h['interaction_rules']} rules, "
          f"llm_enabled={h['llm_enabled']}")


def test_drug_search_and_check():
    res = client.get("/drugs/search", params={"q": "metop"}).json()
    assert res and res[0]["generic"] == "metoprolol"
    # nitrate + PDE5 should be flagged contraindicated
    dc = client.post("/drug-check", json={
        "patient_id": "74919836-2db2-2f73-d2cf-5287a180b0ff",
        "candidate_drugs": ["sildenafil"],
    }).json()
    sev = [f["finding"] for f in dc["new_findings"]]
    assert any("Nitrate" in s for s in sev), sev
    print(f"drug-check nitrate+PDE5 -> {dc['overall_severity']}, "
          f"delta {dc['projected_health_score_delta']}")


def test_determinism():
    rec = data.get_record("74919836-2db2-2f73-d2cf-5287a180b0ff")
    ctx = fu.normalize(rec)
    a = [f.model_dump() for f in engine.analyze(ctx)]
    b = [f.model_dump() for f in engine.analyze(ctx)]
    assert a == b, "engine is not deterministic"
    print(f"determinism ok — {len(a)} findings identical across runs")


def test_full_analysis_offline():
    resp = client.post(
        "/patients/74919836-2db2-2f73-d2cf-5287a180b0ff/analyze",
        json={"event": "encounter", "specialty": "primary_care"},
    ).json()
    assert resp["routed_agents"][0] == "deterministic_engine"
    engine_recs = next(
        r for r in resp["agent_results"] if r["agent"] == "deterministic_engine"
    )["recommendations"]
    assert engine_recs, "engine produced no recommendations"
    # every evidence citation must be a real URL, never fabricated inline
    for r in engine_recs:
        for e in r["evidence"]:
            assert e["citation"].startswith("http"), e
    assert "prioritized_actions" in resp["plan"]
    print(f"full analysis ok — {len(resp['plan']['prioritized_actions'])} prioritized "
          f"actions, {len(resp['conflicts'])} conflicts, llm={resp['llm_enabled']}")


def test_evidence_resolver():
    e = client.get("/evidence/DAPA-HF").json()
    assert "pubmed" in e["url"]
    print(f"evidence resolver ok — DAPA-HF -> {e['url']}")


def test_all_patients_analyze():
    ok = 0
    for enc in data.list_encounters():
        r = asyncio.run(orchestrator.analyze_record(data.get_record(enc["id"])))
        assert r.plan.summary
        ok += 1
    print(f"all-patients analyze ok — {ok}/25 encounters produced a plan")


if __name__ == "__main__":
    for fn in [
        test_health_and_lists, test_drug_search_and_check, test_determinism,
        test_full_analysis_offline, test_evidence_resolver, test_all_patients_analyze,
    ]:
        fn()
    print("\nALL SMOKE TESTS PASSED")
