import type { Severity, ConfidenceBasis } from '../types';

export const SEVERITY_META: Record<Severity, { label: string; color: string; soft: string; short: string }> = {
  contraindicated: { label: 'Contraindicated', color: 'var(--sev-crit)', soft: 'var(--sev-crit-soft)', short: 'STOP' },
  major: { label: 'Major', color: 'var(--sev-major)', soft: 'var(--sev-major-soft)', short: 'Major' },
  moderate: { label: 'Moderate', color: 'var(--sev-moderate)', soft: 'var(--sev-moderate-soft)', short: 'Mod' },
  minor: { label: 'Minor', color: 'var(--sev-minor)', soft: 'var(--sev-minor-soft)', short: 'Minor' },
  info: { label: 'Info', color: 'var(--sev-info)', soft: 'var(--sev-info-soft)', short: 'Info' },
};

export const BASIS_LABEL: Record<ConfidenceBasis, string> = {
  guideline: 'guideline',
  'landmark-trial': 'landmark trial',
  label: 'FDA label',
  cohort: 'cohort study',
  'case-series': 'case series',
  expert: 'expert consensus',
};

export function confidenceLabel(confidence: number, basis: ConfidenceBasis): string {
  const tier = confidence >= 0.85 ? 'High' : confidence >= 0.7 ? 'Medium' : 'Low';
  return `${tier} (${BASIS_LABEL[basis]})`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// MMDDYYYY per workspace convention, for handoff/print
export function fmtDateMMDDYYYY(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}${dd}${d.getFullYear()}`;
}

export function ageFromDob(dob: string): number {
  const d = new Date(dob);
  const now = new Date('2026-07-18T00:00:00');
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

export function relativeSnooze(until: number, now: number): string {
  const diff = until - now;
  if (diff <= 0) return 'expired';
  const h = Math.round(diff / 3600_000);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function scoreColor(score: number): string {
  if (score >= 70) return 'var(--sev-good)';
  if (score >= 50) return 'var(--sev-moderate)';
  return 'var(--sev-crit)';
}

export function riskColor(risk: number): string {
  if (risk >= 75) return 'var(--sev-crit)';
  if (risk >= 55) return 'var(--sev-major)';
  if (risk >= 35) return 'var(--sev-moderate)';
  return 'var(--sev-good)';
}
