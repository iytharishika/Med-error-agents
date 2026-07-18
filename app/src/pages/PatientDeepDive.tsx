import { useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { PATIENT_BY_ID } from '../data/patients';
import { useStore } from '../state/store';
import { buildPatientView } from '../state/selectors';
import { MODULES, MODULE_LIST } from '../data/modules';
import { Logo, ThemeToggle } from '../components/Brand';
import { Icon, DOMAIN_ICON } from '../components/Icon';
import { Btn, Chip, Card } from '../components/primitives';
import { RecommendationCard } from '../components/RecommendationCard';
import { EgfrSparkline } from '../components/PatientRail';
import { TimelineTab } from '../features/TimelineTab';
import { ageFromDob, fmtDate, scoreColor, riskColor } from '../lib/format';

export function PatientDeepDive() {
  const { id } = useParams();
  const nav = useNavigate();
  const store = useStore();
  const patient = id ? PATIENT_BY_ID.get(id) : undefined;
  const nowRef = useRef(Date.now());

  const view = useMemo(
    () => (patient ? buildPatientView(patient, { recStatus: store.recStatus[patient.id] || {}, snoozes: store.snoozes[patient.id] || {}, monitoringDone: store.monitoringDone[patient.id] || {}, showLowConfidence: true, specialty: 'primary-care' }, nowRef.current) : null),
    [patient, store.recStatus, store.snoozes, store.monitoringDone],
  );

  if (!patient || !view) {
    return <div style={{ padding: 40 }}>Patient not found. <Link to="/providers">Back to panel</Link></div>;
  }

  const openCockpit = () => { store.setLastPatient(patient.id); nav('/dashboard'); };

  return (
    <div style={{ minHeight: '100vh' }}>
      <header className="no-print" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/"><Logo size={26} showText={false} /></Link>
          <Link to="/providers" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-2)', textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>
            <Icon name="chevronL" size={15} /> Provider panel
          </Link>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Chart review</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <ThemeToggle />
            <Btn variant="primary" icon="stethoscope" onClick={openCockpit}>Open in cockpit</Btn>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {/* header */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <span style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--surface-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>
            {patient.name.split(' ').map((n) => n[0]).join('')}
          </span>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{patient.name}</h1>
            <div className="num" style={{ color: 'var(--text-3)', fontSize: 13.5, marginTop: 2 }}>{ageFromDob(patient.dob)}{patient.gender} · DOB {fmtDate(patient.dob)} · {patient.mrn} · PCP {patient.pcp}</div>
            <p style={{ color: 'var(--text-2)', fontSize: 14.5, marginTop: 8, maxWidth: 720, lineHeight: 1.5 }}>{patient.summary}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <ScoreBox label="Health" value={patient.healthScore} color={scoreColor(patient.healthScore)} />
            <ScoreBox label="Risk" value={patient.riskScore} color={riskColor(patient.riskScore)} />
            <ScoreBox label="GDMT gap" value={patient.gdmtGap} color={patient.gdmtGap > 50 ? 'var(--sev-major)' : 'var(--text-2)'} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 24, alignItems: 'start' }}>
          {/* problems + allergies + team */}
          <Panel title="Problem list" icon="clipboard">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {patient.diagnoses.map((d) => <Chip key={d.code} tone="neutral" icon={DOMAIN_ICON[d.domain]} title={`${d.code} · since ${d.since || '—'}`}>{d.label}</Chip>)}
            </div>
          </Panel>
          <Panel title="Allergies" icon="alert">
            <div style={{ display: 'grid', gap: 6 }}>
              {patient.allergies.map((a, i) => (
                <div key={i} style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Icon name={a.severity === 'severe' ? 'alert' : 'info'} size={13} style={{ color: a.severity === 'severe' ? 'var(--sev-crit)' : 'var(--text-3)' }} />
                  <strong>{a.substance}</strong> <span style={{ color: 'var(--text-3)' }}>{a.reaction !== '—' ? `· ${a.reaction} (${a.severity})` : ''}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Care team" icon="users">
            <div style={{ display: 'grid', gap: 6 }}>
              {patient.careTeam.map((c, i) => <div key={i} style={{ fontSize: 13.5 }}><strong>{c.name}</strong> <span style={{ color: 'var(--text-3)' }}>· {c.role}</span></div>)}
            </div>
          </Panel>
        </div>

        {/* meds */}
        <Panel title={`Active medications (${patient.meds.length})`} icon="pill" style={{ marginTop: 18 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, fontSize: 13.5 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)' }}>
                {['Medication', 'Dose', 'Class', 'Started', 'Prescriber', 'Flag'].map((h) => <th key={h} style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {patient.meds.map((m) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{m.name}</td>
                    <td style={{ padding: '8px 10px' }} className="num">{m.dose} {m.frequency}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-2)' }}>{m.drugClass}</td>
                    <td style={{ padding: '8px 10px' }} className="num">{fmtDate(m.startDate)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-2)' }}>{m.prescriber}</td>
                    <td style={{ padding: '8px 10px' }}>{m.riskFlag && <Chip tone="warn" icon="alert">{m.riskFlag}</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* labs + renal */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, marginTop: 18, alignItems: 'start' }}>
          <Panel title="Laboratory results" icon="flask">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <tbody>
                  {patient.labs.map((l, i) => (
                    <tr key={i} style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '7px 8px', color: 'var(--text-2)' }}>{l.name}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: l.tone === 'critical' ? 'var(--sev-crit)' : l.tone === 'warn' ? 'var(--sev-major)' : 'var(--text)' }} className="num">{l.value} {l.unit}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--text-3)', fontSize: 12 }} className="num">{l.ref || ''}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--text-3)', fontSize: 12 }} className="num">{fmtDate(l.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Renal trend (eGFR / creatinine)" icon="kidney">
            <EgfrSparkline data={patient.renalHistory} width={360} height={90} />
            <div style={{ display: 'grid', gap: 4, marginTop: 10 }}>
              {patient.renalHistory.slice().reverse().map((r) => (
                <div key={r.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }} className="num">
                  <span style={{ color: 'var(--text-3)' }}>{fmtDate(r.date)}</span>
                  <span>eGFR <strong>{r.eGFR}</strong> · Cr {r.creatinine}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* health score breakdown */}
        <Panel title="Health-score breakdown" icon="activity" style={{ marginTop: 18 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {patient.healthFactors.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="num" style={{ minWidth: 44, textAlign: 'right', fontWeight: 800, color: f.impact < 0 ? 'var(--sev-crit)' : 'var(--sev-good)' }}>{f.impact > 0 ? '+' : ''}{f.impact}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{f.detail}</div>
                </div>
                <div style={{ width: 120, height: 7, background: 'var(--surface-3)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.abs(f.impact) * 5)}%`, background: f.impact < 0 ? 'var(--sev-crit)' : 'var(--sev-good)', marginLeft: f.impact < 0 ? 0 : 'auto' }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* recommendations by module */}
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>Recommendations by module</h2>
          {MODULE_LIST.map((mod) => {
            const recs = (view.byModule[mod.key] || []).filter((r) => r.status !== 'dismissed');
            if (recs.length === 0) return null;
            return (
              <div key={mod.key} style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Icon name={mod.key === 'gdmt' ? 'heart' : mod.key === 'cost' ? 'dollar' : mod.key === 'dose' ? 'sliders' : mod.key === 'risk' ? 'activity' : mod.key === 'interactions' ? 'zap' : 'layers'} size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 700 }}>{MODULES[mod.key].label}</span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{recs.length}</span>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {recs.map((r) => <RecommendationCard key={r.id} rec={r} patientId={patient.id} dense />)}
                </div>
              </div>
            );
          })}
        </div>

        {/* monitoring plan */}
        {view.monitoring.length > 0 && (
          <Panel title="Monitoring plan" icon="eye" style={{ marginTop: 24 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {view.monitoring.map(({ watch }, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, alignItems: 'baseline' }}>
                  <Chip tone="neutral">{watch.type}</Chip>
                  <strong>{watch.item}</strong>
                  <span className="num" style={{ color: 'var(--accent-strong)' }}>{watch.timing} · {watch.frequency}</span>
                  <span style={{ color: 'var(--text-3)' }}>{watch.rationale}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* timeline */}
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4, marginBottom: 14 }}>Timeline</h2>
          <TimelineTab patient={patient} />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon, children, style }: { title: string; icon: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <Card style={{ padding: 18, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name={icon} size={16} style={{ color: 'var(--text-3)' }} />
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</span>
      </div>
      {children}
    </Card>
  );
}

function ScoreBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px', textAlign: 'center', minWidth: 84 }}>
      <div className="num" style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{label}</div>
    </div>
  );
}
