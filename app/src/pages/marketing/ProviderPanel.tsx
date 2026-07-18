import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Chip } from '../../components/primitives';
import { Icon } from '../../components/Icon';
import { PATIENTS } from '../../data/patients';
import { buildRecommendations } from '../../state/selectors';
import { ageFromDob, riskColor } from '../../lib/format';
import { useStore } from '../../state/store';

const wrap = { maxWidth: 1100, margin: '0 auto', padding: '0 24px' } as const;

type SortKey = 'patient' | 'risk' | 'findings';

function shortConditions(labels: string[]): string {
  return labels
    .slice(0, 3)
    .map((l) => l.replace(/\s*\(.*?\)/g, '').split(',')[0].trim())
    .join(', ');
}

export function ProviderPanel() {
  const nav = useNavigate();
  const { setLastPatient } = useStore();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('risk');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const rows = useMemo(() => {
    const base = PATIENTS.map((p) => {
      const recs = buildRecommendations(p).filter((r) => !r.benefit);
      const critical = recs.filter((r) => r.severity === 'contraindicated' || r.severity === 'major').length;
      const conditions = shortConditions(p.diagnoses.map((d) => d.label));
      return { p, findings: recs.length, critical, conditions };
    });

    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter(
          (r) =>
            r.p.name.toLowerCase().includes(q) ||
            r.p.mrn.toLowerCase().includes(q) ||
            r.p.diagnoses.some((d) => d.label.toLowerCase().includes(q)),
        )
      : base;

    const sorted = [...filtered].sort((a, b) => {
      let d = 0;
      if (sortKey === 'patient') d = a.p.name.localeCompare(b.p.name);
      else if (sortKey === 'risk') d = a.p.riskScore - b.p.riskScore;
      else d = a.findings - b.findings;
      return d * sortDir;
    });
    return sorted;
  }, [query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(key === 'patient' ? 1 : -1);
    }
  };

  const open = (id: string) => { setLastPatient(id); nav('/dashboard'); };
  const chart = (id: string) => nav(`/patient/${id}`);

  return (
    <div style={{ paddingTop: 40, paddingBottom: 56 }}>
      {/* header */}
      <section style={{ ...wrap, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="users" size={26} />
        </span>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.6 }}>My Panel</h1>
          <div className="num" style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 2 }}>
            {rows.length} of {PATIENTS.length} patients
          </div>
        </div>
      </section>

      {/* search */}
      <section style={{ ...wrap, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', boxShadow: 'var(--shadow-sm)' }}>
          <Icon name="search" size={18} style={{ color: 'var(--text-3)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, MRN, condition…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: 'var(--text)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', display: 'inline-flex' }} aria-label="Clear">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      </section>

      {/* table */}
      <section style={{ ...wrap, marginTop: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 720 }}>
              {/* header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px 132px 132px', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <SortHead label="Patient" active={sortKey === 'patient'} dir={sortDir} onClick={() => toggleSort('patient')} />
                <SortHead label="Risk" active={sortKey === 'risk'} dir={sortDir} onClick={() => toggleSort('risk')} align="center" />
                <SortHead label="Findings" active={sortKey === 'findings'} dir={sortDir} onClick={() => toggleSort('findings')} align="center" />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'right' }}>Actions</span>
              </div>

              {/* rows */}
              {rows.map(({ p, findings, critical, conditions }) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(p.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') open(p.id); }}
                  className="panel-row"
                  style={{ display: 'grid', gridTemplateColumns: '1fr 96px 132px 132px', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* patient */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span style={{ position: 'relative', flexShrink: 0 }}>
                      <span style={{ width: 44, height: 44, borderRadius: 44, background: 'var(--surface-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'var(--text-2)' }}>
                        {p.name.split(' ').map((n) => n[0]).join('')}
                      </span>
                      <span style={{ position: 'absolute', bottom: 0, right: 0, width: 13, height: 13, borderRadius: 13, background: riskColor(p.riskScore), border: '2px solid var(--surface)' }} title={`Risk ${p.riskScore}`} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span className="num">{ageFromDob(p.dob)} {p.gender}</span> · <span className="num">{p.mrn}</span> · {conditions}
                      </div>
                    </div>
                  </div>

                  {/* risk */}
                  <div style={{ textAlign: 'center' }}>
                    <span className="num" style={{ fontSize: 18, fontWeight: 800, color: riskColor(p.riskScore) }}>{p.riskScore}</span>
                  </div>

                  {/* findings */}
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>{findings}</span>
                    {critical > 0 && <Chip tone="crit" icon="alert">{critical} critical</Chip>}
                  </div>

                  {/* actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => chart(p.id)} title="Chart review" style={iconBtn}><Icon name="file" size={16} /></button>
                    <button onClick={() => open(p.id)} title="Open in cockpit" style={{ ...iconBtn, background: 'var(--accent)', color: 'var(--accent-contrast)', border: '1px solid var(--accent)' }}><Icon name="stethoscope" size={16} /></button>
                  </div>
                </div>
              ))}

              {rows.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
                  No patients match “{query}”.
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-3)' }}>
          Tip: click any row to open the cockpit, or use <Link to="/patient/whitfield-eleanor" style={{ color: 'var(--accent)' }}>chart review</Link> for the full chart.
        </div>
      </section>
    </div>
  );
}

function SortHead({ label, active, dir, onClick, align = 'left' }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void; align?: 'left' | 'center' }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer',
        fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
        color: active ? 'var(--accent-strong)' : 'var(--text-3)',
        justifyContent: align === 'center' ? 'center' : 'flex-start', padding: 0,
      }}
    >
      {label}
      <Icon name={active ? (dir === 1 ? 'arrowUp' : 'arrowDown') : 'chevronD'} size={13} style={{ opacity: active ? 1 : 0.5 }} />
    </button>
  );
}

const iconBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};
