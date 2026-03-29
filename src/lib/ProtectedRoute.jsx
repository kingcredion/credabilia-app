/**
 * ProtectedRoute — guards routes that require authentication.
 *
 * Behaviour by authState:
 *   auth_loading / profile_loading  → show spinner (still resolving)
 *   signed_out                      → redirect to /SignIn with return URL
 *   onboarding_incomplete           → let Layout's OnboardingFlow handle it
 *   ready                           → render children
 */
import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, AUTH_STATES } from '@/lib/AuthContext';

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

export default function ProtectedRoute({ children }) {
  const { authState } = useAuth();

  // Diagnostic logging — helps trace state on production deploys
  useEffect(() => {
    console.log('[ProtectedRoute] authState:', authState, '| path:', window.location.pathname);
  }, [authState]);

  // Still resolving — spinner prevents protected content flash
  if (authState === AUTH_STATES.LOADING || authState === AUTH_STATES.PROFILE_LOADING) {
    return <Spinner />;
  }

  // Not signed in — redirect to Credabilia sign-in page with return URL
  if (authState === AUTH_STATES.SIGNED_OUT) {
    const returnUrl = window.location.pathname + window.location.search;
    console.log('[ProtectedRoute] signed_out — redirecting to SignIn, return:', returnUrl);
    return <Navigate to={`/SignIn?returnUrl=${encodeURIComponent(returnUrl)}`} replace />;
  }

  // onboarding_incomplete or ready — Layout handles the onboarding modal
  return <>{children}</>;
}