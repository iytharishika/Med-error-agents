import type { ModuleMeta, ModuleKey, SpecialtyConfig, Specialty, Domain } from '../types';

// The six reasoning agents (Prompt #1). Each finding is attributed to one.
export const MODULES: Record<ModuleKey, ModuleMeta> = {
  polypharmacy: {
    key: 'polypharmacy',
    label: 'Polypharmacy & Deprescribing',
    short: 'Deprescribe',
    accent: '--sev-major',
    blurb:
      'Finds potentially inappropriate meds, Beers/STOPP flags, anticholinergic burden, duplicates, and low-value chronic therapy — and proposes what to stop.',
  },
  gdmt: {
    key: 'gdmt',
    label: 'GDMT Optimization',
    short: 'GDMT',
    accent: '--sev-good',
    blurb:
      'Compares the regimen against guideline-directed medical therapy for HF, CKD, diabetes and ASCVD, surfacing missing evidence-based agents and under-titration.',
  },
  dose: {
    key: 'dose',
    label: 'Dose Intelligence',
    short: 'Dosing',
    accent: '--sev-info',
    blurb:
      'Checks every dose against renal function, hepatic function, age and weight — flagging contraindicated thresholds and required adjustments.',
  },
  risk: {
    key: 'risk',
    label: 'Risk Monitoring',
    short: 'Risk',
    accent: '--sev-crit',
    blurb:
      'Watches labs, QTc, potassium, renal trend and bleeding risk against the active regimen, and converts each into a concrete monitoring plan.',
  },
  interactions: {
    key: 'interactions',
    label: 'Drug & Supplement Interactions',
    short: 'Interactions',
    accent: '--sev-moderate',
    blurb:
      'Deterministic interaction engine covering drug–drug and drug–supplement pairs, cumulative burden and mechanism-level explanation.',
  },
  cost: {
    key: 'cost',
    label: 'Cost Optimization',
    short: 'Cost',
    accent: '--accent',
    blurb:
      'Identifies therapeutically equivalent, lower-cost or formulary-preferred alternatives without compromising the evidence base.',
  },
};

export const MODULE_LIST = Object.values(MODULES);

// Specialty visibility & ownership (Prompt #3).
// Primary care and pharmacy see everything; specialists see the domains
// they actually manage plus anything general.
export const SPECIALTIES: Record<Specialty, SpecialtyConfig> = {
  'primary-care': {
    key: 'primary-care',
    label: 'Primary Care',
    short: 'PCP',
    manages: 'all',
    blurb: 'Sees the whole medication picture across every organ system.',
  },
  cardiology: {
    key: 'cardiology',
    label: 'Cardiology',
    short: 'Cards',
    manages: ['cardiac', 'general'],
    blurb: 'Manages cardiovascular therapy — GDMT, rate/rhythm, lipids, antithrombotics.',
  },
  nephrology: {
    key: 'nephrology',
    label: 'Nephrology',
    short: 'Nephro',
    manages: ['renal', 'general'],
    blurb: 'Manages renal dosing, potassium, RAAS in CKD, and nephrotoxin avoidance.',
  },
  endocrinology: {
    key: 'endocrinology',
    label: 'Endocrinology',
    short: 'Endo',
    manages: ['endocrine', 'general'],
    blurb: 'Manages diabetes, thyroid and bone therapy.',
  },
  geriatrics: {
    key: 'geriatrics',
    label: 'Geriatrics',
    short: 'Geri',
    manages: ['geriatric', 'psych', 'neuro', 'general'],
    blurb: 'Focuses on Beers/STOPP, anticholinergic burden, falls and deprescribing.',
  },
  psychiatry: {
    key: 'psychiatry',
    label: 'Psychiatry',
    short: 'Psych',
    manages: ['psych', 'neuro', 'general'],
    blurb: 'Manages psychotropics, serotonergic and CNS-depressant burden.',
  },
  rheumatology: {
    key: 'rheumatology',
    label: 'Rheumatology',
    short: 'Rheum',
    manages: ['msk', 'general'],
    blurb: 'Manages DMARDs, NSAIDs, steroids and gout therapy.',
  },
  pharmacy: {
    key: 'pharmacy',
    label: 'Clinical Pharmacy',
    short: 'PharmD',
    manages: 'all',
    blurb: 'Reviews the entire regimen for safety, interactions and cost.',
  },
};

export const SPECIALTY_LIST = Object.values(SPECIALTIES);

export function specialtyManages(spec: Specialty, domain: Domain): boolean {
  const cfg = SPECIALTIES[spec];
  if (cfg.manages === 'all') return true;
  return cfg.manages.includes(domain);
}
