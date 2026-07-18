import { useState } from 'react';
import type { Patient, ClassTag } from '../types';
import type { RecView } from '../state/selectors';
import { Icon } from './Icon';

// Class-colored dot so a regimen can be scanned by organ system at a glance.
function classColor(tags: ClassTag[]): string {
  const any = (list: ClassTag[]) => tags.some((t) => list.includes(t));
  if (any(['anticoagulant', 'doac', 'vka', 'antiplatelet'])) return 'var(--sev-crit)'; // heme / bleeding
  if (any(['opioid', 'benzodiazepine', 'z-drug', 'ssri', 'snri', 'tca', 'maoi', 'antipsychotic', 'gabapentinoid', 'anticholinergic', 'antihistamine-1g'])) return '#a855f7'; // CNS / psych
  if (any(['loop', 'thiazide', 'diuretic', 'k-sparing', 'potassium'])) return 'var(--sev-major)'; // diuretic / lytes
  if (any(['biguanide', 'sulfonylurea', 'sglt2', 'glp1', 'dpp4', 'insulin', 'antidiabetic', 'levothyroxine'])) return 'var(--sev-info)'; // endocrine
  if (any(['supplement'])) return 'var(--sev-good)'; // OTC / supplement
  if (any(['acei', 'arb', 'arni', 'beta-blocker', 'ccb-dhp', 'ccb-nondhp', 'mra', 'raas', 'nitrate', 'statin', 'fibrate', 'antiarrhythmic', 'digoxin', 'pde5'])) return 'var(--accent)'; // cardiovascular
  if (any(['ppi', 'h2ra'])) return '#0ea5e9'; // GI
  return 'var(--text-3)';
}

type Tab = 'active' | 'stopped' | 'allergies' | 'duplicates';
const COLLAPSE_KEY = 'kap.medsbar.collapsed';

export function ActiveMedsBar({ patient, duplicates }: { patient: Patient; duplicates: RecView[] }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [tab, setTab] = useState<Tab>('active');

  const toggle = () => {
    setCollapsed((c) => {
      const n = !c;
      try { localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0'); } catch { /* ignore */ }
      return n;
    });
  };

  const openTab = (t: Tab) => { setTab(t); if (collapsed) toggle(); };

  const allergies = patient.allergies.filter((a) => a.substance !== 'No known drug allergies');
  const counts: Record<Tab, number> = {
    active: patient.meds.length,
    stopped: 0,
    allergies: allergies.length,
    duplicates: duplicates.length,
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px 14px' : '12px 14px', flexWrap: 'wrap' }}>
        <button onClick={toggle} aria-expanded={!collapsed} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)' }}>
          <Icon name="pill" size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Active Meds</span>
          <span className="num" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{patient.meds.length} active · {patient.meds.length} total</span>
          <Icon name={collapsed ? 'chevronD' : 'chevronU'} size={16} style={{ color: 'var(--text-3)' }} />
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['active', 'stopped', 'allergies', 'duplicates'] as Tab[]).map((t) => {
            const on = !collapsed && tab === t;
            const danger = (t === 'allergies' && counts.allergies > 0) || (t === 'duplicates' && counts.duplicates > 0);
            return (
              <button
                key={t}
                onClick={() => openTab(t)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999,
                  border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                  background: on ? 'var(--accent-soft)' : 'transparent',
                  color: on ? 'var(--accent-strong)' : 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{t}</span>
                <span className="num" style={{ fontWeight: 700, color: on ? 'var(--accent-strong)' : danger ? 'var(--sev-major)' : 'var(--text-3)' }}>{counts[t]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* body */}
      {!collapsed && (
        <div className="fade-in" style={{ padding: '4px 14px 14px', borderTop: '1px solid var(--border)' }}>
          {tab === 'active' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {patient.meds.map((m) => (
                <span key={m.id} title={m.riskFlag || m.drugClass} style={chip}>
                  <span style={{ width: 8, height: 8, borderRadius: 8, background: classColor(m.classTags), flexShrink: 0 }} />
                  <strong style={{ fontWeight: 700 }}>{m.name}</strong>
                  <span className="num" style={{ color: 'var(--text-2)' }}>{m.dose} {m.frequency}</span>
                  {m.riskFlag && <Icon name="alert" size={12} style={{ color: 'var(--sev-major)' }} />}
                </span>
              ))}
            </div>
          )}

          {tab === 'stopped' && (
            <Empty text="No recently stopped medications on file." />
          )}

          {tab === 'allergies' && (
            allergies.length === 0 ? <Empty text="No known drug allergies." /> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {allergies.map((a, i) => (
                  <span key={i} style={chip}>
                    <span style={{ width: 8, height: 8, borderRadius: 8, background: a.severity === 'severe' ? 'var(--sev-crit)' : a.severity === 'moderate' ? 'var(--sev-major)' : 'var(--text-3)', flexShrink: 0 }} />
                    <strong style={{ fontWeight: 700 }}>{a.substance}</strong>
                    {a.reaction !== '—' && <span style={{ color: 'var(--text-2)' }}>{a.reaction} · {a.severity}</span>}
                  </span>
                ))}
              </div>
            )
          )}

          {tab === 'duplicates' && (
            duplicates.length === 0 ? <Empty text="No duplicate therapy detected." /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {duplicates.map((d) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                    <Icon name="layers" size={14} style={{ color: 'var(--sev-moderate)' }} />
                    <strong>{d.title}</strong>
                    <span style={{ color: 'var(--text-2)' }}>{d.drugs.join(' + ')}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999,
  padding: '5px 12px', fontSize: 13,
};

function Empty({ text }: { text: string }) {
  return <div style={{ padding: '14px 4px 6px', fontSize: 13, color: 'var(--text-3)' }}>{text}</div>;
}
