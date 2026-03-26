import './App.css'
import React, { Suspense, lazy } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { NavigationProvider } from '@/lib/NavigationContext';
import { ActiveRoleProvider } from '@/lib/ActiveRoleContext';
import ErrorBoundary from '@/lib/ErrorBoundary';

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

const AuthRequiredScreen = ({ navigateToLogin }) => (
  <div className="flex flex-col items-center justify-center p-4" style={{ minHeight: 'min(100dvh, 100vh)' }}>
    <div className="bg-white dark:bg-white/[0.08] dark:border-white/10 dark:backdrop-blur-md rounded-xl shadow-lg dark:shadow-xl p-8 max-w-md w-full text-center border dark:border-white/10">
      <div className="mb-6">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Authentication Required</h2>
        <p className="text-muted-foreground mb-6">You need to be logged in to access this page. Redirecting you to login...</p>
      </div>
      
      <div className="flex items-center justify-center mb-6">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4">If you are not redirected in a few seconds,</p>
      <button
        onClick={navigateToLogin}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
      >
        Click here to log in
      </button>
    </div>
  </div>
);

const LayoutWrapper = ({ children, currentPageName }) => Layout
  ? <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) return <Spinner />;

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') return <AuthRequiredScreen navigateToLogin={navigateToLogin} />;
  }

  return (
    <ErrorBoundary>
      <LayoutWrapper currentPageName={mainPageKey}>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<MainPage />} />
            {Object.entries(Pages).map(([path, Page]) => (
              <Route key={path} path={`/${path}`} element={<ErrorBoundary key={path}><Page /></ErrorBoundary>} />
            ))}
            <Route path="/CheckoutSuccess" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><CheckoutSuccess /></ErrorBoundary></Suspense>} />
            <Route path="/CheckoutCanceled" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><CheckoutCanceled /></ErrorBoundary></Suspense>} />
            <Route path="/ResetPassword" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><ResetPassword /></ErrorBoundary></Suspense>} />
            <Route path="/Terms" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><Terms /></ErrorBoundary></Suspense>} />
            <Route path="/Privacy" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><Privacy /></ErrorBoundary></Suspense>} />
            <Route path="/RefundPolicy" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><RefundPolicy /></ErrorBoundary></Suspense>} />
            <Route path="/AdminAnalytics" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AdminAnalytics /></ErrorBoundary></Suspense>} />
            <Route path="/AdminDashboard" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AdminDashboard /></ErrorBoundary></Suspense>} />
            <Route path="/AdminApprovals" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AdminApprovals /></ErrorBoundary></Suspense>} />
            <Route path="/AdminArtists" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AdminArtists /></ErrorBoundary></Suspense>} />
            <Route path="/AdminFrameShops" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AdminFrameShops /></ErrorBoundary></Suspense>} />
            <Route path="/AdminInfluencers" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AdminInfluencers /></ErrorBoundary></Suspense>} />
            <Route path="/AdminReviewQueuePage" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AdminReviewQueuePage /></ErrorBoundary></Suspense>} />
            <Route path="/FrameShopDashboard" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><FrameShopDashboard /></ErrorBoundary></Suspense>} />
            <Route path="/InfluencerDashboard" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><InfluencerDashboard /></ErrorBoundary></Suspense>} />
            <Route path="/ArtistDashboard" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><ArtistDashboard /></ErrorBoundary></Suspense>} />
            <Route path="/MarketingHub" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><MarketingHub /></ErrorBoundary></Suspense>} />
            <Route path="/AdminOnboardingPreview" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AdminOnboardingPreview /></ErrorBoundary></Suspense>} />
            <Route path="/AuditorRewards" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AuditorRewards /></ErrorBoundary></Suspense>} />
            <Route path="/CouncilRewards" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><AuditorRewards /></ErrorBoundary></Suspense>} /> {/* Legacy alias */}
            <Route path="/FounderCircleDashboard" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><FounderCircleDashboard /></ErrorBoundary></Suspense>} />
            <Route path="/InfluencerProfile" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><InfluencerProfile /></ErrorBoundary></Suspense>} />
            <Route path="/FounderProfile" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><FounderProfile /></ErrorBoundary></Suspense>} />
            <Route path="/CredionSupport" element={<Suspense fallback={<PageSpinner />}><ErrorBoundary><CredionSupport /></ErrorBoundary></Suspense>} />
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
  if (!isAuthenticated || !user?.role === 'admin') return null;
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