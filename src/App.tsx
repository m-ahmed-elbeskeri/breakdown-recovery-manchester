import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { HOME_REGION, regionPath } from './config';
import { matchPage } from './routes';
import { setTelemetryRegion, startTelemetry, trackPageView } from './telemetry';
import { RegionLanding } from './pages/LandingPage';
import { ServicePage } from './pages/ServicePage';
import { PricingPage } from './pages/PricingPage';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { DriveWithUsPage } from './pages/DriveWithUsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TrackPage } from './pages/TrackPage';

// The signed-in side of the site, loaded only by the people who use it. A
// customer booking a tow never downloads the admin or the driver console.
const AuthLayout = lazy(() =>
  import('./pages/account/AuthLayout').then((m) => ({ default: m.AuthLayout })),
);
const LoginPage = lazy(() =>
  import('./pages/account/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/account/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/account/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const DriverApplyPage = lazy(() =>
  import('./pages/driver/DriverApplyPage').then((m) => ({ default: m.DriverApplyPage })),
);
const DriverApp = lazy(() =>
  import('./pages/driver/DriverApp').then((m) => ({ default: m.DriverApp })),
);
const AdminApp = lazy(() =>
  import('./pages/admin/AdminApp').then((m) => ({ default: m.AdminApp })),
);

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
    case 'recruit':
      return <DriveWithUsPage />;
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

function pageKind(pathname: string, match: ReturnType<typeof matchPage>): string {
  if (match) return match.kind === 'region' && pathname === '/' ? 'home' : match.kind;
  if (pathname.startsWith('/track/')) return 'track';
  if (pathname === '/drivers/apply') return 'apply';
  return 'other';
}

/**
 * One page view per navigation, counted in one place so no page can forget to
 * count itself. Rendered after the routes, so a page's own effects have run.
 * Signed-in staff and driver pages are skipped inside trackPageView.
 */
function PageAnalytics() {
  const { pathname } = useLocation();
  useEffect(() => {
    startTelemetry();
    const match = matchPage(pathname);
    // An old area address that is about to redirect is not a visit to anything.
    if (match?.kind === 'region' && match.legacy) return;
    setTelemetryRegion(match?.kind === 'region' ? match.region : undefined);
    trackPageView(pathname, pageKind(pathname, match));
  }, [pathname]);
  return null;
}

/** The route table, shared by the browser and the build-time prerender. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RegionLanding regionName={HOME_REGION} />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/track/:token" element={<TrackPage />} />
      <Route
        element={
          <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
            <AuthLayout />
          </Suspense>
        }
      >
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/drivers/apply" element={<DriverApplyPage />} />
        <Route path="/driver/*" element={<DriverApp />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Route>
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
        <PageAnalytics />
      </BrowserRouter>
    </MotionConfig>
  );
}
