// ============================================================
// BackendRecommendations — RECOMMENDATIONS surface.
// Shows EVERYTHING the agentic backend produced: synthesized summary, the
// reconciled conflicts, the full priority-ranked action list, per-engine
// counts, the monitoring plan, and the patient-facing summary.
// ============================================================
import type { Patient } from '../types';
import { useKapsuleAnalysis } from '../hooks/useKapsuleAnalysis';
import type { AnalysisResponse, BackendRec, BackendConflict } from '../lib/kapsuleApi';
import { TierBadge, ActionPill, EvidenceChips, AGENT_LABEL, TIER_META } from '../components/backendUi';

export function BackendRecommendations({ patient, specialty }: { patient: Patient; specialty: string }) {
  const { data, loading, error, reload } = useKapsuleAnalysis(patient, specialty);

  if (loading) {
    return (
      <Panel>
        <div style={{ color: 'var(--text-2, #555)', fontSize: 14 }}>
          Running the six agents + rules engine over this regimen…
        </div>
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel>
        <div style={{ fontSize: 13.5, color: 'var(--text-2, #555)' }}>
          Couldn’t reach the Kapsule backend ({error}).{' '}
          <button onClick={reload} style={linkBtn}>Retry</button>
        </div>
      </Panel>
    );
  }
  if (!data) return null;

  return <FullOutput data={data} onReload={reload} />;
}

function FullOutput({ data, onReload }: { data: AnalysisResponse; onReload: () => void }) {
  const ran = data.agent_results.filter((a) => a.ran);
  const errored = data.agent_results.filter((a) => !a.ran);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* header + engine chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-3, #999)' }}>
          {data.routed_agents.length} engines · {data.total_latency_ms} ms · {data.llm_enabled ? 'LLM on' : 'rules only'}
        </span>
        <button onClick={onReload} style={{ ...linkBtn, marginLeft: 'auto' }}>↻ Refresh</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ran.map((a) => (
          <span key={a.agent} style={chip('ok')}>
            {AGENT_LABEL[a.agent] || a.agent} · {a.recommendations.length}
          </span>
        ))}
        {errored.map((a) => (
          <span key={a.agent} style={chip('err')} title={a.error || ''}>
            {AGENT_LABEL[a.agent] || a.agent} ✕
          </span>
        ))}
      </div>

      {/* synthesized summary */}
      {data.plan.summary && (
        <Section title="Synthesized summary">
          <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text, #1a1a1a)' }}>{data.plan.summary}</div>
        </Section>
      )}

      {/* conflicts */}
      {data.conflicts.length > 0 && (
        <Section title={`Conflicts reconciled · ${data.conflicts.length}`}>
          <div style={{ display: 'grid', gap: 8 }}>
            {data.conflicts.map((c, i) => <ConflictRow key={i} c={c} />)}
          </div>
        </Section>
      )}

      {/* prioritized actions */}
      <Section title={`Prioritized actions · ${data.plan.prioritized_actions.length}`}>
        <div style={{ display: 'grid', gap: 8 }}>
          {data.plan.prioritized_actions.map((r, i) => <RecRow key={i} r={r} />)}
        </div>
      </Section>

      {/* monitoring */}
      {data.plan.monitoring_plan.length > 0 && (
        <Section title="Monitoring plan">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            {data.plan.monitoring_plan.map((m, i) => (
              <li key={i} style={{ fontSize: 13.5, color: 'var(--text-2, #555)' }}>{m}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* patient-facing */}
      {data.plan.patient_facing_summary && (
        <Section title="Patient-facing summary">
          <div style={{ fontSize: 13.5, color: 'var(--text-2, #555)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {data.plan.patient_facing_summary}
          </div>
        </Section>
      )}
    </div>
  );
}

function RecRow({ r }: { r: BackendRec }) {
  const m = TIER_META[r.tier];
  return (
    <div
      style={{
        border: '1px solid var(--border, #e2e2e2)', borderLeft: `4px solid ${m.color}`,
        borderRadius: 9, padding: '10px 12px', background: 'var(--surface, #fff)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <TierBadge tier={r.tier} />
        <ActionPill action={r.action} />
        <span style={{ fontWeight: 650, fontSize: 13.5 }}>{r.title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-3, #999)' }}>
          {AGENT_LABEL[r.agent] || r.agent} · {(r.confidence * 100).toFixed(0)}%
        </span>
      </div>
      {r.order_target && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3, #999)', marginTop: 3, fontFamily: 'var(--font-mono, monospace)' }}>
          {r.order_target}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: 'var(--text-2, #555)', marginTop: 4, lineHeight: 1.45 }}>{r.rationale}</div>
      <EvidenceChips evidence={r.evidence} />
    </div>
  );
}

function ConflictRow({ c }: { c: BackendConflict }) {
  const isSafety = c.kind === 'safety_override';
  return (
    <div
      style={{
        border: '1px solid var(--border, #e2e2e2)', borderRadius: 9, padding: '10px 12px',
        background: 'var(--surface-2, #faf9f7)',
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: isSafety ? 'var(--sev-crit, #c0392b)' : 'var(--sev-major, #c9803a)' }}>
        {c.kind.replace('_', ' ')}
        {c.order_target ? ` · ${c.order_target}` : ''}
        {c.winning_action ? ` · wins: ${c.winning_action}` : ''}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2, #555)', marginTop: 4, lineHeight: 1.45 }}>{c.resolution}</div>
    </div>
  );
}

// ---- small layout helpers --------------------------------------------------

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border, #e2e2e2)', borderRadius: 12, padding: 16, background: 'var(--surface, #fff)' }}>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', color: 'var(--text-3, #999)', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--accent, #2a5db0)',
  fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0,
};

function chip(kind: 'ok' | 'err'): React.CSSProperties {
  return {
    fontSize: 12, padding: '3px 9px', borderRadius: 999,
    border: '1px solid var(--border, #e2e2e2)',
    color: kind === 'ok' ? 'var(--sev-good, #2f7d4f)' : 'var(--sev-crit, #b0402f)',
  };
}
