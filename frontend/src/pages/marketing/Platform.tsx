import { Card, Chip, EvidenceChip } from '../../components/primitives';
import { Icon } from '../../components/Icon';
import { SectionHead } from './Home';
import { MODULE_LIST } from '../../data/modules';

const wrap = { maxWidth: 1100, margin: '0 auto', padding: '0 24px' } as const;

export function Platform() {
  return (
    <div style={{ paddingTop: 56, paddingBottom: 40 }}>
      <section style={wrap}>
        <Chip tone="accent" icon="layers">Architecture</Chip>
        <h1 style={{ fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 800, letterSpacing: -1.2, marginTop: 16, maxWidth: 820 }}>
          A deterministic reasoning engine, not a chatbot
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text-2)', maxWidth: 720, marginTop: 16, lineHeight: 1.55 }}>
          Every finding comes from an auditable rule with a mechanism, the patient data that triggered it, and a
          verified citation. The same chart always produces the same output — a requirement for clinical trust.
        </p>
      </section>

      <section style={{ ...wrap, paddingTop: 44 }}>
        <SectionHead kicker="Reasoning workflow" title="How a finding is produced" />
        <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
          {[
            { t: 'Chart context is built', d: 'Age, latest eGFR/creatinine, potassium, hemoglobin, QTc, INR, active diagnoses and the full medication list — each with class tags — are assembled into a single deterministic context.' },
            { t: 'Rules fire in parallel', d: '55+ curated rules across six agents evaluate pairwise interactions, cumulative burden (QT, anticholinergic, CNS), duplicate therapy, renal/hepatic dose thresholds, GDMT gaps and Beers criteria.' },
            { t: 'Context gates and escalation', d: 'A RAAS + MRA pair is moderate at K⁺ 4.5 but escalates to major at 5.0 and blocks at 5.5. Severity is a function of the actual chart, not a static label.' },
            { t: 'De-duplication', d: 'If two agents flag the same drug set, the findings merge into one card carrying both reasons and the union of evidence — the single biggest reducer of alert fatigue.' },
            { t: 'Evidence resolution', d: 'Each evidence label resolves to a verified external source (PubMed record, FDA/DailyMed label, guideline, Choosing Wisely). Nothing fabricated.' },
          ].map((s, i) => (
            <Card key={s.t} style={{ padding: 18, display: 'flex', gap: 16 }}>
              <span className="num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', minWidth: 30 }}>{i + 1}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{s.t}</div>
                <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>{s.d}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section style={{ ...wrap, paddingTop: 44 }}>
        <SectionHead kicker="Evidence layer" title="Every chip opens the real source" />
        <p style={{ color: 'var(--text-2)', marginTop: 12, fontSize: 15 }}>A centralized resolver maps labels to authoritative endpoints:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {['PARADIGM-HF', 'DAPA-HF', 'RALES', '2022 AHA/ACC/HFSA HF Guideline', 'KDIGO 2024 CKD', '2023 AGS Beers Criteria', 'FDA label — metformin', 'FDA label — sildenafil', 'Choosing Wisely — PPI', 'CredibleMeds QT list'].map((l) => (
            <EvidenceChip key={l} label={l} />
          ))}
        </div>
      </section>

      <section style={{ ...wrap, paddingTop: 44 }}>
        <SectionHead kicker="Modules" title="The six agents" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 20 }}>
          {MODULE_LIST.map((m) => (
            <Card key={m.key} style={{ padding: 18 }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="check" size={15} style={{ color: 'var(--accent)' }} /> {m.label}
              </div>
              <p style={{ color: 'var(--text-2)', fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>{m.blurb}</p>
            </Card>
          ))}
        </div>
      </section>

      <section style={{ ...wrap, paddingTop: 44 }}>
        <Card style={{ padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <Icon name="lock" size={22} style={{ color: 'var(--accent)', marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Deployment</div>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
              Kapsule embeds in the EHR via SMART on FHIR. This demonstration runs entirely in the browser on typed,
              in-memory synthetic data — no backend, no PHI, deterministic rules only. Production adds audit logging,
              role-based access and write-back to order entry.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
