import { useState } from 'react';
import type { PatientView, RecView } from '../state/selectors';
import type { WatchType, WatchOut } from '../types';
import { Icon } from '../components/Icon';
import { Chip, EvidenceChip, Btn } from '../components/primitives';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../state/store';
import { useToast } from '../components/Toast';

const TYPE_ICON: Record<WatchType, string> = { Lab: 'flask', Vital: 'activity', Symptom: 'eye', Medication: 'pill' };
const TYPES: WatchType[] = ['Lab', 'Vital', 'Symptom', 'Medication'];

export function MonitoringTab({ view, patientId }: { view: PatientView; patientId: string }) {
  const store = useStore();
  const { toast } = useToast();
  const [filter, setFilter] = useState<WatchType | 'all'>('all');

  const statusMap = store.monitoringStatus[patientId] || {};
  const statusOf = (id: string) => statusMap[id]; // 'ordered' | 'dismissed' | undefined

  const all = view.monitoring.filter((m) => m.rec.status !== 'dismissed');
  const filtered = filter === 'all' ? all : all.filter((m) => m.watch.type === filter);

  if (all.length === 0) {
    return <EmptyState icon="eye" title="No monitoring items" body="Accepted recommendations that require follow-up labs or symptom watches will appear here grouped by their parent recommendation." />;
  }

  // Progress: ordered vs active (non-dismissed)
  const active = all.filter((m) => statusOf(m.watch.id) !== 'dismissed');
  const ordered = active.filter((m) => statusOf(m.watch.id) === 'ordered').length;
  const pct = active.length ? (ordered / active.length) * 100 : 0;

  // group by parent recommendation
  const groups = new Map<string, typeof filtered>();
  for (const m of filtered) {
    if (!groups.has(m.rec.id)) groups.set(m.rec.id, []);
    groups.get(m.rec.id)!.push(m);
  }

  const orderItem = (rec: RecView, watch: WatchOut, silent = false) => {
    store.createOrder({
      patientId,
      recId: watch.id,
      actionType: 'add-lab',
      targetMed: rec.targetMed || watch.item,
      detail: `Order ${watch.item} — ${watch.timing}, ${watch.frequency}`,
      orderText: `LAB / MONITORING ORDER — ${watch.item}\nTiming: ${watch.timing} · ${watch.frequency}\nRationale: ${watch.rationale}\n\nFrom: ${rec.title}. Kapsule AI monitoring recommendation. Pending clinician review.`,
      severity: rec.severity,
      module: rec.module,
    });
    store.setMonitoringStatus(patientId, watch.id, 'ordered');
    if (!silent) {
      toast({
        kind: 'success', message: 'Lab order drafted — pending signature', detail: watch.item,
        undo: () => {
          store.setMonitoringStatus(patientId, watch.id, null);
          const o = store.orders.find((x) => x.recId === watch.id && x.status === 'pending-review');
          if (o) store.cancelOrder(o.id);
        },
      });
    }
  };

  const dismissItem = (watch: WatchOut) => {
    store.setMonitoringStatus(patientId, watch.id, 'dismissed');
    toast({ kind: 'default', message: 'Monitoring item dismissed', detail: watch.item, undo: () => store.setMonitoringStatus(patientId, watch.id, null) });
  };

  const reinstate = (watch: WatchOut) => store.setMonitoringStatus(patientId, watch.id, null);

  const cancelOrder = (watch: WatchOut) => {
    store.setMonitoringStatus(patientId, watch.id, null);
    const o = store.orders.find((x) => x.recId === watch.id && x.status === 'pending-review');
    if (o) store.cancelOrder(o.id);
    toast({ kind: 'default', message: 'Order withdrawn', detail: watch.item });
  };

  const orderAllLabs = () => {
    const pending = all.filter((m) => m.watch.type === 'Lab' && !statusOf(m.watch.id));
    pending.forEach((m) => orderItem(m.rec, m.watch, true));
    toast({ kind: 'success', message: `${pending.length} lab orders drafted`, detail: 'Review in the order queue before signing.' });
  };

  const pendingLabs = all.filter((m) => m.watch.type === 'Lab' && !statusOf(m.watch.id)).length;

  return (
    <div>
      {/* progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>Monitoring ordered</span>
          <span className="num" style={{ color: 'var(--text-3)' }}>{ordered}/{active.length}</span>
        </div>
        <div style={{ height: 6, borderRadius: 6, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width .3s' }} />
        </div>
      </div>

      {/* filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip tone="neutral" active={filter === 'all'} onClick={() => setFilter('all')}>All ({all.length})</Chip>
        {TYPES.map((t) => {
          const n = all.filter((m) => m.watch.type === t).length;
          if (!n) return null;
          return <Chip key={t} tone="neutral" icon={TYPE_ICON[t]} active={filter === t} onClick={() => setFilter(t)}>{t} ({n})</Chip>;
        })}
        {pendingLabs > 0 && <Btn size="sm" variant="soft" icon="flask" onClick={orderAllLabs} style={{ marginLeft: 'auto' }}>Order all labs ({pendingLabs})</Btn>}
      </div>

      {/* grouped watch-outs */}
      <div style={{ display: 'grid', gap: 14 }}>
        {[...groups.entries()].map(([recId, items]) => (
          <div key={recId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>
              From: {items[0].rec.title}
            </div>
            <div style={{ display: 'grid' }}>
              {items.map(({ rec, watch }, i) => {
                const st = statusOf(watch.id);
                const dismissed = st === 'dismissed';
                const isOrdered = st === 'ordered';
                return (
                  <div key={watch.id} style={{ display: 'flex', gap: 12, padding: 14, borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'flex-start', opacity: dismissed ? 0.5 : 1, background: dismissed ? 'var(--surface-2)' : 'transparent' }}>
                    {/* status indicator */}
                    <span style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: isOrdered ? 'var(--accent)' : dismissed ? 'var(--surface-3)' : 'transparent',
                      border: isOrdered || dismissed ? 'none' : '2px solid var(--border-strong)',
                      color: isOrdered ? '#fff' : 'var(--text-3)' }}>
                      {isOrdered && <Icon name="check" size={14} />}
                      {dismissed && <Icon name="x" size={13} />}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Chip tone="neutral" icon={TYPE_ICON[watch.type]}>{watch.type}</Chip>
                        <span style={{ fontWeight: 700, fontSize: 14, textDecoration: dismissed ? 'line-through' : 'none' }}>{watch.item}</span>
                        <span className="num" style={{ fontSize: 12.5, color: 'var(--accent-strong)', fontWeight: 600 }}>{watch.timing} · {watch.frequency}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{watch.rationale}</div>
                      {watch.evidence && watch.evidence.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{watch.evidence.map((e) => <EvidenceChip key={e} label={e} />)}</div>
                      )}

                      {/* actions */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        {dismissed ? (
                          <>
                            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Dismissed</span>
                            <Btn size="sm" variant="ghost" icon="chevronL" onClick={() => reinstate(watch)}>Reinstate</Btn>
                          </>
                        ) : isOrdered ? (
                          <>
                            <span style={{ fontSize: 12.5, color: 'var(--sev-good)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Icon name="clipboard" size={13} /> Ordered — pending signature
                            </span>
                            <Btn size="sm" variant="ghost" onClick={() => cancelOrder(watch)}>Undo</Btn>
                          </>
                        ) : (
                          <>
                            <Btn size="sm" variant="primary" icon="clipboard" onClick={() => orderItem(rec, watch)}>Order</Btn>
                            <Btn size="sm" variant="ghost" icon="x" onClick={() => dismissItem(watch)}>Dismiss</Btn>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
