import type {
  ClassTag,
  Severity,
  FindingKind,
  ModuleKey,
  Domain,
  ConfidenceBasis,
  WatchType,
} from '../types';

// Context the rules reason over — built once per patient from the chart.
export interface RuleCtx {
  age: number;
  egfr: number | null;
  creatinine: number | null;
  k: number | null;
  hb: number | null;
  qtc: number | null;
  inr: number | null;
  sodium: number | null;
  sex: 'M' | 'F' | 'X';
  dxLabels: string[];
  hasDx: (kw: string) => boolean;
}

export interface WatchSeed {
  type: WatchType;
  item: string;
  timing: string;
  frequency: string;
  rationale: string;
  evidence?: string[];
}

// A curated pairwise interaction rule (drug–drug or drug–supplement).
export interface PairRule {
  id: string;
  a: ClassTag[]; // med must carry one of these tags…
  b: ClassTag[]; // …and a DISTINCT med one of these
  aIds?: string[]; // or match specific drug ids
  bIds?: string[];
  severity: Severity;
  kind: FindingKind;
  module: ModuleKey;
  domain: Domain;
  title: string;
  mechanism: string;
  action: string;
  monitoring?: WatchSeed[];
  evidence: string[];
  basis: ConfidenceBasis;
  confidence: number;
  gate?: (ctx: RuleCtx) => boolean; // emit only if true
  escalate?: (ctx: RuleCtx) => Severity | null; // context-driven severity bump
  note?: (ctx: RuleCtx) => string | null; // appends patient-specific rationale
  patientMessage?: string;
  counterEvidence?: string;
}

const K_WATCH: WatchSeed = {
  type: 'Lab',
  item: 'Potassium + creatinine',
  timing: '72 hours',
  frequency: 'then 1–2 weeks, then periodically',
  rationale: 'Detect hyperkalemia or renal decline after RAAS/MRA change.',
  evidence: ['RALES'],
};

const QT_WATCH: WatchSeed = {
  type: 'Lab',
  item: 'ECG (QTc) + electrolytes',
  timing: 'baseline',
  frequency: 'and 48–72 hours after starting/uptitrating',
  rationale: 'Stacked QT-prolonging drugs raise torsades risk; keep K⁺ >4.0, Mg²⁺ >2.0.',
  evidence: ['CredibleMeds QT list'],
};

export const PAIR_RULES: PairRule[] = [
  // ---------------- RAAS stacking / hyperkalemia ----------------
  {
    id: 'acei-arb',
    a: ['acei'], b: ['arb'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'Dual RAAS blockade (ACE inhibitor + ARB)',
    mechanism: 'Combined ACEi/ARB gives little added benefit while roughly doubling hyperkalemia, hypotension and acute kidney injury.',
    action: 'Discontinue one agent — retain the single best-indicated RAAS inhibitor.',
    monitoring: [K_WATCH],
    evidence: ['ONTARGET'], basis: 'landmark-trial', confidence: 0.95,
    note: (c) => (c.k != null ? `Current K⁺ ${c.k} mEq/L; eGFR ${c.egfr ?? '—'}.` : null),
  },
  {
    id: 'raas-mra',
    a: ['acei', 'arb', 'arni'], b: ['mra'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'RAAS inhibitor + MRA — hyperkalemia risk',
    mechanism: 'Both reduce potassium excretion; additive hyperkalemia, amplified by CKD.',
    action: 'Appropriate in HFrEF but monitor K⁺ closely; hold or reduce if K⁺ ≥5.5.',
    monitoring: [K_WATCH],
    evidence: ['RALES', 'EMPHASIS-HF'], basis: 'landmark-trial', confidence: 0.9,
    escalate: (c) => (c.k != null && c.k >= 5.0 ? 'major' : c.egfr != null && c.egfr < 30 ? 'major' : null),
    note: (c) => (c.k != null ? `K⁺ ${c.k} mEq/L, eGFR ${c.egfr ?? '—'} — ${c.k >= 5.0 ? 'already at/above 5.0; do not uptitrate.' : 'within range, continue surveillance.'}` : null),
  },
  {
    id: 'raas-potassium',
    a: ['acei', 'arb', 'arni', 'mra', 'k-sparing'], b: ['potassium'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'Potassium supplement with RAAS/MRA',
    mechanism: 'Exogenous potassium plus reduced renal excretion drives hyperkalemia.',
    action: 'Reassess need for potassium supplement; recheck K⁺ before continuing.',
    monitoring: [K_WATCH],
    evidence: ['2022 AHA/ACC/HFSA HF Guideline'], basis: 'guideline', confidence: 0.9,
    escalate: (c) => (c.k != null && c.k >= 5.0 ? 'contraindicated' : null),
    note: (c) => (c.k != null ? `K⁺ ${c.k} mEq/L.` : null),
  },
  {
    id: 'mra-potassium-dup',
    a: ['mra'], b: ['k-sparing'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'renal',
    title: 'Two potassium-sparing agents',
    mechanism: 'Additive potassium retention.',
    action: 'Avoid combining potassium-sparing diuretics unless K⁺ actively low.',
    evidence: ['2023 AGS Beers Criteria'], basis: 'guideline', confidence: 0.8,
  },

  // ---------------- NSAID / ACE / diuretic AKI ----------------
  {
    id: 'nsaid-raas',
    a: ['nsaid'], b: ['acei', 'arb', 'arni'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'renal',
    title: 'NSAID + RAAS inhibitor — AKI & hyperkalemia',
    mechanism: 'NSAIDs constrict the afferent arteriole while RAAS blockade dilates the efferent — GFR falls; both retain potassium.',
    action: 'Avoid the NSAID; use acetaminophen or topical therapy. If unavoidable, limit duration and recheck renal function.',
    monitoring: [K_WATCH],
    evidence: ['KDIGO 2024 CKD'], basis: 'guideline', confidence: 0.85,
    escalate: (c) => (c.egfr != null && c.egfr < 45 ? 'major' : null),
    note: (c) => (c.egfr != null ? `Baseline eGFR ${c.egfr}${c.egfr < 45 ? ' — reduced reserve, higher AKI risk.' : '.'}` : null),
  },
  {
    id: 'nsaid-diuretic',
    a: ['nsaid'], b: ['loop', 'thiazide', 'diuretic'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'renal',
    title: 'NSAID + diuretic — blunted diuresis & AKI',
    mechanism: 'NSAIDs impair renal prostaglandins, reducing diuretic efficacy and renal perfusion.',
    action: 'Avoid NSAID; if fluid-overloaded, this pairing worsens both BP control and renal function.',
    evidence: ['KDIGO 2024 CKD'], basis: 'guideline', confidence: 0.8,
  },

  // ---------------- Bleeding / antithrombotic ----------------
  {
    id: 'anticoag-antiplatelet',
    a: ['anticoagulant', 'doac', 'vka'], b: ['antiplatelet'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'Anticoagulant + antiplatelet — major bleeding',
    mechanism: 'Combined anticoagulation and platelet inhibition markedly increases GI and intracranial bleeding.',
    action: 'Confirm a defined indication and duration (e.g., recent PCI). Otherwise drop the antiplatelet; add PPI for gastroprotection.',
    monitoring: [{ type: 'Symptom', item: 'Bleeding signs (melena, bruising, drop in Hgb)', timing: 'ongoing', frequency: 'each visit', rationale: 'Combined therapy raises major bleeding risk.', evidence: ['AUGUSTUS'] }],
    evidence: ['AUGUSTUS'], basis: 'landmark-trial', confidence: 0.9,
    note: (c) => (c.hb != null && c.hb < 11 ? `Hgb ${c.hb} g/dL is already low — bleeding would be poorly tolerated.` : null),
  },
  {
    id: 'anticoag-nsaid',
    a: ['anticoagulant', 'doac', 'vka'], b: ['nsaid'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'Anticoagulant + NSAID — GI bleeding',
    mechanism: 'NSAIDs add antiplatelet effect and mucosal injury on top of anticoagulation.',
    action: 'Avoid NSAID; use acetaminophen. If essential, co-prescribe a PPI and shorten course.',
    evidence: ['FDA label — warfarin'], basis: 'label', confidence: 0.88,
  },
  {
    id: 'anticoag-ssri',
    a: ['anticoagulant', 'doac', 'vka'], b: ['ssri', 'snri'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'Anticoagulant + SSRI/SNRI — bleeding',
    mechanism: 'Serotonin reuptake inhibition impairs platelet aggregation, adding to anticoagulant bleeding risk.',
    action: 'Weigh benefit; consider a lower-bleeding-risk antidepressant (e.g., bupropion, mirtazapine) if depression treatment ongoing.',
    evidence: ['FDA label — warfarin'], basis: 'label', confidence: 0.7,
  },
  {
    id: 'antiplatelet-ssri',
    a: ['antiplatelet'], b: ['ssri', 'snri'],
    severity: 'minor', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'Antiplatelet + SSRI/SNRI — additive bleeding',
    mechanism: 'Serotonergic platelet effect adds to antiplatelet therapy.',
    action: 'Monitor for bruising/GI bleeding; consider gastroprotection.',
    evidence: ['FDA label — warfarin'], basis: 'label', confidence: 0.6,
  },
  {
    id: 'dual-anticoag',
    a: ['doac', 'vka'], b: ['doac', 'vka', 'anticoagulant'],
    severity: 'major', kind: 'duplicate', module: 'interactions', domain: 'heme',
    title: 'Two anticoagulants',
    mechanism: 'Overlapping anticoagulants (except brief transition) sharply raise bleeding risk with no added benefit.',
    action: 'Confirm this is not an unintended overlap; consolidate to a single agent.',
    evidence: ['2023 ACC/AHA AF Guideline'], basis: 'guideline', confidence: 0.85,
  },
  {
    id: 'anticoag-suppl-bleed',
    a: ['anticoagulant', 'doac', 'vka', 'antiplatelet'],
    b: [], bIds: ['ginkgo-biloba', 'garlic-extract', 'fish-oil', 'ginseng', 'turmeric-curcumin'],
    severity: 'moderate', kind: 'supplement', module: 'interactions', domain: 'heme',
    title: 'Antithrombotic + bleeding-risk supplement',
    mechanism: 'Ginkgo, high-dose fish oil, garlic and curcumin have antiplatelet activity that adds to prescribed antithrombotics.',
    action: 'Advise stopping the supplement; document in the med list — patients often omit these.',
    evidence: ['FDA label — warfarin'], basis: 'expert', confidence: 0.6,
  },

  // ---------------- QT prolongation ----------------
  {
    id: 'qt-qt',
    a: ['qt-prolonging'], b: ['qt-prolonging'],
    severity: 'major', kind: 'qt', module: 'risk', domain: 'cardiac',
    title: 'Two QT-prolonging drugs',
    mechanism: 'Additive delay of cardiac repolarization increases torsades de pointes risk, worsened by hypokalemia/hypomagnesemia.',
    action: 'Avoid the combination where possible; if required, obtain baseline and follow-up QTc and correct electrolytes.',
    monitoring: [QT_WATCH],
    evidence: ['CredibleMeds QT list'], basis: 'cohort', confidence: 0.82,
    escalate: (c) => (c.qtc != null && c.qtc >= 470 ? 'contraindicated' : c.k != null && c.k < 3.6 ? 'major' : null),
    note: (c) => (c.qtc != null ? `Baseline QTc ${c.qtc} ms${c.qtc >= 470 ? ' — already prolonged.' : '.'}` : null),
  },
  {
    id: 'qt-electrolyte',
    a: ['qt-prolonging'], b: ['loop', 'thiazide'],
    severity: 'moderate', kind: 'qt', module: 'risk', domain: 'cardiac',
    title: 'QT-prolonging drug + potassium-wasting diuretic',
    mechanism: 'Diuretic-induced hypokalemia/hypomagnesemia potentiates QT prolongation.',
    action: 'Keep K⁺ >4.0 and Mg²⁺ >2.0; monitor QTc.',
    monitoring: [QT_WATCH],
    evidence: ['CredibleMeds QT list'], basis: 'expert', confidence: 0.65,
  },

  // ---------------- CNS / respiratory depression ----------------
  {
    id: 'opioid-benzo',
    a: ['opioid'], b: ['benzodiazepine'],
    severity: 'major', kind: 'cns', module: 'risk', domain: 'neuro',
    title: 'Opioid + benzodiazepine — respiratory depression',
    mechanism: 'Additive CNS and respiratory depression; a leading cause of overdose death (FDA boxed warning).',
    action: 'Avoid co-prescribing. Taper one agent; if unavoidable, use lowest doses and prescribe naloxone.',
    monitoring: [{ type: 'Symptom', item: 'Sedation / respiratory rate', timing: 'ongoing', frequency: 'each visit', rationale: 'Additive respiratory depression risk.', evidence: ['Choosing Wisely — Benzodiazepines'] }],
    evidence: ['Choosing Wisely — Benzodiazepines'], basis: 'label', confidence: 0.92,
    escalate: (c) => (c.age >= 65 ? 'major' : null),
  },
  {
    id: 'opioid-zdrug',
    a: ['opioid'], b: ['z-drug'],
    severity: 'major', kind: 'cns', module: 'risk', domain: 'neuro',
    title: 'Opioid + Z-drug hypnotic — CNS depression',
    mechanism: 'Additive sedation and respiratory depression.',
    action: 'Avoid combination; address insomnia non-pharmacologically.',
    evidence: ['Choosing Wisely — Benzodiazepines'], basis: 'label', confidence: 0.85,
  },
  {
    id: 'opioid-gabapentinoid',
    a: ['opioid'], b: ['gabapentinoid'],
    severity: 'moderate', kind: 'cns', module: 'risk', domain: 'neuro',
    title: 'Opioid + gabapentinoid — respiratory depression',
    mechanism: 'Gabapentinoids potentiate opioid-related respiratory depression (FDA warning 2019).',
    action: 'Use lowest effective gabapentinoid dose; counsel on sedation; avoid in respiratory compromise.',
    evidence: ['FDA label — gabapentin'], basis: 'label', confidence: 0.75,
  },
  {
    id: 'benzo-gabapentinoid',
    a: ['benzodiazepine', 'z-drug'], b: ['gabapentinoid'],
    severity: 'moderate', kind: 'cns', module: 'risk', domain: 'neuro',
    title: 'Sedative-hypnotic + gabapentinoid',
    mechanism: 'Additive CNS depression and fall risk.',
    action: 'Consolidate sedating agents; reassess necessity.',
    evidence: ['2023 AGS Beers Criteria'], basis: 'guideline', confidence: 0.68,
  },

  // ---------------- CYP3A4 / P-gp ----------------
  {
    id: 'cyp3a4-statin',
    a: ['cyp3a4-inhibitor'], b: [], bIds: ['simvastatin', 'lovastatin'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'CYP3A4 inhibitor + simvastatin/lovastatin — myopathy',
    mechanism: 'CYP3A4 inhibition raises simvastatin/lovastatin levels, risking myopathy and rhabdomyolysis.',
    action: 'Switch to pravastatin, rosuvastatin or pitavastatin (not CYP3A4-dependent), or hold statin during a short inhibitor course.',
    evidence: ['FDA label — simvastatin'], basis: 'label', confidence: 0.9,
  },
  {
    id: 'statin-macrolide',
    a: [], aIds: ['simvastatin', 'lovastatin', 'atorvastatin'], b: [], bIds: ['clarithromycin', 'erythromycin'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'Statin + macrolide — rhabdomyolysis risk',
    mechanism: 'Clarithromycin/erythromycin inhibit CYP3A4, raising statin exposure.',
    action: 'Hold the statin during the macrolide course, or use azithromycin instead.',
    evidence: ['FDA label — simvastatin'], basis: 'label', confidence: 0.85,
  },
  {
    id: 'statin-fibrate',
    a: ['statin'], b: [], bIds: ['gemfibrozil'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'Statin + gemfibrozil — myopathy',
    mechanism: 'Gemfibrozil impairs statin glucuronidation, markedly increasing myopathy risk.',
    action: 'Use fenofibrate instead of gemfibrozil if a fibrate is required.',
    evidence: ['2018 AHA/ACC Cholesterol'], basis: 'guideline', confidence: 0.85,
  },
  {
    id: 'statin-azole',
    a: [], aIds: ['simvastatin', 'lovastatin', 'atorvastatin'], b: ['azole'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'Statin + azole antifungal',
    mechanism: 'Azoles inhibit CYP3A4, raising statin levels.',
    action: 'Hold statin during azole therapy or switch to pravastatin/rosuvastatin.',
    evidence: ['FDA label — simvastatin'], basis: 'label', confidence: 0.75,
  },
  {
    id: 'cyp3a4-doac',
    a: ['cyp3a4-inhibitor', 'pgp-inhibitor'], b: [], bIds: ['apixaban', 'rivaroxaban'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'CYP3A4/P-gp inhibitor + factor Xa DOAC',
    mechanism: 'Combined CYP3A4 and P-gp inhibition raises apixaban/rivaroxaban levels and bleeding risk.',
    action: 'Review dose; strong dual inhibitors warrant dose reduction or agent change.',
    evidence: ['ARISTOTLE'], basis: 'label', confidence: 0.72,
  },
  {
    id: 'pgp-dabigatran',
    a: ['pgp-inhibitor'], b: [], bIds: ['dabigatran'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'P-gp inhibitor + dabigatran',
    mechanism: 'P-gp inhibition raises dabigatran concentration; risk compounded in renal impairment.',
    action: 'Assess CrCl; avoid strong P-gp inhibitors or reduce dabigatran dose.',
    evidence: ['FDA label — dabigatran'], basis: 'label', confidence: 0.72,
  },
  {
    id: 'pgp-digoxin',
    a: ['pgp-inhibitor'], b: [], bIds: ['digoxin'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'P-gp inhibitor + digoxin — digoxin toxicity',
    mechanism: 'Amiodarone/verapamil/dronedarone/clarithromycin inhibit P-gp, raising digoxin levels 50–100%.',
    action: 'Reduce digoxin dose ~50% and check a digoxin level in 5–7 days.',
    monitoring: [{ type: 'Lab', item: 'Digoxin level + K⁺', timing: '5–7 days', frequency: 'after the interacting drug starts', rationale: 'P-gp inhibition raises digoxin concentration.', evidence: ['FDA label — digoxin'] }],
    evidence: ['FDA label — digoxin'], basis: 'label', confidence: 0.85,
  },
  {
    id: 'cyp3a4-inducer',
    a: ['cyp3a4-inducer'], b: ['doac', 'statin', 'ccb-dhp', 'antiarrhythmic'],
    severity: 'moderate', kind: 'supplement', module: 'interactions', domain: 'general',
    title: 'CYP3A4 inducer reduces partner drug efficacy',
    mechanism: 'St John’s Wort strongly induces CYP3A4/P-gp, lowering levels of many cardiac and anticoagulant drugs — risking treatment failure.',
    action: 'Stop St John’s Wort; re-evaluate anticoagulation/therapeutic effect.',
    evidence: ['FDA label — warfarin'], basis: 'label', confidence: 0.7,
  },

  // ---------------- Serotonin syndrome ----------------
  {
    id: 'maoi-serotonergic',
    a: ['maoi'], b: ['ssri', 'snri', 'tca', 'triptan', 'serotonergic'],
    severity: 'contraindicated', kind: 'serotonin', module: 'interactions', domain: 'psych',
    title: 'MAOI + serotonergic agent — serotonin syndrome',
    mechanism: 'MAO inhibition with any serotonergic drug can precipitate life-threatening serotonin syndrome.',
    action: 'Contraindicated. Observe a 2-week washout (5 weeks for fluoxetine).',
    evidence: ['FDA label — warfarin'], basis: 'label', confidence: 0.95,
  },
  {
    id: 'serotonin-pair',
    a: ['ssri', 'snri'], b: ['snri', 'tca', 'serotonergic'], bIds: ['tramadol', 'st-johns-wort'],
    severity: 'moderate', kind: 'serotonin', module: 'interactions', domain: 'psych',
    title: 'Two serotonergic agents — serotonin syndrome risk',
    mechanism: 'Additive serotonergic activity can cause clonus, hyperthermia and autonomic instability.',
    action: 'Minimize overlap; counsel on symptoms (agitation, tremor, diaphoresis, clonus).',
    evidence: ['FDA label — warfarin'], basis: 'expert', confidence: 0.7,
  },
  {
    id: 'ssri-triptan',
    a: ['ssri', 'snri'], b: ['triptan'],
    severity: 'minor', kind: 'serotonin', module: 'interactions', domain: 'psych',
    title: 'SSRI/SNRI + triptan',
    mechanism: 'Theoretical additive serotonergic effect; clinically low but real risk.',
    action: 'Counsel on serotonin syndrome symptoms; usually acceptable with monitoring.',
    evidence: ['FDA label — warfarin'], basis: 'case-series', confidence: 0.55,
    counterEvidence: 'Large reviews suggest the absolute risk is very low.',
  },
  {
    id: 'ssri-tramadol',
    a: ['ssri', 'snri'], b: [], bIds: ['tramadol'],
    severity: 'moderate', kind: 'serotonin', module: 'interactions', domain: 'psych',
    title: 'SSRI/SNRI + tramadol — serotonin & seizure',
    mechanism: 'Tramadol is serotonergic and lowers seizure threshold; adds to SSRI/SNRI effect.',
    action: 'Prefer a non-serotonergic analgesic; if used, keep tramadol dose low.',
    evidence: ['FDA label — warfarin'], basis: 'case-series', confidence: 0.65,
  },

  // ---------------- Hypoglycemia / dysglycemia ----------------
  {
    id: 'sulfonylurea-insulin',
    a: ['sulfonylurea'], b: ['insulin'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'endocrine',
    title: 'Sulfonylurea + insulin — hypoglycemia',
    mechanism: 'Two insulin-secretagogue/replacement therapies compound hypoglycemia risk, especially in CKD and older adults.',
    action: 'Consider stopping the sulfonylurea when insulin is titrated; simplify the regimen.',
    evidence: ['ADA Standards of Care 2025'], basis: 'guideline', confidence: 0.78,
    escalate: (c) => (c.age >= 65 || (c.egfr != null && c.egfr < 45) ? 'major' : null),
  },
  {
    id: 'bb-hypoglycemia',
    a: ['beta-blocker'], b: ['sulfonylurea', 'insulin'],
    severity: 'minor', kind: 'interaction', module: 'interactions', domain: 'endocrine',
    title: 'Beta-blocker masks hypoglycemia',
    mechanism: 'Beta-blockade blunts adrenergic warning symptoms of hypoglycemia.',
    action: 'Counsel patient; cardioselective agents preferred. Rarely a reason to stop a needed beta-blocker.',
    evidence: ['ADA Standards of Care 2025'], basis: 'expert', confidence: 0.5,
  },
  {
    id: 'sulfonylurea-fluoroquinolone',
    a: ['sulfonylurea'], b: ['fluoroquinolone'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'endocrine',
    title: 'Sulfonylurea + fluoroquinolone — dysglycemia',
    mechanism: 'Fluoroquinolones can cause both hypo- and hyperglycemia, exaggerated with sulfonylureas.',
    action: 'Monitor glucose closely during therapy; prefer an alternative antibiotic if suitable.',
    evidence: ['FDA DSC — QT fluoroquinolones'], basis: 'label', confidence: 0.6,
  },

  // ---------------- Digoxin toxicity ----------------
  {
    id: 'digoxin-diuretic',
    a: [], aIds: ['digoxin'], b: ['loop', 'thiazide'],
    severity: 'moderate', kind: 'interaction', module: 'risk', domain: 'cardiac',
    title: 'Digoxin + potassium-wasting diuretic',
    mechanism: 'Hypokalemia sensitizes the myocardium to digoxin, precipitating toxicity.',
    action: 'Keep K⁺ 4.0–5.0; monitor digoxin level and renal function.',
    monitoring: [{ type: 'Lab', item: 'Digoxin level, K⁺, Mg²⁺', timing: '1 week', frequency: 'and with dose changes', rationale: 'Hypokalemia potentiates digoxin toxicity.', evidence: ['FDA label — digoxin'] }],
    evidence: ['FDA label — digoxin'], basis: 'label', confidence: 0.72,
  },

  // ---------------- Warfarin-specific ----------------
  {
    id: 'warfarin-tmpsmx',
    a: [], aIds: ['warfarin'], b: [], bIds: ['trimethoprim-sulfamethoxazole'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'Warfarin + TMP-SMX — INR spike & bleeding',
    mechanism: 'TMP-SMX inhibits CYP2C9 and displaces warfarin, sharply raising INR.',
    action: 'Avoid if possible; choose an alternative antibiotic. If required, reduce warfarin dose and check INR in 3–5 days.',
    monitoring: [{ type: 'Lab', item: 'INR', timing: '3–5 days', frequency: 'during and after the antibiotic course', rationale: 'TMP-SMX potentiates warfarin.', evidence: ['FDA label — warfarin'] }],
    evidence: ['FDA label — warfarin'], basis: 'label', confidence: 0.9,
  },
  {
    id: 'warfarin-azole',
    a: [], aIds: ['warfarin'], b: ['azole'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'Warfarin + azole antifungal — elevated INR',
    mechanism: 'Azoles inhibit CYP2C9/3A4, raising warfarin exposure.',
    action: 'Reduce warfarin dose empirically and check INR within 3–5 days.',
    evidence: ['FDA label — warfarin'], basis: 'label', confidence: 0.82,
  },
  {
    id: 'warfarin-macrolide',
    a: [], aIds: ['warfarin'], b: ['macrolide'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'Warfarin + macrolide — elevated INR',
    mechanism: 'Clarithromycin/erythromycin inhibit warfarin metabolism.',
    action: 'Check INR during therapy; azithromycin interacts less.',
    evidence: ['FDA label — warfarin'], basis: 'label', confidence: 0.68,
  },
  {
    id: 'warfarin-amiodarone',
    a: [], aIds: ['warfarin'], b: [], bIds: ['amiodarone'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'heme',
    title: 'Warfarin + amiodarone — potentiation',
    mechanism: 'Amiodarone inhibits CYP2C9; warfarin effect rises over days–weeks.',
    action: 'Reduce warfarin dose ~30–50% and monitor INR closely for weeks.',
    evidence: ['FDA label — warfarin'], basis: 'label', confidence: 0.8,
  },

  // ---------------- Nitrate / PDE5 ----------------
  {
    id: 'nitrate-pde5',
    a: ['nitrate'], b: ['pde5'],
    severity: 'contraindicated', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'Nitrate + PDE5 inhibitor — fatal hypotension',
    mechanism: 'Both raise cGMP-mediated vasodilation; combination causes profound, potentially fatal hypotension.',
    action: 'Absolute contraindication. Separate nitrate and PDE5 use by the drug’s dosing interval (24h sildenafil, 48h tadalafil).',
    evidence: ['FDA label — sildenafil'], basis: 'label', confidence: 0.98,
  },

  // ---------------- Rate control combinations ----------------
  {
    id: 'bb-nondhp-ccb',
    a: ['beta-blocker'], b: ['ccb-nondhp'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'Beta-blocker + non-dihydropyridine CCB — bradycardia/heart block',
    mechanism: 'Verapamil/diltiazem plus beta-blockade additively depress AV conduction and contractility.',
    action: 'Avoid combination outside specialist supervision; monitor HR and for AV block.',
    monitoring: [{ type: 'Vital', item: 'Heart rate + ECG (PR interval)', timing: '1–2 weeks', frequency: 'after starting', rationale: 'Additive AV nodal blockade.', evidence: ['2023 ACC/AHA AF Guideline'] }],
    evidence: ['2023 ACC/AHA AF Guideline'], basis: 'guideline', confidence: 0.8,
  },
  {
    id: 'clonidine-bb',
    a: [], aIds: ['clonidine'], b: ['beta-blocker'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'Clonidine + beta-blocker — rebound hypertension',
    mechanism: 'Abrupt clonidine withdrawal on a beta-blocker can trigger severe rebound hypertension; also additive bradycardia.',
    action: 'Never stop clonidine abruptly; taper. Monitor HR/BP.',
    evidence: ['2019 ACC/AHA Primary Prevention'], basis: 'expert', confidence: 0.6,
  },

  // ---------------- Rheum / MTX ----------------
  {
    id: 'mtx-nsaid',
    a: [], aIds: ['methotrexate'], b: ['nsaid'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'msk',
    title: 'Methotrexate + NSAID — methotrexate toxicity',
    mechanism: 'NSAIDs reduce renal MTX clearance, raising levels — marrow and GI toxicity (dose-dependent).',
    action: 'Avoid high NSAID doses with MTX; monitor CBC, LFTs and renal function.',
    evidence: ['2023 AGS Beers Criteria'], basis: 'label', confidence: 0.7,
  },
  {
    id: 'mtx-tmpsmx',
    a: [], aIds: ['methotrexate'], b: [], bIds: ['trimethoprim-sulfamethoxazole'],
    severity: 'major', kind: 'interaction', module: 'interactions', domain: 'msk',
    title: 'Methotrexate + TMP-SMX — pancytopenia',
    mechanism: 'Additive antifolate effect risks severe myelosuppression.',
    action: 'Avoid this combination; choose a non-antifolate antibiotic.',
    evidence: ['2023 AGS Beers Criteria'], basis: 'label', confidence: 0.85,
  },

  // ---------------- GI ----------------
  {
    id: 'ppi-clopidogrel',
    a: [], aIds: ['omeprazole', 'esomeprazole'], b: [], bIds: ['clopidogrel'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'cardiac',
    title: 'Omeprazole/esomeprazole + clopidogrel',
    mechanism: 'These PPIs inhibit CYP2C19, reducing clopidogrel activation and antiplatelet effect.',
    action: 'Use pantoprazole if a PPI is needed with clopidogrel.',
    evidence: ['FDA label — simvastatin'], basis: 'label', confidence: 0.62,
    counterEvidence: 'Outcome data are mixed; pharmacologic effect is consistent.',
  },

  // ---------------- Absorption / supplements ----------------
  {
    id: 'levothyroxine-cation',
    a: [], aIds: ['levothyroxine'], b: [], bIds: ['calcium-carbonate', 'magnesium-oxide', 'iron', 'vitamin-d3'],
    severity: 'minor', kind: 'supplement', module: 'interactions', domain: 'endocrine',
    title: 'Levothyroxine + calcium/magnesium — reduced absorption',
    mechanism: 'Divalent cations chelate levothyroxine, lowering absorption and TSH control.',
    action: 'Separate administration by ≥4 hours.',
    evidence: ['ADA Standards of Care 2025'], basis: 'expert', confidence: 0.6,
  },
  {
    id: 'fluoroquinolone-cation',
    a: ['fluoroquinolone'], b: [], bIds: ['calcium-carbonate', 'magnesium-oxide'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'general',
    title: 'Fluoroquinolone + calcium/magnesium — chelation',
    mechanism: 'Cations chelate fluoroquinolones, dramatically reducing absorption and efficacy.',
    action: 'Separate by 2h before / 6h after the cation.',
    evidence: ['FDA DSC — QT fluoroquinolones'], basis: 'label', confidence: 0.7,
  },
  {
    id: 'spironolactone-tmpsmx',
    a: ['mra'], b: [], bIds: ['trimethoprim-sulfamethoxazole'],
    severity: 'moderate', kind: 'interaction', module: 'interactions', domain: 'renal',
    title: 'MRA + TMP-SMX — hyperkalemia',
    mechanism: 'Trimethoprim blocks distal potassium secretion, adding to MRA effect.',
    action: 'Avoid in older adults; if used, recheck K⁺ within days.',
    monitoring: [K_WATCH],
    evidence: ['2023 AGS Beers Criteria'], basis: 'cohort', confidence: 0.72,
    escalate: (c) => (c.age >= 65 ? 'major' : null),
  },
  {
    id: 'bisphosphonate-cation',
    a: ['bisphosphonate'], b: [], bIds: ['calcium-carbonate', 'magnesium-oxide'],
    severity: 'minor', kind: 'supplement', module: 'interactions', domain: 'endocrine',
    title: 'Bisphosphonate + calcium — reduced absorption',
    mechanism: 'Calcium binds oral bisphosphonate, preventing absorption.',
    action: 'Take bisphosphonate fasting; separate calcium by ≥30–60 min.',
    evidence: ['2023 AGS Beers Criteria'], basis: 'expert', confidence: 0.55,
  },
];
