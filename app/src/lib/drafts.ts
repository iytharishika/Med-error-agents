import type { Patient } from '../types';
import type { RecView } from '../state/selectors';
import { ageFromDob, fmtDate } from './format';

// The signing clinician (name + credential). Used for order sign-off and the
// patient message signature, e.g. "Dan Foster, MD" or "Liza Dunn, RN".
export const SIGNER = { name: 'Dan Foster', title: 'MD' };
export const signerLine = () => `${SIGNER.name}, ${SIGNER.title}`;

const TODAY = '2026-07-18T12:00:00'; // noon avoids timezone off-by-one in fmtDate

// ---------------- draft clinical note (for the chart) ----------------
export function buildClinicalNote(patient: Patient, rec: RecView): string {
  const age = ageFromDob(patient.dob);
  const mon = (rec.monitoring || []).map((w) => `  • Monitor ${w.item} — ${w.timing}, ${w.frequency}.`).join('\n');
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
    `  • ${rec.orderDetail || rec.action}`,
    mon || null,
    '',
    `Clinical reasoning: ${rec.mechanism}`,
    rec.evidence?.length ? `Evidence: ${rec.evidence.join(', ')}.` : null,
    rec.counterEvidence ? `Note: ${rec.counterEvidence}` : null,
    '',
    'A pending order has been created and is awaiting signature.',
    '',
    signerLine(),
  ];
  return lines.filter((l) => l !== null).join('\n');
}

// ---------------- draft patient message (~10th-grade reading level) ----------------
const ACTION_PLAIN: Record<string, (med: string) => string> = {
  discontinue: (m) => `I would like you to stop taking ${m}.`,
  hold: (m) => `I would like you to pause ${m} for now.`,
  'reduce-dose': (m) => `I would like to lower your dose of ${m}.`,
  'increase-dose': (m) => `I would like to raise your dose of ${m} so it works better for you.`,
  switch: (m) => `I would like to switch ${m} to a safer medicine that works just as well.`,
  start: (m) => `I would like to add a new medicine${m ? `, ${m},` : ''} to your treatment.`,
  'add-monitoring': (m) => `I would like to keep a closer watch on how ${m} is affecting you.`,
  'add-lab': (m) => `I would like to order a lab test to check how ${m} is affecting you.`,
};

const WHY_PLAIN: Record<string, string> = {
  interaction: 'Two of your medicines can affect each other, and taking them together raises your chance of a harmful side effect.',
  supplement: 'One of your medicines and a supplement you take can affect each other, which raises your chance of side effects.',
  serotonin: 'A few of your medicines act on the same brain chemical, and together they can cause a reaction we want to avoid.',
  cns: 'Some of your medicines can make you very sleepy or slow your breathing when they are taken together.',
  qt: 'Some of your medicines can affect your heart’s rhythm, and taken together they raise that risk.',
  'drug-disease': 'Because of how your body is handling this medicine right now, this is not the safest choice for you.',
  dose: 'Based on your recent lab results, this dose is higher than what is safest for you right now.',
  renal: 'Because your kidneys are working more slowly right now, this medicine or dose is not the safest choice for you.',
  hepatic: 'Because of how your liver is working right now, this medicine or dose is not the safest choice for you.',
  duplicate: 'You are taking two medicines that do the same job, so you do not need to take both.',
  beers: 'This medicine can cause problems such as confusion, dizziness, or falls, and there are safer options.',
  anticholinergic: 'Together, some of your medicines can cause confusion, dry mouth, or trouble with balance, so I want to cut back.',
  'drug-disease-gdmt': 'Research shows this medicine can help protect your heart and kidneys, so I would like you to start it.',
  cost: 'There is a medicine that works just as well but costs much less, and I would like to switch you to it.',
};

export function buildPatientMessage(patient: Patient, rec: RecView): string {
  const first = patient.name.split(' ')[0];
  const med = rec.targetMed || rec.drugs[0] || 'this medicine';
  const action = ACTION_PLAIN[rec.orderAction || 'add-monitoring'] || ((m: string) => `I would like to review ${m}.`);

  let why: string;
  if (rec.benefit || (rec.module === 'gdmt' && rec.orderAction === 'start')) why = WHY_PLAIN['drug-disease-gdmt'];
  else why = WHY_PLAIN[rec.kind] || WHY_PLAIN[rec.module] || 'This change will make your medicines safer and help them work better for you.';

  const watch = (rec.monitoring && rec.monitoring[0])
    ? `To keep you safe, we will check your ${rec.monitoring[0].item.toLowerCase()} in about ${rec.monitoring[0].timing}.`
    : '';

  const lines: (string | null)[] = [
    `Dear ${first},`,
    '',
    `I reviewed your medicine list today, and I would like to make one change. ${action(med)}`,
    '',
    `Here is why: ${why}`,
    watch ? '' : null,
    watch || null,
    '',
    'Please keep taking your other medicines the same way unless I tell you otherwise. If you have any questions, or if you do not feel well, please call our office.',
    '',
    'Best regards,',
    signerLine(),
  ];
  return lines.filter((l) => l !== null).join('\n');
}
