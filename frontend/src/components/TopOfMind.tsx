import { useState } from 'react';
import type { RecView } from '../state/selectors';
import { Icon, DOMAIN_ICON } from './Icon';
import { SeverityBadge, EvidenceChip, ConfidenceBadge, Btn, Chip } from './primitives';
import { Menu } from './Menu';
import { SEVERITY_META } from '../lib/format';
import { MODULES } from '../data/modules';
import { useRecActions } from '../features/useRecActions';
import { SNOOZE_OPTIONS } from '../state/store';

// The single most consequential action right now. Only this uses full
// color + motion; everything else is calmer.
export function TopOfMind({ rec, patientId, moreCount, onSeeMore }: { rec: RecView; patientId: string; moreCount: number; onSeeMore: () => void }) {
  const { accept, defer, dismiss, snooze } = useRecActions(patientId);
  const [why, setWhy] = useState(false);
  const m = SEVERITY_META[rec.severity];
  const crit = rec.severity === 'contraindicated' || rec.severity === 'major';

  return (
    <div
      style={{
        background: 'var(--surface)', borderRadius: 14, overflow: 'hidden',
        border: `1px solid ${crit ? m.color + '66' : 'var(--border)'}`,
        boxShadow: crit ? `0 0 0 1px ${m.color}22, var(--shadow)` : 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: crit ? m.soft : 'var(--surface-2)', borderBottom: `1px solid var(--border)` }}>
        <span className={rec.severity === 'contraindicated' ? 'pulse-crit' : ''} style={{ display: 'inline-flex', color: m.color }}>
          <Icon name={crit ? 'alert' : 'sparkles'} size={16} />
        </span>
        <span style={{ fontWeight: 800, fontSize: 12.5, letterSpacing: 0.6, color: m.color, textTransform: 'uppercase' }}>Top of mind</span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-3)' }} className="num">Reasoned in 380 ms · 6 engines</span>
      </div>

      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <SeverityBadge severity={rec.severity} />
          <Chip tone="neutral" icon={DOMAIN_ICON[rec.domain] || 'pill'}>{MODULES[rec.module].short}</Chip>
          <div style={{ marginLeft: 'auto' }}><ConfidenceBadge confidence={rec.confidence} basis={rec.basis} /></div>
        </div>

        <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.4, marginTop: 12, lineHeight: 1.2 }}>
          {rec.orderDetail || rec.title}
        </div>
        <div style={{ fontSize: 15, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}>{rec.rationale}</div>

        {crit && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="alert" size={15} style={{ color: m.color, marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}><strong style={{ color: 'var(--text)' }}>If not addressed: </strong>{rec.mechanism}</span>
          </div>
        )}

        <button onClick={() => setWhy((w) => !w)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, marginTop: 12, padding: 0 }}>
          <Icon name={why ? 'chevronD' : 'chevronR'} size={13} /> Why we think this
        </button>
        {why && (
          <div className="fade-in" style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {rec.evidence.map((e) => <EvidenceChip key={e} label={e} />)}
            {rec.counterEvidence && <span style={{ fontSize: 12, color: 'var(--sev-major)' }}>⚠ {rec.counterEvidence}</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn variant="primary" icon="clipboard" onClick={() => accept(rec)}>Accept &amp; draft order</Btn>
          <Menu align="left" trigger={(o) => <Btn variant="ghost" icon="clock" onClick={o}>Defer</Btn>}
            items={[
              { key: 'patient-preference', label: 'Patient preference' },
              { key: 'awaiting-labs', label: 'Awaiting labs' },
              { key: 'monitoring', label: 'Monitoring instead' },
              { key: 'disagree', label: 'Clinically disagree' },
            ].map((r) => ({ label: r.label, onClick: () => defer(rec, r.key) }))}
          />
          <Btn variant="ghost" onClick={() => dismiss(rec)}>Not relevant</Btn>
          <Menu align="left" trigger={(o) => <Btn variant="ghost" icon="clock" onClick={o}>Snooze</Btn>}
            items={SNOOZE_OPTIONS.map((s) => ({ label: s.label, icon: <Icon name="clock" size={13} />, onClick: () => snooze(rec, s.ms, s.label) }))}
          />
          {moreCount > 0 && (
            <button onClick={onSeeMore} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>
              {moreCount} more <Icon name="chevronD" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
