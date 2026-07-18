import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RecStatus, DraftOrder, Specialty, OrderActionType, Severity, ModuleKey } from '../types';

// ---------------- snooze durations (Prompt #3) ----------------
export const SNOOZE_OPTIONS = [
  { key: '4h', label: '4 hours', ms: 4 * 3600_000 },
  { key: '24h', label: '24 hours', ms: 24 * 3600_000 },
  { key: '7d', label: '7 days', ms: 7 * 24 * 3600_000 },
  { key: '30d', label: '30 days', ms: 30 * 24 * 3600_000 },
] as const;

export type DeferReason = 'patient-preference' | 'awaiting-labs' | 'disagree' | 'monitoring' | 'other';

export interface SnoozeState {
  until: number;
  label: string;
}

interface Persisted {
  lastPatientId: string;
  specialty: Specialty;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  activeTab: Record<string, string>; // per patient
  showLowConfidence: boolean;
  recStatus: Record<string, Record<string, RecStatus>>; // patient -> rec -> status
  deferReasons: Record<string, Record<string, DeferReason>>;
  monitoringDone: Record<string, Record<string, boolean>>;
  monitoringStatus: Record<string, Record<string, 'ordered' | 'dismissed'>>; // per watch-out
  snoozes: Record<string, Record<string, SnoozeState>>;
  orders: DraftOrder[];
}

const KEY = 'kap.state.v1';

function initialState(): Persisted {
  return {
    lastPatientId: 'whitfield-eleanor',
    specialty: 'primary-care',
    theme: (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light',
    sidebarCollapsed: false,
    activeTab: {},
    showLowConfidence: false,
    recStatus: {},
    deferReasons: {},
    monitoringDone: {},
    monitoringStatus: {},
    snoozes: {},
    orders: [],
  };
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initialState(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return initialState();
}

interface StoreApi extends Persisted {
  setSpecialty: (s: Specialty) => void;
  setTheme: (t: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setLastPatient: (id: string) => void;
  setActiveTab: (patientId: string, tab: string) => void;
  setShowLowConfidence: (v: boolean) => void;
  setRecStatus: (patientId: string, recId: string, status: RecStatus, reason?: DeferReason) => void;
  bulkSetStatus: (patientId: string, recIds: string[], status: RecStatus) => void;
  snooze: (patientId: string, recId: string, ms: number, label: string) => void;
  clearSnooze: (patientId: string, recId: string) => void;
  setMonitoringDone: (patientId: string, watchId: string, done: boolean) => void;
  setMonitoringStatus: (patientId: string, watchId: string, status: 'ordered' | 'dismissed' | null) => void;
  createOrder: (o: Omit<DraftOrder, 'id' | 'createdAt' | 'status'>) => void;
  updateOrder: (id: string, patch: Partial<Pick<DraftOrder, 'orderText' | 'clinicalNote' | 'patientMessage'>>) => void;
  signOrder: (id: string, by: string) => void;
  cancelOrder: (id: string) => void;
  signAllOrders: (by: string) => void;
  resetPatient: (patientId: string) => void;
}

const StoreCtx = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    try {
      localStorage.setItem('kap.theme', state.theme);
    } catch {
      /* ignore */
    }
  }, [state.theme]);

  const api = useMemo<StoreApi>(() => {
    const patch = (fn: (s: Persisted) => Persisted) => setState(fn);
    const nestSet = <T,>(obj: Record<string, Record<string, T>>, pid: string, key: string, val: T) => ({
      ...obj,
      [pid]: { ...(obj[pid] || {}), [key]: val },
    });

    return {
      ...state,
      setSpecialty: (s) => patch((p) => ({ ...p, specialty: s })),
      setTheme: (t) => patch((p) => ({ ...p, theme: t })),
      toggleSidebar: () => patch((p) => ({ ...p, sidebarCollapsed: !p.sidebarCollapsed })),
      setLastPatient: (id) => patch((p) => ({ ...p, lastPatientId: id })),
      setActiveTab: (pid, tab) => patch((p) => ({ ...p, activeTab: { ...p.activeTab, [pid]: tab } })),
      setShowLowConfidence: (v) => patch((p) => ({ ...p, showLowConfidence: v })),
      setRecStatus: (pid, recId, status, reason) =>
        patch((p) => ({
          ...p,
          recStatus: nestSet(p.recStatus, pid, recId, status),
          deferReasons: reason ? nestSet(p.deferReasons, pid, recId, reason) : p.deferReasons,
        })),
      bulkSetStatus: (pid, recIds, status) =>
        patch((p) => {
          const cur = { ...(p.recStatus[pid] || {}) };
          for (const id of recIds) cur[id] = status;
          return { ...p, recStatus: { ...p.recStatus, [pid]: cur } };
        }),
      snooze: (pid, recId, ms, label) =>
        patch((p) => ({ ...p, snoozes: nestSet(p.snoozes, pid, recId, { until: Date.now() + ms, label }) })),
      clearSnooze: (pid, recId) =>
        patch((p) => {
          const cur = { ...(p.snoozes[pid] || {}) };
          delete cur[recId];
          return { ...p, snoozes: { ...p.snoozes, [pid]: cur } };
        }),
      setMonitoringDone: (pid, watchId, done) =>
        patch((p) => ({ ...p, monitoringDone: nestSet(p.monitoringDone, pid, watchId, done) })),
      setMonitoringStatus: (pid, watchId, status) =>
        patch((p) => {
          const cur = { ...(p.monitoringStatus[pid] || {}) };
          if (status === null) delete cur[watchId];
          else cur[watchId] = status;
          return { ...p, monitoringStatus: { ...p.monitoringStatus, [pid]: cur } };
        }),
      createOrder: (o) =>
        patch((p) => {
          // replace an existing pending order for the same rec
          const filtered = p.orders.filter((x) => !(x.recId === o.recId && x.status === 'pending-review'));
          const order: DraftOrder = {
            ...o,
            id: `ord-${o.recId}-${Date.now()}`,
            createdAt: Date.now(),
            status: 'pending-review',
          };
          return { ...p, orders: [order, ...filtered] };
        }),
      updateOrder: (id, patchFields) =>
        patch((p) => ({ ...p, orders: p.orders.map((o) => (o.id === id ? { ...o, ...patchFields } : o)) })),
      signOrder: (id, by) =>
        patch((p) => ({ ...p, orders: p.orders.map((o) => (o.id === id ? { ...o, status: 'signed', signedBy: by } : o)) })),
      cancelOrder: (id) =>
        patch((p) => ({ ...p, orders: p.orders.map((o) => (o.id === id ? { ...o, status: 'canceled' } : o)) })),
      signAllOrders: (by) =>
        patch((p) => ({ ...p, orders: p.orders.map((o) => (o.status === 'pending-review' ? { ...o, status: 'signed', signedBy: by } : o)) })),
      resetPatient: (pid) =>
        patch((p) => ({
          ...p,
          recStatus: { ...p.recStatus, [pid]: {} },
          monitoringDone: { ...p.monitoringDone, [pid]: {} },
          snoozes: { ...p.snoozes, [pid]: {} },
          orders: p.orders.filter((o) => o.patientId !== pid),
        })),
    };
  }, [state]);

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// convenience helpers -------------------------------------------------
export interface OrderDraft {
  patientId: string;
  recId: string;
  actionType: OrderActionType;
  targetMed: string;
  detail: string;
  orderText: string;
  severity: Severity;
  module: ModuleKey;
}
