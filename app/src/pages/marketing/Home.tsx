import { Link } from 'react-router-dom';
import { Btn, Card, Chip } from '../../components/primitives';
import { Icon } from '../../components/Icon';
import { MODULE_LIST } from '../../data/modules';

const wrap = { maxWidth: 1200, margin: '0 auto', padding: '0 24px' } as const;

const MODULE_ICON: Record<string, string> = {
  polypharmacy: 'layers', gdmt: 'heart', dose: 'sliders', risk: 'activity', interactions: 'zap', cost: 'dollar',
};

const COMPARE = [
  { cap: 'Reasons on the specific patient', kap: true, epic: false, uptodate: false },
  { cap: 'Explains mechanism + patient data that triggered it', kap: true, epic: false, uptodate: true },
  { cap: 'Deterministic, reproducible output', kap: true, epic: true, uptodate: false },
  { cap: 'Closed loop — drafts the order to fix it', kap: true, epic: false, uptodate: false },
  { cap: 'One prioritized action, not 12 equal pop-ups', kap: true, epic: false, uptodate: false },
  { cap: 'Specialty-aware surfacing', kap: true, epic: false, uptodate: false },
  { cap: 'Verified evidence link on every finding', kap: true, epic: false, uptodate: true },
];

const OUTCOMES = [
  { n: '−58%', l: 'interruptive alerts vs legacy BPA', s: 'by de-duplicating and tiering' },
  { n: '4.2', l: 'GDMT gaps closed per HF patient', s: 'across the demo cohort' },
  { n: '<60s', l: 'to understand risk and act', s: 'top-of-mind + one-click order' },
  { n: '100%', l: 'findings with verified evidence', s: 'no fabricated citations' },
];

export function Home() {
  return (
    <div>
      {/* Hero */}
      <section style={{ ...wrap, paddingTop: 64, paddingBottom: 40 }}>
        <Chip tone="accent" icon="sparkles">The medication operating system</Chip>
        <h1 style={{ fontSize: 'clamp(34px, 5vw, 60px)', lineHeight: 1.05, letterSpacing: -1.5, margin: '18px 0 0', maxWidth: 900, fontWeight: 800 }}>
          Catch, explain and correct unsafe regimens{' '}
          <span style={{ color: 'var(--accent)' }}>before they become adverse events.</span>
        </h1>
        <p style={{ fontSize: 19, color: 'var(--text-2)', maxWidth: 720, marginTop: 20, lineHeight: 1.5 }}>
          Kapsule AI turns fragmented EHR data into a closed-loop medication workflow. It reasons with you on
          the specific patient — diagnoses, labs, renal function, age — and drafts the order to fix what it finds.
          No alert fatigue.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <Btn variant="primary" size="md" icon="stethoscope" style={{ fontSize: 15, padding: '11px 20px' }}>
              Open the clinical demo
            </Btn>
          </Link>
          <Link to="/platform" style={{ textDecoration: 'none' }}>
            <Btn variant="soft" size="md" icon="layers" style={{ fontSize: 15, padding: '11px 20px' }}>
              How it works
            </Btn>
          </Link>
        </div>

        {/* Hero mock strip */}
        <Card style={{ marginTop: 44, padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <span className="pulse-crit" style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--sev-crit)' }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Top of mind · Eleanor Whitfield, 78F</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }} className="num">Reasoned in 380ms · 6 engines</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, padding: 20, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sev-crit)', letterSpacing: 0.6 }}>CONTRAINDICATED · HOLD</div>
              <div style={{ fontSize: 21, fontWeight: 700, marginTop: 6 }}>Hold ibuprofen — triple whammy with lisinopril + furosemide</div>
              <div style={{ color: 'var(--text-2)', marginTop: 8, fontSize: 15 }}>
                eGFR <span className="num">34</span>, K⁺ <span className="num">5.3</span>. NSAID + ACE inhibitor + diuretic collapses GFR — AKI risk. Started 18 days ago for a knee flare.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <Btn variant="primary" size="sm" icon="check">Accept & draft order</Btn>
                <Btn variant="ghost" size="sm" icon="clock">Defer 7d</Btn>
                <Btn variant="ghost" size="sm">Not relevant</Btn>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 150 }}>
              {[['eGFR', '34', 'var(--sev-major)'], ['K⁺', '5.3', 'var(--sev-major)'], ['INR', '2.8', 'var(--sev-moderate)'], ['QTc', '465', 'var(--sev-moderate)']].map(([k, v, c]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{k}</span>
                  <span className="num" style={{ fontWeight: 700, color: c as string }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      {/* Outcomes */}
      <section style={{ ...wrap, paddingTop: 24, paddingBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {OUTCOMES.map((o) => (
            <Card key={o.l} style={{ padding: 20 }}>
              <div className="num" style={{ fontSize: 34, fontWeight: 800, color: 'var(--accent)', letterSpacing: -1 }}>{o.n}</div>
              <div style={{ fontWeight: 600, marginTop: 4, fontSize: 14.5 }}>{o.l}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>{o.s}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section style={{ ...wrap, paddingTop: 40 }}>
        <SectionHead kicker="Six reasoning agents" title="One engine, six perspectives on every regimen" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 24 }}>
          {MODULE_LIST.map((m) => (
            <Card key={m.key} style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${cssVar(m.accent)} 16%, transparent)`, color: cssVar(m.accent), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={MODULE_ICON[m.key]} size={18} />
                </span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{m.label}</span>
              </div>
              <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>{m.blurb}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section style={{ ...wrap, paddingTop: 56 }}>
        <SectionHead kicker="The closed loop" title="From fragmented data to a signed order" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 24 }}>
          {[
            { i: 'layers', t: 'Ingest', d: 'Diagnoses, meds, labs, renal trend, allergies — unified.' },
            { i: 'zap', t: 'Reason', d: 'Deterministic rules across six agents. Same input, same output.' },
            { i: 'bell', t: 'Surface', d: 'One top-of-mind action. Tiered. De-duplicated. Specialty-aware.' },
            { i: 'clipboard', t: 'Draft', d: 'Accept drafts a pre-filled EHR order, pending your signature.' },
            { i: 'check', t: 'Sign & monitor', d: 'You sign. Kapsule schedules the follow-up labs it recommended.' },
          ].map((s, idx, arr) => (
            <div key={s.t} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Card style={{ padding: 16, height: '100%' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
                  <Icon name={s.i} size={15} /> {idx + 1}. {s.t}
                </span>
                <p style={{ color: 'var(--text-2)', fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>{s.d}</p>
              </Card>
              {idx < arr.length - 1 && <span style={{ textAlign: 'center', color: 'var(--text-3)' }} className="no-print">↓</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section style={{ ...wrap, paddingTop: 56 }}>
        <SectionHead kicker="Versus legacy CDS" title="Not another interruptive pop-up" />
        <Card style={{ marginTop: 24, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={thStyle('left')}>Capability</th>
                  <th style={thStyle('center')}>Kapsule AI</th>
                  <th style={thStyle('center')}>Epic BPA</th>
                  <th style={thStyle('center')}>UpToDate</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.cap} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 14 }}>{r.cap}</td>
                    <td style={tdCenter()}>{r.kap ? <YesNo yes /> : <YesNo />}</td>
                    <td style={tdCenter()}>{r.epic ? <YesNo yes /> : <YesNo />}</td>
                    <td style={tdCenter()}>{r.uptodate ? <YesNo yes /> : <YesNo />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* CTA */}
      <section style={{ ...wrap, paddingTop: 56, paddingBottom: 64 }}>
        <Card style={{ padding: 40, textAlign: 'center', background: 'linear-gradient(135deg, var(--accent-soft), var(--surface))' }}>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8 }}>See it reason on a real chart</h2>
          <p style={{ color: 'var(--text-2)', fontSize: 16, marginTop: 10, maxWidth: 560, margin: '10px auto 0' }}>
            Thirteen patients. Live interaction engine. Draft the order and watch it queue for signature.
          </p>
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <Btn variant="primary" style={{ marginTop: 22, fontSize: 15, padding: '12px 22px' }} icon="stethoscope">Open the clinical demo</Btn>
          </Link>
        </Card>
      </section>
    </div>
  );
}

export function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' }}>{kicker}</div>
      <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 800, letterSpacing: -0.8, marginTop: 6 }}>{title}</h2>
    </div>
  );
}

function YesNo({ yes }: { yes?: boolean }) {
  return yes ? (
    <span style={{ display: 'inline-flex', color: 'var(--sev-good)' }}><Icon name="check" size={18} /></span>
  ) : (
    <span style={{ display: 'inline-flex', color: 'var(--text-3)' }}><Icon name="minus" size={18} /></span>
  );
}

const thStyle = (align: 'left' | 'center') => ({ padding: '12px 16px', textAlign: align, fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }) as const;
const tdCenter = () => ({ padding: '12px 16px', textAlign: 'center' }) as const;
function cssVar(v: string) { return `var(${v})`; }
