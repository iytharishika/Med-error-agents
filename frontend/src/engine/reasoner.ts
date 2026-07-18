import type {
  Patient,
  Finding,
  ClassTag,
  Severity,
  Drug,
  ActiveMed,
  Domain,
} from '../types';
import { SEVERITY_ORDER, SEVERITY_SCORE } from '../types';
import { DRUGS } from '../data/drugs';
import { PAIR_RULES, type RuleCtx } from './rules';

// ---------------- indices ----------------
const DRUG_BY_ID = new Map<string, Drug>(DRUGS.map((d) => [d.id, d]));

export function getDrug(id: string): Drug | undefined {
  return DRUG_BY_ID.get(id);
}

interface EngineMed {
  id: string;
  name: string;
  classTags: ClassTag[];
  simulated: boolean;
  acb: number;
  qtRisk?: 'known' | 'possible' | 'conditional';
  beers?: string;
  dose?: string;
}

function enrichActive(med: ActiveMed): EngineMed {
  const d = DRUG_BY_ID.get(med.id);
  const tags = new Set<ClassTag>([...(med.classTags || []), ...((d?.classTags as ClassTag[]) || [])]);
  return {
    id: med.id,
    name: med.name,
    classTags: [...tags],
    simulated: false,
    acb: d?.anticholinergicBurden ?? 0,
    qtRisk: d?.qtRisk,
    beers: d?.beers,
    dose: med.dose,
  };
}

function enrichCandidate(id: string): EngineMed | null {
  const d = DRUG_BY_ID.get(id);
  if (!d) return null;
  return {
    id: d.id,
    name: d.generic,
    classTags: d.classTags as ClassTag[],
    simulated: true,
    acb: d.anticholinergicBurden ?? 0,
    qtRisk: d.qtRisk,
    beers: d.beers,
    dose: d.typicalDose,
  };
}

// ---------------- context ----------------
function labVal(patient: Patient, names: string[]): number | null {
  for (const n of names) {
    const l = [...patient.labs, ...patient.vitals].find(
      (x) => x.name.toLowerCase() === n.toLowerCase(),
    );
    if (l && typeof l.value === 'number') return l.value;
  }
  return null;
}

export function ageOf(patient: Patient): number {
  const dob = new Date(patient.dob);
  const now = new Date('2026-07-18T00:00:00');
  let a = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) a--;
  return a;
}

export function latestEgfr(patient: Patient): number | null {
  if (patient.renalHistory.length) return patient.renalHistory[patient.renalHistory.length - 1].eGFR;
  return labVal(patient, ['eGFR']);
}

export function buildCtx(patient: Patient): RuleCtx {
  const dxLabels = patient.diagnoses.map((d) => d.label.toLowerCase());
  const egfr = latestEgfr(patient);
  return {
    age: ageOf(patient),
    egfr,
    creatinine: patient.renalHistory.length
      ? patient.renalHistory[patient.renalHistory.length - 1].creatinine
      : labVal(patient, ['Creatinine']),
    k: labVal(patient, ['Potassium', 'K']),
    hb: labVal(patient, ['Hemoglobin', 'Hgb']),
    qtc: labVal(patient, ['QTc']),
    inr: labVal(patient, ['INR']),
    sodium: labVal(patient, ['Sodium', 'Na']),
    sex: patient.gender,
    dxLabels,
    hasDx: (kw: string) => dxLabels.some((l) => l.includes(kw.toLowerCase())),
  };
}

// ---------------- helpers ----------------
const hasTag = (m: EngineMed, tags: ClassTag[]) => tags.some((t) => m.classTags.includes(t));
const uniq = (arr: string[]) => [...new Set(arr)];

function matches(m: EngineMed, tags: ClassTag[], ids?: string[]): boolean {
  if (ids && ids.includes(m.id)) return true;
  if (tags.length && hasTag(m, tags)) return true;
  return false;
}

// ---------------- pairwise interactions ----------------
function runPairRules(meds: EngineMed[], ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  for (const rule of PAIR_RULES) {
    for (let i = 0; i < meds.length; i++) {
      for (let j = 0; j < meds.length; j++) {
        if (i === j) continue;
        const A = meds[i];
        const B = meds[j];
        if (!matches(A, rule.a, rule.aIds)) continue;
        if (!matches(B, rule.b, rule.bIds)) continue;
        // avoid double emit for symmetric rules: only emit i<j when both sides could match either
        const symmetric =
          matches(B, rule.a, rule.aIds) && matches(A, rule.b, rule.bIds);
        if (symmetric && i > j) continue;
        if (rule.gate && !rule.gate(ctx)) continue;

        let severity: Severity = rule.severity;
        if (rule.escalate) {
          const esc = rule.escalate(ctx);
          if (esc && SEVERITY_ORDER[esc] > SEVERITY_ORDER[severity]) severity = esc;
        }
        const note = rule.note ? rule.note(ctx) : null;
        out.push({
          id: `${rule.id}:${A.id}+${B.id}`,
          module: rule.module,
          kind: rule.kind,
          severity,
          domain: rule.domain,
          title: rule.title,
          rationale: `${A.name} + ${B.name}. ${note ? note + ' ' : ''}${rule.mechanism}`,
          mechanism: rule.mechanism,
          action: rule.action,
          monitoring: rule.monitoring?.map((w, k) => ({
            id: `${rule.id}-w${k}:${A.id}`,
            ...w,
            evidence: w.evidence || rule.evidence,
          })),
          evidence: uniq(rule.evidence),
          drugs: [A.name, B.name],
          confidence: rule.confidence,
          basis: rule.basis,
          patientMessage: rule.patientMessage,
          targetMed: B.simulated ? B.name : A.simulated ? A.name : A.name,
          orderAction: severity === 'contraindicated' || severity === 'major' ? 'discontinue' : 'add-monitoring',
          orderDetail: rule.action,
        });
      }
    }
  }
  return out;
}

// ---------------- triple whammy ----------------
function tripleWhammy(meds: EngineMed[], ctx: RuleCtx): Finding[] {
  const nsaid = meds.find((m) => m.classTags.includes('nsaid'));
  const raas = meds.find((m) => hasTag(m, ['acei', 'arb', 'arni']));
  const diuretic = meds.find((m) => hasTag(m, ['loop', 'thiazide', 'diuretic']));
  if (nsaid && raas && diuretic) {
    return [
      {
        id: `triple-whammy:${nsaid.id}`,
        module: 'risk',
        kind: 'interaction',
        severity: 'major',
        domain: 'renal',
        title: 'Triple whammy — NSAID + RAAS inhibitor + diuretic',
        rationale: `${nsaid.name} + ${raas.name} + ${diuretic.name} together${ctx.egfr != null ? ` (eGFR ${ctx.egfr})` : ''} sharply raise acute kidney injury risk, particularly during volume depletion.`,
        mechanism: 'The three agents disable the kidney’s autoregulation (afferent constriction, efferent dilation, volume loss), collapsing GFR.',
        action: `Stop ${nsaid.name}; use acetaminophen or topical analgesia. Recheck creatinine within 1 week.`,
        monitoring: [
          { id: `triple-w0:${nsaid.id}`, type: 'Lab', item: 'Creatinine + K⁺', timing: '1 week', frequency: 'and with any dose change', rationale: 'Detect AKI from the triple combination.', evidence: ['KDIGO 2024 CKD'] },
        ],
        evidence: ['KDIGO 2024 CKD'],
        drugs: [nsaid.name, raas.name, diuretic.name],
        confidence: 0.85,
        basis: 'guideline',
        targetMed: nsaid.name,
        orderAction: 'discontinue',
        orderDetail: `Discontinue ${nsaid.name}`,
      },
    ];
  }
  return [];
}

// ---------------- cumulative burden ----------------
function cumulativeBurden(meds: EngineMed[], ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  const elderly = ctx.age >= 65;

  // Anticholinergic
  const ach = meds.filter((m) => m.acb >= 1);
  const achTotal = ach.reduce((s, m) => s + m.acb, 0);
  if (achTotal >= 3 && ach.length >= 1) {
    out.push({
      id: `burden-ach`,
      module: 'polypharmacy',
      kind: 'anticholinergic',
      severity: elderly ? 'major' : 'moderate',
      domain: elderly ? 'geriatric' : 'neuro',
      title: `High anticholinergic burden (ACB ${achTotal})`,
      rationale: `${ach.map((m) => `${m.name} (ACB ${m.acb})`).join(', ')} sum to ACB ${achTotal}.${elderly ? ` At age ${ctx.age}, this elevates risk of confusion, falls, urinary retention and cognitive decline.` : ''}`,
      mechanism: 'Cumulative muscarinic blockade impairs cognition, thermoregulation, GI/GU motility and increases fall risk.',
      action: 'Deprescribe the highest-burden agents first (ACB 3); substitute lower-burden alternatives.',
      evidence: ['Anticholinergic Cognitive Burden Scale', '2023 AGS Beers Criteria'],
      drugs: ach.map((m) => m.name),
      confidence: 0.8,
      basis: 'cohort',
      targetMed: [...ach].sort((a, b) => b.acb - a.acb)[0].name,
      orderAction: 'discontinue',
      orderDetail: `Deprescribe ${[...ach].sort((a, b) => b.acb - a.acb)[0].name}`,
    });
  }

  // QT-prolonging
  const qt = meds.filter((m) => m.qtRisk === 'known' || m.qtRisk === 'possible');
  if (qt.length >= 2) {
    let sev: Severity = 'moderate';
    if (ctx.qtc != null && ctx.qtc >= 470) sev = 'major';
    if (ctx.qtc != null && ctx.qtc >= 500) sev = 'contraindicated';
    out.push({
      id: `burden-qt`,
      module: 'risk',
      kind: 'qt',
      severity: sev,
      domain: 'cardiac',
      title: `Cumulative QT-prolonging burden (${qt.length} agents)`,
      rationale: `${qt.map((m) => m.name).join(', ')} each prolong QT.${ctx.qtc != null ? ` Current QTc ${ctx.qtc} ms.` : ''}${ctx.k != null && ctx.k < 4 ? ` K⁺ ${ctx.k} adds risk.` : ''}`,
      mechanism: 'Additive delay of ventricular repolarization increases torsades de pointes risk.',
      action: 'Remove or substitute one QT-prolonging agent; obtain ECG and correct K⁺/Mg²⁺.',
      monitoring: [
        { id: `burden-qt-w0`, type: 'Lab', item: 'ECG (QTc) + K⁺/Mg²⁺', timing: 'baseline', frequency: 'and 48–72h after change', rationale: 'Track additive QT prolongation.', evidence: ['CredibleMeds QT list'] },
      ],
      evidence: ['CredibleMeds QT list'],
      drugs: qt.map((m) => m.name),
      confidence: 0.8,
      basis: 'cohort',
      targetMed: qt[qt.length - 1].name,
      orderAction: 'add-monitoring',
      orderDetail: 'Baseline + follow-up QTc',
    });
  }

  // CNS depressant
  const cns = meds.filter((m) => m.classTags.includes('cns-depressant') || hasTag(m, ['opioid', 'benzodiazepine', 'z-drug', 'gabapentinoid']));
  if (cns.length >= 2) {
    out.push({
      id: `burden-cns`,
      module: 'risk',
      kind: 'cns',
      severity: elderly ? 'major' : 'moderate',
      domain: elderly ? 'geriatric' : 'neuro',
      title: `Cumulative CNS-depressant burden (${cns.length} agents)`,
      rationale: `${cns.map((m) => m.name).join(', ')} are each sedating.${elderly ? ` At age ${ctx.age}, this raises fall, fracture and delirium risk.` : ''}`,
      mechanism: 'Additive CNS depression impairs alertness, balance and respiratory drive.',
      action: 'Consolidate sedating agents; taper the least essential.',
      evidence: ['2023 AGS Beers Criteria'],
      drugs: cns.map((m) => m.name),
      confidence: 0.75,
      basis: 'guideline',
      targetMed: cns[cns.length - 1].name,
      orderAction: 'discontinue',
      orderDetail: `Taper ${cns[cns.length - 1].name}`,
    });
  }

  return out;
}

// ---------------- duplicate therapy ----------------
const DUP_GROUPS: { tag: ClassTag; label: string }[] = [
  { tag: 'statin', label: 'HMG-CoA reductase inhibitor (statin)' },
  { tag: 'ppi', label: 'proton pump inhibitor' },
  { tag: 'ssri', label: 'SSRI' },
  { tag: 'snri', label: 'SNRI' },
  { tag: 'acei', label: 'ACE inhibitor' },
  { tag: 'arb', label: 'ARB' },
  { tag: 'beta-blocker', label: 'beta-blocker' },
  { tag: 'loop', label: 'loop diuretic' },
  { tag: 'thiazide', label: 'thiazide diuretic' },
  { tag: 'benzodiazepine', label: 'benzodiazepine' },
  { tag: 'sulfonylurea', label: 'sulfonylurea' },
  { tag: 'nsaid', label: 'NSAID' },
  { tag: 'opioid', label: 'opioid' },
  { tag: 'ccb-dhp', label: 'dihydropyridine calcium channel blocker' },
  { tag: 'gabapentinoid', label: 'gabapentinoid' },
  { tag: 'h2ra', label: 'H2 receptor antagonist' },
];

function duplicateTherapy(meds: EngineMed[]): Finding[] {
  const out: Finding[] = [];
  for (const g of DUP_GROUPS) {
    const inGroup = meds.filter((m) => m.classTags.includes(g.tag));
    if (inGroup.length >= 2) {
      out.push({
        id: `dup-${g.tag}`,
        module: 'polypharmacy',
        kind: 'duplicate',
        severity: g.tag === 'nsaid' || g.tag === 'opioid' || g.tag === 'anticoagulant' ? 'major' : 'moderate',
        domain: 'general',
        title: `Duplicate ${g.label} therapy`,
        rationale: `${inGroup.map((m) => m.name).join(' and ')} are both ${g.label}s — therapeutic duplication with no added benefit and additive adverse effects.`,
        mechanism: 'Two agents of the same class provide overlapping effect while compounding class-specific toxicity.',
        action: `Consolidate to a single ${g.label}; discontinue the redundant agent.`,
        evidence: ['STOPP/START v3'],
        drugs: inGroup.map((m) => m.name),
        confidence: 0.82,
        basis: 'guideline',
        targetMed: inGroup[inGroup.length - 1].name,
        orderAction: 'discontinue',
        orderDetail: `Discontinue ${inGroup[inGroup.length - 1].name}`,
      });
    }
  }
  return out;
}

// ---------------- patient-specific cautions ----------------
function cautions(meds: EngineMed[], ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  const find = (pred: (m: EngineMed) => boolean) => meds.find(pred);
  const push = (f: Finding) => out.push(f);

  const egfr = ctx.egfr;

  // Metformin
  const metformin = find((m) => m.id === 'metformin');
  if (metformin && egfr != null) {
    if (egfr < 30)
      push(mk('caution-metformin', 'dose', 'contraindicated', 'renal', metformin.name,
        'Metformin contraindicated below eGFR 30',
        `eGFR ${egfr} is below 30 — metformin is contraindicated (lactic acidosis risk).`,
        'Reduced renal clearance allows metformin/lactate accumulation.',
        'Discontinue metformin; select a renally appropriate agent (e.g., DPP-4 inhibitor, GLP-1 RA, insulin).',
        ['FDA label — metformin'], 0.9, 'discontinue', 'Discontinue metformin'));
    else if (egfr < 45)
      push(mk('caution-metformin', 'dose', 'moderate', 'renal', metformin.name,
        'Metformin caution below eGFR 45',
        `eGFR ${egfr} (30–45) — do not initiate; if continued, cap at 1000 mg/day and monitor renal function.`,
        'Reduced clearance raises lactic acidosis risk.',
        'Reduce metformin dose and reassess renal function in 3 months.',
        ['FDA label — metformin'], 0.8, 'reduce-dose', 'Reduce metformin to ≤1000 mg/day'));
  }

  // NSAID in CKD
  const nsaid = find((m) => m.classTags.includes('nsaid'));
  if (nsaid && egfr != null && egfr < 30)
    push(mk('caution-nsaid-ckd', 'dose', 'major', 'renal', nsaid.name,
      'NSAID in severe CKD',
      `eGFR ${egfr} — NSAIDs should be avoided in severe CKD (accelerated decline, hyperkalemia, fluid retention).`,
      'Prostaglandin inhibition removes compensatory renal vasodilation.',
      `Discontinue ${nsaid.name}; use acetaminophen or topical therapy.`,
      ['KDIGO 2024 CKD'], 0.85, 'discontinue', `Discontinue ${nsaid.name}`));

  // Dabigatran CrCl<30
  const dabig = find((m) => m.id === 'dabigatran');
  if (dabig && egfr != null && egfr < 30)
    push(mk('caution-dabigatran', 'dose', 'major', 'renal', dabig.name,
      'Dabigatran below CrCl 30',
      `eGFR ${egfr} approximates CrCl <30 — dabigatran is largely renally cleared and accumulates.`,
      'Renal accumulation raises bleeding risk unpredictably.',
      'Switch to apixaban (better tolerated at low CrCl) or reduce per labeling with hematology input.',
      ['FDA label — dabigatran'], 0.85, 'switch', 'Switch dabigatran → apixaban'));

  // Thiazide efficacy
  const thz = find((m) => m.classTags.includes('thiazide'));
  if (thz && egfr != null && egfr < 30)
    push(mk('caution-thiazide', 'dose', 'moderate', 'renal', thz.name,
      'Thiazide less effective below eGFR 30',
      `eGFR ${egfr} — thiazides lose efficacy in advanced CKD; a loop diuretic is preferred for volume/BP control.`,
      'Reduced distal tubular delivery blunts thiazide natriuresis.',
      `Consider switching ${thz.name} to a loop diuretic.`,
      ['KDIGO 2024 CKD'], 0.72, 'switch', `Switch ${thz.name} → loop diuretic`));

  // Gabapentinoid renal
  const gaba = find((m) => m.classTags.includes('gabapentinoid'));
  if (gaba && egfr != null && egfr < 60)
    push(mk('caution-gabapentinoid', 'dose', egfr < 30 ? 'moderate' : 'minor', 'renal', gaba.name,
      'Gabapentinoid renal dose adjustment',
      `eGFR ${egfr} — ${gaba.name} is renally eliminated and requires dose reduction to avoid sedation/ataxia.`,
      'Accumulation causes dose-dependent CNS depression.',
      `Reduce ${gaba.name} dose per renal function; counsel on sedation.`,
      ['FDA label — gabapentin'], 0.7, 'reduce-dose', `Reduce ${gaba.name} for renal function`));

  // Hyperkalemia gate on RAAS/MRA/K
  if (ctx.k != null && ctx.k >= 5.0) {
    const kmed = find((m) => hasTag(m, ['acei', 'arb', 'arni', 'mra', 'k-sparing', 'potassium']));
    if (kmed)
      push(mk('caution-hyperk', 'risk', ctx.k >= 5.5 ? 'major' : 'moderate', 'renal', kmed.name,
        `Potassium ${ctx.k} blocks RAAS/MRA/K escalation`,
        `K⁺ ${ctx.k} mEq/L (≥5.0) — do not initiate or uptitrate ${kmed.name} or any potassium-raising agent until corrected.`,
        'Further potassium retention risks dangerous hyperkalemia and arrhythmia.',
        ctx.k >= 5.5 ? `Hold ${kmed.name}; treat hyperkalemia; recheck K⁺.` : `Hold uptitration; recheck K⁺ and review diet/supplements.`,
        ['2022 AHA/ACC/HFSA HF Guideline'], 0.85, ctx.k >= 5.5 ? 'hold' : 'add-monitoring',
        ctx.k >= 5.5 ? `Hold ${kmed.name}` : 'Recheck K⁺ before uptitration'));
  }

  // Low Hb + NSAID / antithrombotic
  if (ctx.hb != null && ctx.hb < 11) {
    const bleed = find((m) => hasTag(m, ['nsaid', 'anticoagulant', 'doac', 'vka', 'antiplatelet']));
    if (bleed)
      push(mk('caution-anemia-bleed', 'risk', 'moderate', 'heme', bleed.name,
        'Anemia raises bleeding concern',
        `Hgb ${ctx.hb} g/dL with ${bleed.name} — a bleeding event would be poorly tolerated; investigate the anemia source.`,
        'Pre-existing anemia narrows the margin before a bleed becomes symptomatic.',
        `Reassess need for ${bleed.name}; add gastroprotection; work up anemia.`,
        ['FDA label — warfarin'], 0.68, 'add-monitoring', 'Add PPI; work up anemia'));
  }

  return out;
}

// ---------------- GDMT gaps & positive indications ----------------
function gdmt(meds: EngineMed[], ctx: RuleCtx): Finding[] {
  const out: Finding[] = [];
  const has = (pred: (m: EngineMed) => boolean) => meds.some(pred);
  const egfr = ctx.egfr ?? 60;
  const hfref = ctx.hasDx('hfref') || ctx.hasDx('reduced ejection') || ctx.hasDx('systolic heart failure');
  const ckd = ctx.hasDx('ckd') || ctx.hasDx('chronic kidney');
  const t2d = ctx.hasDx('type 2 diabetes') || ctx.hasDx('t2dm') || ctx.hasDx('diabetes');
  const ascvd = ctx.hasDx('coronary') || ctx.hasDx('cad') || ctx.hasDx('myocardial') || ctx.hasDx('ascvd') || ctx.hasDx('stroke') || ctx.hasDx('peripheral arter');
  const af = ctx.hasDx('atrial fibrillation') || ctx.hasDx('afib');

  const onSglt2 = has((m) => m.classTags.includes('sglt2'));
  const onBB = has((m) => m.classTags.includes('beta-blocker'));
  const onRaas = has((m) => hasTag(m, ['acei', 'arb', 'arni']));
  const onArni = has((m) => m.classTags.includes('arni'));
  const onMra = has((m) => m.classTags.includes('mra'));
  const onStatin = has((m) => m.classTags.includes('statin'));
  const onAnticoag = has((m) => hasTag(m, ['anticoagulant', 'doac', 'vka']));

  const gap = (id: string, sev: Severity, domain: Domain, title: string, rationale: string, action: string, evidence: string[], detail: string, drug = ''): Finding => ({
    id: `gdmt-${id}`,
    module: 'gdmt', kind: 'drug-disease', severity: sev, domain,
    title, rationale,
    mechanism: 'Guideline-directed therapy with proven mortality/morbidity benefit is not on the current regimen.',
    action, evidence: uniq(evidence), drugs: drug ? [drug] : [], confidence: 0.85, basis: 'guideline',
    targetMed: drug, orderAction: 'start', orderDetail: detail,
  });

  const benefit = (id: string, domain: Domain, title: string, rationale: string, evidence: string[], drug: string): Finding => ({
    id: `benefit-${id}`,
    module: 'gdmt', kind: 'indication', severity: 'info', benefit: true, domain,
    title, rationale,
    mechanism: 'Evidence-based therapy correctly matched to the indication.',
    action: 'Continue — appropriately prescribed. Ensure target dose is reached.',
    evidence: uniq(evidence), drugs: [drug], confidence: 0.9, basis: 'landmark-trial',
    targetMed: drug, orderAction: 'add-monitoring', orderDetail: 'Confirm titration to target dose',
  });

  if (hfref) {
    if (!onSglt2 && egfr >= 20)
      out.push(gap('hf-sglt2', 'moderate', 'cardiac', 'HFrEF without an SGLT2 inhibitor',
        `HFrEF with eGFR ${ctx.egfr ?? '—'} (≥20) and no SGLT2 inhibitor — a Class 1 pillar of GDMT reducing HF hospitalization and CV death.`,
        'Start dapagliflozin 10 mg or empagliflozin 10 mg daily.', ['DAPA-HF', 'EMPEROR-Reduced', '2022 AHA/ACC/HFSA HF Guideline'], 'Start dapagliflozin 10 mg daily', 'dapagliflozin'));
    if (!onBB)
      out.push(gap('hf-bb', 'moderate', 'cardiac', 'HFrEF without a beta-blocker',
        'HFrEF and no evidence-based beta-blocker (carvedilol, metoprolol succinate or bisoprolol) — a mortality-reducing GDMT pillar.',
        'Start a HF-proven beta-blocker and titrate to target.', ['2022 AHA/ACC/HFSA HF Guideline'], 'Start metoprolol succinate 25 mg daily', 'metoprolol-succinate'));
    if (!onRaas)
      out.push(gap('hf-raas', 'major', 'cardiac', 'HFrEF without RAAS blockade',
        'HFrEF with no ACEi/ARB/ARNI — foundational neurohormonal blockade is missing.',
        'Start an ARNI (sacubitril/valsartan) or ACEi if K⁺/renal permit.', ['PARADIGM-HF', '2022 AHA/ACC/HFSA HF Guideline'], 'Start sacubitril/valsartan 24/26 mg BID', 'sacubitril-valsartan'));
    else if (!onArni)
      out.push(gap('hf-arni', 'minor', 'cardiac', 'Consider ARNI in place of ACEi/ARB',
        'On an ACEi/ARB for HFrEF — switching to sacubitril/valsartan further reduces CV death and HF hospitalization (PARADIGM-HF).',
        'Switch ACEi/ARB to sacubitril/valsartan (36h ACEi washout).', ['PARADIGM-HF'], 'Switch to sacubitril/valsartan', 'sacubitril-valsartan'));
    if (!onMra && (ctx.k == null || ctx.k < 5.0) && egfr >= 30)
      out.push(gap('hf-mra', 'moderate', 'cardiac', 'HFrEF without an MRA',
        `HFrEF with K⁺ ${ctx.k ?? '—'} and eGFR ${ctx.egfr ?? '—'} — an MRA (spironolactone/eplerenone) is indicated and tolerable.`,
        'Start spironolactone 12.5–25 mg daily; check K⁺ at 72h and 2 weeks.', ['RALES', 'EMPHASIS-HF'], 'Start spironolactone 25 mg daily', 'spironolactone'));
    if (onSglt2) out.push(benefit('hf-sglt2', 'cardiac', 'SGLT2 inhibitor appropriately prescribed for HFrEF', 'SGLT2 inhibitor on board for HFrEF — reduces HF hospitalization and CV death.', ['DAPA-HF', 'EMPEROR-Reduced'], meds.find((m) => m.classTags.includes('sglt2'))!.name));
  }

  if (ckd && t2d && !onSglt2 && egfr >= 20)
    out.push(gap('ckd-sglt2', 'moderate', 'renal', 'Diabetic CKD without an SGLT2 inhibitor',
      `Type 2 diabetes with CKD (eGFR ${ctx.egfr ?? '—'}, ≥20) and no SGLT2 inhibitor — slows CKD progression and reduces CV events.`,
      'Start dapagliflozin 10 mg daily (renal + CV protection).', ['CREDENCE', 'DAPA-CKD', 'KDIGO 2022 Diabetes-CKD'], 'Start dapagliflozin 10 mg daily', 'dapagliflozin'));

  if (ascvd && !onStatin)
    out.push(gap('ascvd-statin', 'major', 'cardiac', 'ASCVD without a statin',
      'Established ASCVD and no statin — high-intensity statin therapy is a Class 1 recommendation.',
      'Start atorvastatin 40–80 mg or rosuvastatin 20–40 mg daily.', ['2018 AHA/ACC Cholesterol', 'CTT meta-analysis', '4S'], 'Start atorvastatin 80 mg daily', 'atorvastatin'));
  else if (ascvd && onStatin) {
    const st = meds.find((m) => m.classTags.includes('statin'))!;
    const highIntensity = (st.id === 'atorvastatin' || st.id === 'rosuvastatin');
    if (!highIntensity)
      out.push(gap('ascvd-statin-intensity', 'moderate', 'cardiac', 'ASCVD on non–high-intensity statin',
        `${st.name} for established ASCVD is not high-intensity — guidelines advise atorvastatin 40–80 mg or rosuvastatin 20–40 mg.`,
        `Switch ${st.name} to a high-intensity statin.`, ['2018 AHA/ACC Cholesterol'], `Switch ${st.name} → atorvastatin 80 mg`, st.name));
    else out.push(benefit('ascvd-statin', 'cardiac', 'High-intensity statin appropriately prescribed for ASCVD', `${st.name} provides high-intensity LDL lowering for established ASCVD.`, ['2018 AHA/ACC Cholesterol', 'CTT meta-analysis'], st.name));
  }

  if (af && !onAnticoag)
    out.push(gap('af-anticoag', 'major', 'cardiac', 'Atrial fibrillation without anticoagulation',
      'Atrial fibrillation and no oral anticoagulant — if CHA₂DS₂-VASc ≥2 (men) / ≥3 (women), a DOAC is indicated for stroke prevention.',
      'Start apixaban 5 mg BID (reduce to 2.5 mg if ≥2 of: age ≥80, weight ≤60 kg, Cr ≥1.5).', ['ARISTOTLE', '2023 ACC/AHA AF Guideline'], 'Start apixaban 5 mg BID', 'apixaban'));

  return out;
}

// ---------------- Beers in older adults ----------------
function beersFlags(meds: EngineMed[], ctx: RuleCtx): Finding[] {
  if (ctx.age < 65) return [];
  const out: Finding[] = [];
  for (const m of meds) {
    if (m.beers) {
      out.push({
        id: `beers-${m.id}`,
        module: 'polypharmacy', kind: 'beers',
        severity: 'moderate', domain: 'geriatric',
        title: `Beers Criteria: ${m.name}`,
        rationale: `At age ${ctx.age}, ${m.name} is flagged by the 2023 AGS Beers Criteria — ${m.beers}`,
        mechanism: 'Potentially inappropriate medication in older adults per Beers Criteria.',
        action: `Review the indication for ${m.name}; deprescribe or substitute a safer agent.`,
        evidence: ['2023 AGS Beers Criteria'],
        drugs: [m.name], confidence: 0.78, basis: 'guideline',
        targetMed: m.name, orderAction: 'discontinue', orderDetail: `Deprescribe ${m.name}`,
      });
    }
  }
  return out;
}

// ---------------- low-value chronic PPI ----------------
function lowValuePPI(patient: Patient, meds: EngineMed[]): Finding[] {
  const ppi = meds.find((m) => m.classTags.includes('ppi'));
  if (!ppi) return [];
  const gerdOrUlcer = patient.diagnoses.some((d) => /gerd|reflux|ulcer|barrett|esophag/i.test(d.label));
  if (gerdOrUlcer) return [];
  return [{
    id: `ppi-lowvalue`,
    module: 'polypharmacy', kind: 'beers',
    severity: 'minor', domain: 'gi',
    title: 'Chronic PPI without a documented indication',
    rationale: `${ppi.name} is on the chronic med list with no GERD/ulcer/Barrett’s indication in the problem list — long-term PPI use carries fracture, hypomagnesemia, B12 and infection risks.`,
    mechanism: 'Prolonged acid suppression without indication delivers risk without benefit.',
    action: `Attempt a step-down/taper of ${ppi.name}; switch to H2RA or PRN antacid.`,
    evidence: ['Choosing Wisely — PPI'],
    drugs: [ppi.name], confidence: 0.65, basis: 'guideline',
    targetMed: ppi.name, orderAction: 'discontinue', orderDetail: `Taper ${ppi.name}`,
  }];
}

// ---------------- helper to build a Finding ----------------
function mk(
  idBase: string, module: Finding['module'], severity: Severity, domain: Domain, drug: string,
  title: string, rationale: string, mechanism: string, action: string,
  evidence: string[], confidence: number, orderAction: Finding['orderAction'], orderDetail: string,
): Finding {
  return {
    id: `${idBase}:${drug}`,
    module, kind: module === 'dose' ? 'dose' : 'drug-disease',
    severity, domain, title, rationale, mechanism, action,
    evidence: uniq(evidence), drugs: [drug], confidence, basis: 'guideline',
    targetMed: drug, orderAction, orderDetail,
  };
}

// ---------------- dedupe ----------------
function dedupe(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  for (const f of findings) {
    const sig = `${f.kind}|${[...f.drugs].sort().join(',')}`;
    const existing = map.get(sig);
    if (!existing) {
      map.set(sig, { ...f, evidence: uniq(f.evidence) });
    } else if (SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[existing.severity]) {
      map.set(sig, {
        ...f,
        evidence: uniq([...existing.evidence, ...f.evidence]),
        rationale: existing.rationale === f.rationale ? f.rationale : `${f.rationale} (also flagged by ${existing.module}).`,
      });
    } else {
      existing.evidence = uniq([...existing.evidence, ...f.evidence]);
    }
  }
  return [...map.values()];
}

// Merge findings that recommend the SAME action on the SAME drug into one
// card carrying multiple reasons — the brief's alert-fatigue reducer.
const MERGEABLE_ACTIONS = new Set(['discontinue', 'hold', 'reduce-dose', 'switch']);
function mergeByAction(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  const passthrough: Finding[] = [];
  for (const f of findings) {
    if (f.targetMed && f.orderAction && MERGEABLE_ACTIONS.has(f.orderAction)) {
      const key = `${f.orderAction}|${f.targetMed}`;
      const ex = map.get(key);
      if (!ex) {
        map.set(key, { ...f });
      } else {
        const keep = SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[ex.severity] ? f : ex;
        const other = keep === f ? ex : f;
        map.set(key, {
          ...keep,
          confidence: Math.max(keep.confidence, other.confidence),
          rationale: `${keep.rationale} Also flagged: ${other.title.replace(/\.$/, '')}.`,
          evidence: uniq([...keep.evidence, ...other.evidence]),
          monitoring: [...(keep.monitoring || []), ...(other.monitoring || [])],
          drugs: uniq([...keep.drugs, ...other.drugs]),
        });
      }
    } else {
      passthrough.push(f);
    }
  }
  return [...map.values(), ...passthrough];
}

// ---------------- main entry ----------------
export function runEngine(patient: Patient, candidateIds: string[] = []): Finding[] {
  const ctx = buildCtx(patient);
  const active = patient.meds.map(enrichActive);
  const cands = candidateIds.map(enrichCandidate).filter((m): m is EngineMed => m !== null);
  const meds = [...active, ...cands];

  const findings = [
    ...runPairRules(meds, ctx),
    ...tripleWhammy(meds, ctx),
    ...cumulativeBurden(meds, ctx),
    ...duplicateTherapy(meds),
    ...cautions(meds, ctx),
    ...gdmt(meds, ctx),
    ...beersFlags(meds, ctx),
    ...lowValuePPI(patient, meds),
  ];

  return sortFindings(mergeByAction(dedupe(findings)));
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    // benefits (info) sink below issues of equal-ish weight but keep severity primary
    const s = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (s !== 0) return s;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.id.localeCompare(b.id);
  });
}

// Findings that specifically involve a simulated candidate.
export function findingsForCandidate(patient: Patient, candidateIds: string[], candidateName: string): Finding[] {
  const all = runEngine(patient, candidateIds);
  const baseline = new Set(runEngine(patient, candidateIds.filter((_, i) => candidateIds[i] !== candidateName)).map((f) => f.id));
  return all.filter((f) => f.drugs.includes(candidateName) || !baseline.has(f.id));
}

// Health-score projection for the simulator.
export function projectScore(baseFindings: Finding[], newFindings: Finding[]): number {
  const baseIds = new Set(baseFindings.map((f) => f.id));
  let delta = 0;
  for (const f of newFindings) {
    if (!baseIds.has(f.id)) delta += SEVERITY_SCORE[f.severity];
  }
  return delta;
}

export function overallSeverity(findings: Finding[]): Severity {
  let worst: Severity = 'info';
  for (const f of findings) if (SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[worst]) worst = f.severity;
  return worst;
}
