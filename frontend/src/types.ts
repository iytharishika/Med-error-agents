// ============================================================
// Kapsule AI — domain types
// The single contract shared by data, engine, and UI.
// ============================================================

export type Severity =
  | 'contraindicated'
  | 'major'
  | 'moderate'
  | 'minor'
  | 'info';

export const SEVERITY_ORDER: Record<Severity, number> = {
  contraindicated: 5,
  major: 4,
  moderate: 3,
  minor: 2,
  info: 1,
};

// Health-score impact per severity (New Med Simulator + scoring)
export const SEVERITY_SCORE: Record<Severity, number> = {
  contraindicated: -15,
  major: -8,
  moderate: -4,
  minor: -1,
  info: 2,
};

// The 6 reasoning agents (Prompt #1). Each finding is produced by one.
export type ModuleKey =
  | 'polypharmacy' // deprescribing / Beers / anticholinergic burden
  | 'gdmt' // guideline-directed medical therapy optimization
  | 'dose' // dose intelligence (renal/hepatic/age)
  | 'risk' // risk monitoring (labs, QT, K, bleeding)
  | 'interactions' // drug–drug and drug–supplement
  | 'cost'; // cost / formulary optimization

export interface ModuleMeta {
  key: ModuleKey;
  label: string;
  short: string;
  accent: string; // css var name
  blurb: string;
}

export type FindingKind =
  | 'interaction'
  | 'drug-disease'
  | 'duplicate'
  | 'renal'
  | 'hepatic'
  | 'beers'
  | 'qt'
  | 'anticholinergic'
  | 'cns'
  | 'serotonin'
  | 'indication' // positive / benefit
  | 'dose'
  | 'monitoring'
  | 'supplement'
  | 'cost';

// Clinical domain → drives specialty visibility & ownership
export type Domain =
  | 'cardiac'
  | 'renal'
  | 'endocrine'
  | 'psych'
  | 'neuro'
  | 'gi'
  | 'heme'
  | 'pulm'
  | 'msk'
  | 'geriatric'
  | 'general';

export type Specialty =
  | 'primary-care'
  | 'cardiology'
  | 'nephrology'
  | 'endocrinology'
  | 'geriatrics'
  | 'psychiatry'
  | 'rheumatology'
  | 'pharmacy';

export interface SpecialtyConfig {
  key: Specialty;
  label: string;
  short: string;
  // Domains this specialty actively manages. Empty ⇒ sees everything (primary care / pharmacy).
  manages: Domain[] | 'all';
  blurb: string;
}

// Confidence basis — plain-English, per Prompt #2 trust section
export type ConfidenceBasis =
  | 'guideline'
  | 'landmark-trial'
  | 'label' // FDA labeling / boxed warning
  | 'cohort'
  | 'case-series'
  | 'expert';

export interface EvidenceLabel {
  label: string;
}

export type WatchType = 'Lab' | 'Vital' | 'Symptom' | 'Medication';

export interface WatchOut {
  id: string;
  type: WatchType;
  item: string;
  timing: string; // e.g. "72 hours"
  frequency: string; // e.g. "then q2 weeks"
  rationale: string;
  evidence: string[];
}

// A finding is the atomic output of the reasoning engine.
export interface Finding {
  id: string;
  module: ModuleKey;
  kind: FindingKind;
  severity: Severity;
  benefit?: boolean; // positive indication (adds to score)
  domain: Domain;
  title: string; // "finding"
  rationale: string; // patient-specific, cites actual chart values
  mechanism: string;
  action: string; // recommended action (verb-first)
  patientMessage?: string; // 6th-grade reading level, for Share-with-patient
  monitoring?: WatchOut[];
  evidence: string[]; // keys into the evidence resolver
  drugs: string[]; // drug ids or names involved
  confidence: number; // 0..1
  basis: ConfidenceBasis;
  counterEvidence?: string; // "2 studies disagree" style
  // The specific active med this recommendation would modify (for EHR order draft)
  targetMed?: string;
  orderAction?: OrderActionType;
  orderDetail?: string; // e.g. "Reduce to 5 mg daily"
}

export type OrderActionType =
  | 'discontinue'
  | 'reduce-dose'
  | 'increase-dose'
  | 'hold'
  | 'start'
  | 'switch'
  | 'add-lab'
  | 'add-monitoring';

// A precomputed recommendation attached to a patient.
export type RecStatus = 'pending' | 'accepted' | 'deferred' | 'dismissed';

export interface Recommendation extends Finding {
  status?: RecStatus; // runtime; default pending
}

// ---------------- Drug library ----------------

export type ClassTag =
  | 'raas'
  | 'acei'
  | 'arb'
  | 'arni'
  | 'mra'
  | 'beta-blocker'
  | 'ccb-dhp'
  | 'ccb-nondhp'
  | 'thiazide'
  | 'loop'
  | 'k-sparing'
  | 'sglt2'
  | 'glp1'
  | 'dpp4'
  | 'sulfonylurea'
  | 'biguanide'
  | 'insulin'
  | 'statin'
  | 'fibrate'
  | 'anticoagulant'
  | 'doac'
  | 'vka'
  | 'antiplatelet'
  | 'nsaid'
  | 'opioid'
  | 'benzodiazepine'
  | 'z-drug'
  | 'ssri'
  | 'snri'
  | 'tca'
  | 'maoi'
  | 'antipsychotic'
  | 'anticholinergic'
  | 'antihistamine-1g'
  | 'ppi'
  | 'h2ra'
  | 'macrolide'
  | 'fluoroquinolone'
  | 'azole'
  | 'triptan'
  | 'gabapentinoid'
  | 'digoxin'
  | 'nitrate'
  | 'pde5'
  | 'diuretic'
  | 'antiarrhythmic'
  | 'qt-prolonging'
  | 'cns-depressant'
  | 'serotonergic'
  | 'cyp3a4-inhibitor'
  | 'cyp3a4-inducer'
  | 'pgp-inhibitor'
  | 'bisphosphonate'
  | 'levothyroxine'
  | 'supplement'
  | 'potassium'
  | 'nephrotoxin'
  | 'antidiabetic'
  | 'corticosteroid'
  | 'other';

export interface DrugMonitoring {
  labs?: string[];
  cadence?: string;
}

export interface Drug {
  id: string;
  generic: string;
  brand: string[];
  drugClass: string;
  classTags: ClassTag[];
  typicalDose: string;
  renal: string; // renal guidance
  hepatic: string; // hepatic guidance
  pregnancy: string;
  lactation: string;
  monitoring: string; // monitoring defaults
  boxedWarning?: string;
  beers?: string; // Beers Criteria flag text (older adults)
  anticholinergicBurden?: 0 | 1 | 2 | 3; // ACB score
  qtRisk?: 'known' | 'possible' | 'conditional';
  evidence?: string[];
}

// ---------------- Patient chart ----------------

export interface Allergy {
  substance: string;
  reaction: string;
  severity: 'mild' | 'moderate' | 'severe';
}

export interface ActiveMed {
  id: string; // references Drug.id when possible
  name: string; // display (generic)
  dose: string;
  route?: string;
  frequency: string;
  startDate: string; // ISO
  drugClass: string;
  classTags: ClassTag[];
  riskFlag?: string;
  prescriber?: string;
}

export type LabTrend = 'up' | 'down' | 'flat';
export type LabTone = 'critical' | 'warn' | 'normal' | 'good';

export interface Lab {
  name: string;
  value: number | string;
  unit: string;
  date: string;
  trend?: LabTrend;
  tone?: LabTone;
  ref?: string; // reference range
  source?: string; // provenance, e.g. "Quest"
}

export interface RenalPoint {
  date: string;
  eGFR: number;
  creatinine: number;
}

export interface Diagnosis {
  code: string; // ICD-10
  label: string;
  since?: string;
  domain: Domain;
}

export interface CareTeamMember {
  name: string;
  role: string;
  specialty: Specialty;
}

export type TimelineType = 'med' | 'lab' | 'visit' | 'alert';
export type TimelineSubtype =
  | 'start'
  | 'stop'
  | 'hold'
  | 'dose-change'
  | 'result'
  | 'visit'
  | 'alert';

export interface TimelineEvent {
  id: string;
  date: string;
  type: TimelineType;
  subtype: TimelineSubtype;
  title: string;
  detail?: string;
  reason?: string; // in parentheses in UI
  by?: string; // "Mike Daniels, MD"
  medName?: string;
  riskLevel?: Severity;
  source?: string; // traceable to source
}

export interface HealthFactor {
  label: string;
  impact: number; // negative hurts, positive helps
  detail: string;
}

export interface Patient {
  id: string;
  name: string;
  mrn: string;
  dob: string;
  gender: 'M' | 'F' | 'X';
  pcp: string;
  careTeam: CareTeamMember[];
  diagnoses: Diagnosis[];
  allergies: Allergy[];
  meds: ActiveMed[];
  labs: Lab[];
  renalHistory: RenalPoint[];
  vitals: Lab[];
  healthScore: number; // 0..100 (higher = safer regimen)
  riskScore: number; // 0..100 (higher = more risk)
  gdmtGap: number; // 0..100 (higher = bigger gap)
  scoreTrend30d: number; // delta over 30 days
  healthFactors: HealthFactor[];
  timeline: TimelineEvent[];
  recommendations: Recommendation[];
  summary: string; // one-liner clinical summary
}

// ---------------- EHR order queue (Prompt #3) ----------------

export type OrderStatus = 'pending-review' | 'signed' | 'canceled';

export interface DraftOrder {
  id: string;
  patientId: string;
  recId: string;
  createdAt: number;
  status: OrderStatus;
  actionType: OrderActionType;
  targetMed: string;
  detail: string; // human summary of the change
  orderText: string; // pre-filled order-entry text
  severity: Severity;
  module: ModuleKey;
  signedBy?: string;
  clinicalNote?: string; // draft chart note documenting the change
  patientMessage?: string; // draft patient-facing message (~10th grade), signed
}

// ---------------- Simulator ----------------

export interface SimCandidate {
  drugId: string;
  name: string;
}

export interface SimResult {
  candidate: SimCandidate;
  overall: Severity;
  findings: Finding[];
}
