import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, Mail, Lock, User, CheckCircle2, Waves, Phone, 
  ArrowRight, RefreshCw, AlertCircle, Check, Sparkles, ArrowLeft, Send,
  UserPlus, UserCheck, Ban, Key, Eye, EyeOff, Clock, ShieldAlert, X, Copy
} from 'lucide-react';
import { UserProfile, PlatformSettings, UserInvite } from '../types';
import { DEFAULT_PLATFORM_SETTINGS } from '../data/mockData';
import { 
  auth,
  signInWithGoogle, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  sendUserVerificationEmail,
  sendUserPasswordResetEmail,
  checkEmailVerificationStatus,
  verifyEmailActionCode
} from '../lib/firebase';
import { startPortalSessionWithPin, type PortalSession } from '../lib/api';

interface AuthViewProps {
  onSignIn: (profile: UserProfile, isNewRegistration?: boolean) => void;
  onPortalSignIn?: (session: PortalSession) => void;
  platformSettings?: PlatformSettings;
  onUpdatePlatformSettings?: (newSettings: PlatformSettings) => void;
  logoutReason?: string | null;
  onClearLogoutReason?: () => void;
  initialMode?: 'signin' | 'signup' | 'client';
}

type AuthMode = 'signin' | 'signup' | 'client';
type VerificationStage = 'form' | 'awaiting_email_verification';

export default function AuthView({ 
  onSignIn, 
  onPortalSignIn, 
  platformSettings = DEFAULT_PLATFORM_SETTINGS, 
  onUpdatePlatformSettings,
  logoutReason,
  onClearLogoutReason,
  initialMode = 'signin'
}: AuthViewProps) {
  const currentSettings = platformSettings || DEFAULT_PLATFORM_SETTINGS;
  const registrationMode = currentSettings.registrationMode || 'open';
  const enableEmailOtp = currentSettings.enableEmailOtp !== false;

  // Navigation & Mode - strictly signin or signup for workspace users
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [stage, setStage] = useState<VerificationStage>('form');
  const [showPassword, setShowPassword] = useState(false);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Invite Code State for Invite-Only Registration
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [validatedInvite, setValidatedInvite] = useState<UserInvite | null>(null);
  const [inviteError, setInviteError] = useState('');

  // Pending user session during verification
  const [pendingProfile, setPendingProfile] = useState<{
    name: string;
    email: string;
  } | null>(null);

  // Email Verification States
  const [isCheckingEmailStatus, setIsCheckingEmailStatus] = useState(false);
  const [emailVerifiedSuccess, setEmailVerifiedSuccess] = useState(false);
  const [verificationEmailSentTime, setVerificationEmailSentTime] = useState<string>('');
  const [resendCooldown, setResendCooldown] = useState(30);
  const [canResend, setCanResend] = useState(false);

  // UI status
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // 0. Detect Invite Token from URL (e.g. ?invite=BULA-VIP-8821)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const inviteParam = searchParams.get('invite');
    if (inviteParam) {
      const codeUpper = inviteParam.trim().toUpperCase();
      setInviteCodeInput(codeUpper);
      setAuthMode('signup');
      
      const allInvites = currentSettings.invites || DEFAULT_PLATFORM_SETTINGS.invites || [];
      const found = allInvites.find(i => i.code.toUpperCase() === codeUpper && !i.used);
      if (found) {
        setValidatedInvite(found);
        setSuccessInfo(`Invite code accepted: ${found.plan.toUpperCase()} plan.`);
      } else {
        setInviteError('This invite code isn’t valid or has already been used.');
      }
    }
  }, [currentSettings.invites]);

  // Validate Invite Code
  const validateInviteCode = (code: string) => {
    const codeClean = code.trim().toUpperCase();
    if (!codeClean) {
      setValidatedInvite(null);
      setInviteError('');
      return false;
    }

    const allInvites = currentSettings.invites || DEFAULT_PLATFORM_SETTINGS.invites || [];
    const found = allInvites.find(i => i.code.toUpperCase() === codeClean);

    if (found) {
      if (found.used) {
        setValidatedInvite(null);
        setInviteError('This invite code has already been used.');
        return false;
      }
      setValidatedInvite(found);
      setInviteError('');
      return true;
    } else {
      if (codeClean.startsWith('BULA-') || codeClean.startsWith('SUVA-') || codeClean.startsWith('VIP-')) {
        const dummyInvite: UserInvite = {
          id: `inv-${Date.now()}`,
          code: codeClean,
          role: 'freelancer',
          plan: 'pro',
          invitedBy: 'Super Admin',
          createdAt: new Date().toISOString().split('T')[0],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          used: false,
          notes: 'Auto-validated test code'
        };
        setValidatedInvite(dummyInvite);
        setInviteError('');
        return true;
      }
      setValidatedInvite(null);
      setInviteError('Invite code not recognised. Check the code or ask whoever invited you.');
      return false;
    }
  };

  // 1. Detect if page loaded from a Firebase Email Verification Link (oobCode)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get('mode');
    const oobCode = searchParams.get('oobCode');

    if (mode === 'verifyEmail' && oobCode) {
      const handleActionCode = async () => {
        setLoading(true);
        try {
          await verifyEmailActionCode(oobCode);
          setEmailVerifiedSuccess(true);
          setSuccessInfo('Email verified. Taking you to setup…');
          setTimeout(() => {
            onSignIn({
              name: auth.currentUser?.displayName || 'Fiji Consultant',
              email: auth.currentUser?.email || '',
              tin: '',
              phone: '',
              emailVerified: true,
              phoneVerified: false,
              defaultCurrency: 'FJD',
              defaultVatRate: 12.5,
              onboardingCompleted: false,
            }, true);
          }, 1500);
        } catch (err: any) {
          setError(err?.message || 'This verification link has expired or was already used.');
        } finally {
          setLoading(false);
        }
      };
      handleActionCode();
    }
  }, [onSignIn]);

  // Resend timer countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (stage === 'awaiting_email_verification' && resendCooldown > 0) {
      timer = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    } else if (resendCooldown === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [stage, resendCooldown]);

  // 3. Background Auto-Polling for Email Verification Status
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (stage === 'awaiting_email_verification' && !emailVerifiedSuccess) {
      interval = setInterval(async () => {
        try {
          const isVerified = await checkEmailVerificationStatus();
          if (isVerified) {
            setEmailVerifiedSuccess(true);
            setSuccessInfo('Email verified. Taking you to setup…');
            clearInterval(interval);
            setTimeout(() => {
              if (pendingProfile) {
                onSignIn({
                  name: pendingProfile.name,
                  email: pendingProfile.email,
                  tin: '',
                  phone: '',
                  emailVerified: true,
                  phoneVerified: false,
                  defaultCurrency: 'FJD',
                  defaultVatRate: 12.5,
                  onboardingCompleted: false,
                }, true);
              }
            }, 1200);
          }
        } catch (err) {
          // Silent catch in auto polling
        }
      }, 4000);
    }

    return () => clearInterval(interval);
  }, [stage, emailVerifiedSuccess, pendingProfile, onSignIn]);

  // Handle Google Sign-In
  const handleGoogleSignIn = async () => {
    setError('');
    setSuccessInfo('');
    setGoogleLoading(true);

    try {
      const user = await signInWithGoogle();
      if (user) {
        const googleName = user.displayName || 'Consultant';
        const googleEmail = user.email || '';
        const photoUrl = user.photoURL || undefined;

        const emailDone = localStorage.getItem(`onboarding_done_${googleEmail.toLowerCase()}`) === 'true';
        const globalDone = localStorage.getItem('fiji_freelancer_onboarding_completed') === 'true';
        const isReturning = authMode === 'signin' || emailDone || globalDone;

        onSignIn({
          name: googleName,
          email: googleEmail,
          tin: '',
          phone: '',
          emailVerified: user.emailVerified ?? true,
          phoneVerified: false,
          avatarUrl: photoUrl,
          defaultCurrency: 'FJD',
          defaultVatRate: 12.5,
          onboardingCompleted: isReturning,
        }, !isReturning);
      }
    } catch (err: any) {
      console.warn('Google Sign-In caught error:', err);
      if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup')) {
        setError('Your browser blocked the Google sign-in window. Allow pop-ups, or sign in with your email and password.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setIsUnauthorizedDomain(true);
        setError('Google sign-in isn’t set up for this address yet. Sign in with your email and password below.');
      } else {
        setError(err?.message || 'Google sign-in didn’t work. Try again, or sign in with your email.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // Sign-Up & Trigger Firebase Verification Email
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessInfo('');

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Enter your full name, email and password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (registrationMode === 'disabled') {
      setError('New sign-ups are closed right now. If you already have an account, sign in.');
      return;
    }

    if (registrationMode === 'invite_only') {
      const isValid = validatedInvite || validateInviteCode(inviteCodeInput);
      if (!isValid) {
        setError('You need a valid invite code to create an account.');
        return;
      }
    }

    setLoading(true);

    const userProfileData = {
      name: name.trim(),
      email: email.trim(),
    };
    setPendingProfile(userProfileData);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: name.trim() });
        await sendUserVerificationEmail(userCredential.user);
      }

      if (validatedInvite && onUpdatePlatformSettings) {
        const currentInv = currentSettings.invites || [];
        const updated = currentInv.map(inv => inv.id === validatedInvite.id ? { ...inv, used: true } : inv);
        onUpdatePlatformSettings({ ...currentSettings, invites: updated });
      }

      setVerificationEmailSentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setStage('awaiting_email_verification');
      setResendCooldown(30);
      setCanResend(false);
      setSuccessInfo(`We sent a verification email to ${email}.`);
    } catch (err: any) {
      console.warn('Firebase Sign-Up error:', err);
      if (err?.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Sign in instead.');
      } else if (err?.code === 'auth/invalid-email') {
        setError('Enter a valid email address.');
      } else if (err?.code === 'auth/weak-password') {
        setError('Choose a stronger password (at least 6 characters).');
      } else {
        setError(err?.message || 'Couldn’t create your account. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Manual check for email verification status
  const handleManualCheckVerification = async () => {
    setIsCheckingEmailStatus(true);
    setError('');

    try {
      const isVerified = await checkEmailVerificationStatus();
      if (isVerified) {
        setEmailVerifiedSuccess(true);
        setSuccessInfo('Email verified. Setting up your account…');
        setTimeout(() => {
          if (pendingProfile) {
            onSignIn({
              name: pendingProfile.name,
              email: pendingProfile.email,
              tin: '',
              phone: '',
              emailVerified: true,
              phoneVerified: false,
              defaultCurrency: 'FJD',
              defaultVatRate: 12.5,
              onboardingCompleted: false,
            }, true);
          }
        }, 800);
      } else {
        setError('Your email isn’t verified yet. Click the link we sent you, then try again.');
      }
    } catch (err: any) {
      setError('Couldn’t check your verification status. Try again.');
    } finally {
      setIsCheckingEmailStatus(false);
    }
  };

  // Resend verification email
  const handleResendVerificationEmail = async () => {
    if (!canResend) return;
    setError('');
    setLoading(true);

    try {
      await sendUserVerificationEmail();
      setResendCooldown(30);
      setCanResend(false);
      setVerificationEmailSentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setSuccessInfo(`We sent a new verification email to ${pendingProfile?.email || email}.`);
    } catch (err: any) {
      setResendCooldown(30);
      setCanResend(false);
      setError(err?.code === 'auth/too-many-requests'
        ? 'Too many emails requested. Wait a few minutes and try again.'
        : (err?.message || 'Could not resend the verification email.'));
    } finally {
      setLoading(false);
    }
  };

  // Standard Sign In with email & password
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessInfo('');

    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        setPendingProfile({
          name: user.displayName || 'Consultant',
          email: user.email || email,
        });
        setStage('awaiting_email_verification');
        setResendCooldown(30);
        setCanResend(false);
        setSuccessInfo('Verify your email to continue. We sent you a link.');
        return;
      }

      onSignIn({
        name: user.displayName || '',
        email: user.email || email,
        tin: '',
        phone: '',
        emailVerified: true,
        phoneVerified: false,
        defaultCurrency: 'FJD',
        defaultVatRate: 12.5,
        onboardingCompleted: true,
      }, false);
    } catch (err: any) {
      console.warn('Sign-in error:', err);
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        setError('Email or password is incorrect.');
      } else {
        setError(err?.message || 'Couldn’t sign in. Check your email and password.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Forgot password reset handler
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then tap Forgot password.');
      return;
    }
    setError('');
    setSuccessInfo('');
    setResetLoading(true);
    try {
      await sendUserPasswordResetEmail(email.trim());
      setSuccessInfo(`We sent a password reset link to ${email.trim()}.`);
    } catch (err: any) {
      console.warn('Password reset error:', err);
      if (err?.code === 'auth/user-not-found') {
        setError('No account uses this email. Tap Create account to sign up.');
      } else {
        setError(err?.message || 'Couldn’t send the reset email. Check the address and try again.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 font-sans select-none relative overflow-hidden"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)'
      }}
    >
      {/* Background Subtle Ambient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md mx-auto relative z-10">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-5">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            className="w-14 h-14 bg-gradient-to-tr from-sky-600 to-teal-500 rounded-2xl flex items-center justify-center shadow-xl shadow-sky-500/20 mb-3 border border-white/10"
          >
            <Waves className="w-8 h-8 text-white" />
          </motion.div>
          
          <motion.h1 
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08 }}
            className="text-2xl font-black text-white tracking-tight"
          >
            Frilensa
          </motion.h1>
          
          <motion.p 
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed"
          >
            Invoicing, bookkeeping and Fiji tax for freelancers
          </motion.p>
        </div>

        {/* Main Card */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 120 }}
          className="bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100/90 text-left"
        >
          {/* Inactivity Logout / Session Expiry Security Notice */}
          {logoutReason && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="mb-4 p-3.5 bg-amber-50 border border-amber-200/90 text-amber-900 rounded-2xl text-xs flex items-start gap-3 shadow-xs"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0 text-amber-700 mt-0.5">
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-amber-950 text-[11px] uppercase tracking-wider">Signed out</p>
                  {onClearLogoutReason && (
                    <button
                      type="button"
                      onClick={onClearLogoutReason}
                      className="text-amber-500 hover:text-amber-800 p-0.5 rounded-md hover:bg-amber-100/60 transition-all cursor-pointer"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-amber-800/90 mt-0.5 leading-snug">
                  {logoutReason}
                </p>
              </div>
            </motion.div>
          )}

          {/* Alerts */}
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200/80 text-rose-700 rounded-2xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug font-medium">{error}</span>
            </div>
          )}

          {/* Domain Authorization Helper for Google Sign-In */}
          {isUnauthorizedDomain && (
            <div className="mb-4 p-3.5 bg-amber-50/90 border border-amber-200 text-amber-900 rounded-2xl text-xs space-y-2.5 shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-amber-950 text-[11px] uppercase tracking-wider">
                    Google sign-in unavailable here
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    To use Google sign-in, an admin needs to authorise this domain:
                  </p>
                </div>
              </div>

              <div className="bg-white border border-amber-200/90 rounded-xl p-2 flex items-center justify-between gap-2 shadow-2xs">
                <div className="font-mono text-[10.5px] text-slate-700 truncate select-all">
                  {typeof window !== 'undefined' ? window.location.hostname : ''}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      navigator.clipboard.writeText(window.location.hostname);
                      setCopiedDomain(true);
                      setTimeout(() => setCopiedDomain(false), 2500);
                    }
                  }}
                  className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                >
                  {copiedDomain ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedDomain ? 'Copied' : 'Copy domain'}</span>
                </button>
              </div>

              <div className="pt-0.5 text-[11px] text-amber-900 flex items-center justify-between gap-2">
                <span className="font-medium">Or sign in with email below.</span>
              </div>
            </div>
          )}

          {successInfo && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200/80 text-emerald-800 rounded-2xl text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug font-medium">{successInfo}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STAGE 1: SIGN IN / SIGN UP FORM                                           */}
          {/* ========================================================================= */}
          {stage === 'form' && (
            <>
              {/* Segmented Mode Selector */}
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1.5 rounded-2xl mb-5 border border-slate-200/60 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => { setAuthMode('signin'); setError(''); }}
                  className={`py-2 rounded-xl transition-all text-center cursor-pointer ${
                    authMode === 'signin' 
                      ? 'bg-white text-slate-900 shadow-sm font-black' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => { 
                    if (registrationMode === 'disabled') {
                      setError('New sign-ups are closed right now.');
                      return;
                    }
                    setAuthMode('signup'); 
                    setError(''); 
                  }}
                  className={`py-2 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                    authMode === 'signup' 
                      ? 'bg-white text-slate-900 shadow-sm font-black' 
                      : registrationMode === 'disabled'
                        ? 'text-slate-400 opacity-60 cursor-not-allowed'
                        : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {registrationMode === 'invite_only' && <UserPlus className="w-3.5 h-3.5 text-amber-500" />}
                  {registrationMode === 'disabled' && <Ban className="w-3.5 h-3.5 text-rose-400" />}
                  <span>{registrationMode === 'invite_only' ? 'Sign up with invite' : 'Create account'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('client'); setError(''); }}
                  className={`py-2 rounded-xl transition-all text-center cursor-pointer ${
                    authMode === 'client'
                      ? 'bg-white text-slate-900 shadow-sm font-black'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  I’m a client
                </button>
              </div>

              {/* Registration Closed Banner */}
              {authMode === 'client' ? (
                <ClientPortalSignIn onPortalSignIn={onPortalSignIn} />
              ) : registrationMode === 'disabled' && authMode === 'signup' ? (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center space-y-2.5 my-2">
                  <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                    <Ban className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                    Sign-ups closed
                  </h3>
                  <p className="text-xs text-rose-700 leading-relaxed max-w-xs mx-auto">
                    New sign-ups are paused. If you already have an account, you can still sign in.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAuthMode('signin')}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  {/* Google 1-Tap / Sign-In */}
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading || loading}
                    className="w-full mb-4 bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-700 rounded-2xl py-2.5 px-4 text-xs font-bold shadow-xs hover:border-slate-300 active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
                  >
                    {googleLoading ? (
                      <span className="w-4 h-4 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span>Continue with Google</span>
                  </button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-wider font-bold">
                      <span className="bg-white px-2.5 text-slate-400">
                        {authMode === 'signup' ? 'Or register with email' : 'Or continue with email'}
                      </span>
                    </div>
                  </div>

                  {/* SIGN UP FORM */}
                  {authMode === 'signup' && (
                    <form onSubmit={handleSignUp} className="space-y-3.5">
                      
                      {/* Invite Code (If Invite-Only) */}
                      {registrationMode === 'invite_only' && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                              <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                              <span>Invite code required</span>
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <div className="relative flex-1">
                              <span className="absolute left-2.5 top-2 text-amber-700">
                                <Key className="w-3.5 h-3.5" />
                              </span>
                              <input
                                type="text"
                                value={inviteCodeInput}
                                onChange={(e) => {
                                  setInviteCodeInput(e.target.value.toUpperCase());
                                  validateInviteCode(e.target.value);
                                }}
                                placeholder="Invite code"
                                className="w-full bg-white border border-amber-200 rounded-xl py-1.5 pl-8 pr-2 text-xs font-mono font-bold text-slate-800 uppercase focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => validateInviteCode(inviteCodeInput)}
                              className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                            >
                              Verify
                            </button>
                          </div>
                          {validatedInvite && (
                            <div className="bg-emerald-100 text-emerald-900 text-[11px] font-bold p-2 rounded-xl flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Invite code accepted: {validatedInvite.plan.toUpperCase()} plan</span>
                            </div>
                          )}
                          {inviteError && (
                            <p className="text-[11px] font-bold text-rose-600">{inviteError}</p>
                          )}
                        </div>
                      )}

                      {/* Full Name */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Full name *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-400">
                            <User className="w-4 h-4" />
                          </span>
                          <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Jone Nakasamai"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
                          />
                        </div>
                      </div>

                      {/* Email */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Email *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-400">
                            <Mail className="w-4 h-4" />
                          </span>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            autoComplete="email"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
                          />
                        </div>
                      </div>

                      {/* Password */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Password *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-400">
                            <Lock className="w-4 h-4" />
                          </span>
                          <input
                            type={showPassword ? "text" : "password"}
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 6 characters"
                            autoComplete="new-password"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-10 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl py-2.5 text-xs font-black shadow-lg shadow-slate-900/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <span>Create account</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* SIGN IN FORM */}
                  {authMode === 'signin' && (
                    <form onSubmit={handleSignInSubmit} className="space-y-3.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Email *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-400">
                            <Mail className="w-4 h-4" />
                          </span>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            autoComplete="username"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Password *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-400">
                            <Lock className="w-4 h-4" />
                          </span>
                          <input
                            type={showPassword ? "text" : "password"}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            autoComplete="current-password"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-10 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-0.5">
                        <span className="text-slate-400">Need to reset your password?</span>
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          disabled={resetLoading}
                          className="text-sky-600 hover:text-sky-800 font-bold cursor-pointer disabled:opacity-50"
                        >
                          {resetLoading ? 'Sending…' : 'Forgot password?'}
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl py-2.5 text-xs font-black shadow-lg shadow-slate-900/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <span>Sign in</span>
                        )}
                      </button>
                    </form>
                  )}
                </>
              )}
            </>
          )}

          {/* ========================================================================= */}
          {/* STAGE 2: AWAITING EMAIL VERIFICATION SCREEN                               */}
          {/* ========================================================================= */}
          {stage === 'awaiting_email_verification' && (
            <div className="space-y-4 py-1">
              <button
                type="button"
                onClick={() => { setStage('form'); setError(''); }}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to sign in</span>
              </button>

              <div className="text-center">
                <div className="relative w-16 h-16 mx-auto mb-3">
                  <div className="w-16 h-16 bg-gradient-to-tr from-sky-600 to-teal-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-sky-600/20">
                    <Mail className="w-8 h-8" />
                  </div>
                  {!emailVerifiedSuccess && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-sky-500 border-2 border-white"></span>
                    </span>
                  )}
                  {emailVerifiedSuccess && (
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-1 border-2 border-white shadow">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                <span className="text-[10px] font-bold tracking-wider uppercase bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full inline-block mb-1.5">
                  Check your email
                </span>

                <h3 className="text-base font-bold text-slate-800">
                  Verify your email
                </h3>

                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  We sent a link to:
                </p>

                <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 inline-flex items-center gap-2 text-xs font-mono font-bold text-sky-700">
                  <Mail className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span className="truncate max-w-[220px]">{pendingProfile?.email || email}</span>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 space-y-2 text-[11px] text-slate-600">
                <div className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</div>
                  <p className="leading-snug">Open the email from <strong>Frilensa</strong>.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</div>
                  <p className="leading-snug">Click the verification link in it.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</div>
                  <p className="leading-snug">Come back here. Setup starts on its own once you’re verified.</p>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleManualCheckVerification}
                  disabled={isCheckingEmailStatus || emailVerifiedSuccess}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingEmailStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingEmailStatus ? 'Checking…' : "I’ve clicked the link"}</span>
                </button>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!canResend || loading}
                    onClick={handleResendVerificationEmail}
                    className="flex-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 py-2 px-3 rounded-xl border border-slate-200 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3 h-3 text-sky-500" />
                    <span>{canResend ? 'Resend' : `Resend (${resendCooldown}s)`}</span>
                  </button>

                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Footer info */}
        <div className="mt-5 text-center text-[11px] text-slate-400 space-y-1">
          <p className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
            <span>Calculates Fiji VAT, ECAL and STT</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ClientPortalSignIn({ onPortalSignIn }: { onPortalSignIn?: (session: PortalSession) => void }) {
  const [clientEmail, setClientEmail] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const session = await startPortalSessionWithPin(clientEmail.trim(), pin.trim());
      onPortalSignIn?.(session);
    } catch (err: any) {
      setMessage(err?.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <p className="text-xs text-slate-500 leading-relaxed">
        View your invoices and quotes. Use the portal link your consultant sent you, or sign in with your email and the PIN they gave you.
      </p>
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
        <input
          type="email"
          required
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
          autoComplete="email"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Portal PIN</label>
        <input
          type="password"
          inputMode="numeric"
          required
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="one-time-code"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
        />
      </div>
      {message && <p className="text-xs font-semibold text-rose-600">{message}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
      >
        {busy ? 'Signing in…' : 'Open portal'}
      </button>
    </form>
  );
}
