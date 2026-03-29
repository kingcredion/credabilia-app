/**
 * AuthContext — single source of truth for authentication state.
 *
 * State machine:
 *   auth_loading                        — initial bootstrap, nothing renders
 *   signed_out                          — no session / invalid session
 *   authenticated_profile_loading       — token present, fetching profile
 *   authenticated_onboarding_incomplete — profile loaded, onboarding not done
 *   authenticated_ready                 — profile loaded, onboarding complete
 *
 * Session hardening:
 *   - Bootstrap ALWAYS calls base44.auth.me() to confirm a live server session.
 *     isAuthenticated() is never trusted alone — it only checks local storage.
 *   - Any error or empty profile during bootstrap results in signed_out + storage wipe.
 *   - logout() wipes ALL Base44 auth keys from localStorage + sessionStorage before
 *     handing off to base44.auth.logout().
 *   - refreshUser() treats a failed profile fetch as a session-invalidation event.
 */

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

// ─── State machine values ──────────────────────────────────────────────────
export const AUTH_STATES = {
  LOADING:               'auth_loading',
  SIGNED_OUT:            'signed_out',
  PROFILE_LOADING:       'authenticated_profile_loading',
  ONBOARDING_INCOMPLETE: 'authenticated_onboarding_incomplete',
  READY:                 'authenticated_ready',
};

// ─── Storage wipe ─────────────────────────────────────────────────────────
// Clears every Base44 auth-related key from both storages.
// Called on logout AND whenever a session turns out to be invalid.
const AUTH_STORAGE_KEYS = [
  'base44_access_token',
  'base44_session_token',
  'base44_auth_token',
  'base44_token',
  'base44_user',
  'base44_profile',
  'base44_app_id',       // keep app_id but wipe token keys safely
];

// These are token/session keys — we wipe them but keep app config keys
const TOKEN_KEYS = [
  'base44_access_token',
  'base44_session_token',
  'base44_auth_token',
  'base44_token',
  'base44_user',
  'base44_profile',
];

function wipeAuthStorage() {
  try {
    TOKEN_KEYS.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    // Also sweep for any other base44 auth-looking keys dynamically
    const lsKeys = Object.keys(localStorage);
    lsKeys.forEach((k) => {
      if (k.startsWith('base44_') && (k.includes('token') || k.includes('session') || k.includes('user') || k.includes('profile'))) {
        localStorage.removeItem(k);
      }
    });
    const ssKeys = Object.keys(sessionStorage);
    ssKeys.forEach((k) => {
      if (k.startsWith('base44_') && (k.includes('token') || k.includes('session') || k.includes('user') || k.includes('profile'))) {
        sessionStorage.removeItem(k);
      }
    });
    console.log('[Auth] Storage wipe complete');
  } catch (e) {
    console.warn('[Auth] Storage wipe failed (likely SSR/private mode):', e?.message);
  }
}

// ─── Provider ──────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(AUTH_STATES.LOADING);
  const [user, setUser]           = useState(null);

  // Derived convenience booleans (legacy compat)
  const isAuthenticated         = authState === AUTH_STATES.READY || authState === AUTH_STATES.ONBOARDING_INCOMPLETE;
  const isLoadingAuth           = authState === AUTH_STATES.LOADING || authState === AUTH_STATES.PROFILE_LOADING;
  const isLoadingPublicSettings = false;
  const authError               = null;

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  // ALWAYS hits the server — never trusts localStorage alone.
  const bootstrap = useCallback(async () => {
    console.log('[Auth] Bootstrap start');
    setAuthState(AUTH_STATES.LOADING);
    setUser(null);

    try {
      // Step 1: check local token presence (fast, no network)
      const hasLocalToken = await base44.auth.isAuthenticated();
      console.log('[Auth] Local token present:', hasLocalToken);

      if (!hasLocalToken) {
        // No token in storage at all — definitively signed out
        console.log('[Auth] No local token → signed_out');
        wipeAuthStorage();
        setAuthState(AUTH_STATES.SIGNED_OUT);
        return;
      }

      // Step 2: ALWAYS verify with the server by calling me()
      // This catches stale / expired / revoked tokens
      console.log('[Auth] Token found — verifying with server (me())');
      setAuthState(AUTH_STATES.PROFILE_LOADING);

      const profile = await base44.auth.me();
      console.log('[Auth] Server response — profile:', profile?.email ?? 'null',
        '| onboarding_completed:', profile?.onboarding_completed ?? 'n/a');

      if (!profile || !profile.email) {
        // Token existed locally but server rejected or returned empty profile
        console.warn('[Auth] Server returned no valid profile — wiping storage → signed_out');
        wipeAuthStorage();
        setAuthState(AUTH_STATES.SIGNED_OUT);
        setUser(null);
        return;
      }

      // Step 3: Valid profile — set state
      setUser(profile);

      if (!profile.onboarding_completed) {
        console.log('[Auth] Valid user — onboarding incomplete:', profile.email);
        setAuthState(AUTH_STATES.ONBOARDING_INCOMPLETE);
      } else {
        console.log('[Auth] Valid user — ready:', profile.email);
        setAuthState(AUTH_STATES.READY);
      }
    } catch (err) {
      // Network error or 401 from server
      const status = err?.response?.status ?? err?.status;
      console.error('[Auth] Bootstrap error — status:', status, '|', err?.message ?? err);

      if (status === 401 || status === 403) {
        console.warn('[Auth] Auth error from server — wiping storage → signed_out');
        wipeAuthStorage();
      } else {
        // Network/timeout — don't wipe storage (user may just be offline)
        // but still go signed_out so the app doesn't hang
        console.warn('[Auth] Network/unknown error — going signed_out without wiping storage');
      }

      setAuthState(AUTH_STATES.SIGNED_OUT);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // ── Actions ───────────────────────────────────────────────────────────────

  // refreshUser: re-fetches profile from server.
  // On failure → treats session as invalid and signs out.
  const refreshUser = useCallback(async () => {
    try {
      const profile = await base44.auth.me();
      if (!profile || !profile.email) {
        console.warn('[Auth] refreshUser — no valid profile returned → signing out');
        wipeAuthStorage();
        setUser(null);
        setAuthState(AUTH_STATES.SIGNED_OUT);
        return;
      }
      setUser(profile);
      if (!profile.onboarding_completed) {
        setAuthState(AUTH_STATES.ONBOARDING_INCOMPLETE);
      } else {
        setAuthState(AUTH_STATES.READY);
      }
      console.log('[Auth] User refreshed:', profile.email);
    } catch (err) {
      const status = err?.response?.status ?? err?.status;
      console.error('[Auth] refreshUser error — status:', status, '|', err?.message ?? err);
      if (status === 401 || status === 403) {
        console.warn('[Auth] refreshUser 401/403 — wiping storage → signed_out');
        wipeAuthStorage();
        setUser(null);
        setAuthState(AUTH_STATES.SIGNED_OUT);
      }
      // Non-auth errors (network etc.) — don't change state
    }
  }, []);

  const markOnboardingComplete = useCallback(() => {
    setAuthState(AUTH_STATES.READY);
    console.log('[Auth] Onboarding marked complete');
  }, []);

  // logout: wipe storage, reset state, invalidate server session, then route to home
  const logout = useCallback(() => {
    console.log('[Auth] Logout initiated — wiping storage');
    wipeAuthStorage();
    setUser(null);
    setAuthState(AUTH_STATES.SIGNED_OUT);
    console.log('[Auth] State reset → signed_out');

    // Invalidate the server-side session
    base44.auth.logout().catch((err) => {
      console.warn('[Auth] Logout HTTP call failed (may be expected):', err?.message);
    });

    // Route to public homepage (not Base44's redirect)
    // Use window.location for a full page reload to ensure clean state
    console.log('[Auth] Routing to homepage');
    window.location.href = '/';
  }, []);

  const navigateToLogin = useCallback(() => {
    console.log('[Auth] Redirect to custom login — path:', window.location.pathname);
    // Redirect to custom Credabilia sign-in instead of Base44 default
    window.location.href = `/SignIn?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }, []);

  // Legacy alias
  const checkAppState = bootstrap;

  return (
    <AuthContext.Provider value={{
      authState,
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings: null,
      refreshUser,
      markOnboardingComplete,
      logout,
      navigateToLogin,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};