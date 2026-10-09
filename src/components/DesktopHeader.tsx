import React, { useState } from 'react';
import { 
  Search, Calculator, Zap, ShieldCheck, Sparkles, Building2, 
  ExternalLink, Layers, Users, FolderKanban, Briefcase, Globe, Settings,
  Cloud, RefreshCw, CheckCircle2
} from 'lucide-react';
import { CRMData } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

interface DesktopHeaderProps {
  activeTab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant';
  crmData: CRMData;
  onOpenQuickPulse?: () => void;
  onOpenFxCalc?: () => void;
  onSearchClick?: () => void;
  onManualCloudSync?: () => Promise<void>;
}

export default function DesktopHeader({
  activeTab,
  crmData,
  onOpenQuickPulse,
  onOpenFxCalc,
  onSearchClick,
  onManualCloudSync
}: DesktopHeaderProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncedJustNow, setSyncedJustNow] = useState(false);
  const activeBusiness = crmData.businesses?.find(b => b.id === crmData.activeBusinessId) || crmData.businesses?.[0];

  const handleSyncClick = async () => {
    if (syncing) return;
    setSyncing(true);
    if (onManualCloudSync) {
      await onManualCloudSync();
    } else {
      await new Promise(r => setTimeout(r, 600));
    }
    setSyncing(false);
    setSyncedJustNow(true);
    setTimeout(() => setSyncedJustNow(false), 2500);
  };

  const getTabInfo = () => {
    switch (activeTab) {
      case 'dashboard':
        return { title: 'Executive Hub', subtitle: 'Overview, cash flow, and quick invoicing actions' };
      case 'billing':
        return { title: 'Invoices & Billing', subtitle: 'Tax-compliant invoices, quotes, receipts & retainers' };
      case 'clients':
        return { title: 'Client Management', subtitle: 'Directory of clients, direct portals & access links' };
      case 'projects':
        return { title: 'Projects & Milestones', subtitle: 'Kanban boards, deliverables & tracked hourly billing' };
      case 'services':
        return { title: 'Finance & Bookkeeping', subtitle: 'P&L statements, BSP/ANZ ledger & auto reconciler' };
      case 'directory':
        return { title: 'Service Directory', subtitle: 'FRCS-verified Fijian freelancers and agency network' };
      case 'assistant':
        return { title: 'Bula AI Copilot', subtitle: 'Smart business advisor for Fiji tax, billing and contracts' };
      case 'settings':
        return { title: 'Settings & Compliance', subtitle: 'TIN registration, VAT rates, PWA, and business presets' };
      default:
        return { title: 'Frilensa Freelancer CRM', subtitle: 'Pacific Business Operating System' };
    }
  };

  const tabInfo = getTabInfo();

  return (
    <header className="hidden md:flex h-16 bg-white border-b border-slate-200/80 px-6 lg:px-8 items-center justify-between shrink-0 select-none z-10">
      
      {/* Left: View Title & Subtitle */}
      <div className="flex items-center gap-3 min-w-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base lg:text-lg font-bold text-slate-900 tracking-tight font-display">
              {tabInfo.title}
            </h1>
            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200 font-mono">
              {crmData.userProfile?.defaultCurrency || 'FJD'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate hidden lg:block">
            {tabInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Tools, Active Business Indicator & Shortcuts */}
      <div className="flex items-center gap-3 shrink-0">
        
        {/* Quick Search Trigger */}
        <button
          type="button"
          onClick={onSearchClick}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 text-xs font-medium border border-slate-200/60 transition-all cursor-pointer shadow-2xs"
          title="Search anything (⌘K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden xl:inline text-[11px]">Quick Search...</span>
          <kbd className="text-[9px] font-mono font-bold bg-white text-slate-400 border border-slate-200 px-1 py-0.5 rounded shadow-2xs">
            ⌘K
          </kbd>
        </button>

        {/* Cloud Firestore Sync Status Button */}
        <button
          type="button"
          onClick={handleSyncClick}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
            syncedJustNow 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : syncing
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
          }`}
          title={`Cloud Database Sync: ${firebaseConfig.projectId} (Click to re-sync)`}
        >
          {syncing ? (
            <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
          ) : syncedJustNow ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Cloud className="w-3.5 h-3.5 text-sky-600" />
          )}
          <span className="hidden sm:inline text-[11px]">
            {syncing ? 'Syncing...' : syncedJustNow ? 'Synced' : 'Cloud DB'}
          </span>
        </button>

        {/* Currency & FX Calculator quick launcher */}
        <button
          type="button"
          onClick={onOpenFxCalc}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100/80 text-sky-800 text-xs font-bold border border-sky-200/70 transition-all cursor-pointer shadow-2xs"
          title="Open Pacific FX Exchange Calculator"
        >
          <Calculator className="w-3.5 h-3.5 text-sky-600" />
          <span className="hidden sm:inline text-[11px]">FX Rates</span>
        </button>

        {/* Activity Summary / Quick Pulse */}
        <button
          type="button"
          onClick={onOpenQuickPulse}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-sky-500/10 hover:from-amber-500/20 hover:to-sky-500/20 text-slate-800 text-xs font-bold border border-amber-300/40 transition-all cursor-pointer shadow-2xs"
          title="Open Activity Summary Pulse"
        >
          <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
          <span className="hidden sm:inline text-[11px]">Pulse</span>
        </button>

        {/* Active Business Badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div 
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-xs"
            style={{ backgroundColor: activeBusiness?.colorTheme || '#0284c7' }}
          >
            {activeBusiness?.name?.charAt(0) || 'B'}
          </div>
          <div className="hidden lg:block text-left">
            <span className="text-[11px] font-bold text-slate-800 block truncate max-w-[120px]">
              {activeBusiness?.name}
            </span>
            <span className="text-[9px] text-emerald-600 font-bold block flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Online
            </span>
          </div>
        </div>

      </div>
    </header>
  );
}
