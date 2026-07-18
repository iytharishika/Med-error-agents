import type { Patient } from '../types';
import type { PatientView } from '../state/selectors';
import { ageFromDob, fmtDateMMDDYYYY, SEVERITY_META } from '../lib/format';

// One-page handoff summary. Hidden on screen, shown on print.
export function PrintSummary({ patient, view }: { patient: Patient; view: PatientView }) {
  const key = (n: string) => [...patient.labs, ...patient.vitals].find((l) => l.name.toLowerCase() === n.toLowerCase())?.value ?? '—';
  const active = view.active;

  return (
    <div className="print-only print-page" style={{ padding: 24, color: '#000', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Kapsule AI — Medication Safety Handoff</div>
          <div style={{ fontSize: 12 }}>Generated {fmtDateMMDDYYYY('2026-07-18')} · Decision support, not a substitute for clinical judgment</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 10, fontSize: 12 }}>
        <div><strong>{patient.name}</strong> · {ageFromDob(patient.dob)}{patient.gender} · {patient.mrn}</div>
        <div>PCP: {patient.pcp}</div>
      </div>
      <div style={{ fontSize: 12, marginTop: 4 }}>{patient.summary}</div>

      <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        <span>eGFR {key('eGFR')}</span><span>K⁺ {key('Potassium')}</span><span>INR {key('INR')}</span>
        <span>QTc {key('QTc')}</span><span>Hgb {key('Hemoglobin')}</span>
        <span>Health {patient.healthScore}</span><span>Risk {patient.riskScore}</span>
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginTop: 14, borderBottom: '1px solid #000' }}>Open recommendations ({active.length})</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginTop: 6 }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th style={{ padding: '3px 6px', width: 70 }}>Severity</th>
            <th style={{ padding: '3px 6px' }}>Action</th>
            <th style={{ padding: '3px 6px' }}>Why</th>
          </tr>
        </thead>
        <tbody>
          {active.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #ccc' }}>
              <td style={{ padding: '3px 6px', fontWeight: 700, color: SEVERITY_META[r.severity].color }}>{SEVERITY_META[r.severity].label}</td>
              <td style={{ padding: '3px 6px', fontWeight: 600 }}>{r.orderDetail || r.action}</td>
              <td style={{ padding: '3px 6px' }}>{r.rationale}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontWeight: 700, fontSize: 13, marginTop: 14, borderBottom: '1px solid #000' }}>Active medications ({patient.meds.length})</div>
      <div style={{ fontSize: 11.5, marginTop: 6, columnCount: 2 }}>
        {patient.meds.map((m) => <div key={m.id}>• {m.name} {m.dose} {m.frequency}</div>)}
      </div>
    </div>
  );
}
