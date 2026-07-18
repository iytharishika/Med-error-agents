// ============================================================
// New Med Simulator — now backed by the Kapsule backend's deterministic
// drug_check (POST /drug-check-chart). Falls back to the local engine if the
// backend is unreachable, so the tab always works.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Patient, Finding, Severity } from '../types';
import { searchDrugs } from '../engine/search';
import { runEngine, getDrug } from '../engine/reasoner';
import { Icon } from '../components/Icon';
import { Btn, Chip } from '../components/primitives';
import { SEVERITY_META } from '../lib/format';
import { drugCheckChart, type DrugCheckFinding } from '../lib/kapsuleApi';

const isHighRisk = (s: Severity) => s === 'contraindicated' || s === 'major';

// Unify backend findings + local findings into one shape for rendering.
interface SimFinding {
  key: string;
  severity: Severity;
  title: string;
  rationale: string;
  mechanism?: string;
  drugs: string[];
  evidence: string[];
}

const fromBackend = (f: DrugCheckFinding, i: number): SimFinding => ({
  key: `be-${i}-${f.finding}`,
  severity: f.severity,
  title: f.finding,
  rationale: f.patient_rationale,
  mechanism: f.mechanism,
  drugs: f.drugs,
  evidence: f.evidence,
});

const fromLocal = (f: Finding): SimFinding => ({
  key: f.id,
  severity: f.severity,
  title: f.title,
  rationale: f.rationale,
  mechanism: f.mechanism,
  drugs: f.drugs,
  evidence: f.evidence,
});

const HEALTH_DELTA: Record<Severity, number> = {
  contraindicated: -15, major: -8, moderate: -4, minor: -1, info: 2,
};

export function SimulatorTab({ patient }: { patient: Patient }) {
  const [q, setQ] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]); // drug ids
  const [findings, setFindings] = useState<SimFinding[]>([]);
  const [delta, setDelta] = useState(0);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'backend' | 'local' | null>(null);
  const reqId = useRef(0);

  const results = useMemo(() => (q.trim() ? searchDrugs(q, 8) : []), [q]);
  const genericFor = (id: string) => getDrug(id)?.generic || id;

  // Recompute whenever the candidate set changes.
  useEffect(() => {
    if (candidates.length === 0) {
      setFindings([]); setDelta(0); setSource(null); setLoading(false);
      return;
    }
    const id = ++reqId.current;
    const generics = candidates.map(genericFor);
    setLoading(true);
    drugCheckChart(patient, generics)
      .then((res) => {
        if (id !== reqId.current) return;
        setFindings(res.new_findings.map(fromBackend));
        setDelta(res.projected_health_score_delta);
        setSource('backend');
        setLoading(false);
      })
      .catch(() => {
        if (id !== reqId.current) return;
        // fallback: local engine
        const base = new Set(runEngine(patient).map((f) => f.id));
        const local = runEngine(patient, candidates).filter((f) => !base.has(f.id));
        setFindings(local.map(fromLocal));
        setDelta(local.reduce((s, f) => s + HEALTH_DELTA[f.severity], 0));
        setSource('local');
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, patient.id]);

  const add = (id: string) => { if (!candidates.includes(id)) setCandidates((c) => [...c, id]); setQ(''); };
  const remove = (id: string) => setCandidates((c) => c.filter((x) => x !== id));
  const reset = () => setCandidates([]);

  const highRisk = findings.filter((f) => isHighRisk(f.severity));
  const hasContra = highRisk.some((f) => f.severity === 'contraindicated');

  return (
    <div>
      {/* search */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 14px' }}>
          <Icon name="search" size={18} style={{ color: 'var(--text-3)' }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search a candidate drug to simulate (generic, brand or class)…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)' }}
          />
          {candidates.length > 0 && <Btn size="sm" variant="ghost" icon="x" onClick={reset}>Reset</Btn>}
        </div>
        {results.length > 0 && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 6, maxHeight: 320, overflowY: 'auto' }}>
            {results.map((d) => (
              <button key={d.id} onClick={() => add(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <Icon name="pill" size={16} style={{ color: 'var(--accent)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{d.generic} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{d.brand[0] ? `· ${d.brand[0]}` : ''}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{d.drugClass} · {d.typicalDose}</div>
                </div>
                <Icon name="plus" size={16} style={{ color: 'var(--text-3)' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {candidates.length === 0 ? (
        <div style={{ marginTop: 20, padding: 24, borderRadius: 12, border: '1px dashed var(--border-strong)', textAlign: 'center', color: 'var(--text-2)' }}>
          <Icon name="flask" size={26} style={{ color: 'var(--text-3)' }} />
          <div style={{ marginTop: 8, fontWeight: 600 }}>Simulate before you prescribe</div>
          <div style={{ fontSize: 13.5, marginTop: 4 }}>Add one or more candidate drugs. The backend checks each against the active regimen and the other candidates, and projects the health-score impact.</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            {['sildenafil', 'ibuprofen', 'clarithromycin', 'amiodarone'].map((id) => {
              const d = getDrug(id); return d ? <Chip key={id} tone="accent" icon="plus" onClick={() => add(id)}>{d.generic}</Chip> : null;
            })}
          </div>
        </div>
      ) : (
        <>
          {/* candidate chips + projected score */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
            {candidates.map((id) => (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', fontSize: 13 }}>
                {genericFor(id)}
                <button onClick={() => remove(id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'inline-flex' }}><Icon name="x" size={13} /></button>
              </span>
            ))}
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {source && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{source === 'backend' ? 'via backend' : 'local engine (offline)'}</span>}
              <span style={{ fontSize: 13, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: '#fff', background: delta < 0 ? 'var(--sev-crit)' : 'var(--sev-good, #2f7d4f)' }}>
                Health-score {delta >= 0 ? '+' : ''}{delta}
              </span>
            </span>
          </div>

          {loading && <div style={{ marginTop: 16, color: 'var(--text-2)', fontSize: 14 }}>Checking candidates against the regimen…</div>}

          {/* HIGH-RISK ALERT */}
          {!loading && highRisk.length > 0 && (
            <div className="fade-in" style={{ marginTop: 18, borderRadius: 12, overflow: 'hidden', border: `2px solid var(--sev-crit)`, boxShadow: '0 0 0 4px color-mix(in srgb, var(--sev-crit) 18%, transparent)', background: 'var(--sev-crit-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'var(--sev-crit)', color: '#fff' }}>
                <span className="pulse-crit" style={{ display: 'inline-flex' }}><Icon name="alert" size={20} /></span>
                <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.3 }}>
                  {hasContra ? 'DO NOT PRESCRIBE — contraindicated combination' : 'HIGH-RISK INTERACTION — review before prescribing'}
                </span>
                <span className="num" style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 14, background: 'rgba(255,255,255,.22)', borderRadius: 999, padding: '2px 10px' }}>{highRisk.length}</span>
              </div>
              <div style={{ padding: '12px 16px', display: 'grid', gap: 8 }}>
                {highRisk.map((f) => (
                  <div key={f.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Icon name="alert" size={16} style={{ color: 'var(--sev-crit)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--sev-crit)' }}>{f.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2, lineHeight: 1.45 }}>{f.rationale}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* all new findings */}
          {!loading && (
            <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
              {findings.length === 0 ? (
                <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--border)', color: 'var(--sev-good, #2f7d4f)', fontSize: 13.5 }}>
                  No new interactions with the active regimen or the other candidates.
                </div>
              ) : (
                findings.map((f) => <FindingRow key={f.key} f={f} />)
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FindingRow({ f }: { f: SimFinding }) {
  const m = SEVERITY_META[f.severity];
  const hot = isHighRisk(f.severity);
  const edge = hot ? 'var(--sev-crit)' : m.color;
  return (
    <div style={{ display: 'flex', gap: 10, padding: 10, borderRadius: 9, background: hot ? 'var(--sev-crit-soft)' : 'var(--surface-2)', borderLeft: `${hot ? 4 : 3}px solid ${edge}` }}>
      <Icon name={hot ? 'alert' : 'pill'} size={16} style={{ color: edge, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: hot ? 'var(--sev-crit)' : 'var(--text)' }}>{f.title}</span>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, color: '#fff', background: edge }}>{f.severity}</span>
          {f.drugs.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{f.drugs.join(' + ')}</span>}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, lineHeight: 1.45 }}>{f.rationale}</div>
        {f.mechanism && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>Mechanism: {f.mechanism}</div>}
      </div>
    </div>
  );
}
