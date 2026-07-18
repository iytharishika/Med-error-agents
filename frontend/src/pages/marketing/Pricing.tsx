import { Link } from 'react-router-dom';
import { Btn, Card, Chip } from '../../components/primitives';
import { Icon } from '../../components/Icon';

const wrap = { maxWidth: 1100, margin: '0 auto', padding: '0 24px' } as const;

const TIERS = [
  {
    name: 'Clinic', price: '$XXX', unit: 'per provider / month', tagline: 'Independent practices and small groups.',
    highlight: false,
    features: ['All six reasoning agents', 'Interaction + Beers + QT + anticholinergic', 'New-med simulator', 'Evidence resolver', 'Up to 5 providers'],
  },
  {
    name: 'Health System', price: '$XXX', unit: 'per provider / month', tagline: 'Multi-specialty groups and hospitals.',
    highlight: true,
    features: ['Everything in Clinic', 'Specialty-aware surfacing', 'EHR order-entry write-back', 'Closed-loop monitoring orders', 'QI dashboard from defer reasons', 'SSO + audit logging'],
  },
  {
    name: 'Enterprise', price: '$XXX', unit: 'custom', tagline: 'IDNs and payers at scale.',
    highlight: false,
    features: ['Everything in Health System', 'SMART on FHIR deployment', 'Custom rule authoring', 'Population medication analytics', 'Dedicated clinical success', 'BAA + on-prem option'],
  },
];

const MATRIX = [
  ['Reasoning agents', 'All 6', 'All 6', 'All 6'],
  ['New-med simulator', '✓', '✓', '✓'],
  ['Specialty-aware views', '—', '✓', '✓'],
  ['EHR order write-back', '—', '✓', '✓'],
  ['Defer-reason QI analytics', '—', '✓', '✓'],
  ['Custom rules', '—', '—', '✓'],
  ['SSO / audit / BAA', '—', '✓', '✓'],
];

export function Pricing() {
  return (
    <div style={{ paddingTop: 56, paddingBottom: 48 }}>
      <section style={{ ...wrap, textAlign: 'center' }}>
        <Chip tone="accent" icon="dollar">Per-provider SaaS</Chip>
        <h1 style={{ fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 800, letterSpacing: -1.2, marginTop: 16 }}>Pricing that scales with your panel</h1>
        <p style={{ fontSize: 17, color: 'var(--text-2)', maxWidth: 600, margin: '14px auto 0' }}>
          Final pricing is being set with launch partners. Figures below are placeholders.
        </p>
      </section>

      <section style={{ ...wrap, paddingTop: 40 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {TIERS.map((t) => (
            <Card key={t.name} style={{ padding: 24, border: t.highlight ? '2px solid var(--accent)' : '1px solid var(--border)', position: 'relative' }}>
              {t.highlight && <Chip tone="accent" style={{ position: 'absolute', top: -12, left: 24 }}>Most popular</Chip>}
              <div style={{ fontWeight: 700, fontSize: 18 }}>{t.name}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 13.5, marginTop: 4, minHeight: 36 }}>{t.tagline}</div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="num" style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>{t.price}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{t.unit}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
                {t.features.map((f) => (
                  <span key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--text-2)' }}>
                    <Icon name="check" size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} /> {f}
                  </span>
                ))}
              </div>
              <Link to="/dashboard" style={{ textDecoration: 'none', display: 'block', marginTop: 20 }}>
                <Btn variant={t.highlight ? 'primary' : 'soft'} style={{ width: '100%' }}>Try the demo</Btn>
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section style={{ ...wrap, paddingTop: 44 }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>Feature</th>
                  {['Clinic', 'Health System', 'Enterprise'].map((h) => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row[0]} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 16px', fontSize: 14 }}>{row[0]}</td>
                    {row.slice(1).map((c, i) => (
                      <td key={i} style={{ padding: '11px 16px', textAlign: 'center', fontSize: 14, color: c === '✓' ? 'var(--sev-good)' : c === '—' ? 'var(--text-3)' : 'var(--text)', fontWeight: c === '✓' ? 700 : 500 }}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
