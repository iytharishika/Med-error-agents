import type { PatientView } from '../state/selectors';
import { SEVERITY_ORDER } from '../types';
import { RecommendationCard } from '../components/RecommendationCard';
import { EmptyState } from '../components/EmptyState';
import { Btn } from '../components/primitives';
import { useRecActions } from './useRecActions';
import { useToast } from '../components/Toast';

export function DeprescribeTab({ view, patientId }: { view: PatientView; patientId: string }) {
  const { accept } = useRecActions(patientId);
  const { toast } = useToast();

  const items = view.deprescribe
    .filter((r) => r.managed && r.status === 'pending' && !r.snoozed)
    .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || b.confidence - a.confidence);

  const handled = view.deprescribe.filter((r) => r.status !== 'pending');

  if (items.length === 0 && handled.length === 0) {
    return <EmptyState icon="layers" title="No deprescribing opportunities" body="No Beers-flagged, duplicate, or low-value medications for this patient in your specialty view." />;
  }

  const acceptAll = () => {
    items.forEach(accept);
    toast({ kind: 'success', message: `${items.length} deprescribing orders drafted`, detail: 'Review in the order queue before signing.' });
  };

  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}><strong>{items.length}</strong> deprescribing {items.length === 1 ? 'opportunity' : 'opportunities'}, sorted by severity.</span>
          <Btn size="sm" variant="soft" icon="check" onClick={acceptAll} style={{ marginLeft: 'auto' }}>Accept all ({items.length})</Btn>
        </div>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((r) => <RecommendationCard key={r.id} rec={r} patientId={patientId} />)}
      </div>
      {handled.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', margin: '20px 0 10px' }}>Reviewed</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {handled.map((r) => <RecommendationCard key={r.id} rec={r} patientId={patientId} dense />)}
          </div>
        </>
      )}
    </div>
  );
}
