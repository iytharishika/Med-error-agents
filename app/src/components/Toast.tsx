import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Toast {
  id: number;
  message: string;
  detail?: string;
  undo?: () => void;
  kind?: 'default' | 'success' | 'warn' | 'critical';
}

interface ToastApi {
  toast: (t: Omit<Toast, 'id'>) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++idRef.current;
      setToasts((cur) => [...cur, { ...t, id }]);
      setTimeout(() => remove(id), 9000);
    },
    [remove],
  );

  const kindColor = (k?: Toast['kind']) =>
    k === 'critical' ? 'var(--sev-crit)' : k === 'warn' ? 'var(--sev-major)' : k === 'success' ? 'var(--sev-good)' : 'var(--accent)';

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="no-print" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className="slide-up"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--surface)', color: 'var(--text)',
              border: '1px solid var(--border-strong)', borderLeft: `3px solid ${kindColor(t.kind)}`,
              borderRadius: 10, padding: '10px 14px', boxShadow: 'var(--shadow-lg)', minWidth: 320, maxWidth: 520,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t.message}</div>
              {t.detail && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{t.detail}</div>}
            </div>
            {t.undo && (
              <button
                onClick={() => { t.undo?.(); remove(t.id); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 13, padding: '4px 8px' }}
              >
                Undo
              </button>
            )}
            <button onClick={() => remove(t.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', display: 'flex', padding: 4 }} aria-label="Dismiss">
              <Icon name="x" size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
