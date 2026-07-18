# Kapsule AI — clinical demo

EHR-embedded medication intelligence and closed-loop clinical decision support.
Client-only demo: Vite + React + TypeScript + Tailwind v4, typed in-memory mock
data, deterministic reasoning engine, localStorage persistence. No backend, no PHI.

## Run

```bash
npm install
npm run dev      # http://localhost:5231
npm run build    # type-check + production build
```

## Where things live

```
src/
  types.ts                 # shared domain contract
  data/
    drugs.ts               # 180+ drug library (generic/brand, class tags, renal/hepatic,
                           #   pregnancy/lactation, monitoring, boxed warnings, Beers, ACB, QT)
    patients.ts            # 8 internally-consistent mock patients
    evidence.ts            # evidence resolver → verified PubMed / FDA / DailyMed / Choosing Wisely
    modules.ts             # the 6 reasoning agents + specialty config
  engine/
    rules.ts               # 50+ curated interaction rules (class-tag + drug-id keyed)
    reasoner.ts            # runEngine: pairwise + burden + duplicate + cautions + GDMT + Beers,
                           #   context escalation, de-dup + action-merge
    search.ts              # fuzzy drug search (prefix-ranked)
  state/
    store.tsx              # localStorage-backed state (statuses, snoozes, orders, prefs)
    selectors.ts           # PatientView: tiering, specialty visibility, confidence gate
  features/                # tabs + order queue + accept/defer/snooze actions
  components/              # design-system primitives, cards, strips, rail
  pages/
    marketing/             # Home, Platform, Pricing, Provider Panel
    Dashboard.tsx          # the medication cockpit
    PatientDeepDive.tsx    # /patient/:id expanded chart review
```

## Routes

- `/` `/platform` `/pricing` `/providers` — marketing site
- `/dashboard` — clinical cockpit (patient switcher persists last-viewed)
- `/patient/:id` — expanded chart review

## Notes

- The engine is deterministic — the same patient always produces the same findings.
- Evidence chips open the real source in a new tab; nothing is fabricated.
- Keyboard on the Recommendations tab: `J/K` move, `A` accept, `D` defer, `?` help.
