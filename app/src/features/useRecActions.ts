import { useStore } from '../state/store';
import { useToast } from '../components/Toast';
import type { RecView } from '../state/selectors';
import type { OrderActionType } from '../types';
import { PATIENT_BY_ID } from '../data/patients';
import { buildClinicalNote, buildPatientMessage } from '../lib/drafts';

const ACTION_VERB: Record<OrderActionType, string> = {
  discontinue: 'Discontinue',
  'reduce-dose': 'Reduce dose',
  'increase-dose': 'Increase dose',
  hold: 'Hold',
  start: 'Start',
  switch: 'Switch',
  'add-lab': 'Order lab',
  'add-monitoring': 'Add monitoring',
};

export function orderTextFor(rec: RecView): string {
  const verb = ACTION_VERB[rec.orderAction || 'add-monitoring'];
  const med = rec.targetMed || rec.drugs[0] || '';
  const detail = rec.orderDetail || rec.action;
  return `${verb}${med ? ` — ${med}` : ''}\n${detail}\n\nIndication: ${rec.title}. Kapsule AI recommendation (${rec.module}). Pending clinician review.`;
}

export function useRecActions(patientId: string) {
  const store = useStore();
  const { toast } = useToast();

  const accept = (rec: RecView) => {
    const prev = store.recStatus[patientId]?.[rec.id] || 'pending';
    store.setRecStatus(patientId, rec.id, 'accepted');
    // Draft a pending EHR order that stays in the queue until signed,
    // plus a draft clinical note and a patient-facing message.
    const makesOrder = rec.targetMed || rec.orderAction;
    if (makesOrder) {
      const patient = PATIENT_BY_ID.get(patientId);
      store.createOrder({
        patientId,
        recId: rec.id,
        actionType: rec.orderAction || 'add-monitoring',
        targetMed: rec.targetMed || rec.drugs[0] || '—',
        detail: rec.orderDetail || rec.action,
        orderText: orderTextFor(rec),
        severity: rec.severity,
        module: rec.module,
        clinicalNote: patient ? buildClinicalNote(patient, rec) : undefined,
        patientMessage: patient ? buildPatientMessage(patient, rec) : undefined,
      });
    }
    toast({
      kind: 'success',
      message: `Accepted — order, note & patient message drafted`,
      detail: `${rec.orderDetail || rec.action}`,
      undo: () => {
        store.setRecStatus(patientId, rec.id, prev);
        // cancel the just-created pending order
        const o = store.orders.find((x) => x.recId === rec.id && x.status === 'pending-review');
        if (o) store.cancelOrder(o.id);
      },
    });
  };

  const defer = (rec: RecView, reason?: any) => {
    const prev = store.recStatus[patientId]?.[rec.id] || 'pending';
    store.setRecStatus(patientId, rec.id, 'deferred', reason);
    toast({
      kind: 'default',
      message: 'Deferred',
      detail: reason ? `Reason: ${String(reason).replace('-', ' ')}` : undefined,
      undo: () => store.setRecStatus(patientId, rec.id, prev),
    });
  };

  const dismiss = (rec: RecView) => {
    const prev = store.recStatus[patientId]?.[rec.id] || 'pending';
    store.setRecStatus(patientId, rec.id, 'dismissed');
    toast({ kind: 'default', message: 'Dismissed — not clinically relevant', undo: () => store.setRecStatus(patientId, rec.id, prev) });
  };

  const snooze = (rec: RecView, ms: number, label: string) => {
    store.snooze(patientId, rec.id, ms, label);
    toast({ kind: 'default', message: `Snoozed for ${label}`, undo: () => store.clearSnooze(patientId, rec.id) });
  };

  const reopen = (rec: RecView) => {
    store.setRecStatus(patientId, rec.id, 'pending');
    store.clearSnooze(patientId, rec.id);
  };

  return { accept, defer, dismiss, snooze, reopen };
}
