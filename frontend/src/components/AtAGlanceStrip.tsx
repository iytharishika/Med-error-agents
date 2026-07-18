import type { Patient, Lab } from '../types';
import { Icon } from './Icon';
import { fmtDate } from '../lib/format';
import { Trend } from './primitives';

// The single always-visible strip: composite risk + the four med-relevant
// values (eGFR, K⁺, INR, QTc) + allergy / med counts. Numbers in mono.
export function AtAGlanceStrip({ patient, highRisk, criticalCount }: { patient: Patient; highRisk: number; criticalCount: number }) {
  const lab = (names: string[]): Lab | undefined =>
    [...patient.labs, ...patient.vitals].find((l) => names.some((n) => l.name.toLowerCase() === n.toLowerCase()));

  const egfr = lab(['eGFR']);
  const k = lab(['Potassium']);
  const inr = lab(['INR']);
  const qtc = lab(['QTc']);
  const severeAllergy = patient.allergies.filter((a) => a.severity === 'severe').length;

  const toneColor = (t?: string) => (t === 'critical' ? 'var(--sev-crit)' : t === 'warn' ? 'var(--sev-major)' : t === 'good' ? 'var(--sev-good)' : 'var(--text)');

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '8px 6px', boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Metric label="eGFR" lab={egfr} color={toneColor(egfr?.tone)} />
      <Divider />
      <Metric label="K⁺" lab={k} color={toneColor(k?.tone)} />
      <Divider />
      <Metric label="INR" lab={inr} color={toneColor(inr?.tone)} />
      <Divider />
      <Metric label="QTc" lab={qtc} color={toneColor(qtc?.tone)} />
      <Divider />

      <Cell>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }}>ALLERGIES</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="num" style={{ fontSize: 16, fontWeight: 700, color: severeAllergy ? 'var(--sev-crit)' : 'var(--text)' }}>{patient.allergies.filter((a) => a.substance !== 'No known drug allergies').length}</span>
          {severeAllergy > 0 && <span style={{ fontSize: 11, color: 'var(--sev-crit)', fontWeight: 700 }}>{severeAllergy} severe</span>}
        </div>
      </Cell>
      <Divider />
      <Cell>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }}>MEDS</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="num" style={{ fontSize: 16, fontWeight: 700 }}>{patient.meds.length}</span>
          {highRisk > 0 && <span style={{ fontSize: 11, color: 'var(--sev-major)', fontWeight: 700 }}>· {highRisk} high-risk</span>}
        </div>
      </Cell>
      {criticalCount > 0 && (
        <>
          <Divider />
          <Cell>
            <span className="pulse-crit" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--sev-crit)', fontWeight: 700, fontSize: 13 }}>
              <Icon name="alert" size={15} /> {criticalCount} critical
            </span>
          </Cell>
        </>
      )}
    </div>
  );
}

function Metric({ label, lab, color }: { label: string; lab?: Lab; color: string }) {
  return (
    <Cell title={lab ? `${lab.source || 'EHR'} · ${fmtDate(lab.date)}` : 'No recent value'}>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className="num" style={{ fontSize: 16, fontWeight: 700, color }}>{lab ? lab.value : '—'}</span>
        <Trend trend={lab?.trend} size={11} />
      </div>
    </Cell>
  );
}

function Cell({ children, title }: { children: React.ReactNode; title?: string }) {
  return <div title={title} style={{ padding: '2px 12px', cursor: title ? 'help' : 'default' }}>{children}</div>;
}
function Divider() {
  return <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '4px 0' }} />;
}
