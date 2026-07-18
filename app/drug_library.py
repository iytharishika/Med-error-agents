"""Curated drug library with fuzzy search + raw-label normalization.

Each entry carries the fields Prompt #1 asks for: generic/brand names, class and
class tags, typical dosing, renal & hepatic guidance, pregnancy/lactation,
monitoring defaults, boxed warnings, Beers flag, and evidence labels.

`class_tags` are the machine-readable hooks the deterministic engine matches its
rules against (e.g. "raas", "qt_prolonging", "anticoagulant"). The set below is
curated to cover the interaction/burden/duplicate/caution rules in engine.py and
the medications present in the demo FHIR dataset; it is straightforward to extend
toward the full 150-drug target.
"""
from __future__ import annotations

import difflib
import re
from functools import lru_cache
from typing import Any, Optional

# Compact schema: (generic, brands, klass, tags, dose, renal, hepatic, preg, monitoring, boxed, beers, evidence)
_RAW: list[tuple] = [
    # --- RAAS / antihypertensives ---
    ("lisinopril", ["Prinivil", "Zestril"], "ACE inhibitor", ["raas", "ace_inhibitor"],
     "10-40 mg daily", "Reduce/monitor; hold if AKI", "No adjustment", "Contraindicated (D)",
     ["potassium", "creatinine"], "Fetal toxicity", False, ["ACC/AHA HF 2022"]),
    ("enalapril", ["Vasotec"], "ACE inhibitor", ["raas", "ace_inhibitor"],
     "5-20 mg BID", "Reduce/monitor", "No adjustment", "Contraindicated (D)",
     ["potassium", "creatinine"], "Fetal toxicity", False, ["ACC/AHA HF 2022"]),
    ("ramipril", ["Altace"], "ACE inhibitor", ["raas", "ace_inhibitor"],
     "2.5-10 mg daily", "Reduce/monitor", "No adjustment", "Contraindicated (D)",
     ["potassium", "creatinine"], "Fetal toxicity", False, ["ACC/AHA HF 2022"]),
    ("losartan", ["Cozaar"], "ARB", ["raas", "arb"],
     "50-100 mg daily", "Monitor K/Cr", "Reduce in hepatic impairment", "Contraindicated (D)",
     ["potassium", "creatinine"], "Fetal toxicity", False, ["ACC/AHA HF 2022"]),
    ("valsartan", ["Diovan"], "ARB", ["raas", "arb"],
     "80-320 mg daily", "Monitor K/Cr", "Caution", "Contraindicated (D)",
     ["potassium", "creatinine"], "Fetal toxicity", False, ["ACC/AHA HF 2022"]),
    ("sacubitril/valsartan", ["Entresto"], "ARNI", ["raas", "arni", "arb"],
     "24/26-97/103 mg BID", "Caution <30", "Reduce (moderate)", "Contraindicated (D)",
     ["potassium", "creatinine", "blood pressure"], "Fetal toxicity", False, ["PARADIGM-HF", "ACC/AHA HF 2022"]),
    ("spironolactone", ["Aldactone"], "MRA / K-sparing diuretic", ["mra", "potassium_sparing", "raas"],
     "12.5-50 mg daily", "Avoid if eGFR<30; monitor K", "Caution", "Caution",
     ["potassium", "creatinine"], None, True, ["RALES", "ACC/AHA HF 2022"]),
    ("eplerenone", ["Inspra"], "MRA", ["mra", "potassium_sparing", "raas"],
     "25-50 mg daily", "Avoid if eGFR<30", "Caution", "Caution",
     ["potassium", "creatinine"], None, False, ["ACC/AHA HF 2022"]),
    ("finerenone", ["Kerendia"], "Nonsteroidal MRA", ["mra", "potassium_sparing"],
     "10-20 mg daily", "Contra if K>5; hold per K", "Avoid severe", "Caution",
     ["potassium"], None, False, ["FIDELIO-DKD", "KDIGO Diabetes CKD"]),
    ("amlodipine", ["Norvasc"], "Dihydropyridine CCB", ["ccb"],
     "2.5-10 mg daily", "No adjustment", "Reduce/titrate slow", "Limited data",
     ["blood pressure", "edema"], None, False, []),
    ("hydrochlorothiazide", ["Microzide"], "Thiazide diuretic", ["thiazide", "diuretic"],
     "12.5-25 mg daily", "Less effective <30", "Caution", "Caution",
     ["potassium", "sodium", "creatinine"], None, False, []),
    ("chlorthalidone", ["Thalitone"], "Thiazide-like diuretic", ["thiazide", "diuretic"],
     "12.5-25 mg daily", "Less effective <30", "Caution", "Caution",
     ["potassium", "sodium"], None, False, []),
    ("furosemide", ["Lasix"], "Loop diuretic", ["loop_diuretic", "diuretic"],
     "20-80 mg daily-BID", "Higher doses needed in CKD", "Caution", "Caution",
     ["potassium", "creatinine", "weight"], None, False, []),
    ("atenolol", ["Tenormin"], "Beta blocker", ["beta_blocker"],
     "25-100 mg daily", "Reduce if eGFR<35 (renally cleared)", "No adjustment", "Caution",
     ["heart rate", "blood pressure"], None, True, []),
    ("metoprolol", ["Lopressor", "Toprol XL"], "Beta blocker", ["beta_blocker"],
     "succinate 25-200 mg daily", "No adjustment", "Reduce/titrate", "Caution",
     ["heart rate", "blood pressure"], None, False, ["ACC/AHA HF 2022"]),
    ("carvedilol", ["Coreg"], "Beta blocker", ["beta_blocker"],
     "3.125-25 mg BID", "No adjustment", "Avoid in severe", "Caution",
     ["heart rate", "blood pressure"], None, False, ["ACC/AHA HF 2022"]),
    ("clonidine", ["Catapres"], "Central alpha-2 agonist", ["anticholinergic", "cns_depressant"],
     "0.1-0.3 mg BID", "Reduce", "Caution", "Caution",
     ["blood pressure", "heart rate"], "Rebound hypertension", True, ["Beers 2023"]),
    # --- Diabetes ---
    ("metformin", ["Glucophage"], "Biguanide", ["antidiabetic"],
     "500-1000 mg BID", "Contra <30; caution <45; max 1000 mg <45", "Avoid in hepatic impairment", "Compatible",
     ["hba1c", "egfr", "b12"], "Lactic acidosis", False, ["FDA metformin renal", "ADA Standards of Care"]),
    ("glipizide", ["Glucotrol"], "Sulfonylurea", ["sulfonylurea", "antidiabetic", "hypoglycemia_risk"],
     "5-20 mg daily", "Start low", "Caution", "Caution",
     ["glucose", "hba1c"], None, False, ["Beers 2023"]),
    ("glimepiride", ["Amaryl"], "Sulfonylurea", ["sulfonylurea", "antidiabetic", "hypoglycemia_risk"],
     "1-8 mg daily", "Start low", "Caution", "Caution",
     ["glucose", "hba1c"], None, True, ["Beers 2023"]),
    ("glyburide", ["DiaBeta"], "Sulfonylurea", ["sulfonylurea", "antidiabetic", "hypoglycemia_risk"],
     "1.25-20 mg daily", "Avoid in CKD", "Caution", "Avoid",
     ["glucose"], None, True, ["Beers 2023"]),
    ("insulin glargine", ["Lantus", "Basaglar"], "Basal insulin", ["insulin", "antidiabetic", "hypoglycemia_risk"],
     "individualized units SC", "Reduce needs in CKD", "Monitor", "Compatible",
     ["glucose"], None, False, []),
    ("empagliflozin", ["Jardiance"], "SGLT2 inhibitor", ["sglt2", "antidiabetic"],
     "10-25 mg daily", "Do not initiate <20; CV/renal benefit retained", "Caution", "Not recommended",
     ["egfr", "volume status", "glucose"], "Ketoacidosis, genital infection", False,
     ["EMPA-REG OUTCOME", "EMPEROR-Reduced", "DAPA-CKD"]),
    ("dapagliflozin", ["Farxiga"], "SGLT2 inhibitor", ["sglt2", "antidiabetic"],
     "10 mg daily", "Do not initiate <20 (T2DM); benefit in CKD/HF", "Caution", "Not recommended",
     ["egfr", "volume status"], "Ketoacidosis", False, ["DAPA-HF", "DAPA-CKD"]),
    ("semaglutide", ["Ozempic", "Wegovy"], "GLP-1 receptor agonist", ["glp1", "antidiabetic"],
     "0.25-2 mg weekly SC", "No adjustment", "No adjustment", "Avoid",
     ["hba1c", "weight"], "Thyroid C-cell tumors", False, ["ADA Standards of Care"]),
    ("sitagliptin", ["Januvia"], "DPP-4 inhibitor", ["dpp4", "antidiabetic"],
     "100 mg daily", "Reduce: 50 mg <45, 25 mg <30", "No adjustment", "Limited data",
     ["hba1c"], None, False, []),
    # --- Lipids / antithrombotics ---
    ("atorvastatin", ["Lipitor"], "HMG-CoA reductase inhibitor (statin)", ["statin"],
     "10-80 mg daily", "No adjustment", "Contra in active liver disease", "Contraindicated (X)",
     ["ldl", "alt"], None, False, ["ACC/AHA Cholesterol 2018"]),
    ("rosuvastatin", ["Crestor"], "Statin", ["statin"],
     "5-40 mg daily", "Max 10 mg if eGFR<30", "Caution", "Contraindicated (X)",
     ["ldl", "alt"], None, False, ["ACC/AHA Cholesterol 2018"]),
    ("simvastatin", ["Zocor"], "Statin", ["statin", "cyp3a4_substrate"],
     "10-40 mg daily", "Start 5 mg if eGFR<30", "Contra in active liver disease", "Contraindicated (X)",
     ["ldl", "alt"], "Myopathy at 80 mg", False, ["ACC/AHA Cholesterol 2018"]),
    ("pravastatin", ["Pravachol"], "Statin", ["statin"],
     "10-80 mg daily", "Start low in severe", "Caution", "Contraindicated (X)",
     ["ldl", "alt"], None, False, []),
    ("aspirin", ["Bayer", "Ecotrin"], "Antiplatelet (low-dose)", ["antiplatelet", "bleeding_risk"],
     "81 mg daily", "Caution in CKD", "Caution", "Caution (3rd tri)",
     ["hemoglobin"], None, False, []),
    ("clopidogrel", ["Plavix"], "P2Y12 antiplatelet", ["antiplatelet", "bleeding_risk"],
     "75 mg daily", "No adjustment", "Caution", "Limited data",
     ["hemoglobin"], None, False, []),
    ("warfarin", ["Coumadin", "Jantoven"], "Vitamin K antagonist", ["anticoagulant", "warfarin", "bleeding_risk"],
     "individualized to INR 2-3", "Monitor INR", "Increased sensitivity", "Contraindicated (X)",
     ["inr", "hemoglobin"], "Major bleeding", False, ["HAS-BLED"]),
    ("apixaban", ["Eliquis"], "DOAC (factor Xa inhibitor)", ["anticoagulant", "doac", "bleeding_risk"],
     "5 mg BID (2.5 if criteria)", "Reduce per age/wt/Cr", "Avoid in severe", "Limited data",
     ["hemoglobin", "creatinine"], "Bleeding; spinal hematoma", False, ["ESC AFib 2020"]),
    ("rivaroxaban", ["Xarelto"], "DOAC (factor Xa inhibitor)", ["anticoagulant", "doac", "bleeding_risk"],
     "20 mg daily w/ food", "Avoid if CrCl<15; 15 mg 15-50", "Avoid moderate-severe", "Limited data",
     ["hemoglobin", "creatinine"], "Bleeding", False, ["ESC AFib 2020"]),
    ("dabigatran", ["Pradaxa"], "DOAC (direct thrombin inhibitor)", ["anticoagulant", "doac", "bleeding_risk"],
     "150 mg BID", "Avoid CrCl<30; renally cleared", "No adjustment", "Limited data",
     ["hemoglobin", "creatinine"], "Bleeding", False, ["ESC AFib 2020"]),
    ("clopidogrel/aspirin", ["DAPT"], "Dual antiplatelet", ["antiplatelet", "bleeding_risk"],
     "per indication", "Caution", "Caution", "Caution", ["hemoglobin"], None, False, []),
    # --- Cardiac / nitrates ---
    ("nitroglycerin", ["Nitrostat", "Nitro-Bid"], "Nitrate", ["nitrate"],
     "0.4 mg SL PRN", "No adjustment", "No adjustment", "Limited data",
     ["blood pressure"], None, False, []),
    ("isosorbide mononitrate", ["Imdur"], "Nitrate", ["nitrate"],
     "30-120 mg daily", "No adjustment", "Caution", "Limited data",
     ["blood pressure"], None, False, []),
    ("digoxin", ["Lanoxin"], "Cardiac glycoside", ["digoxin", "narrow_therapeutic"],
     "0.125-0.25 mg daily", "Reduce dose; renally cleared", "No adjustment", "Compatible",
     ["digoxin level", "potassium", "creatinine"], "Toxicity", True, ["Beers 2023"]),
    ("sildenafil", ["Viagra", "Revatio"], "PDE5 inhibitor", ["pde5"],
     "20-100 mg", "Reduce", "Reduce", "N/A",
     ["blood pressure"], "Hypotension with nitrates", False, []),
    ("tadalafil", ["Cialis", "Adcirca"], "PDE5 inhibitor", ["pde5"],
     "2.5-20 mg", "Reduce", "Reduce", "N/A",
     ["blood pressure"], "Hypotension with nitrates", False, []),
    # --- Antibiotics ---
    ("azithromycin", ["Zithromax"], "Macrolide antibiotic", ["macrolide", "qt_prolonging", "cyp3a4_inhibitor"],
     "250-500 mg daily", "No adjustment", "Caution", "Compatible",
     ["qtc"], "QT prolongation", False, ["FDA QT drug list"]),
    ("clarithromycin", ["Biaxin"], "Macrolide antibiotic", ["macrolide", "qt_prolonging", "cyp3a4_inhibitor"],
     "250-500 mg BID", "Reduce if CrCl<30", "Caution", "Avoid (1st tri)",
     ["qtc"], "QT prolongation", False, ["FDA QT drug list"]),
    ("ciprofloxacin", ["Cipro"], "Fluoroquinolone", ["fluoroquinolone", "qt_prolonging"],
     "250-750 mg BID", "Reduce if CrCl<30", "Caution", "Caution",
     ["qtc"], "Tendon rupture, QT", False, ["FDA QT drug list"]),
    ("levofloxacin", ["Levaquin"], "Fluoroquinolone", ["fluoroquinolone", "qt_prolonging"],
     "250-750 mg daily", "Reduce if CrCl<50", "No adjustment", "Caution",
     ["qtc"], "Tendon rupture, QT", False, ["FDA QT drug list"]),
    ("trimethoprim/sulfamethoxazole", ["Bactrim", "Septra"], "Sulfonamide antibiotic",
     ["tmp_smx", "potassium_raising"],
     "1 DS BID", "Reduce if CrCl<30; avoid <15", "Caution", "Avoid (1st/3rd tri)",
     ["potassium", "creatinine"], "Hyperkalemia; SJS", False, []),
    ("amoxicillin", ["Amoxil"], "Aminopenicillin", ["penicillin"],
     "500 mg TID", "Reduce if CrCl<30", "No adjustment", "Compatible",
     [], None, False, []),
    # --- CNS / pain / psych ---
    ("gabapentin", ["Neurontin"], "Gabapentinoid", ["gabapentinoid", "cns_depressant"],
     "300-1200 mg TID", "Renal dose adjust (per CrCl)", "No adjustment", "Limited data",
     ["sedation"], None, False, ["Beers 2023"]),
    ("pregabalin", ["Lyrica"], "Gabapentinoid", ["gabapentinoid", "cns_depressant"],
     "75-300 mg BID", "Renal dose adjust", "No adjustment", "Limited data",
     ["sedation"], None, False, []),
    ("tramadol", ["Ultram"], "Opioid / SNRI", ["opioid", "cns_depressant", "serotonergic", "seizure_risk"],
     "50-100 mg q6h PRN", "Reduce if CrCl<30", "Reduce", "Avoid",
     ["sedation", "respiratory rate"], "Addiction; seizures; serotonin syndrome", True, ["Beers 2023"]),
    ("oxycodone", ["OxyContin", "Roxicodone"], "Opioid", ["opioid", "cns_depressant"],
     "5-10 mg q4-6h PRN", "Reduce", "Reduce", "Caution",
     ["sedation", "respiratory rate"], "Addiction; respiratory depression", False, []),
    ("hydrocodone/acetaminophen", ["Norco", "Vicodin"], "Opioid combination", ["opioid", "cns_depressant"],
     "5/325 q4-6h PRN", "Reduce", "Max APAP 3 g/day", "Caution",
     ["sedation", "respiratory rate"], "Addiction; hepatotoxicity", False, []),
    ("morphine", ["MS Contin"], "Opioid", ["opioid", "cns_depressant"],
     "individualized", "Reduce; active metabolite accumulates", "Reduce", "Caution",
     ["sedation", "respiratory rate"], "Respiratory depression", False, []),
    ("diazepam", ["Valium"], "Benzodiazepine", ["benzodiazepine", "cns_depressant"],
     "2-10 mg BID-QID", "Caution", "Reduce", "Avoid",
     ["sedation"], "CNS/respiratory depression with opioids", True, ["Beers 2023"]),
    ("lorazepam", ["Ativan"], "Benzodiazepine", ["benzodiazepine", "cns_depressant"],
     "0.5-2 mg BID-TID", "Caution", "Caution", "Avoid",
     ["sedation"], "CNS/respiratory depression with opioids", True, ["Beers 2023"]),
    ("zolpidem", ["Ambien"], "Z-drug hypnotic", ["cns_depressant", "sedative_hypnotic"],
     "5-10 mg qHS", "No adjustment", "Reduce", "Avoid",
     ["sedation"], "Complex sleep behaviors", True, ["Beers 2023"]),
    ("sentraline placeholder", [], "", [], "", "", "", "", [], None, False, []),
    ("sertraline", ["Zoloft"], "SSRI", ["ssri", "serotonergic"],
     "50-200 mg daily", "No adjustment", "Reduce", "Caution",
     ["mood", "sodium"], "Suicidality (<25)", False, []),
    ("escitalopram", ["Lexapro"], "SSRI", ["ssri", "serotonergic", "qt_prolonging"],
     "10-20 mg daily", "Caution", "Reduce", "Caution",
     ["mood", "qtc", "sodium"], "Suicidality (<25); QT", False, ["FDA QT drug list"]),
    ("citalopram", ["Celexa"], "SSRI", ["ssri", "serotonergic", "qt_prolonging"],
     "20 mg daily (max 20 if >60)", "Caution", "Reduce", "Caution",
     ["mood", "qtc"], "QT prolongation", True, ["FDA QT drug list", "Beers 2023"]),
    ("fluoxetine", ["Prozac"], "SSRI", ["ssri", "serotonergic"],
     "20-80 mg daily", "No adjustment", "Reduce", "Caution",
     ["mood", "sodium"], "Suicidality (<25)", False, []),
    ("duloxetine", ["Cymbalta"], "SNRI", ["snri", "serotonergic"],
     "30-60 mg daily", "Avoid if CrCl<30", "Avoid in hepatic impairment", "Caution",
     ["mood", "blood pressure"], "Suicidality (<25)", False, []),
    ("venlafaxine", ["Effexor"], "SNRI", ["snri", "serotonergic"],
     "37.5-225 mg daily", "Reduce", "Reduce", "Caution",
     ["mood", "blood pressure"], "Suicidality (<25)", False, []),
    ("amitriptyline", ["Elavil"], "Tricyclic antidepressant", ["tca", "anticholinergic", "serotonergic", "qt_prolonging"],
     "10-150 mg qHS", "Caution", "Caution", "Caution",
     ["qtc", "sedation"], "Suicidality; anticholinergic", True, ["Beers 2023"]),
    ("diphenhydramine", ["Benadryl"], "1st-gen antihistamine", ["anticholinergic", "cns_depressant"],
     "25-50 mg q6h PRN", "Caution", "Caution", "Compatible",
     ["sedation"], None, True, ["Beers 2023"]),
    ("hydroxyzine", ["Vistaril", "Atarax"], "Antihistamine / anxiolytic", ["anticholinergic", "qt_prolonging"],
     "25-50 mg q6h PRN", "Reduce", "Reduce", "Avoid (early)",
     ["sedation", "qtc"], None, True, ["Beers 2023"]),
    ("oxybutynin", ["Ditropan"], "Antimuscarinic (OAB)", ["anticholinergic"],
     "5 mg BID-TID", "Caution", "Caution", "Caution",
     ["cognition"], None, True, ["Beers 2023"]),
    ("cyclobenzaprine", ["Flexeril"], "Skeletal muscle relaxant", ["anticholinergic", "cns_depressant"],
     "5-10 mg TID", "Caution", "Avoid moderate-severe", "Caution",
     ["sedation"], None, True, ["Beers 2023"]),
    ("quetiapine", ["Seroquel"], "Atypical antipsychotic", ["antipsychotic", "qt_prolonging", "cns_depressant"],
     "25-300 mg", "No adjustment", "Reduce", "Caution",
     ["qtc", "glucose", "weight"], "Increased mortality in dementia", True, ["Beers 2023"]),
    ("haloperidol", ["Haldol"], "Typical antipsychotic", ["antipsychotic", "qt_prolonging"],
     "0.5-5 mg", "No adjustment", "Caution", "Caution",
     ["qtc"], "QT; mortality in dementia", True, ["FDA QT drug list", "Beers 2023"]),
    ("trazodone", ["Desyrel"], "Serotonin antagonist/reuptake inhibitor", ["serotonergic", "cns_depressant", "qt_prolonging"],
     "25-100 mg qHS", "No adjustment", "Reduce", "Caution",
     ["sedation", "qtc"], "Priapism", False, []),
    # --- GI ---
    ("omeprazole", ["Prilosec"], "Proton pump inhibitor", ["ppi"],
     "20-40 mg daily", "No adjustment", "Reduce in severe", "Compatible",
     ["magnesium", "b12"], None, False, ["Choosing Wisely"]),
    ("pantoprazole", ["Protonix"], "Proton pump inhibitor", ["ppi"],
     "40 mg daily", "No adjustment", "Reduce in severe", "Compatible",
     ["magnesium"], None, False, ["Choosing Wisely"]),
    ("ranitidine", ["Zantac"], "H2 receptor antagonist", ["h2ra", "anticholinergic"],
     "150 mg BID", "Reduce", "Caution", "Compatible",
     [], None, False, []),
    ("famotidine", ["Pepcid"], "H2 receptor antagonist", ["h2ra"],
     "20-40 mg daily", "Reduce if CrCl<50", "No adjustment", "Compatible",
     [], None, False, []),
    # --- Other common ---
    ("levothyroxine", ["Synthroid"], "Thyroid hormone", ["thyroid"],
     "titrated mcg daily", "No adjustment", "No adjustment", "Compatible",
     ["tsh"], None, False, []),
    ("prednisone", ["Deltasone"], "Corticosteroid", ["corticosteroid", "potassium_lowering"],
     "variable", "No adjustment", "Caution", "Caution",
     ["glucose", "blood pressure", "potassium"], None, False, []),
    ("ibuprofen", ["Advil", "Motrin"], "NSAID", ["nsaid", "bleeding_risk"],
     "200-800 mg q6-8h", "Avoid in severe CKD", "Caution", "Avoid (3rd tri)",
     ["creatinine", "blood pressure", "hemoglobin"], "GI bleed; CV; renal", True, ["Beers 2023"]),
    ("naproxen", ["Aleve"], "NSAID", ["nsaid", "bleeding_risk"],
     "250-500 mg BID", "Avoid in severe CKD", "Caution", "Avoid (3rd tri)",
     ["creatinine", "blood pressure"], "GI bleed; CV; renal", True, ["Beers 2023"]),
    ("meloxicam", ["Mobic"], "NSAID", ["nsaid", "bleeding_risk"],
     "7.5-15 mg daily", "Avoid in severe CKD", "Caution", "Avoid (3rd tri)",
     ["creatinine", "blood pressure"], "GI bleed; CV; renal", True, ["Beers 2023"]),
    ("allopurinol", ["Zyloprim"], "Xanthine oxidase inhibitor", ["urate_lowering"],
     "100-300 mg daily", "Reduce per CrCl", "Caution", "Limited data",
     ["urate", "creatinine"], "SJS/DRESS (HLA-B*5801)", False, []),
    ("potassium chloride", ["K-Dur", "Klor-Con"], "Potassium supplement", ["potassium_raising"],
     "10-40 mEq daily", "Caution in CKD; monitor K", "No adjustment", "Compatible",
     ["potassium"], None, False, []),
    ("ferrous sulfate", ["Feosol"], "Oral iron", ["iron"],
     "325 mg daily-TID", "No adjustment", "No adjustment", "Compatible",
     ["hemoglobin", "ferritin"], None, False, []),
    ("albuterol", ["ProAir", "Ventolin"], "SABA bronchodilator", ["saba"],
     "2 puffs q4-6h PRN", "No adjustment", "No adjustment", "Compatible",
     ["heart rate", "potassium"], None, False, []),
]

# supplements the drug-supplement engine reasons about
SUPPLEMENTS = {
    "fish oil": ["bleeding_risk"], "omega-3": ["bleeding_risk"],
    "ginkgo": ["bleeding_risk"], "vitamin e": ["bleeding_risk"],
    "garlic": ["bleeding_risk"], "st john's wort": ["serotonergic", "cyp3a4_inducer"],
    "turmeric": ["bleeding_risk"], "ginger": ["bleeding_risk"],
    "potassium supplement": ["potassium_raising"], "salt substitute": ["potassium_raising"],
    "grapefruit": ["cyp3a4_inhibitor"], "melatonin": ["cns_depressant"],
    "valerian": ["cns_depressant"], "coq10": [],
}


def _build() -> dict[str, dict[str, Any]]:
    lib: dict[str, dict[str, Any]] = {}
    for row in _RAW:
        (generic, brands, klass, tags, dose, renal, hepatic, preg,
         monitoring, boxed, beers, ev) = row
        if not klass:  # skip placeholder rows
            continue
        lib[generic] = {
            "generic": generic,
            "brands": brands,
            "drug_class": klass,
            "class_tags": tags,
            "typical_dose": dose,
            "renal_guidance": renal,
            "hepatic_guidance": hepatic,
            "pregnancy": preg,
            "monitoring": monitoring,
            "boxed_warning": boxed,
            "beers_flag": beers,
            "evidence": ev,
        }
    return lib


@lru_cache
def library() -> dict[str, dict[str, Any]]:
    return _build()


def all_drugs() -> list[dict[str, Any]]:
    return list(library().values())


_TOKEN = re.compile(r"[a-z]+")


def normalize_name(raw: str) -> Optional[str]:
    """Map a raw FHIR med label to a known generic name, if possible."""
    if not raw:
        return None
    low = raw.lower()
    lib = library()
    # direct generic substring
    for generic in lib:
        base = generic.split("/")[0]
        if base in low:
            return generic
    # brand substring
    for generic, entry in lib.items():
        for b in entry["brands"]:
            if b.lower() in low:
                return generic
    # fuzzy on first alpha token
    tokens = _TOKEN.findall(low)
    for tok in tokens:
        if len(tok) < 4:
            continue
        match = difflib.get_close_matches(tok, list(lib.keys()), n=1, cutoff=0.85)
        if match:
            return match[0]
    return None


def lookup(name: str) -> Optional[dict[str, Any]]:
    generic = normalize_name(name) or name.lower()
    return library().get(generic)


def search(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search generic/brand/class, ranking prefix > substring > fuzzy."""
    q = (query or "").strip().lower()
    if not q:
        return all_drugs()[:limit]
    scored: list[tuple[float, dict]] = []
    for entry in all_drugs():
        names = [entry["generic"]] + [b.lower() for b in entry["brands"]]
        cls = entry["drug_class"].lower() + " " + " ".join(entry["class_tags"])
        score = 0.0
        for n in names:
            n = n.lower()
            if n == q:
                score = max(score, 100)
            elif n.startswith(q):
                score = max(score, 80)
            elif q in n:
                score = max(score, 60)
            else:
                score = max(score, difflib.SequenceMatcher(None, q, n).ratio() * 50)
        if q in cls:
            score = max(score, 55)
        if score > 30:
            scored.append((score, entry))
    scored.sort(key=lambda x: (-x[0], x[1]["generic"]))
    return [e for _, e in scored[:limit]]
