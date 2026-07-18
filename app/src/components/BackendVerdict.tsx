// ============================================================
// BackendVerdict — HOME surface.
// Shows only the single highest-priority recommendation (the "final verdict"
// from the agentic backend) plus the Cost agent's projection. Not the whole list.
// ============================================================
import type { Patient } from '../types';
import { useKapsuleAnalysis } from '../hooks/useKapsuleAnalysis';
import { costVerdict } from '../lib/kapsuleApi';
import { TierBadge, ActionPill, EvidenceChips, AGENT_LABEL } from './backendUi';
import { AcceptDraftPanel } from './AcceptDraftPanel';

export function BackendVerdict({
  patient,
  specialty,
  onSeeAll,
}: {
  patient: Patient;
  specialty: string;
  onSeeAll?: () => void;
}) {
  const { data, loading, error, reload } = useKapsuleAnalysis(patient, specialty);

  return (
    <div
      style={{
        background: 'var(--surface, #fff)', borderRadius: 14, overflow: 'hidden',
        border: '1px solid var(--border, #e2e2e2)', boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,.06))',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px',
          background: 'var(--surface-2, #f6f6f6)', borderBottom: '1px solid var(--border, #e2e2e2)',
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--accent-strong, #2a5db0)' }}>
          Agentic verdict
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-3, #999)' }}>
          {data ? `${data.routed_agents.length} engines · ${data.total_latency_ms} ms${data.llm_enabled ? '' : ' · rules only'}` : 'Kapsule backend'}
        </span>
        <button
          onClick={reload}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #999)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          ↻
        </button>
      </div>

      <div style={{ padding: 20 }}>
        {loading && (
          <div style={{ color: 'var(--text-2, #555)', fontSize: 14 }}>
            Analyzing regimen with the agentic backend…
          </div>
        )}

        {error && !loading && (
          <div style={{ fontSize: 13.5, color: 'var(--text-2, #555)' }}>
            Couldn’t reach the Kapsule backend ({error}). Start it with{' '}
            <code>uvicorn app.main:app</code> and press ↻.
          </div>
        )}

        {data && !loading && <Verdict data={data} patient={patient} onSeeAll={onSeeAll} />}
      </div>
    </div>
  );
}

function Verdict({
  data,
  patient,
  onSeeAll,
}: {
  data: import('../lib/kapsuleApi').AnalysisResponse;
  patient: Patient;
  onSeeAll?: () => void;
}) {
  const top = data.plan.prioritized_actions[0];
  const cost = costVerdict(data);
  const moreCount = Math.max(0, data.plan.prioritized_actions.length - 1);

  if (!top) {
    return <div style={{ color: 'var(--text-2, #555)', fontSize: 14 }}>No open priorities for this patient.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <TierBadge tier={top.tier} />
        <ActionPill action={top.action} />
        <span style={{ fontSize: 12, color: 'var(--text-3, #999)' }}>{AGENT_LABEL[top.agent] || top.agent}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3, #999)' }}>
          confidence {(top.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, marginTop: 12, lineHeight: 1.2 }}>
        {top.title}
      </div>
      {top.order_target && (
        <div style={{ fontSize: 13, color: 'var(--text-3, #999)', marginTop: 3 }}>on {top.order_target}</div>
      )}
      <div style={{ fontSize: 14.5, color: 'var(--text-2, #555)', marginTop: 8, lineHeight: 1.5 }}>{top.rationale}</div>
      <EvidenceChips evidence={top.evidence} />

      {/* Cost projection — the Cost agent's verdict */}
      <div
        style={{
          marginTop: 16, padding: '12px 14px', borderRadius: 10,
          background: 'var(--surface-2, #f6f6f6)', border: '1px solid var(--border, #e2e2e2)',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-3, #999)', marginBottom: 4 }}>
          Cost projection
        </div>
        {cost ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{cost.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2, #555)', marginTop: 3, lineHeight: 1.45 }}>{cost.rationale}</div>
          </>
        ) : (
          <div style={{ fontSize: 13.5, color: 'var(--text-2, #555)' }}>
            No lower-cost, formulary-preferred switch identified for the current regimen.
          </div>
        )}
      </div>

      {/* Accept → draft clinical note + 10th-grade patient message (editable, copyable) */}
      <AcceptDraftPanel patient={patient} rec={top} />

      {moreCount > 0 && onSeeAll && (
        <button
          onClick={onSeeAll}
          style={{
            marginTop: 14, background: 'transparent', border: 'none', color: 'var(--accent, #2a5db0)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0,
          }}
        >
          See all {moreCount} more in Recommendations →
        </button>
      )}
    </div>
  );
}
