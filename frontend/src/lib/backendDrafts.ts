// ============================================================
// Draft a clinical note + 10th-grade patient message from a *backend*
// recommendation, mirroring the app's own lib/drafts.ts style and signature.
// ============================================================
import type { Patient, OrderActionType, ModuleKey, Severity } from '../types';
import { ageFromDob, fmtDate } from './format';
import { signerLine } from './drafts';
import type { BackendRec, BackendTier } from './kapsuleApi';

const TODAY = '2026-07-18T12:00:00';

const TIER_TO_SEVERITY: Record<BackendTier, Severity> = {
  critical: 'contraindicated', high: 'major', moderate: 'moderate', low: 'minor', info: 'info',
};

const AGENT_TO_MODULE: Record<string, ModuleKey> = {
  deterministic_engine: 'interactions',
  polypharmacy: 'polypharmacy',
  gdmt_optimization: 'gdmt',
  dose_intelligence: 'dose',
  risk_monitoring: 'risk',
  drug_supplement: 'interactions',
  cost_optimization: 'cost',
};

/** Backend action verb -> the app's OrderActionType. */
export function orderActionFor(rec: BackendRec): OrderActionType {
  const t = `${rec.title} ${rec.rationale}`.toLowerCase();
  switch (rec.action) {
    case 'stop':
      return t.includes('hold') || t.includes('pause') ? 'hold' : 'discontinue';
    case 'start':
      return 'start';
    case 'substitute':
      return 'switch';
    case 'adjust_dose':
      return /increase|intensif|uptitrate|up-titrate|high-intensity|escalat|raise/.test(t)
        ? 'increase-dose'
        : 'reduce-dose';
    case 'monitor':
      return 'add-monitoring';
    default:
      return 'add-monitoring';
  }
}

/** A medication change is one that alters a specific drug order. */
export function isMedChange(rec: BackendRec): boolean {
  return (
    ['stop', 'start', 'substitute', 'adjust_dose'].includes(rec.action) &&
    !!rec.order_target
  );
}

export function severityFor(rec: BackendRec): Severity {
  return TIER_TO_SEVERITY[rec.tier];
}

export function moduleFor(rec: BackendRec): ModuleKey {
  return AGENT_TO_MODULE[rec.agent] || 'interactions';
}

const ACTION_ORDER_VERB: Record<OrderActionType, string> = {
  discontinue: 'Discontinue', 'reduce-dose': 'Reduce dose', 'increase-dose': 'Increase dose',
  hold: 'Hold', start: 'Start', switch: 'Switch', 'add-lab': 'Order lab', 'add-monitoring': 'Add monitoring',
};

export function orderTextFor(rec: BackendRec): string {
  const verb = ACTION_ORDER_VERB[orderActionFor(rec)];
  const med = rec.order_target || '';
  return `${verb}${med ? ` — ${med}` : ''}\n${rec.title}\n\nIndication: ${rec.rationale}\nKapsule AI recommendation (${rec.agent}). Pending clinician review.`;
}

// ---------------- clinical note (chart) ----------------
export function buildClinicalNote(patient: Patient, rec: BackendRec): string {
  const age = ageFromDob(patient.dob);
  const evidence = rec.evidence.map((e) => e.source).filter(Boolean);
  const lines: (string | null)[] = [
    'CLINICAL NOTE — Medication change (draft)',
    '',
    `Patient: ${patient.name} · ${age}${patient.gender} · MRN ${patient.mrn}`,
    `Date: ${fmtDate(TODAY)}`,
    `Provider: ${signerLine()}`,
    '',
    'Assessment:',
    `${rec.title}. ${rec.rationale}`,
    '',
    'Plan:',
    `  • ${ACTION_ORDER_VERB[orderActionFor(rec)]}${rec.order_target ? ` — ${rec.order_target}` : ''}`,
    '',
    evidence.length ? `Evidence: ${evidence.join(', ')}.` : null,
    '',
    'A pending order has been created and is awaiting signature.',
    '',
    signerLine(),
  ];
  return lines.filter((l) => l !== null).join('\n');
}

// ---------------- patient message (~10th-grade reading level) ----------------
function actionSentence(action: OrderActionType, med: string): string {
  switch (action) {
    case 'discontinue': return `I would like you to stop taking ${med}.`;
    case 'hold': return `I would like you to pause ${med} for now.`;
    case 'reduce-dose': return `I would like to lower your dose of ${med}.`;
    case 'increase-dose': return `I would like to raise your dose of ${med} so it works better for you.`;
    case 'switch': return `I would like to switch ${med} to a medicine that works just as well and is a better fit for you.`;
    case 'start': return `I would like to add a new medicine, ${med}, to your treatment.`;
    default: return `I would like to keep a closer watch on ${med}.`;
  }
}

function whySentence(rec: BackendRec): string {
  const a = rec.agent;
  if (a === 'gdmt_optimization' && rec.action === 'start')
    return 'Research shows this medicine can help protect your heart and kidneys, so I would like you to start it.';
  if (a === 'cost_optimization')
    return 'There is a medicine that works just as well but costs less, and I would like to switch you to it.';
  if (a === 'drug_supplement' || a === 'deterministic_engine')
    return 'Some of your medicines can affect each other, and taking them together raises your chance of a harmful side effect.';
  if (a === 'dose_intelligence')
    return 'Based on your recent lab results, this dose is not the safest choice for you right now.';
  if (a === 'risk_monitoring')
    return 'This helps us catch any side effect early and keep you safe.';
  return 'This change will make your medicines safer and help them work better for you.';
}

export function buildPatientMessage(patient: Patient, rec: BackendRec): string {
  const first = patient.name.split(' ')[0];
  const med = rec.order_target || 'this medicine';
  const lines: (string | null)[] = [
    `Dear ${first},`,
    '',
    `I reviewed your medicine list today, and I would like to make one change. ${actionSentence(orderActionFor(rec), med)}`,
    '',
    `Here is why: ${whySentence(rec)}`,
    '',
    'Please keep taking your other medicines the same way unless I tell you otherwise. If you have any questions, or if you do not feel well, please call our office.',
    '',
    'Best regards,',
    signerLine(),
  ];
  return lines.filter((l) => l !== null).join('\n');
}
