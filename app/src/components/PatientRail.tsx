import type { Patient } from '../types';
import type { RecView } from '../state/selectors';
import { Icon, DOMAIN_ICON } from './Icon';
import { Trend, Chip } from './primitives';
import { useToast } from './Toast';
import { ActiveMedsBar } from './ActiveMedsBar';
import { ageFromDob, fmtDate } from '../lib/format';

export function EgfrSparkline({ data, width = 240, height = 56 }: { data: { date: string; eGFR: number }[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const vals = data.map((d) => d.eGFR);
  const min = Math.min(...vals, 15);
  const max = Math.max(...vals, 60);
  const pad = 6;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (data.length - 1);
  const y = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.eGFR).toFixed(1)}`).join(' ');
  const last = data[data.length - 1].eGFR;
  const color = last < 30 ? 'var(--sev-crit)' : last < 45 ? 'var(--sev-major)' : last < 60 ? 'var(--sev-moderate)' : 'var(--sev-good)';
  return (
    <svg width={width} height={height} style={{ display: 'block', width: '100%' }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[30, 45, 60].filter((t) => t >= min && t <= max).map((t) => (
        <line key={t} x1={pad} x2={width - pad} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 3" strokeWidth={1} />
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.eGFR)} r={i === data.length - 1 ? 3.5 : 2} fill={color} />)}
    </svg>
  );
}

export function PatientRail({ patient, duplicates }: { patient: Patient; duplicates: RecView[] }) {
  const { toast } = useToast();
  const handoff = (what: string) =>
    toast({ kind: 'default', message: 'Handoff to EHR', detail: `Opening ${what} in Epic…` });

  const lastEgfr = patient.renalHistory[patient.renalHistory.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* identity + scores */}
      <Section>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {patient.name.split(' ').map((n) => n[0]).join('')}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{patient.name}</div>
            <div className="num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{ageFromDob(patient.dob)}{patient.gender} · {patient.mrn}</div>
          </div>
        </div>
        <button onClick={() => handoff('active medication list')} style={{ ...ehrBtn, marginTop: 12 }}>
          <Icon name="external" size={13} /> Open in EHR
        </button>
      </Section>

      {/* active meds — collapsible, directly under Open in EHR */}
      <ActiveMedsBar patient={patient} duplicates={duplicates} />

      {/* vitals + labs */}
      <Section title="Latest vitals & labs">
        <div style={{ display: 'grid', gap: 7 }}>
          {[...patient.vitals, ...patient.labs].slice(0, 8).map((l, i) => (
            <div key={i} title={`${l.source || 'EHR'} · ${fmtDate(l.date)}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'help' }}>
              <span style={{ color: 'var(--text-2)', flex: 1 }}>{l.name}</span>
              <span className="num" style={{ fontWeight: 700, color: l.tone === 'critical' ? 'var(--sev-crit)' : l.tone === 'warn' ? 'var(--sev-major)' : 'var(--text)' }}>{l.value}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 42 }}>{l.unit}</span>
              <Trend trend={l.trend} size={12} />
            </div>
          ))}
        </div>
      </Section>

      {/* eGFR chart */}
      <Section title="Renal trend (eGFR)">
        <EgfrSparkline data={patient.renalHistory} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5, color: 'var(--text-3)' }}>
          <span>{fmtDate(patient.renalHistory[0].date)}</span>
          <span className="num" style={{ fontWeight: 700, color: 'var(--text)' }}>{lastEgfr.eGFR} mL/min · {fmtDate(lastEgfr.date)}</span>
        </div>
      </Section>

      {/* allergies */}
      <Section title="Allergies">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {patient.allergies.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Icon name={a.severity === 'severe' ? 'alert' : 'info'} size={13} style={{ color: a.severity === 'severe' ? 'var(--sev-crit)' : 'var(--text-3)' }} />
              <span style={{ fontWeight: 600 }}>{a.substance}</span>
              {a.reaction !== '—' && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>· {a.reaction}</span>}
            </div>
          ))}
        </div>
      </Section>

      {/* diagnoses */}
      <Section title="Active problems">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {patient.diagnoses.map((d) => <Chip key={d.code} tone="neutral" icon={DOMAIN_ICON[d.domain] || 'pill'} title={d.code}>{d.label}</Chip>)}
        </div>
      </Section>

      {/* care team */}
      <Section title="Care team">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {patient.careTeam.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              <Icon name="user" size={13} style={{ color: 'var(--text-3)' }} />
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>· {c.role}</span>
            </div>
          ))}
        </div>
        <button onClick={() => handoff('care-team chat')} style={ehrBtn}><Icon name="users" size={13} /> Message team in EHR</button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      {title && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{title}</div>}
      {children}
    </div>
  );
}

const ehrBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: 12,
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
};
