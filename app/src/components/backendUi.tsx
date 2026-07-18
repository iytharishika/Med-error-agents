// ============================================================
// Shared bits for the backend-driven panels (self-contained, theme-aware).
// ============================================================
import type { BackendTier, BackendEvidence } from '../lib/kapsuleApi';

export const TIER_META: Record<BackendTier, { label: string; color: string; soft: string }> = {
  critical: { label: 'Critical', color: 'var(--sev-crit, #c0392b)', soft: 'var(--sev-crit-soft, #fbe9e7)' },
  high: { label: 'High', color: 'var(--sev-major, #c9803a)', soft: 'var(--sev-major-soft, #f7ecdd)' },
  moderate: { label: 'Moderate', color: 'var(--sev-mod, #7a7a7a)', soft: 'var(--surface-2, #f3f3f3)' },
  low: { label: 'Low', color: 'var(--sev-minor, #9aa0a6)', soft: 'var(--surface-2, #f3f3f3)' },
  info: { label: 'Info', color: 'var(--sev-info, #6c7a89)', soft: 'var(--surface-2, #f3f3f3)' },
};

export const AGENT_LABEL: Record<string, string> = {
  deterministic_engine: 'Rules engine',
  polypharmacy: 'Polypharmacy',
  gdmt_optimization: 'GDMT',
  dose_intelligence: 'Dose intelligence',
  risk_monitoring: 'Risk monitoring',
  drug_supplement: 'Drug–supplement',
  cost_optimization: 'Cost',
};

export const ACTION_LABEL: Record<string, string> = {
  stop: 'Stop', start: 'Start', adjust_dose: 'Adjust dose', substitute: 'Switch',
  monitor: 'Monitor', continue: 'Continue', counsel: 'Counsel', refer: 'Refer',
};

export function TierBadge({ tier }: { tier: BackendTier }) {
  const m = TIER_META[tier];
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
        padding: '2px 7px', borderRadius: 5, color: '#fff', background: m.color, whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  );
}

export function ActionPill({ action }: { action: string }) {
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
        background: 'var(--surface-2, #f1f1f1)', color: 'var(--text-2, #555)', whiteSpace: 'nowrap',
      }}
    >
      {ACTION_LABEL[action] || action}
    </span>
  );
}

export function EvidenceChips({ evidence }: { evidence: BackendEvidence[] }) {
  if (!evidence?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {evidence.map((e, i) =>
        e.citation ? (
          <a
            key={i} href={e.citation} target="_blank" rel="noreferrer" title={e.detail}
            style={{
              fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
              background: 'var(--accent-soft, #eef4ff)', color: 'var(--accent-strong, #2a5db0)',
              textDecoration: 'none', border: '1px solid var(--border, #e2e2e2)',
            }}
          >
            {e.source} ↗
          </a>
        ) : (
          <span
            key={i} title={e.detail}
            style={{
              fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
              background: 'var(--surface-2, #f1f1f1)', color: 'var(--text-2, #555)',
            }}
          >
            {e.source}
          </span>
        ),
      )}
    </div>
  );
}
