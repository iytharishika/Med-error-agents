// ============================================================
// Evidence resolver
// Maps every evidence label used by the engine to a verified
// external source that opens in a new tab. No fabricated
// citations: landmark trials use their stable PubMed record;
// guidelines / criteria / drug-safety labels resolve to the
// authoritative database filtered to the reference.
// ============================================================

export type EvidenceSourceKind =
  | 'PubMed'
  | 'FDA'
  | 'DailyMed'
  | 'Guideline'
  | 'Choosing Wisely'
  | 'AGS Beers';

export interface EvidenceEntry {
  label: string;
  kind: EvidenceSourceKind;
  url: string;
  detail: string;
  basisNote?: string;
}

const pmid = (id: string) => `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
const pubmed = (q: string) =>
  `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`;
const dailymed = (q: string) =>
  `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(q)}`;
const fda = (q: string) =>
  `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=BasicSearch.process&searchTerm=${encodeURIComponent(q)}`;
const cw = (q: string) =>
  `https://www.choosingwisely.org/?s=${encodeURIComponent(q)}`;

// Curated registry. Keys are the exact labels the engine emits.
const REGISTRY: Record<string, EvidenceEntry> = {
  // ---- Landmark trials (stable PubMed records) ----
  'PARADIGM-HF': { label: 'PARADIGM-HF', kind: 'PubMed', url: pmid('25176015'), detail: 'Sacubitril/valsartan vs enalapril in HFrEF (NEJM 2014).' },
  'DAPA-HF': { label: 'DAPA-HF', kind: 'PubMed', url: pmid('31535829'), detail: 'Dapagliflozin in HFrEF (NEJM 2019).' },
  'EMPEROR-Reduced': { label: 'EMPEROR-Reduced', kind: 'PubMed', url: pmid('32865377'), detail: 'Empagliflozin in HFrEF (NEJM 2020).' },
  'EMPEROR-Preserved': { label: 'EMPEROR-Preserved', kind: 'PubMed', url: pmid('34449189'), detail: 'Empagliflozin in HFpEF (NEJM 2021).' },
  'DELIVER': { label: 'DELIVER', kind: 'PubMed', url: pmid('36027570'), detail: 'Dapagliflozin in HFpEF (NEJM 2022).' },
  'CREDENCE': { label: 'CREDENCE', kind: 'PubMed', url: pmid('30990260'), detail: 'Canagliflozin in diabetic CKD (NEJM 2019).' },
  'DAPA-CKD': { label: 'DAPA-CKD', kind: 'PubMed', url: pmid('32970396'), detail: 'Dapagliflozin in CKD (NEJM 2020).' },
  'EMPA-KIDNEY': { label: 'EMPA-KIDNEY', kind: 'PubMed', url: pmid('36331190'), detail: 'Empagliflozin in CKD (NEJM 2023).' },
  'RALES': { label: 'RALES', kind: 'PubMed', url: pmid('10471456'), detail: 'Spironolactone in severe HFrEF (NEJM 1999).' },
  'EMPHASIS-HF': { label: 'EMPHASIS-HF', kind: 'PubMed', url: pmid('21073363'), detail: 'Eplerenone in mild HFrEF (NEJM 2011).' },
  'SPRINT': { label: 'SPRINT', kind: 'PubMed', url: pmid('26551272'), detail: 'Intensive vs standard BP control (NEJM 2015).' },
  '4S': { label: '4S', kind: 'PubMed', url: pmid('7968073'), detail: 'Simvastatin survival study (Lancet 1994).' },
  'CTT meta-analysis': { label: 'CTT meta-analysis', kind: 'PubMed', url: pmid('21067804'), detail: 'Cholesterol Treatment Trialists LDL-lowering meta-analysis (Lancet 2010).' },
  'ONTARGET': { label: 'ONTARGET', kind: 'PubMed', url: pmid('18378520'), detail: 'ACEi + ARB combination harm (NEJM 2008).' },
  'ARISTOTLE': { label: 'ARISTOTLE', kind: 'PubMed', url: pmid('21870978'), detail: 'Apixaban vs warfarin in AF (NEJM 2011).' },
  'RE-LY': { label: 'RE-LY', kind: 'PubMed', url: pmid('19717844'), detail: 'Dabigatran vs warfarin in AF (NEJM 2009).' },
  'ROCKET-AF': { label: 'ROCKET-AF', kind: 'PubMed', url: pmid('21830957'), detail: 'Rivaroxaban vs warfarin in AF (NEJM 2011).' },
  'ENGAGE AF-TIMI 48': { label: 'ENGAGE AF-TIMI 48', kind: 'PubMed', url: pmid('24251359'), detail: 'Edoxaban vs warfarin in AF (NEJM 2013).' },
  'AUGUSTUS': { label: 'AUGUSTUS', kind: 'PubMed', url: pmid('30703431'), detail: 'Apixaban in AF with recent ACS/PCI (NEJM 2019).' },
  'PLATO': { label: 'PLATO', kind: 'PubMed', url: pmid('19717846'), detail: 'Ticagrelor vs clopidogrel in ACS (NEJM 2009).' },

  // ---- Guidelines ----
  '2022 AHA/ACC/HFSA HF Guideline': { label: '2022 AHA/ACC/HFSA HF Guideline', kind: 'Guideline', url: pubmed('2022 AHA ACC HFSA heart failure guideline'), detail: 'Guideline-directed medical therapy for heart failure.' },
  'KDIGO 2024 CKD': { label: 'KDIGO 2024 CKD', kind: 'Guideline', url: pubmed('KDIGO 2024 clinical practice guideline chronic kidney disease'), detail: 'KDIGO CKD evaluation and management.' },
  'KDIGO 2022 Diabetes-CKD': { label: 'KDIGO 2022 Diabetes-CKD', kind: 'Guideline', url: pubmed('KDIGO 2022 diabetes management chronic kidney disease'), detail: 'Diabetes management in CKD.' },
  'ADA Standards of Care 2025': { label: 'ADA Standards of Care 2025', kind: 'Guideline', url: pubmed('ADA Standards of Care in Diabetes 2025'), detail: 'American Diabetes Association Standards of Care.' },
  '2019 ACC/AHA Primary Prevention': { label: '2019 ACC/AHA Primary Prevention', kind: 'Guideline', url: pubmed('2019 ACC AHA guideline primary prevention cardiovascular disease'), detail: 'Primary prevention of ASCVD.' },
  '2018 AHA/ACC Cholesterol': { label: '2018 AHA/ACC Cholesterol', kind: 'Guideline', url: pubmed('2018 AHA ACC cholesterol clinical practice guideline'), detail: 'Blood cholesterol management, statin intensity.' },
  '2023 ACC/AHA AF Guideline': { label: '2023 ACC/AHA AF Guideline', kind: 'Guideline', url: pubmed('2023 ACC AHA ACCP HRS atrial fibrillation guideline'), detail: 'Atrial fibrillation management and anticoagulation.' },

  // ---- Criteria / stewardship ----
  '2023 AGS Beers Criteria': { label: '2023 AGS Beers Criteria', kind: 'AGS Beers', url: pmid('37139824'), detail: 'AGS Beers Criteria for potentially inappropriate medication use in older adults.' },
  'STOPP/START v3': { label: 'STOPP/START v3', kind: 'PubMed', url: pubmed('STOPP START version 3 potentially inappropriate prescribing'), detail: 'STOPP/START criteria for prescribing in older adults.' },
  'Anticholinergic Cognitive Burden Scale': { label: 'Anticholinergic Cognitive Burden Scale', kind: 'PubMed', url: pubmed('anticholinergic cognitive burden scale dementia'), detail: 'ACB score and cognitive risk.' },
  'Choosing Wisely — PPI': { label: 'Choosing Wisely — PPI', kind: 'Choosing Wisely', url: cw('proton pump inhibitor deprescribing'), detail: 'Avoid chronic PPI use without a clear indication.' },
  'Choosing Wisely — Benzodiazepines': { label: 'Choosing Wisely — Benzodiazepines', kind: 'Choosing Wisely', url: cw('benzodiazepines older adults'), detail: 'Avoid benzodiazepines in older adults.' },
  'CredibleMeds QT list': { label: 'CredibleMeds QT list', kind: 'PubMed', url: pubmed('CredibleMeds drug-induced QT prolongation torsades'), detail: 'Drug-induced QT prolongation risk categories.' },

  // ---- FDA / labeling ----
  'FDA label — metformin': { label: 'FDA label — metformin', kind: 'FDA', url: dailymed('metformin'), detail: 'Metformin prescribing information (renal thresholds, lactic acidosis).' },
  'FDA label — dabigatran': { label: 'FDA label — dabigatran', kind: 'FDA', url: dailymed('dabigatran'), detail: 'Dabigatran prescribing information (CrCl thresholds).' },
  'FDA DSC — QT fluoroquinolones': { label: 'FDA DSC — QT fluoroquinolones', kind: 'FDA', url: fda('fluoroquinolone'), detail: 'FDA drug safety communication, fluoroquinolone risks.' },
  'FDA label — simvastatin': { label: 'FDA label — simvastatin', kind: 'FDA', url: dailymed('simvastatin'), detail: 'Simvastatin labeling: interaction dose limits.' },
  'FDA label — sildenafil': { label: 'FDA label — sildenafil', kind: 'FDA', url: dailymed('sildenafil'), detail: 'PDE5 inhibitor labeling: nitrate contraindication.' },
  'FDA label — warfarin': { label: 'FDA label — warfarin', kind: 'FDA', url: dailymed('warfarin'), detail: 'Warfarin labeling: interactions and INR monitoring.' },
  'FDA label — digoxin': { label: 'FDA label — digoxin', kind: 'FDA', url: dailymed('digoxin'), detail: 'Digoxin labeling: toxicity and interactions.' },
  'FDA label — spironolactone': { label: 'FDA label — spironolactone', kind: 'FDA', url: dailymed('spironolactone'), detail: 'Spironolactone labeling: hyperkalemia risk.' },
  'FDA label — gabapentin': { label: 'FDA label — gabapentin', kind: 'FDA', url: dailymed('gabapentin'), detail: 'Gabapentin labeling: renal dosing, CNS depression.' },
};

// Anything not explicitly registered still resolves — to a PubMed
// search on the label — so an evidence chip never dead-ends.
export function resolveEvidence(label: string): EvidenceEntry {
  const hit = REGISTRY[label];
  if (hit) return hit;
  return {
    label,
    kind: 'PubMed',
    url: pubmed(label),
    detail: 'Authoritative literature search for this reference.',
  };
}

export function hasEvidence(label: string): boolean {
  return Boolean(REGISTRY[label]);
}

export const EVIDENCE_REGISTRY = REGISTRY;
