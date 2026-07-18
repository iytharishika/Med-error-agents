// ============================================================
// Kapsule backend client — talks to the FastAPI agentic backend.
// Base URL comes from VITE_KAPSULE_API (defaults to localhost:8000).
// ============================================================
import type { Patient, Severity } from '../types';

export const KAPSULE_API =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_KAPSULE_API || 'http://localhost:8000';

export type BackendTier = 'critical' | 'high' | 'moderate' | 'low' | 'info';

export interface BackendEvidence {
  source: string;
  detail: string;
  citation?: string | null;
}

export interface BackendRec {
  agent: string;
  tier: BackendTier;
  specialty: string;
  action: string;
  title: string;
  rationale: string;
  order_target?: string | null;
  confidence: number;
  evidence: BackendEvidence[];
  tags: string[];
}

export interface BackendConflict {
  kind: string;
  description: string;
  order_target?: string | null;
  agents_involved: string[];
  recommendation_titles: string[];
  resolution: string;
  winning_action?: string | null;
  tier: BackendTier;
}

export interface BackendAgentResult {
  agent: string;
  ran: boolean;
  error?: string | null;
  recommendations: BackendRec[];
  calculators: Record<string, unknown>;
  latency_ms: number;
}

export interface BackendPlan {
  summary: string;
  prioritized_actions: BackendRec[];
  monitoring_plan: string[];
  patient_facing_summary: string;
}

export interface AnalysisResponse {
  patient_id: string;
  encounter_id: string;
  visit_title: string;
  routed_agents: string[];
  agent_results: BackendAgentResult[];
  conflicts: BackendConflict[];
  plan: BackendPlan;
  llm_enabled: boolean;
  total_latency_ms: number;
}

export interface DrugCheckFinding {
  kind: string;
  severity: Severity;
  finding: string;
  patient_rationale: string;
  mechanism: string;
  action: string;
  monitoring: string[];
  evidence: string[];
  drugs: string[];
}

export interface DrugCheckResponse {
  candidates: string[];
  new_findings: DrugCheckFinding[];
  overall_severity: Severity;
  projected_health_score_delta: number;
  all_findings_with_candidate: DrugCheckFinding[];
}

// Backend tier -> the frontend's Severity vocabulary (for reusing badges/colors).
export const TIER_TO_SEVERITY: Record<BackendTier, Severity> = {
  critical: 'contraindicated',
  high: 'major',
  moderate: 'moderate',
  low: 'minor',
  info: 'info',
};

// ---- payload mapping -------------------------------------------------------

export interface ChartPayload {
  id: string;
  name: string;
  gender: string;
  dob: string | null;
  conditions: { label: string; code?: string }[];
  medications: { name: string; dose: string; status: string }[];
  labs: { name: string; value: number | string; unit: string; date?: string }[];
  allergies: string[];
  visit_title: string;
}

/** Convert a frontend Patient into the backend's chart payload. */
export function patientToChart(p: Patient): ChartPayload {
  return {
    id: p.id,
    name: p.name,
    gender: p.gender,
    dob: p.dob || null,
    conditions: p.diagnoses.map((d) => ({ label: d.label, code: d.code })),
    medications: p.meds.map((m) => ({ name: m.name, dose: m.dose, status: 'active' })),
    labs: p.labs.map((l) => ({ name: l.name, value: l.value, unit: l.unit, date: l.date })),
    allergies: p.allergies.map((a) => a.substance),
    visit_title: 'Medication review',
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${KAPSULE_API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kapsule backend ${res.status} at ${path}`);
  return res.json() as Promise<T>;
}

/** Full agentic analysis for a patient (engine + agents + conflicts + plan). */
export function analyzeChart(p: Patient, specialty: string): Promise<AnalysisResponse> {
  return post<AnalysisResponse>('/analyze-chart', {
    patient: patientToChart(p),
    event: 'encounter',
    specialty,
  });
}

/** Deterministic New-Med Simulator (fast, no LLM). */
export function drugCheckChart(p: Patient, candidateDrugs: string[]): Promise<DrugCheckResponse> {
  return post<DrugCheckResponse>('/drug-check-chart', {
    patient: patientToChart(p),
    candidate_drugs: candidateDrugs,
  });
}

/** The Cost Optimization agent's top verdict, if it ran. */
export function costVerdict(a: AnalysisResponse): BackendRec | null {
  const cost = a.agent_results.find((r) => r.agent === 'cost_optimization');
  return cost?.recommendations?.[0] ?? null;
}
