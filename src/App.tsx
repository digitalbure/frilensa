import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, LogOut, CheckCircle2, CloudOff } from 'lucide-react';
import AuthView from './components/AuthView';
import DashboardView from './components/DashboardView';
import BillingView from './components/BillingView';
import ClientsView from './components/ClientsView';
import BookkeepingView from './components/BookkeepingView';
import SettingsView from './components/SettingsView';
import ProjectsView from './components/ProjectsView';
import ClientPortalView from './components/ClientPortalView';
import BottomNav from './components/BottomNav';
import DesktopSidebar from './components/DesktopSidebar';
import DesktopHeader from './components/DesktopHeader';
import AdminPanelView from './components/AdminPanelView';
import AiAssistantView from './components/AiAssistantView';
import DirectoryView from './components/DirectoryView';
import OnboardingWizard from './components/OnboardingWizard';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import PublicDocumentView from './components/PublicDocumentView';
import RateCardPublicView from './components/RateCardPublicView';
import { CRMData, UserProfile } from './types';
import { INITIAL_CRM_DATA } from './data/mockData';
import { auth, onAuthStateChanged, signOut, type User } from './lib/firebase';
import {
  saveConsultantData,
  loadConsultantData,
  subscribeToConsultantData,
  mergeCRMData,
  saveLocalBackup,
  loadLocalBackup,
  setLocalCacheOwner
} from './lib/db';
import {
  PortalSession,
  loadPortalSession,
  clearPortalSession,
  startPortalSessionWithToken
} from './lib/api';
import { isPlatformAdmin } from './lib/admin';
import { ensureShareTokens } from './lib/documentLinks';
import { normalizeDocuments } from './lib/normalizeDocuments';
import ScreenErrorBoundary from './components/ScreenErrorBoundary';
import OAuthConsent from './components/OAuthConsent';
import { inboxDocumentCount } from './lib/inbox';

type Tab = 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant';
const TABS: Tab[] = ['dashboard', 'directory', 'billing', 'clients', 'services', 'settings', 'projects', 'assistant'];
const LAST_ACTIVE_KEY = 'fiji_crm_last_active_timestamp';
const SAVE_DEBOUNCE_MS = 1200;

function freshWorkspaceFor(user: User): CRMData {
  return {
    ...INITIAL_CRM_DATA,
    userProfile: {
      ...INITIAL_CRM_DATA.userProfile,
      name: user.displayName || '',
      email: (user.email || '').toLowerCase(),
      emailVerified: user.emailVerified,
      avatarUrl: user.photoURL || undefined
    }
  };
}

export default function App() {
  // Firebase is the only source of truth for who is signed in.
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const isSignedIn = Boolean(authUser && authUser.emailVerified);
  // Connecting an app such as Claude: /oauth/authorize?client_id=… (see server/oauth.ts).
  const isOAuthAuthorize = window.location.pathname === '/oauth/authorize';

  // Client portal session (issued and verified by the server)
  const [portalSession, setPortalSession] = useState<PortalSession | null>(() => loadPortalSession());
  const [portalLinkError, setPortalLinkError] = useState<string | null>(null);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'client'>('signin');

  // "View online" document links: /?doc=<token>. Links from older versions (?viewDoc=…, /docs/…)
  // can't be opened securely, so they get an explanation instead.
  const [publicDocLink, setPublicDocLink] = useState<{ token: string | null } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('doc');
    if (token) return { token };
    if (params.get('viewDoc') || window.location.pathname.startsWith('/docs/')) return { token: null };
    return null;
  });

  // Shareable rate cards: /?rates=<token>
  const [rateCardToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get('rates'));

  // CRM workspace for the signed-in user
  const [crmData, setCrmData] = useState<CRMData>(INITIAL_CRM_DATA);
  const crmDataRef = useRef<CRMData>(INITIAL_CRM_DATA);
  // Cloud saves are held until the cloud copy has been loaded, so an empty local state can never overwrite it.
  const [cloudReady, setCloudReady] = useState(false);
  const cloudReadyRef = useRef(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeUidRef = useRef<string | null>(null);

  // SaaS Super Admin states
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const [impersonationTenant, setImpersonationTenant] = useState<string | null>(null);
  const [originalCrmData, setOriginalCrmData] = useState<CRMData | null>(null);
  const canAdmin = isPlatformAdmin(authUser);

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    return tabParam && TABS.includes(tabParam) ? tabParam : 'dashboard';
  });
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Session Inactivity & Auto-Logout Security States
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const [showInactivityWarning, setShowInactivityWarning] = useState<boolean>(false);
  const [inactivityCountdown, setInactivityCountdown] = useState<number>(60);
  const lastActiveRef = useRef<number>(Date.now());

  const inactivityTimeoutMinutes =
    crmData.userProfile?.inactivityTimeoutMinutes ??
    crmData.platformSettings?.defaultInactivityTimeoutMinutes ??
    15;

  const applyData = useCallback((incoming: CRMData) => {
    // Repair documents with missing amounts or fields (they crashed Billing), then give every
    // document a share token so its "view online" link and QR code work.
    const data = ensureShareTokens(normalizeDocuments(incoming));
    crmDataRef.current = data;
    setCrmData(data);
    return data;
  }, []);

  const flushCloudSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!cloudReadyRef.current || !auth.currentUser) return;
    try {
      await saveConsultantData(crmDataRef.current);
      setSyncError(null);
    } catch (err: any) {
      console.warn('Cloud save failed:', err);
      setSyncError(err?.message?.includes('offline') || err?.code === 'unavailable'
        ? 'You are offline. Changes are kept on this device and will sync when you reconnect.'
        : 'Your latest changes could not be saved to the cloud. They are kept on this device.');
    }
  }, []);

  const scheduleCloudSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { flushCloudSave(); }, SAVE_DEBOUNCE_MS);
  }, [flushCloudSave]);

  // Auth lifecycle: load the signed-in user's workspace, and wipe it from memory on sign-out or user switch.
  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }
      cloudReadyRef.current = false;
      setCloudReady(false);
      setAuthUser(firebaseUser);

      if (!firebaseUser || !firebaseUser.emailVerified) {
        activeUidRef.current = null;
        setLocalCacheOwner(null);
        applyData(INITIAL_CRM_DATA);
        setAuthReady(true);
        return;
      }

      activeUidRef.current = firebaseUser.uid;
      const email = (firebaseUser.email || '').toLowerCase();
      setLocalCacheOwner(firebaseUser.uid, email);
      const local = loadLocalBackup();
      let working = local || freshWorkspaceFor(firebaseUser);
      applyData(working);
      setAuthReady(true);

      try {
        // Make sure the ID token carries email_verified=true before touching Firestore.
        await firebaseUser.getIdToken(true);
        const remote = await loadConsultantData();
        if (activeUidRef.current !== firebaseUser.uid) return;
        if (remote) {
          working = local ? mergeCRMData(local, remote.data) : mergeCRMData(freshWorkspaceFor(firebaseUser), remote.data);
          working.userProfile = { ...working.userProfile, email, emailVerified: true };
          applyData(working);
          saveLocalBackup(working);
        }
        cloudReadyRef.current = true;
        setCloudReady(true);
        // Documents that just received a share token must be saved so their links keep working.
        const tokensAdded = (remote?.data.documents || []).some(d => d && !d.shareToken);
        if (!remote || remote.migratedFromLegacy || local || tokensAdded) {
          await flushCloudSave();
        }
        unsubSnapshot = subscribeToConsultantData((liveData) => {
          if (activeUidRef.current !== firebaseUser.uid) return;
          const merged = mergeCRMData(crmDataRef.current, liveData);
          applyData(merged);
          saveLocalBackup(merged);
        });
      } catch (err) {
        console.warn('Could not load workspace from the cloud:', err);
        // Saving stays off until a cloud load succeeds, so a stale device copy can never overwrite newer cloud data.
        // Edits made meanwhile are kept on this device and merged in on the next successful sync.
        setSyncError('Could not reach the cloud. Your changes are kept on this device until it reconnects.');
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, [applyData, flushCloudSave]);

  // Direct client portal links (?token=...) are exchanged with the server for a portal session.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('clientToken') || params.get('portalToken');
    if (!token) return;
    startPortalSessionWithToken(token)
      .then(session => setPortalSession(session))
      .catch(err => setPortalLinkError(err?.message || 'This portal link is invalid or has been revoked.'))
      .finally(() => {
        params.delete('token'); params.delete('clientToken'); params.delete('portalToken'); params.delete('email');
        const qs = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
      });
  }, []);

  // Flush pending saves when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushCloudSave(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flushCloudSave]);

  const recordActivity = useCallback(() => {
    const now = Date.now();
    lastActiveRef.current = now;
    const stored = Number(localStorage.getItem(LAST_ACTIVE_KEY) || '0');
    if (now - stored > 3000) {
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
    }
  }, []);

  const handleStayLoggedIn = () => {
    const now = Date.now();
    lastActiveRef.current = now;
    localStorage.setItem(LAST_ACTIVE_KEY, String(now));
    setShowInactivityWarning(false);
  };

  const handleUpdateData = (newData: CRMData) => {
    if (impersonationTenant) {
      // Sandbox edits stay in memory only.
      setCrmData(newData);
      return;
    }
    saveLocalBackup(applyData(newData));
    scheduleCloudSave();
  };

  // Called by AuthView after a successful sign-in/registration with the details the user typed.
  const handleSignIn = async (profile: UserProfile, _isNewRegistration: boolean = false) => {
    setLogoutReason(null);
    setShowInactivityWarning(false);
    const now = Date.now();
    lastActiveRef.current = now;
    localStorage.setItem(LAST_ACTIVE_KEY, String(now));

    const user = auth.currentUser;
    if (!user) return;
    // Email verification may have completed after the auth state was first reported.
    if (user.emailVerified && activeUidRef.current !== user.uid) {
      await user.getIdToken(true);
      setAuthUser(user);
      // Re-run the auth bootstrap by reloading; onAuthStateChanged doesn't fire for verification.
      window.location.reload();
      return;
    }
    if (profile.name && !crmDataRef.current.userProfile?.name) {
      handleUpdateData({
        ...crmDataRef.current,
        userProfile: { ...crmDataRef.current.userProfile, name: profile.name }
      });
    }
  };

  const handleSignOut = async () => {
    await flushCloudSave();
    handleExitImpersonation();
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Error signing out from Firebase:', e);
    }
    setShowInactivityWarning(false);
    setShowAdminPanel(false);
    setActiveTab('dashboard');
  };

  // Inactivity Auto-Logout & Session Security Monitor
  useEffect(() => {
    if (!isSignedIn || inactivityTimeoutMinutes <= 0) {
      setShowInactivityWarning(false);
      return;
    }

    // Initialize activity timestamp
    const now = Date.now();
    lastActiveRef.current = now;
    localStorage.setItem(LAST_ACTIVE_KEY, String(now));

    // Global activity listener
    let lastThrottledTime = 0;
    const handleUserInteraction = () => {
      const current = Date.now();
      if (current - lastThrottledTime > 2000) {
        lastThrottledTime = current;
        recordActivity();
      }
    };

    const monitoredEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'pointerdown'];
    monitoredEvents.forEach(evt => {
      window.addEventListener(evt, handleUserInteraction, { passive: true });
    });

    // Check inactivity countdown every second
    const interval = setInterval(() => {
      const storedLast = Number(localStorage.getItem(LAST_ACTIVE_KEY) || String(lastActiveRef.current));
      const effectiveLastActive = Math.max(lastActiveRef.current, storedLast);
      const idleMs = Date.now() - effectiveLastActive;
      const totalAllowedMs = inactivityTimeoutMinutes * 60 * 1000;
      const remainingMs = totalAllowedMs - idleMs;
      const remainingSec = Math.ceil(remainingMs / 1000);

      if (remainingSec <= 0) {
        // Auto-logout triggered due to idle timeout
        clearInterval(interval);
        handleSignOut();
        setLogoutReason(
          `You were automatically signed out after ${inactivityTimeoutMinutes} minute${inactivityTimeoutMinutes === 1 ? '' : 's'} of inactivity.`
        );
        setShowInactivityWarning(false);
      } else if (remainingSec <= 60) {
        // Show 60-second warning countdown modal
        setShowInactivityWarning(true);
        setInactivityCountdown(remainingSec);
      } else {
        setShowInactivityWarning(false);
      }
    }, 1000);

    return () => {
      monitoredEvents.forEach(evt => {
        window.removeEventListener(evt, handleUserInteraction);
      });
      clearInterval(interval);
    };
  }, [isSignedIn, inactivityTimeoutMinutes, recordActivity]);

  const handleStartImpersonating = (tenantName: string, simulatedData: any) => {
    if (!originalCrmData) {
      setOriginalCrmData(crmData);
    }
    setImpersonationTenant(tenantName);
    setCrmData(simulatedData);
    setShowAdminPanel(false);
    setActiveTab('dashboard');
  };

  const handleExitImpersonation = () => {
    if (originalCrmData) {
      setCrmData(originalCrmData);
      setOriginalCrmData(null);
    }
    setImpersonationTenant(null);
  };

  // Safe navigation function with action payloads (e.g., jump from Dashboard click directly to Creator in Billing)
  const handleNavigateWithAction = (
    tab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant', 
    docActionId?: string
  ) => {
    setActiveTab(tab);
    if (docActionId) {
      setSelectedDocId(docActionId);
    }
  };

  const handleManualCloudSync = async () => {
    if (!auth.currentUser) return;
    if (!cloudReadyRef.current) {
      // The workspace never loaded from the cloud: rerun startup (load, merge this device's edits, subscribe).
      window.location.reload();
      return;
    }
    try {
      const remote = await loadConsultantData();
      if (remote) {
        const merged = mergeCRMData(crmDataRef.current, remote.data);
        applyData(merged);
        saveLocalBackup(merged);
      }
      await flushCloudSave();
    } catch (e) {
      console.warn('Manual cloud resync failed:', e);
      setSyncError('Sync failed. Check your connection and try again.');
    }
  };

  const handlePortalSignIn = (session: PortalSession) => {
    setPortalLinkError(null);
    setPortalSession(session);
  };

  if (rateCardToken) {
    return <RateCardPublicView token={rateCardToken} />;
  }

  if (publicDocLink) {
    return (
      <PublicDocumentView
        token={publicDocLink.token}
        onOpenClientSignIn={() => {
          window.history.replaceState({}, '', '/');
          setAuthInitialMode('client');
          setPublicDocLink(null);
        }}
      />
    );
  }

  if (portalSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex justify-center items-start sm:p-4 font-sans antialiased">
        <div className="w-full max-w-md min-h-screen sm:min-h-[850px] bg-slate-50 flex flex-col relative sm:rounded-[2.5rem] sm:shadow-2xl sm:border-[6px] border-slate-800 overflow-hidden">
          <ClientPortalView
            session={portalSession}
            onSignOut={() => {
              clearPortalSession();
              setPortalSession(null);
            }}
          />
        </div>
        <PwaInstallPrompt />
      </div>
    );
  }

  if (!authReady) {
    return <LoadingScreen label="Loading Frilensa…" />;
  }

  if (!isSignedIn) {
    return (
      <>
        {isOAuthAuthorize && (
          <div className="fixed top-3 inset-x-3 z-[999] mx-auto max-w-md rounded-xl bg-slate-900 text-white text-xs font-semibold px-4 py-3 shadow-lg text-center">
            Sign in to Frilensa to finish connecting.
          </div>
        )}
        {portalLinkError && (
          <div className="fixed top-3 inset-x-3 z-[999] mx-auto max-w-md rounded-xl bg-rose-600 text-white text-xs font-semibold px-4 py-3 shadow-lg">
            {portalLinkError}
          </div>
        )}
        <AuthView
          onSignIn={handleSignIn}
          onPortalSignIn={handlePortalSignIn}
          platformSettings={crmData.platformSettings}
          logoutReason={logoutReason}
          onClearLogoutReason={() => setLogoutReason(null)}
          initialMode={authInitialMode}
        />
        <PwaInstallPrompt />
      </>
    );
  }

  if (isOAuthAuthorize) {
    return <OAuthConsent email={authUser?.email} onSignOut={handleSignOut} />;
  }

  // Wait for the cloud copy before deciding a returning user on a new device needs onboarding.
  const hasWorkspace = Boolean(crmData.onboardingCompleted || crmData.userProfile?.onboardingCompleted || crmData.businesses?.length);
  if (!hasWorkspace && !cloudReady) {
    if (syncError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-sm text-center space-y-3">
            <CloudOff className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">{syncError}</p>
            <div className="flex gap-2 justify-center">
              <button type="button" onClick={handleManualCloudSync} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">Try again</button>
              <button type="button" onClick={handleSignOut} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer">Sign out</button>
            </div>
          </div>
        </div>
      );
    }
    return <LoadingScreen label="Loading your workspace…" />;
  }

  const needsOnboarding = !hasWorkspace;

  if (needsOnboarding) {
    return (
      <>
        <OnboardingWizard
          initialData={crmData}
          onCompleteOnboarding={(completedData) => {
            handleUpdateData(completedData);
          }}
          onSignOut={handleSignOut}
        />
        <PwaInstallPrompt />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex font-sans antialiased text-slate-900">
      
      {/* Desktop & Tablet Navigation Sidebar (hidden on mobile, visible md+) */}
      <DesktopSidebar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        crmData={crmData}
        onUpdateData={handleUpdateData}
        onSignOut={handleSignOut}
        onOpenAdminPanel={canAdmin ? () => setShowAdminPanel(true) : undefined}
      />

      {/* Main Content Workspace Container */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen md:h-screen md:overflow-hidden bg-slate-50">
        
        {/* Desktop & Tablet Top Bar Header (hidden on mobile, visible md+) */}
        <DesktopHeader
          activeTab={activeTab}
          crmData={crmData}
          onManualCloudSync={handleManualCloudSync}
        />

        {/* Native Mobile Safe Area Top Spacer */}
        <div 
          className="md:hidden bg-white shrink-0 pointer-events-none" 
          style={{ height: 'env(safe-area-inset-top, 0px)' }} 
        />

        {/* Impersonation Active Warn Banner */}
        {impersonationTenant && (
          <div className="bg-amber-400 text-slate-950 px-4 py-2 text-[10px] font-bold flex items-center justify-between shadow-inner shrink-0 z-20">
            <div className="flex items-center gap-1.5 truncate">
              <span className="h-1.5 w-1.5 bg-slate-950 rounded-full animate-pulse"></span>
              <p className="truncate">Viewing as <span className="underline font-black">{impersonationTenant}</span></p>
            </div>
            <button
              onClick={handleExitImpersonation}
              className="bg-slate-950 hover:bg-slate-900 text-amber-400 font-extrabold px-2.5 py-1 rounded-lg text-[9px] uppercase tracking-widest shrink-0 transition-all active:scale-95 cursor-pointer"
            >
              Stop viewing
            </button>
          </div>
        )}

        {syncError && (
          <div className="bg-amber-100 text-amber-900 border-b border-amber-200 px-4 py-2 text-[11px] font-semibold flex items-center justify-between gap-2 shrink-0 z-20">
            <span className="flex items-center gap-1.5"><CloudOff className="w-3.5 h-3.5 shrink-0" />{syncError}</span>
            <button type="button" onClick={handleManualCloudSync} className="underline font-bold shrink-0 cursor-pointer">Retry</button>
          </div>
        )}

        {/* Content Screens Router */}
        <main className="flex-1 md:overflow-y-auto pb-20 md:pb-8 bg-slate-50/70 smooth-scroll">
          <ScreenErrorBoundary key={activeTab} onGoHome={() => setActiveTab('dashboard')}>
          {activeTab === 'dashboard' && (
            <DashboardView 
              data={crmData} 
              onUpdateData={handleUpdateData}
              onNavigateToTab={handleNavigateWithAction}
              onManualCloudSync={handleManualCloudSync}
            />
          )}

          {activeTab === 'directory' && (
            <DirectoryView 
              data={crmData} 
              onUpdateData={handleUpdateData}
              onOpenAdminPanel={canAdmin ? () => setShowAdminPanel(true) : undefined}
              onNavigateToTab={handleNavigateWithAction}
            />
          )}

          {activeTab === 'billing' && (
            <BillingView 
              data={crmData} 
              onUpdateData={handleUpdateData}
              selectedDocId={selectedDocId}
              onClearSelectedDocId={() => setSelectedDocId(null)}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsView 
              data={crmData} 
              onUpdateData={handleUpdateData}
              onNavigateToTab={handleNavigateWithAction}
            />
          )}

          {activeTab === 'services' && (
            <BookkeepingView 
              data={crmData} 
              onUpdateData={handleUpdateData}
              onNavigateToTab={handleNavigateWithAction}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsView 
              data={crmData} 
              onUpdateData={handleUpdateData}
              onNavigateToTab={handleNavigateWithAction}
            />
          )}

          {activeTab === 'assistant' && (
            <AiAssistantView 
              data={crmData}
              onUpdateData={handleUpdateData}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView 
              data={crmData} 
              onUpdateData={handleUpdateData}
              onManualCloudSync={handleManualCloudSync}
              onSignOut={handleSignOut}
              onOpenAdminPanel={canAdmin ? () => setShowAdminPanel(true) : undefined}
            />
          )}
          </ScreenErrorBoundary>
        </main>

        {/* Fixed Mobile Bottom Tab Bar (hidden on md+) */}
        <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} dashboardBadge={inboxDocumentCount(crmData)} />
      </div>

      {/* Install PWA Prompt Banner & Offline Status */}
      <PwaInstallPrompt />

      {showAdminPanel && canAdmin && (
        <AdminPanelView 
          onClose={() => setShowAdminPanel(false)}
          crmData={crmData}
          onUpdateCrmData={handleUpdateData}
          onImpersonate={handleStartImpersonating}
        />
      )}

      {/* Inactivity Auto-Logout Warning Modal */}
      <AnimatePresence>
        {showInactivityWarning && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 text-center space-y-4 relative overflow-hidden"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 shadow-xs">
                <Clock className="w-7 h-7 text-amber-600 animate-pulse" />
              </div>
              
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">Are you still there?</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  You've been inactive for a while. You'll be signed out in:
                </p>
                <div className="mt-3 flex items-center justify-center gap-1.5 font-mono text-3xl font-black text-amber-600">
                  <span>{inactivityCountdown}</span>
                  <span className="text-xs font-sans text-slate-400 font-semibold uppercase tracking-wider">seconds</span>
                </div>
              </div>

              {/* Visual Countdown Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-rose-500 h-full transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, (inactivityCountdown / 60) * 100))}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={handleStayLoggedIn}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Stay signed in
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm font-semibold">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-sky-600 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}
