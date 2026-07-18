import { Link } from 'react-router-dom';
import type { Patient } from '../types';
import { Logo, ThemeToggle } from './Brand';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { Chip } from './primitives';
import { PATIENTS } from '../data/patients';
import { SPECIALTY_LIST, SPECIALTIES } from '../data/modules';
import { useStore } from '../state/store';
import { ageFromDob } from '../lib/format';

export function ClinicalTopBar({
  patient, pendingOrders, onOpenOrders, onPrint, onPatientView,
}: {
  patient: Patient; pendingOrders: number; onOpenOrders: () => void; onPrint: () => void; onPatientView: () => void;
}) {
  const store = useStore();

  return (
    <header
      className="no-print"
      style={{ position: 'sticky', top: 0, zIndex: 45, background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', flexWrap: 'wrap' }}>
        <Link to="/" style={{ textDecoration: 'none' }}><Logo size={26} showText={false} /></Link>

        {/* patient switcher */}
        <Menu
          align="left"
          trigger={(open) => (
            <button onClick={open} style={switcherBtn}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                {patient.name.split(' ').map((n) => n[0]).join('')}
              </span>
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{patient.name}</div>
                <div className="num" style={{ fontSize: 11, color: 'var(--text-3)' }}>{ageFromDob(patient.dob)}{patient.gender} · {patient.mrn}</div>
              </div>
              <Icon name="chevronD" size={15} style={{ color: 'var(--text-3)' }} />
            </button>
          )}
          items={PATIENTS.map((p) => ({
            label: `${p.name} · ${ageFromDob(p.dob)}${p.gender}`,
            icon: <Icon name={p.id === patient.id ? 'check' : 'user'} size={14} style={{ color: p.id === patient.id ? 'var(--accent)' : 'var(--text-3)' }} />,
            onClick: () => store.setLastPatient(p.id),
          }))}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* specialty */}
          <Menu
            align="right"
            trigger={(open) => (
              <button onClick={open} style={pillBtn} title="Viewing as specialty">
                <Icon name="stethoscope" size={14} />
                Viewing as: <strong style={{ color: 'var(--text)' }}>{SPECIALTIES[store.specialty].label}</strong>
                <Icon name="chevronD" size={13} />
              </button>
            )}
            items={SPECIALTY_LIST.map((s) => ({
              label: s.label,
              icon: <Icon name={s.key === store.specialty ? 'check' : 'user'} size={14} style={{ color: s.key === store.specialty ? 'var(--accent)' : 'var(--text-3)' }} />,
              onClick: () => store.setSpecialty(s.key),
            }))}
          />

          <button onClick={onOpenOrders} style={{ ...pillBtn, position: 'relative' }} title="Order queue">
            <Icon name="clipboard" size={15} /> Orders
            {pendingOrders > 0 && (
              <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 18, background: 'var(--sev-major)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }} className="num">{pendingOrders}</span>
            )}
          </button>

          <button onClick={onPatientView} style={iconBtn} title="Share-with-patient view"><Icon name="users" size={16} /></button>
          <button onClick={onPrint} style={iconBtn} title="Print one-page summary"><Icon name="print" size={16} /></button>
          <button onClick={() => store.toggleSidebar()} style={iconBtn} title="Toggle patient rail"><Icon name="layers" size={16} /></button>
          <ThemeToggle />
        </div>
      </div>

      {store.specialty !== 'primary-care' && store.specialty !== 'pharmacy' && (
        <div style={{ padding: '6px 18px', background: 'var(--accent-soft)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          <Icon name="info" size={14} style={{ color: 'var(--accent-strong)' }} />
          <span style={{ color: 'var(--accent-strong)' }}>
            {SPECIALTIES[store.specialty].blurb} Findings outside {SPECIALTIES[store.specialty].label} are shown separately as managed by other teams.
          </span>
          <Chip tone="accent" onClick={() => store.setSpecialty('primary-care')} style={{ marginLeft: 'auto' }}>See all (Primary Care)</Chip>
        </div>
      )}
    </header>
  );
}

const switcherBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 9, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '5px 10px', cursor: 'pointer' };
const pillBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer' };
const iconBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
