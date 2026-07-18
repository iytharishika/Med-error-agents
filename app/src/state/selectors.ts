import type { Patient, Recommendation, RecStatus, WatchOut, ModuleKey, Specialty } from '../types';
import { SEVERITY_ORDER } from '../types';
import { runEngine, sortFindings } from '../engine/reasoner';
import { specialtyManages } from '../data/modules';
import type { SnoozeState } from './store';

export type Tier = 'critical' | 'actionable' | 'fyi';

export interface RecView extends Recommendation {
  status: RecStatus;
  snoozed: SnoozeState | null;
  managed: boolean;
  tier: Tier;
  lowConfidence: boolean;
}

export interface StoreSlice {
  recStatus: Record<string, RecStatus>;
  snoozes: Record<string, SnoozeState>;
  monitoringDone: Record<string, boolean>;
  showLowConfidence: boolean;
  specialty: Specialty;
}

export interface PatientView {
  all: RecView[];
  active: RecView[];
  topOfMind: RecView | null;
  critical: RecView[];
  actionable: RecView[];
  fyi: RecView[];
  benefits: RecView[];
  otherSpecialty: RecView[];
  snoozed: RecView[];
  handled: RecView[];
  hiddenLowConfidence: number;
  byModule: Partial<Record<ModuleKey, RecView[]>>;
  monitoring: { rec: RecView; watch: WatchOut }[];
  gdmtGaps: RecView[];
  duplicates: RecView[];
  deprescribe: RecView[];
  counts: {
    critical: number;
    recommendations: number;
    gdmt: number;
    monitoring: number;
    duplicates: number;
  };
}

export function tierOf(sev: Recommendation['severity']): Tier {
  if (sev === 'contraindicated' || sev === 'major') return 'critical';
  if (sev === 'moderate' || sev === 'minor') return 'actionable';
  return 'fyi';
}

// Combine engine output with curated seed recs, apply live state.
export function buildRecommendations(patient: Patient): Recommendation[] {
  const engine = runEngine(patient);
  const seedIds = new Set(patient.recommendations.map((r) => r.id));
  const merged = [...engine.filter((f) => !seedIds.has(f.id)), ...patient.recommendations];
  return sortFindings(merged);
}

export function buildPatientView(patient: Patient, slice: StoreSlice, now: number): PatientView {
  const recs = buildRecommendations(patient);

  const views: RecView[] = recs.map((r) => {
    const status = slice.recStatus[r.id] || 'pending';
    const sn = slice.snoozes[r.id];
    const snoozed = sn && sn.until > now ? sn : null;
    const managed = specialtyManages(slice.specialty, r.domain);
    return {
      ...r,
      status,
      snoozed,
      managed,
      tier: tierOf(r.severity),
      lowConfidence: r.confidence < 0.7,
    };
  });

  const confVisible = (r: RecView) => !r.lowConfidence || slice.showLowConfidence;
  const isPending = (r: RecView) => r.status === 'pending';

  // Active = pending, managed by current specialty, not snoozed, confidence-visible
  const active = views.filter((r) => isPending(r) && r.managed && !r.snoozed && confVisible(r) && !r.benefit);

  const critical = active.filter((r) => r.tier === 'critical');
  const actionable = active.filter((r) => r.tier === 'actionable');
  const fyi = active.filter((r) => r.tier === 'fyi');
  const benefits = views.filter((r) => r.benefit && r.managed && isPending(r) && !r.snoozed);

  const otherSpecialty = views.filter((r) => !r.managed && isPending(r) && !r.snoozed && !r.benefit);
  const snoozed = views.filter((r) => r.snoozed && isPending(r));
  const handled = views.filter((r) => r.status !== 'pending');

  const hiddenLowConfidence = views.filter(
    (r) => isPending(r) && r.managed && !r.snoozed && r.lowConfidence && !slice.showLowConfidence && !r.benefit,
  ).length;

  const topOfMind =
    [...critical, ...actionable].sort(
      (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || b.confidence - a.confidence,
    )[0] || null;

  const byModule: Partial<Record<ModuleKey, RecView[]>> = {};
  for (const r of views) {
    (byModule[r.module] ||= []).push(r);
  }

  const monitoring: { rec: RecView; watch: WatchOut }[] = [];
  for (const r of views) {
    if (r.status === 'dismissed') continue;
    for (const w of r.monitoring || []) monitoring.push({ rec: r, watch: w });
  }

  const gdmtGaps = views.filter((r) => r.module === 'gdmt' && !r.benefit);
  const duplicates = views.filter((r) => r.kind === 'duplicate');
  const deprescribe = views.filter(
    (r) => r.module === 'polypharmacy' || r.kind === 'beers' || r.kind === 'anticholinergic' || r.kind === 'duplicate',
  );

  return {
    all: views,
    active,
    topOfMind,
    critical,
    actionable,
    fyi,
    benefits,
    otherSpecialty,
    snoozed,
    handled,
    hiddenLowConfidence,
    byModule,
    monitoring,
    gdmtGaps,
    duplicates,
    deprescribe,
    counts: {
      critical: critical.length,
      recommendations: active.length,
      gdmt: gdmtGaps.filter((r) => isPending(r) && !r.snoozed).length,
      monitoring: monitoring.filter((m) => m.rec.status === 'pending').length,
      duplicates: duplicates.filter((r) => isPending(r)).length,
    },
  };
}
