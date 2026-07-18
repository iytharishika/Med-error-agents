import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { PATIENT_BY_ID, PATIENTS } from '../data/patients';
import { buildPatientView } from '../state/selectors';
import { ClinicalTopBar } from '../components/ClinicalTopBar';
import { AtAGlanceStrip } from '../components/AtAGlanceStrip';
import { PriorityStrip } from '../components/PriorityStrip';
import { TopOfMind } from '../components/TopOfMind';
import { PatientRail } from '../components/PatientRail';
import { RecommendationsTab } from '../features/RecommendationsTab';
import { SimulatorTab } from '../features/SimulatorTab';
import { DeprescribeTab } from '../features/DeprescribeTab';
import { MonitoringTab } from '../features/MonitoringTab';
import { TimelineTab } from '../features/TimelineTab';
import { OrderQueue } from '../features/OrderQueue';
import { RecommendationCard } from '../components/RecommendationCard';
import { ShareWithPatient } from '../components/ShareWithPatient';
import { PrintSummary } from '../components/PrintSummary';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
// --- Kapsule backend integration ---
import { BackendVerdict } from '../components/BackendVerdict';
import { BackendRecommendations } from '../features/BackendRecommendations';

const NAV = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'recommendations', label: 'Recommendations', icon: 'sparkles' },
  { key: 'simulator', label: 'New Med Simulator', icon: 'flask' },
  { key: 'deprescribe', label: 'Deprescribing', icon: 'layers' },
  { key: 'monitoring', label: 'Monitoring', icon: 'eye' },
  { key: 'timeline', label: 'Timeline', icon: 'clock' },
] as const;

function useWindowWidth() {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function Dashboard() {
  const store = useStore();
  const winW = useWindowWidth();
  const patient = PATIENT_BY_ID.get(store.lastPatientId) || PATIENTS[0];
  // Wide enough for 3 columns? Otherwise the rail stacks below the content
  // (kept visible, never squeezed). Manual toggle can still hide it entirely.
  const wide = winW >= 1180;
  const railVisible = !store.sidebarCollapsed;
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const nowRef = useRef(Date.now());

  const view = useMemo(
    () =>
      buildPatientView(
        patient,
        {
          recStatus: store.recStatus[patient.id] || {},
          snoozes: store.snoozes[patient.id] || {},
          monitoringDone: store.monitoringDone[patient.id] || {},
          showLowConfidence: store.showLowConfidence,
          specialty: store.specialty,
        },
        nowRef.current,
      ),
    [patient, store.recStatus, store.snoozes, store.monitoringDone, store.showLowConfidence, store.specialty],
  );

  const section = store.activeTab[patient.id] || 'home';
  const setSection = (t: string) => store.setActiveTab(patient.id, t);

  const highRiskMeds = patient.meds.filter((m) => m.riskFlag).length;
  const pendingOrders = store.orders.filter((o) => o.patientId === patient.id && o.status === 'pending-review').length;

  const counts: Record<string, number> = {
    home: view.counts.critical,
    recommendations: view.counts.recommendations,
    deprescribe: view.deprescribe.filter((r) => r.status === 'pending' && r.managed && !r.snoozed).length,
    monitoring: view.counts.monitoring,
    simulator: 0,
    timeline: patient.timeline.length,
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <ClinicalTopBar
        patient={patient}
        pendingOrders={pendingOrders}
        onOpenOrders={() => setOrdersOpen(true)}
        onPrint={() => window.print()}
        onPatientView={() => setShareOpen(true)}
      />

      <div
        className="no-print"
        style={{
          width: '100%', padding: '16px 18px', display: 'grid', gap: 18, alignItems: 'start', boxSizing: 'border-box',
          gridTemplateColumns: railVisible && wide ? '208px minmax(0,1fr) 320px' : '208px minmax(0,1fr)',
          gridTemplateAreas: railVisible ? (wide ? '"nav main rail"' : '"nav main" "nav rail"') : '"nav main"',
        }}
      >
        {/* left nav sidebar */}
        <nav style={{ gridArea: 'nav', position: 'sticky', top: 78, display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="Sections">
          {NAV.map((n) => {
            const on = section === n.key;
            const isHome = n.key === 'home';
            const c = counts[n.key];
            return (
              <button
                key={n.key}
                onClick={() => setSection(n.key)}
                aria-current={on}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                  background: on ? 'var(--accent-soft)' : 'transparent',
                  border: '1px solid ' + (on ? 'transparent' : 'transparent'),
                  color: on ? 'var(--accent-strong)' : 'var(--text-2)', fontSize: 14, fontWeight: on ? 700 : 600,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon name={n.icon} size={17} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.label}</span>
                {c > 0 && (
                  <span className="num" style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px', flexShrink: 0,
                    background: isHome ? 'var(--sev-crit)' : on ? 'var(--accent)' : 'var(--surface-3)',
                    color: isHome || on ? '#fff' : 'var(--text-2)' }}>{c}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* main content */}
        <div style={{ gridArea: 'main', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {section === 'home' && (
            <>
              <div style={{ position: 'sticky', top: 78, zIndex: 20 }}>
                <AtAGlanceStrip patient={patient} highRisk={highRiskMeds} criticalCount={view.counts.critical} />
              </div>
              {/* Agentic backend verdict: the single highest-priority action + cost projection */}
              <BackendVerdict patient={patient} specialty={store.specialty} onSeeAll={() => setSection('recommendations')} />
              {view.topOfMind ? (
                <TopOfMind rec={view.topOfMind} patientId={patient.id} moreCount={Math.max(0, view.active.length - 1)} onSeeMore={() => setSection('recommendations')} />
              ) : (
                <EmptyState icon="check" title="No open priorities" body="No critical or actionable findings for this patient in your specialty view right now." />
              )}
              {view.active.length > 1 && <PriorityStrip recs={view.active.filter((r) => r.id !== view.topOfMind?.id).slice(0, 12)} patientId={patient.id} />}
              {view.benefits.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <SubHead icon="check" title={`Confirmed benefits (${view.benefits.length})`} />
                  <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                    {view.benefits.map((r) => <RecommendationCard key={r.id} rec={r} patientId={patient.id} dense />)}
                  </div>
                </div>
              )}
            </>
          )}

          {section === 'recommendations' && (
            <>
              <SectionTitle icon="sparkles" title="Regimen Recommendations" />
              {/* Everything the agentic backend produced for this patient */}
              <BackendRecommendations patient={patient} specialty={store.specialty} />
              <div style={{ marginTop: 22 }}>
                <SubHead icon="clipboard" title="Interactive review (accept / defer / draft orders)" />
                <div style={{ marginTop: 10 }}>
                  <RecommendationsTab view={view} patientId={patient.id} />
                </div>
              </div>
              {view.otherSpecialty.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <SubHead icon="users" title={`Managed by other teams (${view.otherSpecialty.length})`} />
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '6px 0 10px' }}>Outside your specialty view — shown read-only for awareness.</div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {view.otherSpecialty.map((r) => <RecommendationCard key={r.id} rec={r} patientId={patient.id} dense />)}
                  </div>
                </div>
              )}
            </>
          )}

          {section === 'simulator' && (<><SectionTitle icon="flask" title="New Med Simulator" /><SimulatorTab patient={patient} /></>)}
          {section === 'deprescribe' && (<><SectionTitle icon="layers" title="Deprescribing" /><DeprescribeTab view={view} patientId={patient.id} /></>)}
          {section === 'monitoring' && (<><SectionTitle icon="eye" title="Monitoring" /><MonitoringTab view={view} patientId={patient.id} /></>)}
          {section === 'timeline' && (<><SectionTitle icon="clock" title="Timeline" /><TimelineTab patient={patient} /></>)}
        </div>

        {/* rail — 3rd column when wide, stacked below the content when narrow */}
        {railVisible && (
          <div style={{ gridArea: 'rail', minWidth: 0, maxWidth: wide ? 'none' : 560 }} className="rail">
            <PatientRail patient={patient} duplicates={view.duplicates} />
          </div>
        )}
      </div>

      <OrderQueue patientId={patient.id} open={ordersOpen} onClose={() => setOrdersOpen(false)} />
      {shareOpen && <ShareWithPatient patient={patient} recs={view.active} onClose={() => setShareOpen(false)} />}
      <PrintSummary patient={patient} view={view} />
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 2 }}>
      <Icon name={icon} size={18} style={{ color: 'var(--accent)' }} />
      <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>{title}</h2>
    </div>
  );
}

function SubHead({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={15} style={{ color: 'var(--text-3)' }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{title}</span>
    </div>
  );
}
