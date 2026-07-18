import { useState } from 'react';
import type { RecView } from '../state/selectors';
import { SeverityBadge, EvidenceChip, ConfidenceBadge, Btn, Chip } from './primitives';
import { Icon, DOMAIN_ICON } from './Icon';
import { Menu } from './Menu';
import { MODULES } from '../data/modules';
import { useRecActions } from '../features/useRecActions';
import { SEVERITY_META } from '../lib/format';
import { SNOOZE_OPTIONS } from '../state/store';

const DEFER_REASONS: { key: any; label: string }[] = [
  { key: 'patient-preference', label: 'Patient preference' },
  { key: 'awaiting-labs', label: 'Awaiting labs' },
  { key: 'monitoring', label: 'Monitoring instead' },
  { key: 'disagree', label: 'Clinically disagree' },
];

export function RecommendationCard({
  rec, patientId, defaultWhy = false, dense = false,
}: {
  rec: RecView; patientId: string; defaultWhy?: boolean; dense?: boolean;
}) {
  const { accept, defer, dismiss, snooze, reopen } = useRecActions(patientId);
  const [why, setWhy] = useState(defaultWhy);
  const m = SEVERITY_META[rec.severity];
  const mod = MODULES[rec.module];
  const handled = rec.status !== 'pending';
  const isBenefit = rec.benefit;
  const accent = isBenefit ? 'var(--sev-good)' : rec.tier === 'critical' ? m.color : 'var(--border-strong)';

  return (
    <div
      className="fade-in"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`, borderRadius: 12, overflow: 'hidden',
        opacity: handled ? 0.62 : 1,
      }}
    >
      <div style={{ padding: dense ? 14 : 18 }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isBenefit ? <Chip tone="good" icon="check">Benefit</Chip> : <SeverityBadge severity={rec.severity} small={dense} />}
          <Chip tone="neutral" icon={DOMAIN_ICON[rec.domain] || 'pill'} title={`${mod.label} · ${rec.domain}`}>{mod.short}</Chip>
          {rec.lowConfidence && <Chip tone="warn">Low confidence</Chip>}
          <div style={{ marginLeft: 'auto' }}>
            {handled ? (
              <StatusPill status={rec.status} snoozed={!!rec.snoozed} />
            ) : (
              <ConfidenceBadge confidence={rec.confidence} basis={rec.basis} />
            )}
          </div>
        </div>

        {/* title */}
        <div style={{ fontSize: dense ? 15.5 : 17.5, fontWeight: 700, marginTop: 10, lineHeight: 1.3 }}>{rec.title}</div>

        {/* 4-line grammar */}
        <div style={{ marginTop: 10, display: 'grid', gap: 5 }}>
          <GrammarLine k="DO" v={rec.orderDetail || rec.action} strong />
          <GrammarLine k="WHY" v={rec.rationale} />
          {!isBenefit && <GrammarLine k="RISK" v={rec.mechanism} muted />}
        </div>

        {rec.patientMessage && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
            Patient-friendly: “{rec.patientMessage}”
          </div>
        )}

        {/* why we think this */}
        <button
          onClick={() => setWhy((w) => !w)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, marginTop: 12, padding: 0 }}
        >
          <Icon name={why ? 'chevronD' : 'chevronR'} size={13} /> Why we think this
        </button>

        {why && (
          <div className="fade-in" style={{ marginTop: 10, padding: 12, background: 'var(--surface-2)', borderRadius: 9, display: 'grid', gap: 10 }}>
            <WhyRow label="Basis">
              <ConfidenceBadge confidence={rec.confidence} basis={rec.basis} />
            </WhyRow>
            <WhyRow label="Triggered by">
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{rec.rationale}</span>
            </WhyRow>
            {rec.drugs.length > 0 && (
              <WhyRow label="Medications">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {rec.drugs.map((d) => <Chip key={d} tone="neutral" icon="pill">{d}</Chip>)}
                </div>
              </WhyRow>
            )}
            <WhyRow label="Mechanism">
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{rec.mechanism}</span>
            </WhyRow>
            <WhyRow label="Evidence">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {rec.evidence.map((e) => <EvidenceChip key={e} label={e} />)}
              </div>
            </WhyRow>
            {rec.counterEvidence && (
              <WhyRow label="Counter-evidence">
                <span style={{ fontSize: 12.5, color: 'var(--sev-major)' }}>⚠ {rec.counterEvidence}</span>
              </WhyRow>
            )}
          </div>
        )}
      </div>

      {/* actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: dense ? '10px 14px' : '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', flexWrap: 'wrap' }}>
        {handled ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {rec.status === 'accepted' ? 'Order drafted — see queue' : rec.snoozed ? `Snoozed ${rec.snoozed.label}` : `Marked ${rec.status}`}
            </span>
            <Btn variant="ghost" size="sm" icon="chevronL" onClick={() => reopen(rec)} style={{ marginLeft: 'auto' }}>Reopen</Btn>
          </>
        ) : isBenefit ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Evidence-based therapy confirmed on regimen.</span>
            <Btn variant="ghost" size="sm" onClick={() => dismiss(rec)} style={{ marginLeft: 'auto' }}>Acknowledge</Btn>
          </>
        ) : (
          <>
            <Btn variant="primary" size="sm" icon="clipboard" onClick={() => accept(rec)}>Accept &amp; draft order</Btn>
            <Menu
              align="left"
              trigger={(open) => <Btn variant="ghost" size="sm" icon="clock" onClick={open}>Defer</Btn>}
              items={DEFER_REASONS.map((r) => ({ label: r.label, onClick: () => defer(rec, r.key) }))}
            />
            <Menu
              align="right"
              trigger={(open) => (
                <button onClick={open} title="More" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 9px', color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>
                  <Icon name="clock" size={14} /> Snooze <Icon name="chevronD" size={12} />
                </button>
              )}
              items={[
                ...SNOOZE_OPTIONS.map((s) => ({ label: `Snooze ${s.label}`, icon: <Icon name="clock" size={14} />, onClick: () => snooze(rec, s.ms, s.label) })),
                { label: 'Not clinically relevant', icon: <Icon name="x" size={14} />, danger: true, onClick: () => dismiss(rec) },
                { label: 'Already addressed', icon: <Icon name="check" size={14} />, onClick: () => dismiss(rec) },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}

function GrammarLine({ k, v, strong, muted }: { k: string; v: string; strong?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: 10, alignItems: 'start' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 0.7, paddingTop: 2 }}>{k}</span>
      <span style={{ fontSize: strong ? 14.5 : 13.5, fontWeight: strong ? 700 : 500, color: muted ? 'var(--text-3)' : 'var(--text)', lineHeight: 1.45 }}>{v}</span>
    </div>
  );
}

function WhyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function StatusPill({ status, snoozed }: { status: string; snoozed: boolean }) {
  const map: Record<string, { c: string; t: string; i: string }> = {
    accepted: { c: 'var(--sev-good)', t: 'Accepted', i: 'check' },
    deferred: { c: 'var(--sev-moderate)', t: 'Deferred', i: 'clock' },
    dismissed: { c: 'var(--text-3)', t: 'Dismissed', i: 'x' },
  };
  const s = snoozed ? { c: 'var(--sev-info)', t: 'Snoozed', i: 'clock' } : map[status] || map.dismissed;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: s.c, fontSize: 12.5, fontWeight: 700 }}>
      <Icon name={s.i} size={13} /> {s.t}
    </span>
  );
}
