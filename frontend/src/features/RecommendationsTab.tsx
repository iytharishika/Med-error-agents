import { useEffect, useState } from 'react';
import type { PatientView, RecView } from '../state/selectors';
import { RecommendationCard } from '../components/RecommendationCard';
import { Btn, Chip } from '../components/primitives';
import { Icon } from '../components/Icon';
import { useRecActions } from './useRecActions';
import { useToast } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../state/store';

export function RecommendationsTab({ view, patientId }: { view: PatientView; patientId: string }) {
  const { accept, defer } = useRecActions(patientId);
  const { toast } = useToast();
  const store = useStore();
  const active = view.active;
  const [idx, setIdx] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmSafe, setConfirmSafe] = useState(false);

  const current: RecView | undefined = active[Math.min(idx, active.length - 1)];

  useEffect(() => {
    if (idx > active.length - 1) setIdx(Math.max(0, active.length - 1));
  }, [active.length, idx]);

  // Keyboard: J/K move, A accept, D defer, ? help
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'j' || e.key === 'ArrowDown') { setIdx((i) => Math.min(i + 1, active.length - 1)); e.preventDefault(); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { setIdx((i) => Math.max(i - 1, 0)); e.preventDefault(); }
      else if (e.key === 'a' && current) { accept(current); }
      else if (e.key === 'd' && current) { defer(current); }
      else if (e.key === '?') setShowHelp((s) => !s);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, current, accept, defer]);

  const safeRecs = active.filter((r) => (r.severity === 'moderate' || r.severity === 'minor') && r.confidence >= 0.8);

  const acceptAllSafe = () => {
    safeRecs.forEach(accept);
    setConfirmSafe(false);
    toast({ kind: 'success', message: `${safeRecs.length} safe recommendations accepted`, detail: 'Orders drafted for signature.' });
  };

  const total = view.all.filter((r) => r.managed && !r.benefit).length;
  const done = view.handled.filter((r) => r.managed && !r.benefit).length;

  if (active.length === 0) {
    return (
      <EmptyState
        icon="check"
        title={done > 0 ? 'All caught up' : 'No active recommendations'}
        body={done > 0 ? `${done} of ${total} items reviewed. No new risks since 07-15. Last review: Dr. Patel.` : 'This regimen has no open findings for your specialty right now.'}
      />
    );
  }

  return (
    <div>
      {/* progress + bulk */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>Reviewing {idx + 1} of {active.length} open</span>
            <span className="num" style={{ color: 'var(--text-3)' }}>{done}/{total} handled</span>
          </div>
          <div style={{ height: 6, borderRadius: 6, background: 'var(--surface-3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${total ? (done / total) * 100 : 0}%`, background: 'var(--accent)', transition: 'width .3s' }} />
          </div>
        </div>
        {safeRecs.length > 0 && (
          confirmSafe ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Accept {safeRecs.length} safe?</span>
              <Btn size="sm" variant="primary" onClick={acceptAllSafe}>Confirm</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setConfirmSafe(false)}>Cancel</Btn>
            </div>
          ) : (
            <Btn size="sm" variant="soft" icon="check" onClick={() => setConfirmSafe(true)}>Accept all safe ({safeRecs.length})</Btn>
          )
        )}
        <Btn size="sm" variant="ghost" onClick={() => setShowHelp((s) => !s)}>?</Btn>
      </div>

      {showHelp && (
        <div className="fade-in" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: 12, background: 'var(--surface-2)', borderRadius: 9, marginBottom: 14 }}>
          {[['J / ↓', 'Next'], ['K / ↑', 'Previous'], ['A', 'Accept'], ['D', 'Defer'], ['?', 'Toggle help']].map(([k, v]) => (
            <span key={k} style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              <kbd style={kbd}>{k}</kbd> {v}
            </span>
          ))}
        </div>
      )}

      {/* nav + card */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
        <NavArrow dir="left" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} />
        <div style={{ flex: 1, minWidth: 0 }}>{current && <RecommendationCard rec={current} patientId={patientId} defaultWhy />}</div>
        <NavArrow dir="right" onClick={() => setIdx((i) => Math.min(active.length - 1, i + 1))} disabled={idx >= active.length - 1} />
      </div>

      {/* dots */}
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        {active.map((r, i) => (
          <button key={r.id} onClick={() => setIdx(i)} title={r.title}
            style={{ width: i === idx ? 22 : 9, height: 9, borderRadius: 9, border: 'none', cursor: 'pointer', transition: 'width .2s',
              background: i === idx ? 'var(--accent)' : r.tier === 'critical' ? 'var(--sev-crit)' : 'var(--border-strong)' }} />
        ))}
      </div>

      {view.hiddenLowConfidence > 0 && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Chip tone="neutral" icon={store.showLowConfidence ? 'eyeoff' : 'eye'} onClick={() => store.setShowLowConfidence(!store.showLowConfidence)}>
            {store.showLowConfidence ? 'Hide' : 'Show'} {view.hiddenLowConfidence} low-confidence
          </Chip>
        </div>
      )}
    </div>
  );
}

function NavArrow({ dir, onClick, disabled }: { dir: 'left' | 'right'; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={dir === 'left' ? 'Previous' : 'Next'}
      style={{ width: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={dir === 'left' ? 'chevronL' : 'chevronR'} size={20} />
    </button>
  );
}

const kbd: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 5, padding: '1px 6px', fontWeight: 600, color: 'var(--text)' };
