import { Routes, Route } from 'react-router-dom';
import { MarketingLayout } from './pages/marketing/MarketingLayout';
import { Home } from './pages/marketing/Home';
import { Platform } from './pages/marketing/Platform';
import { Pricing } from './pages/marketing/Pricing';
import { ProviderPanel } from './pages/marketing/ProviderPanel';
import { Dashboard } from './pages/Dashboard';
import { PatientDeepDive } from './pages/PatientDeepDive';

export default function App() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/platform" element={<Platform />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/providers" element={<ProviderPanel />} />
      </Route>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/patient/:id" element={<PatientDeepDive />} />
    </Routes>
  );
}
