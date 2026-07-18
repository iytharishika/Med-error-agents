import { useMemo, useState } from 'react';
import type { Patient, TimelineType, Severity } from '../types';
import { Icon } from '../components/Icon';
import { Chip, SeverityBadge } from '../components/primitives';
import { fmtDate } from '../lib/format';

const TYPE_META: Record<TimelineType, { icon: string; label: string; color: string }> = {
  med: { icon: 'pill', label: 'Medication', color: 'var(--accent)' },
  lab: { icon: 'flask', label: 'Lab', color: 'var(--sev-info)' },
  visit: { icon: 'user', label: 'Visit', color: 'var(--text-2)' },
  alert: { icon: 'alert', label: 'Alert', color: 'var(--sev-major)' },
};

export function TimelineTab({ patient }: { patient: Patient }) {
  const [typeFilter, setTypeFilter] = useState<TimelineType | 'all'>('all');
  const [riskFilter, setRiskFilter] = useState<Severity | 'all'>('all');
  const [medQuery, setMedQuery] = useState('');
  const [sortDesc, setSortDesc] = useState(true);

  const events = useMemo(() => {
    let e = [...patient.timeline];
    if (typeFilter !== 'all') e = e.filter((x) => x.type === typeFilter);
    if (riskFilter !== 'all') e = e.filter((x) => x.riskLevel === riskFilter);
    if (medQuery.trim()) e = e.filter((x) => (x.medName || '').toLowerCase().includes(medQuery.toLowerCase()) || x.title.toLowerCase().includes(medQuery.toLowerCase()));
    e.sort((a, b) => (sortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
    return e;
  }, [patient.timeline, typeFilter, riskFilter, medQuery, sortDesc]);

  return (
    <div>
      {/* filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <Chip tone="neutral" active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All events</Chip>
        {(Object.keys(TYPE_META) as TimelineType[]).map((t) => (
          <Chip key={t} tone="neutral" icon={TYPE_META[t].icon} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{TYPE_META[t].label}</Chip>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', marginLeft: 'auto' }}>
          <Icon name="search" size={14} style={{ color: 'var(--text-3)' }} />
          <input value={medQuery} onChange={(e) => setMedQuery(e.target.value)} placeholder="Filter by medication…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', width: 150 }} />
        </div>
        <Chip tone="neutral" icon={sortDesc ? 'arrowDown' : 'arrowUp'} onClick={() => setSortDesc((s) => !s)}>{sortDesc ? 'Newest' : 'Oldest'}</Chip>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <Chip tone="neutral" active={riskFilter === 'all'} onClick={() => setRiskFilter('all')}>Any risk</Chip>
        {(['contraindicated', 'major', 'moderate'] as Severity[]).map((s) => (
          <Chip key={s} tone="neutral" active={riskFilter === s} onClick={() => setRiskFilter(s)}>{s}</Chip>
        ))}
      </div>

      {/* timeline */}
      <div style={{ position: 'relative', paddingLeft: 8 }}>
        <div style={{ position: 'absolute', left: 19, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />
        <div style={{ display: 'grid', gap: 4 }}>
          {events.map((ev) => {
            const meta = TYPE_META[ev.type];
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 14, padding: '10px 0', position: 'relative' }}>
                <span style={{ width: 24, height: 24, borderRadius: 24, background: 'var(--surface)', border: `2px solid ${meta.color}`, color: meta.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                  <Icon name={meta.icon} size={12} />
                </span>
                <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="num" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{fmtDate(ev.date)}</span>
                    {ev.riskLevel && ev.riskLevel !== 'info' && <SeverityBadge severity={ev.riskLevel} small />}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>
                    {ev.title}
                    {ev.reason && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> ({ev.reason})</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: 12, color: 'var(--text-3)', flexWrap: 'wrap' }}>
                    {ev.by && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="user" size={11} /> {ev.by}</span>}
                    {ev.source && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Traceable to source"><Icon name="file" size={11} /> {ev.source}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {events.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>No events match these filters.</div>}
        </div>
      </div>
    </div>
  );
}
