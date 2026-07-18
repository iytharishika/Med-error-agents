# Medication Safety Multi-Agent System
### Abridge Hackathon — System Design & Prep Doc

---

## 1. Problem statement

Medication errors are one of the largest sources of preventable harm in
hospitalized and ambulatory patients. Adverse drug events (ADEs) drive a
large share of emergency visits and hospitalizations in the US every year.
Risk compounds sharply with polypharmacy — patients on seven or more
medications face a dramatically elevated chance of an adverse event, and the
risk isn't just additive; drugs interact cumulatively, not just pairwise.

At the same time, clinicians are trying to solve several related but
distinct problems at once for every patient, usually without dedicated
tooling for most of them:

- Is this patient on too many drugs relative to their actual needs?
- Are they actually on the guideline-recommended therapy for their
  condition, at the right dose?
- Do any of their prescriptions conflict with each other or with
  supplements/OTC drugs they're taking?
- Can they actually afford what's being prescribed?
- Is their overall risk trajectory getting better or worse over time?

Today these are handled by separate, disconnected tools (if handled by
tooling at all), and none of them reason about how a change in one area
affects the others.

## 2. Landscape — what exists today, and why this is different # girum to verify

| Domain | What exists today | Gap |
|---|---|---|
| Polypharmacy / cumulative interaction risk | Tabula Rasa Healthcare's MedWise platform scores cumulative multi-drug risk for pharmacists | Deterministic rules engine, not an LLM agent; doesn't reason across other domains |
| GDMT optimization | Mostly academic — clinical trials and review papers call for dedicated heart-failure-specific deprescribing/optimization tools, but no widely deployed product exists | Real opportunity — least mature domain |
| Dose intelligence | Narrow dosing calculators (e.g. DoseMe) exist for specific drug classes; pharmacokinetic-informed agentic architectures are only just appearing in research papers | Not productized, not agentic |
| Drug/supplement interactions | Standard EHR interaction checkers exist (usually one-to-one, not cumulative) | Well-served for pairwise checks; weak on cumulative + supplement reasoning |
| Cost optimization | Real-Time Benefit Check (RTBC) is mature, deployed infrastructure — Surescripts, Arrive Health (formerly RxRevu), GoodRx Provider Mode, CoverMyMeds all do this today | Solved as a lookup problem, not integrated into a reasoning chain |
| Cross-domain coordination | Academic multi-agent healthcare research is active but flags real risks: agents miscommunicating or acting on incomplete context can produce inconsistent or systemically wrong recommendations | **This is the open space.** No deployed product coordinates these domains as reasoning agents that resolve conflicts with each other |

**Our actual differentiation is not "AI checks your meds" — that exists.**
It's a system where agents reason *across* domains and a dedicated
component arbitrates when they disagree (e.g. a GDMT agent wants to add a
drug, a polypharmacy agent flags burden, a cost agent finds an affordable
path forward) — producing one coherent, cited recommendation instead of
three uncoordinated alerts.

## 3. Hackathon scope (deliberately cut down from the full vision)

Six agents is the full vision. **Building three, fully, well** beats
building six shallowly:

1. **Polypharmacy agent** — cumulative medication burden scoring
2. **GDMT optimization agent** — guideline gap detection (heart failure,
   four-pillar therapy)
3. **Cost optimization agent** — cheaper therapeutic-equivalent lookup

This trio is chosen because they can genuinely conflict on one realistic
patient case, which gives the conflict resolver something real to do
instead of a scripted disagreement.

**Interaction check, dose intelligence, and risk monitoring** will be shown
as clearly-labeled "coming next" in the UI — not faked, not hidden. ?? # Get input from Girum


## 4. Architecture

```
Trigger event (new order / admission / periodic review)
        │
        ▼
Patient context builder  ── distills the patient record into a compact,
        │                    agent-readable snapshot (meds, conditions,
        │                    labs, allergies)
        ▼
Orchestrator (LangGraph)  ── routes the case to relevant agents,
        │                    conditionally, not just sequentially
        ▼
┌─────────────────────────────────────────┐
│  Specialized agents — run in parallel    │
│                                           │
│  Polypharmacy   GDMT optimization   Cost │
│                                          │
│                                           │
│  Interaction    Dose             Risk    │
│                                         │
└─────────────────────────────────────────┘
        │
        ▼
Conflict resolver  ── arbitrates disagreements between agents using an
        │              explicit, auditable priority order 
        ▼
Recommendation synthesizer +evidence checker (link to source) ── structures the resolved output into a
        │                       clinician-facing recommendation with
        │                       citations back to the source data
        ▼
Clinician review  ── pharmacist or physician approves, edits, or rejects
        │             — nothing below this line happens without a human
        ▼
EHR write-back  ── order update or alert (simulated for the demo; real
                    integration is a "next steps" talking point)
```

The agents automate the analysis, not the decision. This is a load-
bearing point for the pitch and for Q&A: it's both a safety argument and a
deployment-realism argument, given documented multi-agent coordination
failure risks in low-error-tolerance clinical settings.

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Orchestration | **LangGraph** | Needs conditional routing (cost agent only fires if GDMT agent recommends a change) — a graph/state-machine model fits better than a purely sequential crew pattern |
| Agent LLM calls | **Anthropic Claude via `anthropic` / `langchain-anthropic`** | Direct SDK access inside each agent node; structured/tool-use output for grounded lookups |
| Backend API | **Flask** | Lightweight, fast to stand up, exposes one clean endpoint for the frontend |
| Data grounding | **Static curated CSVs + pandas, not live external APIs during the demo** | Removes shared-wifi / rate-limit failure risk on demo day; still real, auditable data rather than LLM memory |
| Structured I/O | **Pydantic models** | Enforces a fixed JSON contract between backend and frontend so both of you can build in parallel |
| Frontend | **Vibe-coded** | Consumes the fixed JSON contract from the backend — shows each agent's reasoning trace, the conflict resolver's arbitration, and an approve/reject control |
| Testing | **pytest** | Minimal smoke tests on agent outputs — even a few tests signal engineering rigor to judges |

### Why grounding matters more than anything else here
LLM-generated drug facts without a real source are the single biggest risk
to this pitch. Every agent that makes a clinical claim (interaction,
guideline gap, dose flag) needs to point to a specific row in a curated
table or a specific guideline citation — not to "the model knows this." 

TOOD: collect sourcew document #ASK Girum

## 6. Conflict resolver — design notes

Not "another agent votes." Use an explicit, inspectable priority order the
clinician can defend on stage:

1. Hard safety constraints (contraindications, allergy conflicts) always win
2. Guideline strength (how strong is the evidence behind the GDMT
   recommendation being proposed or challenged) ( future step dynamically updates itself with updated documents) #ASK Girum
3. Cost/access barriers (does the "correct" answer become moot if the
   patient can't afford or won't adhere to it) #ASK Girum?

Output should show the reasoning chain, not just the final answer — this is
what makes it auditable by a human reviewer instead of a black box.

## 7. Team split

**RIshika:**
- Repo scaffolding, LangGraph orchestrator, all three agent implementations
- Conflict resolver logic (the centerpiece — budget real time here)
- Recommendation synthesizer, Flask API
- Reliability: caching demo responses, error handling, latency testing
- Final integration + deployment

**Girum:**
- Defines the synthetic demo patient(s) — needs to actually produce a
  three-way conflict across the built agents
- Builds the GDMT guideline table as structured data (four HF drug
  classes, target doses, contraindication rules)
- Writes agent system prompts in clinically accurate language

**shared todos**
- Vibe-codes the frontend against the fixed JSON contract
- QA pass on every agent output against real clinical judgment


## 8. Timeline (10:30am – 5:00pm)

| Time | Focus |
|---|---|
| 10:30–11:00 | Lock scope, define demo patient case together, repo public + first commit |
| 11:00–12:30 | You: orchestrator + agent 1 & 2 skeletons. Clinician: GDMT table + prompts |
| 12:30–1:00 | Lunch |
| 1:00–2:30 | You: agent 3 + conflict resolver + synthesizer. Clinician: cost/interaction data, start UI |
| 2:30–3:30 | Integration — wire frontend to backend, cache demo responses |
| 3:30–4:15 | Full rehearsal, test a **second** patient case to prove it isn't hard-coded, prep Q&A answers |
| 4:15–5:00 | Polish README, record 1-minute demo video, submit |

Test a second patient case deliberately, before the judging room — it's
your defense against "what if I change the input."

## 9. Judging criteria mapping

- **Impact (20%)** — lead with the ADE/polypharmacy stats; make the "who
  actually uses this" answer concrete (hospital pharmacist / prescribing
  physician), 
- **Execution (30%)** — the single biggest lever. A tight three-agent
  system that visibly works. Rehearse the live demo enough that it survives an off-script input
- **Technical complexity (20%)** — the conflict resolver is the real
  answer here. Be ready to explain the priority
  logic, not just show its output
- **Creativity & originality (25%)** — the cross-domain arbitration is the
  differentiator; use the landscape comparison to show you know
  what already exists and why this isn't a re-skin of it

## 10. Anticipated Q&A #Girum review answers

- *Where does the interaction/dosing/guideline data come from — model
  memory or a real source?* → curated tables, from domain expert?
- *Which agents are actually working vs. mocked?* → say so plainly; three
  real, three labeled "next"
- *How does the conflict resolver decide who wins?* → the explicit priority
  order, not "another LLM call votes"
- *Does this ever act without a clinician?* → no — walk through the
  human-in-the-loop step explicitly. # giram thoughts on fully automating it?
- *Real patient data or synthetic?* → synthetic, describe the real
  integration path without claiming it's built
- *How is this different from Epic's Best Practice Advisories or MedWise?* - # Girum ?
 

## 11. Suggested folder structure

```
abridge-hackathon/
├── requirements.txt
├── .env
├── .gitignore
├── system_design.md
├── README.md
├── agents/            # polypharmacy.py, gdmt.py, cost.py (+ stubs)
├── orchestrator/       # LangGraph state machine
├── data/                # curated GDMT table, interaction/cost CSVs
├── frontend/            
└── tests/                # pytest smoke tests
```

## 12. Open questions to resolve live, not before

- Exact contents of the demo patient case # Girum
- Exact wording of agent system prompts # Girum
- Final priority weights in the conflict resolver (may need tuning once
  real agent outputs are seen) 

## 13.  Addiotional features
1. Show similar demographic info chart while clinician is reviewing
2. Add the remaning agents