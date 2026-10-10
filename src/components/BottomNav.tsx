import React from 'react';
import { motion } from 'motion/react';
import { LayoutDashboard, Layers, Users, Briefcase, Settings, FolderKanban, Globe, Sparkles } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant';
  onChangeTab: (tab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant') => void;
  /** Items waiting on the user, shown as a badge on the Hub tab. */
  dashboardBadge?: number;
}

export default function BottomNav({ activeTab, onChangeTab, dashboardBadge = 0 }: BottomNavProps) {
  const navItems = [
    { id: 'dashboard' as const, label: 'Hub', icon: LayoutDashboard },
    { id: 'directory' as const, label: 'Directory', icon: Globe },
    { id: 'projects' as const, label: 'Projects', icon: FolderKanban },
    { id: 'billing' as const, label: 'Billing', icon: Layers },
    { id: 'clients' as const, label: 'Clients', icon: Users },
    { id: 'services' as const, label: 'Finance', icon: Briefcase },
    { id: 'assistant' as const, label: 'AI', icon: Sparkles },
    { id: 'settings' as const, label: 'Setup', icon: Settings },
  ];

  const handleTabClick = (tabId: typeof activeTab) => {
    // Native haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate?.(12);
    }
    onChangeTab(tabId);
  };

  return (
    <nav 
      aria-label="Bottom Navigation Bar"
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 px-1 pt-1.5 shadow-2xl shadow-slate-900/15 z-30 max-w-md mx-auto"
      style={{
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))'
      }}
    >
      <div className="flex justify-between items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className="flex flex-col items-center justify-center relative py-1 transition-all active:scale-95 group flex-1 min-w-[44px] touch-manipulation min-h-[44px]"
            >
              {item.id === 'dashboard' && dashboardBadge > 0 && (
                <span className="absolute top-0 right-1/4 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-extrabold flex items-center justify-center" aria-label={`${dashboardBadge} items need attention`}>
                  {dashboardBadge}
                </span>
              )}
              <div className="relative p-1.5 rounded-xl transition-all flex items-center justify-center">
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 bg-sky-50 rounded-xl -z-10 border border-sky-100"
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  />
                )}
                <Icon className={`w-4 h-4 stroke-[2.25] transition-transform ${
                  isActive 
                    ? 'text-sky-600 scale-110' 
                    : 'text-slate-400 group-hover:text-slate-600'
                }`} />
              </div>
              <span className={`text-[8.5px] font-bold mt-0.5 transition-colors tracking-tight text-center truncate w-full ${
                isActive ? 'text-sky-600 font-extrabold' : 'text-slate-400'
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
