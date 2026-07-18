import { useStore } from '../state/store';
import { Icon } from './Icon';

// Brand palette (fixed — identity colors, independent of the UI accent)
const ORANGE = '#f2921e';

// Path to the real logo asset. Drop the provided PNG at app/public/kapsule-logo.png
// and it renders intact (aspect-ratio preserved, never stretched). Until the file
// exists, the vector fallback below shows — silently, no console noise.
const LOGO_SRC = '/kapsule-logo.png';

// The Kapsule mark: renders the exact logo image when present (contain = no
// distortion), layered over a faithful vector fallback of the four-pill "k".
export function KapsuleMark({ size = 28 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="Kapsule AI"
      style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', inset: 0 }}>
        <FallbackMark size={size} />
      </span>
      <span
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url('${LOGO_SRC}')`,
          backgroundSize: 'contain', // preserves aspect ratio — no distortion
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      />
    </span>
  );
}

// Vector reproduction of the pill "k" — shown only if the PNG is absent.
function FallbackMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id="kapNavy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#31508f" />
          <stop offset="0.55" stopColor="#22356a" />
          <stop offset="1" stopColor="#16244c" />
        </linearGradient>
        <linearGradient id="kapOrange" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7ad3e" />
          <stop offset="1" stopColor="#df7b15" />
        </linearGradient>
      </defs>
      {/* pills with a light sticker outline */}
      <g stroke="#eef1f6" strokeWidth="2.2">
        <rect x="24.5" y="11" width="18.5" height="47" rx="9.25" fill="url(#kapNavy)" />
        <g transform="rotate(-42 64 42)"><rect x="42" y="32.6" width="44" height="18.6" rx="9.3" fill="url(#kapNavy)" /></g>
        <rect x="45.5" y="62.5" width="37.5" height="19.5" rx="9.75" fill="url(#kapNavy)" />
        <circle cx="34" cy="72.2" r="10.8" fill="url(#kapOrange)" />
      </g>
      {/* score lines */}
      <g stroke="#0e1c3d" strokeOpacity="0.4" strokeWidth="1" strokeLinecap="round">
        <line x1="25.5" y1="37" x2="41.5" y2="37" />
        <g transform="rotate(-42 64 42)"><line x1="64" y1="34.6" x2="64" y2="49" /></g>
        <line x1="64.2" y1="64.5" x2="64.2" y2="80" />
      </g>
      <line x1="27.6" y1="79.4" x2="40.6" y2="65.6" stroke="#a65c0c" strokeOpacity="0.5" strokeWidth="1.1" strokeLinecap="round" />
      {/* gloss */}
      <g fill="#ffffff" fillOpacity="0.16">
        <rect x="28" y="14.5" width="3.8" height="18" rx="1.9" />
        <g transform="rotate(-42 64 42)"><rect x="46" y="34.6" width="17" height="3.4" rx="1.7" /></g>
        <rect x="49" y="65" width="3.8" height="14.5" rx="1.9" />
      </g>
      <circle cx="30.2" cy="68.2" r="3.4" fill="#ffffff" fillOpacity="0.22" />
    </svg>
  );
}

export function Logo({ size = 28, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <KapsuleMark size={size} />
      {showText && (
        <span style={{ fontWeight: 800, fontSize: size * 0.62, letterSpacing: -0.4, color: 'var(--text)' }}>
          Kapsule<span style={{ color: ORANGE }}> AI</span>
        </span>
      )}
    </span>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useStore();
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label="Toggle theme"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 8, background: 'var(--surface-2)',
        border: '1px solid var(--border)', color: 'var(--text-2)',
      }}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}
