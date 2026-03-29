/**
 * SignIn — Native Credabilia sign-in page.
 *
 * Uses base44.auth.login() directly — no redirects to Base44 auth pages.
 * On success, triggers AuthContext bootstrap to load the full user session,
 * then routes by onboarding state.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, AUTH_STATES } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, Loader2, Eye, EyeOff, Sparkles, User, Mail, Apple } from 'lucide-react';
import { toast } from 'sonner';

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authState, user, isAuthenticated, checkAppState } = useAuth();

  // Mode: 'signin' | 'signup'
  const [mode, setMode] = useState('signin');

  // Sign-in fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign-up fields
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const returnUrl = new URLSearchParams(location.search).get('returnUrl') || '/Marketplace';

  // If already logged in, redirect immediately
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('[SignIn] Already authenticated — redirecting to:', returnUrl);
      navigate(returnUrl, { replace: true });
    }
  }, [isAuthenticated, user, navigate, returnUrl]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      console.log('[SignIn] Attempting login for:', email);

      // base44.auth.login(email, password) — credential login via Base44 SDK
      // Falls back gracefully if the method signature differs between SDK versions
      if (typeof base44.auth.login === 'function') {
        await base44.auth.login(email, password);
      } else if (typeof base44.auth.signIn === 'function') {
        await base44.auth.signIn({ email, password });
      } else {
        throw new Error('Login method not available. Please contact support.');
      }

      console.log('[SignIn] Login succeeded — running bootstrap');

      // Re-run AuthContext bootstrap to load the full authenticated session
      await checkAppState();

      // After bootstrap, read the fresh profile to decide where to send the user
      const fresh = await base44.auth.me();
      if (fresh?.onboarding_completed) {
        navigate(returnUrl, { replace: true });
      } else {
        // Onboarding incomplete — Marketplace → Layout shows the onboarding modal
        navigate('/Marketplace', { replace: true });
      }
    } catch (err) {
      const message = err?.message || err?.response?.data?.message || 'Invalid email or password. Please try again.';
      console.error('[SignIn] Error:', message);
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderLogin = async (provider) => {
    setError('');
    setIsLoading(true);

    try {
      console.log(`[SignIn] Starting ${provider} login`);

      // Call Base44's provider login method
      if (typeof base44.auth.loginWithProvider === 'function') {
        await base44.auth.loginWithProvider(provider, returnUrl);
        // Redirect is handled by Base44 — no need to do anything after
        return;
      } else {
        throw new Error(`${provider} login is not available. Please try email sign-in.`);
      }
    } catch (err) {
      const message = err?.message || `Failed to start ${provider} login. Please try again.`;
      console.error(`[SignIn] ${provider} login error:`, message);
      setError(message);
      toast.error(message);
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Basic validation
      if (!signupEmail || !signupPassword || !fullName) {
        throw new Error('Please fill in all fields');
      }

      if (signupPassword !== signupPasswordConfirm) {
        throw new Error('Passwords do not match');
      }

      if (signupPassword.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      console.log('[SignUp] Creating account for:', signupEmail);

      // Use Base44 SDK to create account
      // Try the createAccount method first, fall back to signup if needed
      let accountCreated = false;

      if (typeof base44.auth.createAccount === 'function') {
        await base44.auth.createAccount({
          email: signupEmail,
          password: signupPassword,
          full_name: fullName,
        });
        accountCreated = true;
      } else if (typeof base44.auth.signup === 'function') {
        await base44.auth.signup(signupEmail, signupPassword, {
          full_name: fullName,
        });
        accountCreated = true;
      } else if (typeof base44.auth.register === 'function') {
        await base44.auth.register({
          email: signupEmail,
          password: signupPassword,
          full_name: fullName,
        });
        accountCreated = true;
      } else {
        throw new Error('Account creation method not available');
      }

      if (!accountCreated) {
        throw new Error('Failed to create account');
      }

      console.log('[SignUp] Account created — auto-logging in');

      // Auto-login the new user
      if (typeof base44.auth.login === 'function') {
        await base44.auth.login(signupEmail, signupPassword);
      } else if (typeof base44.auth.signIn === 'function') {
        await base44.auth.signIn({ email: signupEmail, password: signupPassword });
      } else {
        throw new Error('Login method not available after signup');
      }

      console.log('[SignUp] Auto-login succeeded — running bootstrap');

      // Run AuthContext bootstrap to load the full session
      await checkAppState();

      // Fetch fresh profile and route appropriately
      const freshProfile = await base44.auth.me();
      if (freshProfile?.onboarding_completed) {
        // Onboarding already done — go to dashboard/marketplace
        navigate(returnUrl, { replace: true });
      } else {
        // Onboarding incomplete — go to Marketplace where Layout shows onboarding modal
        navigate('/Marketplace', { replace: true });
      }

      toast.success('Welcome to Credabilia! 🎉');
    } catch (err) {
      const message = err?.message || err?.response?.data?.message || 'Failed to create account. Please try again.';
      console.error('[SignUp] Error:', message);
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: 'url(https://media.base44.com/images/public/690badbd56a85b130b88aa42/9f5f4d8bc_D7F385BF-DD9E-47EA-8753-9881A6F8BC50.png)',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      <Card className="w-full max-w-md relative z-10 shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl">
        <CardHeader className="space-y-3 text-center pb-6">
          <div className="flex justify-center mb-4">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/46533c917_Photoroom_20251118_202357.png"
              alt="Credabilia"
              className="h-12 w-auto object-contain"
              onError={(e) => {
                e.target.outerHTML = '<div class="text-3xl font-black bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">CREDABILIA</div>';
              }}
            />
          </div>
          <div>
            <CardTitle className="text-2xl text-slate-50">
              {mode === 'signin' ? 'Welcome Back' : 'Join Credabilia'}
            </CardTitle>
            <CardDescription className="text-slate-400 text-sm mt-1">
              {mode === 'signin'
                ? 'Sign in to access your collection and marketplace'
                : 'Create an account to start collecting and trading'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {mode === 'signin' ? (
            /* ── SIGN-IN FORM ── */
            <form onSubmit={handleSignIn} className="space-y-4">
              {error && (
                <div className="flex gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Email Address</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="bg-slate-700/50 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => navigate('/ResetPassword?email=' + encodeURIComponent(email))}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="bg-slate-700/50 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={isLoading || !email || !password}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium h-10 mt-6"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>

              {/* Social Login Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-800/80 text-slate-500">or continue with</span>
                </div>
              </div>

              {/* Social Login Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={() => handleProviderLogin('google')}
                  disabled={isLoading}
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30 font-medium"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Google
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={() => handleProviderLogin('apple')}
                  disabled={isLoading}
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30 font-medium"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Apple className="w-4 h-4 mr-2" />
                      Apple
                    </>
                  )}
                </Button>
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-800/80 text-slate-500">New to Credabilia?</span>
                </div>
              </div>

              {/* Switch to Sign Up */}
              <Button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError('');
                }}
                variant="outline"
                className="w-full border-slate-600 text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
                disabled={isLoading}
              >
                Create an Account
              </Button>
            </form>
          ) : (
            /* ── SIGN-UP FORM ── */
            <form onSubmit={handleSignUp} className="space-y-4">
              {error && (
                <div className="flex gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Full Name</label>
                <Input
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isLoading}
                  className="bg-slate-700/50 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Email Address</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  disabled={isLoading}
                  className="bg-slate-700/50 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Password</label>
                <div className="relative">
                  <Input
                    type={showSignupPassword ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    disabled={isLoading}
                    className="bg-slate-700/50 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 disabled:opacity-50"
                  >
                    {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Confirm Password</label>
                <Input
                  type={showSignupPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={signupPasswordConfirm}
                  onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                  disabled={isLoading}
                  className="bg-slate-700/50 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={isLoading || !fullName || !signupEmail || !signupPassword || !signupPasswordConfirm}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium h-10 mt-6"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4 mr-2" />
                    Create Account
                  </>
                )}
              </Button>

              {/* Social Login Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-800/80 text-slate-500">or continue with</span>
                </div>
              </div>

              {/* Social Login Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={() => handleProviderLogin('google')}
                  disabled={isLoading}
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30 font-medium"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Google
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={() => handleProviderLogin('apple')}
                  disabled={isLoading}
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30 font-medium"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Apple className="w-4 h-4 mr-2" />
                      Apple
                    </>
                  )}
                </Button>
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-800/80 text-slate-500">Already have an account?</span>
                </div>
              </div>

              {/* Switch to Sign In */}
              <Button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError('');
                }}
                variant="outline"
                className="w-full border-slate-600 text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
                disabled={isLoading}
              >
                Sign In
              </Button>
            </form>
          )}

          <p className="text-center text-xs text-slate-500 mt-6">
            By {mode === 'signin' ? 'signing in' : 'creating an account'}, you agree to our{' '}
            <button type="button" onClick={() => navigate('/Terms')} className="text-blue-400 hover:text-blue-300">
              Terms
            </button>
            {' '}and{' '}
            <button type="button" onClick={() => navigate('/Privacy')} className="text-blue-400 hover:text-blue-300">
              Privacy Policy
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}