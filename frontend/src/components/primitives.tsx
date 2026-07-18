import type { ReactNode, CSSProperties } from 'react';
import type { Severity, ConfidenceBasis } from '../types';
import { SEVERITY_META, confidenceLabel } from '../lib/format';
import { resolveEvidence } from '../data/evidence';
import { Icon } from './Icon';

export function SeverityDot({ severity, pulse = false }: { severity: Severity; pulse?: boolean }) {
  const m = SEVERITY_META[severity];
  return (
    <span
      className={pulse && severity === 'contraindicated' ? 'pulse-crit' : ''}
      style={{ width: 9, height: 9, borderRadius: 9, background: m.color, display: 'inline-block', flexShrink: 0 }}
    />
  );
}

export function SeverityBadge({ severity, small = false }: { severity: Severity; small?: boolean }) {
  const m = SEVERITY_META[severity];
  const crit = severity === 'contraindicated';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: m.soft, color: m.color,
        border: `1px solid ${m.color}33`,
        borderRadius: 6, padding: small ? '1px 7px' : '3px 9px',
        fontSize: small ? 11 : 12, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap',
      }}
    >
      {(crit || severity === 'major') && <Icon name="alert" size={small ? 11 : 12} />}
      {m.label}
    </span>
  );
}

export function Chip({
  children, tone = 'neutral', icon, onClick, active, style, title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'crit' | 'good' | 'warn';
  icon?: string;
  onClick?: () => void;
  active?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const tones: Record<string, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: 'var(--surface-2)', fg: 'var(--text-2)', bd: 'var(--border)' },
    accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-strong)', bd: 'transparent' },
    crit: { bg: 'var(--sev-crit-soft)', fg: 'var(--sev-crit)', bd: 'transparent' },
    good: { bg: 'var(--sev-good-soft)', fg: 'var(--sev-good)', bd: 'transparent' },
    warn: { bg: 'var(--sev-major-soft)', fg: 'var(--sev-major)', bd: 'transparent' },
  };
  const t = tones[tone];
  const Comp: any = onClick ? 'button' : 'span';
  return (
    <Comp
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: active ? t.fg : t.bg, color: active ? '#fff' : t.fg,
        border: `1px solid ${active ? t.fg : t.bd}`,
        borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default', ...style,
      }}
    >
      {icon && <Icon name={icon} size={12.5} />}
      {children}
    </Comp>
  );
}

export function EvidenceChip({ label }: { label: string }) {
  const e = resolveEvidence(label);
  return (
    <a
      href={e.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${e.kind} · ${e.detail}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'var(--surface-2)', color: 'var(--text-2)',
        border: '1px solid var(--border)', borderRadius: 6,
        padding: '2px 7px', fontSize: 11.5, fontWeight: 600, textDecoration: 'none',
      }}
    >
      {label}
      <Icon name="external" size={11} />
    </a>
  );
}

export function ConfidenceBadge({ confidence, basis }: { confidence: number; basis: ConfidenceBasis }) {
  const tier = confidence >= 0.85 ? 'good' : confidence >= 0.7 ? 'warn' : 'neutral';
  const color = tier === 'good' ? 'var(--sev-good)' : tier === 'warn' ? 'var(--sev-moderate)' : 'var(--text-3)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color }}>
      <Icon name="shield" size={12} />
      {confidenceLabel(confidence, basis)}
    </span>
  );
}

export function Card({ children, style, className, onClick }: { children: ReactNode; style?: CSSProperties; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: 'var(--shadow-sm)', ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Btn({
  children, onClick, variant = 'ghost', size = 'md', icon, disabled, style, title, accent,
}: {
  children?: ReactNode;
  onClick?: (e: any) => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'soft';
  size?: 'sm' | 'md';
  icon?: string;
  disabled?: boolean;
  style?: CSSProperties;
  title?: string;
  accent?: string;
}) {
  const pad = size === 'sm' ? '5px 10px' : '8px 14px';
  const fs = size === 'sm' ? 12.5 : 13.5;
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 8, padding: pad, fontSize: fs, fontWeight: 600, border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
    minHeight: size === 'sm' ? 30 : 38,
  };
  const variants: Record<string, CSSProperties> = {
    primary: { background: accent || 'var(--accent)', color: 'var(--accent-contrast)' },
    danger: { background: 'var(--sev-crit)', color: '#fff' },
    soft: { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)' },
  };
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{ ...base, ...variants[variant], ...style }}>
      {icon && <Icon name={icon} size={fs} />}
      {children}
    </button>
  );
}

export function Trend({ trend, size = 13 }: { trend?: 'up' | 'down' | 'flat'; size?: number }) {
  if (!trend || trend === 'flat') return <span style={{ color: 'var(--text-3)', fontSize: size }}>→</span>;
  return (
    <Icon name={trend === 'up' ? 'arrowUp' : 'arrowDown'} size={size} style={{ color: 'var(--text-3)' }} />
  );
}
