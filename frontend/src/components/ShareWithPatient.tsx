import { useState } from 'react';
import type { Patient } from '../types';
import type { RecView } from '../state/selectors';
import { Icon } from './Icon';
import { Btn } from './primitives';
import { ageFromDob } from '../lib/format';

function plainLanguage(rec: RecView): { headline: string; body: string } {
  if (rec.patientMessage) return { headline: rec.orderDetail || rec.title, body: rec.patientMessage };
  const med = rec.targetMed || rec.drugs[0] || 'a medicine';
  const verbMap: Record<string, string> = {
    discontinue: `We want to stop ${med}.`,
    'reduce-dose': `We want to lower your dose of ${med}.`,
    hold: `We want to pause ${med} for now.`,
    start: `We want to add a new medicine${rec.targetMed ? `: ${rec.targetMed}` : ''}.`,
    switch: `We want to change ${med} to a safer option.`,
    'add-monitoring': `We want to keep a closer eye on how ${med} is affecting you.`,
    'add-lab': `We want to check a blood test soon.`,
    'increase-dose': `We want to raise your dose of ${med} to help more.`,
  };
  const headline = verbMap[rec.orderAction || 'add-monitoring'] || `We want to review ${med}.`;
  const why = rec.benefit
    ? `This medicine is a good match for your condition and is helping protect you.`
    : `Right now, ${med} could be causing a problem with your other medicines or your kidneys. Making this change lowers that risk.`;
  return { headline, body: why };
}

export function ShareWithPatient({ patient, recs, onClose }: { patient: Patient; recs: RecView[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const list = recs.filter((r) => !r.benefit);
  const rec = list[i];
  if (!rec) {
    return (
      <Overlay onClose={onClose}>
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Icon name="check" size={30} style={{ color: 'var(--sev-good)' }} />
          <div style={{ fontWeight: 700, marginTop: 8 }}>Nothing to review with the patient right now.</div>
          <Btn variant="soft" onClick={onClose} style={{ marginTop: 16 }}>Close</Btn>
        </div>
      </Overlay>
    );
  }
  const pl = plainLanguage(rec);
  return (
    <Overlay onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon name="users" size={18} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>For {patient.name.split(' ')[0]} ({ageFromDob(patient.dob)})</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-3)' }} className="num">{i + 1} of {list.length}</span>
      </div>
      <div style={{ minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 4px' }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.25 }}>{pl.headline}</div>
        <div style={{ fontSize: 17, color: 'var(--text-2)', marginTop: 14, lineHeight: 1.55 }}>{pl.body}</div>
        <div style={{ fontSize: 15, color: 'var(--text-2)', marginTop: 14, lineHeight: 1.5 }}>
          <strong>What to do:</strong> {rec.orderDetail || rec.action}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Btn variant="ghost" icon="chevronL" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>Back</Btn>
        <div style={{ flex: 1, display: 'flex', gap: 5, justifyContent: 'center' }}>
          {list.map((_, k) => <span key={k} style={{ width: k === i ? 20 : 8, height: 8, borderRadius: 8, background: k === i ? 'var(--accent)' : 'var(--border-strong)', transition: 'width .2s' }} />)}
        </div>
        <Btn variant="primary" onClick={() => setI((x) => Math.min(list.length - 1, x + 1))} disabled={i >= list.length - 1}>Next<Icon name="chevronR" size={15} /></Btn>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="slide-up" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 96vw)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', padding: 24 }}>
        {children}
      </div>
    </div>
  );
}
