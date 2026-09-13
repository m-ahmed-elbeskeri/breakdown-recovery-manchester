import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { HOME_REGION, regionPath } from './config';
import { matchPage } from './routes';
import { RegionLanding } from './pages/LandingPage';
import { ServicePage } from './pages/ServicePage';
import { PricingPage } from './pages/PricingPage';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminPage } from './pages/AdminPage';
import { DriverPage } from './pages/DriverPage';
import { TrackPage } from './pages/TrackPage';

/** Any single-segment path: an area page, a service page, or a 404. */
function SlugPage() {
  const { slug } = useParams();
  const match = matchPage(`/${slug ?? ''}`);
  if (!match) return <NotFoundPage />;
  switch (match.kind) {
    case 'region':
      // The old /breakdown-recovery-<area> URLs: sent to the new address so
      // anything ever linked keeps working and search engines see one page.
      return match.legacy ? (
        <Navigate to={regionPath(match.region)} replace />
      ) : (
        <RegionLanding regionName={match.region} />
      );
    case 'service':
      return <ServicePage page={match.page} />;
    case 'pricing':
      return <PricingPage />;
    case 'privacy':
      return <PrivacyPolicy />;
  }
}

/**
 * Start each page at the top. The router keeps the scroll position across
 * navigations, so a footer link to a service page used to land the reader at
 * the bottom of it. Hash links are left to the page to handle.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

/** The route table, shared by the browser and the build-time prerender. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RegionLanding regionName={HOME_REGION} />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/driver" element={<DriverPage />} />
      <Route path="/track/:token" element={<TrackPage />} />
      <Route path="/:slug" element={<SlugPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ScrollToTop />
        <AppRoutes />
      </BrowserRouter>
    </MotionConfig>
  );
}
