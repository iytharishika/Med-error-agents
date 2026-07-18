import { useEffect, useState } from 'react';
import type { DraftOrder } from '../types';
import { useStore } from '../state/store';
import { useToast } from '../components/Toast';
import { Icon } from '../components/Icon';
import { Btn, SeverityBadge } from '../components/primitives';
import { MODULES } from '../data/modules';
import { signerLine } from '../lib/drafts';

export function OrderQueue({ patientId, open, onClose }: { patientId: string; open: boolean; onClose: () => void }) {
  const store = useStore();
  const { toast } = useToast();
  const orders = store.orders.filter((o) => o.patientId === patientId);
  const pending = orders.filter((o) => o.status === 'pending-review');
  const signed = orders.filter((o) => o.status === 'signed');

  const sign = (o: DraftOrder) => { store.signOrder(o.id, signerLine()); toast({ kind: 'success', message: 'Order signed', detail: o.detail }); };
  const signAll = () => { store.signAllOrders(signerLine()); toast({ kind: 'success', message: `${pending.length} orders signed`, detail: 'Transmitted to order entry (mock).' }); };

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 70 }} />
      <div className="slide-up no-print" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(500px, 94vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)', zIndex: 71, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="clipboard" size={20} style={{ color: 'var(--accent)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Order queue</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{pending.length} pending signature · {signed.length} signed</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', display: 'inline-flex', padding: 6 }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
              <Icon name="clipboard" size={28} />
              <div style={{ marginTop: 8, fontSize: 14 }}>No orders yet. Accept a recommendation to draft one here.</div>
            </div>
          )}

          {pending.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Pending signature</span>
              <Btn size="sm" variant="primary" icon="check" onClick={signAll} style={{ marginLeft: 'auto' }}>Sign all ({pending.length})</Btn>
            </div>
          )}
          {pending.map((o) => (
            <OrderCard key={o.id} o={o} onSign={() => sign(o)} onCancel={() => { store.cancelOrder(o.id); toast({ message: 'Order canceled' }); }} />
          ))}

          {signed.length > 0 && <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 8 }}>Signed</div>}
          {signed.map((o) => <OrderCard key={o.id} o={o} signed />)}
        </div>
      </div>
    </>
  );
}

function OrderCard({ o, onSign, onCancel, signed }: { o: DraftOrder; onSign?: () => void; onCancel?: () => void; signed?: boolean }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden', opacity: signed ? 0.82 : 1 }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
        <SeverityBadge severity={o.severity} small />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{MODULES[o.module].short}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: signed ? 'var(--sev-good)' : 'var(--sev-major)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name={signed ? 'check' : 'clock'} size={13} /> {signed ? `Signed · ${o.signedBy}` : 'Pending'}
        </span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{o.detail}</div>
        <pre style={{ margin: '8px 0 0', padding: 10, background: 'var(--surface-2)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', whiteSpace: 'pre-wrap', border: '1px solid var(--border)' }}>{o.orderText}</pre>

        {o.clinicalNote && <DraftBlock orderId={o.id} field="clinicalNote" title="Draft clinical note" icon="file" text={o.clinicalNote} />}
        {o.patientMessage && <DraftBlock orderId={o.id} field="patientMessage" title="Patient message" icon="message" text={o.patientMessage} note="~10th-grade reading level" />}

        {!signed && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn size="sm" variant="primary" icon="check" onClick={onSign}>Sign order</Btn>
            <Btn size="sm" variant="ghost" onClick={onCancel}>Cancel</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function DraftBlock({ orderId, field, title, icon, text, note }: {
  orderId: string; field: 'clinicalNote' | 'patientMessage'; title: string; icon: string; text: string; note?: string;
}) {
  const store = useStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(text);
  useEffect(() => { if (!editing) setVal(text); }, [text, editing]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ kind: 'success', message: `${title} copied to clipboard` });
    } catch {
      toast({ kind: 'warn', message: 'Copy failed — select and copy manually' });
    }
  };

  const save = () => {
    store.updateOrder(orderId, field === 'clinicalNote' ? { clinicalNote: val } : { patientMessage: val });
    setEditing(false);
    toast({ kind: 'success', message: `${title} saved` });
  };

  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
        <Icon name={icon} size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{title}</span>
        {note && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {note}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {editing ? (
            <>
              <Btn size="sm" variant="primary" icon="check" onClick={save}>Save</Btn>
              <Btn size="sm" variant="ghost" onClick={() => { setVal(text); setEditing(false); }}>Cancel</Btn>
            </>
          ) : (
            <>
              <button onClick={copy} title="Copy" style={iconBtn}><Icon name="copy" size={14} /></button>
              <button onClick={() => setEditing(true)} title="Edit" style={iconBtn}><Icon name="edit" size={14} /></button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          rows={Math.min(16, val.split('\n').length + 1)}
          style={{ width: '100%', border: 'none', outline: 'none', resize: 'vertical', padding: 10, background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontFamily: field === 'clinicalNote' ? 'var(--font-mono)' : 'var(--font-sans)', lineHeight: 1.5, boxSizing: 'border-box' }}
        />
      ) : (
        <pre style={{ margin: 0, padding: 10, whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text)', fontFamily: field === 'clinicalNote' ? 'var(--font-mono)' : 'var(--font-sans)' }}>{text}</pre>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};
