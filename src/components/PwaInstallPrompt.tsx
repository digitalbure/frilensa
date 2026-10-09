import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Download, Share2, PlusSquare, X, Smartphone, 
  CheckCircle2, Wifi, WifiOff, Sparkles, ShieldCheck 
} from 'lucide-react';

interface PwaInstallPromptProps {
  onDismiss?: () => void;
}

export default function PwaInstallPrompt({ onDismiss }: PwaInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installedSuccessfully, setInstalledSuccessfully] = useState(false);

  useEffect(() => {
    // Check if already installed / running in standalone mode
    const isStandaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');
    
    setIsStandalone(isStandaloneMode);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Capture standard PWA install prompt for Chromium/Android/Desktop
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Auto-show floating install prompt after 2 seconds if not installed and not dismissed before
      const hasDismissed = sessionStorage.getItem('pwa_install_prompt_dismissed');
      if (!hasDismissed && !isStandaloneMode) {
        setTimeout(() => setShowPrompt(true), 2000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Capture installed event
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalledSuccessfully(true);
      setShowPrompt(false);
      setTimeout(() => setInstalledSuccessfully(false), 4000);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // Online / Offline monitor
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Auto-prompt on iOS if not in standalone mode and not dismissed
    if (isIosDevice && !isStandaloneMode) {
      const hasDismissed = sessionStorage.getItem('pwa_install_prompt_dismissed');
      if (!hasDismissed) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    // Haptic feedback
    if ('vibrate' in navigator) navigator.vibrate?.([15, 30, 15]);

    if (isIOS) {
      setShowIosGuide(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalledSuccessfully(true);
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback for browsers that support manual install or instructions
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('pwa_install_prompt_dismissed', 'true');
    if (onDismiss) onDismiss();
  };

  if (isStandalone) {
    // When in standalone PWA mode, show subtle connectivity badge if offline
    if (!isOnline) {
      return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-slate-950 px-3 py-1.5 text-[10px] font-bold flex items-center justify-center gap-1.5 shadow-md">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode Active • Invoices & cached records safely stored locally</span>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {/* Offline Alert Strip */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-slate-950 px-3 py-1.5 text-[10px] font-bold flex items-center justify-center gap-1.5 shadow-md">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode: You are working offline. Cached records remain fully accessible.</span>
        </div>
      )}

      {/* Installed Toast Notification */}
      <AnimatePresence>
        {installedSuccessfully && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-50 max-w-sm mx-auto bg-emerald-600 text-white p-3 rounded-2xl shadow-xl flex items-center gap-2.5 border border-emerald-400/40"
          >
            <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
            <div className="text-xs">
              <p className="font-bold">App Installed Successfully!</p>
              <p className="text-[10px] text-emerald-100">Frilensa (frilensa.com) is now ready on your home screen with offline support.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Bottom PWA Install Card / Banner */}
      <AnimatePresence>
        {showPrompt && !installedSuccessfully && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="fixed bottom-20 left-3 right-3 z-40 max-w-md mx-auto bg-gradient-to-r from-slate-900 via-slate-900 to-slate-900 text-white p-3.5 rounded-2xl shadow-2xl border border-sky-500/30 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-teal-400 p-0.5 shadow-md flex items-center justify-center shrink-0">
                <img src="/pwa-icon.svg" alt="App Icon" className="w-full h-full rounded-[10px]" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-white tracking-tight truncate">
                    Install Frilensa App
                  </h4>
                  <span className="text-[8px] bg-sky-500/20 text-sky-300 font-bold px-1.5 py-0.2 rounded-full border border-sky-400/30">
                    PWA Fast
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 line-clamp-1 mt-0.5">
                  Full screen, offline access & instant push alerts on mobile.
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleInstallClick}
                  className="bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install</span>
                </button>
                <button
                  onClick={handleDismiss}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Installation Instructions Modal */}
      <AnimatePresence>
        {showIosGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl text-slate-900 relative border border-slate-100"
            >
              <button
                onClick={() => setShowIosGuide(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-teal-500 p-0.5 shadow-md flex items-center justify-center shrink-0">
                  <img src="/pwa-icon.svg" alt="App Icon" className="w-full h-full rounded-[14px]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Install on iPhone / iPad</h3>
                  <p className="text-[11px] text-slate-500">Run as a native app on your home screen</p>
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs text-slate-700">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="leading-snug">
                      Tap the <strong>Share</strong> button in Safari's bottom toolbar.
                    </p>
                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded-md border border-slate-200 text-[10px] text-slate-600 font-semibold">
                      <Share2 className="w-3 h-3 text-sky-600" /> Share Icon
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="leading-snug">
                      Scroll down and tap <strong>Add to Home Screen</strong>.
                    </p>
                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded-md border border-slate-200 text-[10px] text-slate-600 font-semibold">
                      <PlusSquare className="w-3 h-3 text-emerald-600" /> Add to Home Screen
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="leading-snug">
                      Tap <strong>Add</strong> in the top-right corner to finish.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setShowIosGuide(false)}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 text-xs font-bold shadow-md active:scale-98 transition-all"
                >
                  Got It, Thanks!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
