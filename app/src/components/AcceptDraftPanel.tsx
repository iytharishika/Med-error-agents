// ============================================================
// AcceptDraftPanel — sits inside a Home recommendation.
// Accepting a MEDICATION change drafts a clinical note + a 10th-grade patient
// message (signed), both editable and copyable, and pushes a pending order into
// the existing store / OrderQueue (stays pending until the clinician signs).
// ============================================================
import { useState } from 'react';
import type { Patient } from '../types';
import type { BackendRec } from '../lib/kapsuleApi';
import { useStore } from '../state/store';
import { useToast } from '../components/Toast';
import { Icon } from '../components/Icon';
import { Btn } from '../components/primitives';
import {
  buildClinicalNote, buildPatientMessage, orderTextFor, orderActionFor,
  isMedChange, severityFor, moduleFor,
} from '../lib/backendDrafts';

export function AcceptDraftPanel({ patient, rec }: { patient: Patient; rec: BackendRec }) {
  const store = useStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  const medChange = isMedChange(rec);
  const recId = `be-${patient.id}-${(rec.order_target || rec.title)}-${rec.action}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const accept = () => {
    const n = buildClinicalNote(patient, rec);
    const m = buildPatientMessage(patient, rec);
    setNote(n);
    setMessage(m);
    setOpen(true);
    // Pending order → shows in the existing OrderQueue until signed.
    store.createOrder({
      patientId: patient.id,
      recId,
      actionType: orderActionFor(rec),
      targetMed: rec.order_target || '—',
      detail: rec.title,
      orderText: orderTextFor(rec),
      severity: severityFor(rec),
      module: moduleFor(rec),
      clinicalNote: n,
      patientMessage: m,
    });
    toast({ kind: 'success', message: 'Accepted — order, note & patient message drafted', detail: rec.title });
  };

  if (!medChange) {
    return (
      <div style={{ marginTop: 16 }}>
        <Btn variant="soft" icon="check" onClick={() => toast({ kind: 'success', message: 'Accepted', detail: rec.title })}>
          Accept
        </Btn>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      {!open ? (
        <Btn variant="primary" icon="clipboard" onClick={accept}>Accept &amp; draft order</Btn>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--sev-good, #2f7d4f)', fontWeight: 700 }}>
            <Icon name="check" size={15} /> Pending order drafted — awaiting signature
          </div>
          <DraftCard title="Clinical note (chart)" value={note} onChange={setNote} />
          <DraftCard title="Patient message · 10th-grade" value={message} onChange={setMessage} />
        </div>
      )}
    </div>
  );
}

function DraftCard({ title, value, onChange }: { title: string; value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div style={{ border: '1px solid var(--border, #e2e2e2)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-2, #f6f6f6)', borderBottom: '1px solid var(--border, #e2e2e2)' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-3, #999)' }}>{title}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setEditing((e) => !e)}
            style={iconBtn}
            title={editing ? 'Done editing' : 'Edit'}
          >
            <Icon name={editing ? 'check' : 'edit'} size={14} />
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>{editing ? 'Done' : 'Edit'}</span>
          </button>
          <button onClick={copy} style={iconBtn} title="Copy">
            <Icon name="clipboard" size={14} />
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%', minHeight: 180, border: 'none', outline: 'none', resize: 'vertical',
            padding: 12, fontSize: 13, lineHeight: 1.5, fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            color: 'var(--text, #1a1a1a)', background: 'transparent', boxSizing: 'border-box',
          }}
        />
      ) : (
        <pre style={{ margin: 0, padding: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono, ui-monospace, monospace)', color: 'var(--text, #1a1a1a)' }}>
          {value}
        </pre>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent',
  border: '1px solid var(--border, #e2e2e2)', borderRadius: 7, padding: '3px 8px',
  cursor: 'pointer', color: 'var(--text-2, #555)',
};
