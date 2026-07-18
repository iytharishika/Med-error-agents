import { useState } from 'react';
import type { RecView } from '../state/selectors';
import { Icon, DOMAIN_ICON } from './Icon';
import { SeverityDot, EvidenceChip, Btn, ConfidenceBadge } from './primitives';
import { Menu } from './Menu';
import { SEVERITY_META } from '../lib/format';
import { useRecActions } from '../features/useRecActions';
import { SNOOZE_OPTIONS } from '../state/store';

// Compact horizontal priority chips. Click a chip → inline "why" drawer.
// Toggle Bulk → select multiple → Accept / Snooze in one action.
export function PriorityStrip({ recs, patientId }: { recs: RecView[]; patientId: string }) {
  const { accept, snooze } = useRecActions(patientId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (recs.length === 0) return null;

  const open = openId ? recs.find((r) => r.id === openId) : null;

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const selectedRecs = recs.filter((r) => selected.has(r.id));
  const clear = () => setSelected(new Set());

  const bulkAccept = () => { selectedRecs.forEach(accept); clear(); setBulk(false); };
  const bulkSnooze = (ms: number, label: string) => { selectedRecs.forEach((r) => snooze(r, ms, label)); clear(); };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Priorities · {recs.length}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {bulk && selected.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{selected.size} selected</span>
              <Btn size="sm" variant="primary" icon="clipboard" onClick={bulkAccept}>Accept</Btn>
              <Menu
                align="right"
                trigger={(o) => <Btn size="sm" variant="soft" icon="clock" onClick={o}>Snooze</Btn>}
                items={SNOOZE_OPTIONS.map((s) => ({ label: s.label, icon: <Icon name="clock" size={13} />, onClick: () => bulkSnooze(s.ms, s.label) }))}
              />
              <Btn size="sm" variant="ghost" onClick={clear}>Clear</Btn>
            </>
          )}
          <Btn size="sm" variant={bulk ? 'primary' : 'ghost'} icon="layers" onClick={() => { setBulk((b) => !b); clear(); setOpenId(null); }}>
            {bulk ? 'Bulk on' : 'Bulk'}
          </Btn>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {recs.map((r) => {
          const m = SEVERITY_META[r.severity];
          const isOpen = openId === r.id;
          const isSel = selected.has(r.id);
          return (
            <button
              key={r.id}
              onClick={() => (bulk ? toggleSel(r.id) : setOpenId(isOpen ? null : r.id))}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: 320,
                background: isSel ? 'var(--accent-soft)' : isOpen ? 'var(--surface-3)' : 'var(--surface-2)',
                border: `1px solid ${isSel ? 'var(--accent)' : isOpen ? m.color : 'var(--border)'}`,
                borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', cursor: 'pointer',
              }}
            >
              {bulk && <Icon name={isSel ? 'check' : 'plus'} size={13} style={{ color: isSel ? 'var(--accent)' : 'var(--text-3)' }} />}
              <SeverityDot severity={r.severity} pulse={r.severity === 'contraindicated'} />
              <Icon name={DOMAIN_ICON[r.domain] || 'pill'} size={13} style={{ color: 'var(--text-3)' }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.orderDetail || r.title}</span>
            </button>
          );
        })}
      </div>

      {/* inline why drawer */}
      {open && !bulk && (
        <div className="fade-in" style={{ marginTop: 10, padding: 14, borderRadius: 10, background: 'var(--surface-2)', border: `1px solid ${SEVERITY_META[open.severity].color}44` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SeverityDot severity={open.severity} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>{open.title}</span>
            <button onClick={() => setOpenId(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-3)', display: 'inline-flex' }}><Icon name="x" size={16} /></button>
          </div>
          <div style={{ marginTop: 8, fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-3)', fontWeight: 700, fontSize: 11 }}>KEY FACTORS · </strong>{open.rationale}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <ConfidenceBadge confidence={open.confidence} basis={open.basis} />
            {open.evidence.map((e) => <EvidenceChip key={e} label={e} />)}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Btn size="sm" variant="primary" icon="clipboard" onClick={() => { accept(open); setOpenId(null); }}>Accept &amp; draft order</Btn>
            <Menu
              align="left"
              trigger={(o) => <Btn size="sm" variant="soft" icon="clock" onClick={o}>Snooze</Btn>}
              items={SNOOZE_OPTIONS.map((s) => ({ label: s.label, icon: <Icon name="clock" size={13} />, onClick: () => { snooze(open, s.ms, s.label); setOpenId(null); } }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
