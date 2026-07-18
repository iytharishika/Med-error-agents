import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
}

export function Menu({ trigger, items, align = 'left' }: { trigger: (open: () => void) => ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div
          className="pop-in"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', [align]: 0,
            background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10,
            boxShadow: 'var(--shadow-lg)', padding: 6, minWidth: 190, zIndex: 60,
          }}
        >
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => { it.onClick(); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                background: 'transparent', border: 'none', borderRadius: 7, padding: '8px 10px',
                fontSize: 13.5, fontWeight: 500, color: it.danger ? 'var(--sev-crit)' : 'var(--text)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
