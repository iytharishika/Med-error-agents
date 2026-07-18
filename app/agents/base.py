"""Base class for the six reasoning agents.

An agent = (name, specialty, which patients it should run on, a system prompt,
the calculators it wants, a JSON schema for its recommendations). The base class
handles: building the grounded context block, calling Claude, parsing the JSON
into `Recommendation` objects, and degrading gracefully when the LLM is
unavailable.
"""
from __future__ import annotations

import time
from typing import Any

from .. import calculators as calc
from .. import fhir_utils as fu
from .. import llm
from ..models import Action, AgentResult, Evidence, Recommendation, Tier

# The exact JSON contract we ask every agent LLM call to emit.
_OUTPUT_CONTRACT = """
Return ONLY a JSON object of this shape (no prose outside the JSON):
{
  "recommendations": [
    {
      "tier": "critical|high|moderate|low|info",
      "action": "start|stop|adjust_dose|substitute|monitor|continue|counsel|refer",
      "title": "<= 12 word imperative headline",
      "order_target": "the specific drug / lab / order this acts on",
      "rationale": "2-4 sentences grounded in THIS patient's data",
      "confidence": 0.0-1.0,
      "evidence": [{"source": "guideline/trial/calculator", "detail": "...", "citation": "optional"}],
      "tags": ["optional","keywords"]
    }
  ]
}
If nothing is clinically indicated, return {"recommendations": []}.
Only make recommendations supported by the provided data. Do not invent labs,
doses, or diagnoses that are not present.
"""


class BaseAgent:
    name: str = "base"
    specialty: str = "general"
    description: str = ""
    # visit types / conditions that should trigger this agent (substring match).
    always_run: bool = False

    # --- routing: does this agent apply to this patient? -------------------
    def applies(self, ctx: dict) -> bool:
        return self.always_run or self._applies(ctx)

    def _applies(self, ctx: dict) -> bool:  # override
        return True

    # --- calculators this agent wants (subset of auto_calculators) ---------
    def relevant_calculators(self, all_calcs: dict) -> dict:
        return all_calcs

    # --- prompt -----------------------------------------------------------
    def system_prompt(self) -> str:  # override
        raise NotImplementedError

    def build_user_prompt(self, ctx: dict, calcs: dict) -> str:
        digest = fu.clinical_digest(ctx)
        calc_lines = []
        for key, c in calcs.items():
            calc_lines.append(
                f"- {c['name']}: score={c.get('score')} — {c.get('interpretation','')}"
            )
        calc_block = "\n".join(calc_lines) if calc_lines else "(none computed)"
        return (
            f"CLINICAL CONTEXT\n{digest}\n\n"
            f"PRE-COMPUTED CALCULATORS\n{calc_block}\n\n"
            f"{_OUTPUT_CONTRACT}"
        )

    # --- run --------------------------------------------------------------
    async def run(self, ctx: dict, all_calcs: dict) -> AgentResult:
        start = time.time()
        calcs = self.relevant_calculators(all_calcs)
        try:
            data = await llm.complete_json(
                self.system_prompt(), self.build_user_prompt(ctx, calcs), max_tokens=8192,
            )
        except llm.LLMUnavailable:
            return AgentResult(
                agent=self.name, ran=False, error="LLM unavailable (no API key)",
                calculators=calcs,
            )
        except Exception as e:  # noqa: BLE001 - surface any parse/API error per-agent
            return AgentResult(
                agent=self.name, ran=False, error=f"{type(e).__name__}: {e}",
                calculators=calcs,
            )

        recs = []
        for raw in (data or {}).get("recommendations", []):
            recs.append(self._coerce(raw))
        return AgentResult(
            agent=self.name,
            recommendations=recs,
            calculators=calcs,
            latency_ms=int((time.time() - start) * 1000),
        )

    def _coerce(self, raw: dict) -> Recommendation:
        def _enum(val, enum, default):
            try:
                return enum(str(val).strip().lower())
            except Exception:  # noqa: BLE001
                return default

        evidence = []
        for e in raw.get("evidence", []) or []:
            if isinstance(e, dict):
                evidence.append(
                    Evidence(
                        source=str(e.get("source", "")),
                        detail=str(e.get("detail", "")),
                        citation=e.get("citation"),
                    )
                )
            elif isinstance(e, str):
                evidence.append(Evidence(source=e, detail=""))
        conf = raw.get("confidence", 0.5)
        try:
            conf = max(0.0, min(1.0, float(conf)))
        except (TypeError, ValueError):
            conf = 0.5
        return Recommendation(
            agent=self.name,
            specialty=self.specialty,
            tier=_enum(raw.get("tier"), Tier, Tier.moderate),
            action=_enum(raw.get("action"), Action, Action.monitor),
            title=str(raw.get("title", "Recommendation"))[:160],
            rationale=str(raw.get("rationale", "")),
            order_target=raw.get("order_target"),
            confidence=conf,
            evidence=evidence,
            tags=[str(t) for t in (raw.get("tags") or [])],
        )
