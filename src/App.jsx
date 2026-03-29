import './App.css'
import React, { Suspense, lazy } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth, AUTH_STATES } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { NavigationProvider } from '@/lib/NavigationContext';
import { ActiveRoleProvider } from '@/lib/ActiveRoleContext';
import ErrorBoundary from '@/lib/ErrorBoundary';
import ProtectedRoute from '@/lib/ProtectedRoute';

// Helper for resilient lazy loading with exponential backoff retry
const lazyWithRetry = (importFn, retries = 2) =>
  lazy(async () => {
    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        return await importFn();
      } catch (error) {
        console.error(`[lazyWithRetry] Dynamic import failed (attempt ${i + 1}):`, error);
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 400 * (i + 1)));
      }
    }
    throw lastError;
  });

// VisualEditAgent — lazy import to avoid blocking app shell
const VisualEditAgent = lazy(() => import('@/lib/VisualEditAgent'));

// Auth pages — custom sign-in + password reset
const SignIn = lazyWithRetry(() => import('./pages/SignIn'));

// Checkout pages — rarely visited, lazy load with retry
const CheckoutSuccess = lazyWithRetry(() => import('./pages/CheckoutSuccess'));
const CheckoutCanceled = lazyWithRetry(() => import('./pages/CheckoutCanceled'));

// Auth pages — password reset
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'));
const Terms = lazyWithRetry(() => import('./pages/Terms'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const RefundPolicy = lazyWithRetry(() => import('./pages/RefundPolicy'));

// Heavy role-specific / admin pages — lazy load with retry
const AdminAnalytics = lazyWithRetry(() => import('./pages/AdminAnalytics'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const AdminApprovals = lazyWithRetry(() => import('./pages/AdminApprovals'));
const AdminArtists = lazyWithRetry(() => import('./pages/AdminArtists'));
const AdminFrameShops = lazyWithRetry(() => import('./pages/AdminFrameShops'));
const AdminInfluencers = lazyWithRetry(() => import('./pages/AdminInfluencers'));
const AdminReviewQueuePage = lazyWithRetry(() => import('./pages/AdminReviewQueuePage'));
const FrameShopDashboard = lazyWithRetry(() => import('./pages/FrameShopDashboard'));
const InfluencerDashboard = lazyWithRetry(() => import('./pages/InfluencerDashboard'));
const ArtistDashboard = lazyWithRetry(() => import('./pages/ArtistDashboard'));
const MarketingHub = lazyWithRetry(() => import('./pages/MarketingHub'));
const AdminOnboardingPreview = lazyWithRetry(() => import('./pages/AdminOnboardingPreview'));
const AuditorRewards = lazyWithRetry(() => import('./pages/CouncilRewards')); // File is CouncilRewards.jsx, imported as AuditorRewards component
const FounderCircleDashboard = lazyWithRetry(() => import('./pages/FounderCircleDashboard'));
const InfluencerProfile = lazyWithRetry(() => import('./pages/InfluencerProfile'));
const FounderProfile = lazyWithRetry(() => import('./pages/FounderProfile'));
const CredionSupport = lazyWithRetry(() => import('./pages/CredionSupport'));

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

// Reusable spinner — avoids duplicating JSX across fallbacks
const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

const PageSpinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800" />
  </div>
);

// Removed: AuthRequiredScreen — redirect-based login no longer used in main flow

const LayoutWrapper = ({ children, currentPageName }) => Layout
  ? <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// ── Route helpers ──────────────────────────────────────────────────────────

// Public pages: accessible without login. Auth resolves in background.
// Protected pages: wrapped in <ProtectedRoute> — redirect to login if signed out.

// Wrap a lazy component in ProtectedRoute (auth required)
const P = (Component) => (
  <ProtectedRoute>
    <Suspense fallback={<PageSpinner />}><ErrorBoundary><Component /></ErrorBoundary></Suspense>
  </ProtectedRoute>
);

// Wrap a lazy component for a public route (no auth required)
const Pub = (Component) => (
  <Suspense fallback={<PageSpinner />}><ErrorBoundary><Component /></ErrorBoundary></Suspense>
);

// Pages that exist in pagesConfig and are public (browsable without login)
const PUBLIC_PAGE_PATHS = new Set([
  'Marketplace', 'ItemDetails', 'Home', 'Profile', 'VendorProfile',
  'ArtistProfile', 'FrameShopProfile', 'InfluencerProfile', 'FounderProfile',
  'ExploreFrameShops', 'ExploreArtists', 'ExploreUsers', 'Feed',
]);

const AuthenticatedApp = () => {
  const { authState } = useAuth();

  // Only block if auth hasn't finished the very first bootstrap yet.
  // Public routes render immediately after; protected routes handle their own spinner.
  if (authState === AUTH_STATES.LOADING) {
    return <Spinner />;
  }

  return (
    <ErrorBoundary>
      <LayoutWrapper currentPageName={mainPageKey}>
        <Suspense fallback={<Spinner />}>
          <Routes>
            {/* ── Main page (public) ─────────────────────────────────────── */}
            <Route path="/" element={<MainPage />} />

            {/* ── pagesConfig routes — split by public/protected ─────────── */}
            {Object.entries(Pages).map(([path, Page]) =>
              PUBLIC_PAGE_PATHS.has(path)
                ? <Route key={path} path={`/${path}`} element={<ErrorBoundary key={path}><Page /></ErrorBoundary>} />
                : <Route key={path} path={`/${path}`} element={P(Page)} />
            )}

            {/* ── Auth pages: public, no layout ──────────────────────────── */}
            <Route path="/SignIn"       element={Pub(SignIn)} />
            <Route path="/ResetPassword" element={Pub(ResetPassword)} />

            {/* ── Public static pages ────────────────────────────────────── */}
            <Route path="/Terms"        element={Pub(Terms)} />
            <Route path="/Privacy"      element={Pub(Privacy)} />
            <Route path="/RefundPolicy" element={Pub(RefundPolicy)} />

            {/* ── Public profile pages ───────────────────────────────────── */}
            <Route path="/InfluencerProfile" element={Pub(InfluencerProfile)} />
            <Route path="/FounderProfile"    element={Pub(FounderProfile)} />

            {/* ── Protected: post-purchase ───────────────────────────────── */}
            <Route path="/CheckoutSuccess"  element={P(CheckoutSuccess)} />
            <Route path="/CheckoutCanceled" element={P(CheckoutCanceled)} />

            {/* ── Protected: role dashboards ─────────────────────────────── */}
            <Route path="/FrameShopDashboard"    element={P(FrameShopDashboard)} />
            <Route path="/InfluencerDashboard"   element={P(InfluencerDashboard)} />
            <Route path="/ArtistDashboard"       element={P(ArtistDashboard)} />
            <Route path="/FounderCircleDashboard" element={P(FounderCircleDashboard)} />
            <Route path="/AuditorRewards"        element={P(AuditorRewards)} />
            <Route path="/CouncilRewards"        element={P(AuditorRewards)} /> {/* Legacy alias */}
            <Route path="/MarketingHub"          element={P(MarketingHub)} />
            <Route path="/CredionSupport"        element={P(CredionSupport)} />

            {/* ── Protected: admin ───────────────────────────────────────── */}
            <Route path="/AdminAnalytics"        element={P(AdminAnalytics)} />
            <Route path="/AdminDashboard"        element={P(AdminDashboard)} />
            <Route path="/AdminApprovals"        element={P(AdminApprovals)} />
            <Route path="/AdminArtists"          element={P(AdminArtists)} />
            <Route path="/AdminFrameShops"       element={P(AdminFrameShops)} />
            <Route path="/AdminInfluencers"      element={P(AdminInfluencers)} />
            <Route path="/AdminReviewQueuePage"  element={P(AdminReviewQueuePage)} />
            <Route path="/AdminOnboardingPreview" element={P(AdminOnboardingPreview)} />

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Suspense>
      </LayoutWrapper>
    </ErrorBoundary>
  );
};

// Only mount VisualEditAgent for admin users — checked after auth resolves
// Wrapped in ErrorBoundary to isolate any failures and prevent app blanking
function MaybeVisualEditAgent() {
  const { isAuthenticated, user } = useAuth();
  // Only load for authenticated admin users
  if (!isAuthenticated || user?.role !== 'admin') return null;
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <VisualEditAgent />
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ActiveRoleProvider>
          <Router>
            <NavigationProvider>
              <NavigationTracker />
              <AuthenticatedApp />
            </NavigationProvider>
          </Router>
        </ActiveRoleProvider>
        <Toaster />
        <MaybeVisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;