// ============================================================
// useKapsuleAnalysis — fetch the backend agentic analysis for a patient,
// cached per (patient, specialty). Returns loading / error / data + reload.
// The analysis can take a while (six LLM agents), so results are cached.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Patient } from '../types';
import { analyzeChart, type AnalysisResponse } from '../lib/kapsuleApi';

const cache = new Map<string, AnalysisResponse>();

export interface AnalysisState {
  data: AnalysisResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useKapsuleAnalysis(patient: Patient, specialty: string): AnalysisState {
  const key = `${patient.id}:${specialty}`;
  const [data, setData] = useState<AnalysisResponse | null>(() => cache.get(key) || null);
  const [loading, setLoading] = useState<boolean>(!cache.has(key));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    if (cache.has(key) && nonce === 0) {
      setData(cache.get(key)!);
      setLoading(false);
      setError(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    analyzeChart(patient, specialty)
      .then((res) => {
        if (id !== reqId.current) return;
        cache.set(key, res);
        setData(res);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => {
    cache.delete(key);
    setNonce((n) => n + 1);
  }, [key]);

  return { data, loading, error, reload };
}
