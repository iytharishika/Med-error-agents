import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Logo, ThemeToggle } from '../../components/Brand';
import { Btn } from '../../components/primitives';
import { Icon } from '../../components/Icon';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/platform', label: 'Platform' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/providers', label: 'Provider Panel' },
];

export function MarketingLayout() {
  const loc = useLocation();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(12px)',
          background: 'color-mix(in srgb, var(--bg) 82%, transparent)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Logo />
          </Link>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 12 }} className="mkt-nav">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                style={({ isActive }) => ({
                  padding: '7px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none',
                  color: isActive ? 'var(--accent-strong)' : 'var(--text-2)',
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                })}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle />
            <Link to="/dashboard" style={{ textDecoration: 'none' }} key={loc.pathname}>
              <Btn variant="primary" icon="stethoscope">Open clinical demo</Btn>
            </Link>
          </div>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', marginTop: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
          <Logo size={24} />
          <span style={{ color: 'var(--text-3)', fontSize: 13, maxWidth: 480 }}>
            Kapsule AI — the medication operating system. Decision support for demonstration only; not a substitute for clinical judgment.
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, color: 'var(--text-3)', fontSize: 13 }}>
            <Link to="/platform" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Platform</Link>
            <Link to="/pricing" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Pricing</Link>
            <a href="#" style={{ color: 'var(--text-3)', textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              Admas Health <Icon name="external" size={12} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
