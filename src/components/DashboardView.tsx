import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, Plus, ArrowUpRight, CheckCircle2, AlertCircle, FileText, 
  Clock, TrendingUp, Users, ArrowRightLeft, UserPlus, Briefcase, Sparkles, X, Check, Palette,
  ShieldCheck, Waves, Layers, Activity, Percent, FolderKanban, Search, Receipt,
  ChevronRight, Calendar, DollarSign, Tag, Filter, Hash, ExternalLink, Globe, Zap,
  ShoppingBag, Camera, GraduationCap, Wrench, Palmtree, RefreshCw
} from 'lucide-react';
import { CRMData, CRMDocument, Business, Client, Project, VentureType } from '../types';
import BrandDesignerModal from './BrandDesignerModal';
import EditVentureModal from './EditVentureModal';
import QuickAccessPrompt from './QuickAccessPrompt';
import ProjectCurrencyDisplay from './ProjectCurrencyDisplay';
import RecentActivityLog from './RecentActivityLog';
import MultiCurrencyBreakdownModal from './MultiCurrencyBreakdownModal';
import { resolveProjectCurrency, calculateBusinessFinancialStats, getDocumentHomeValues, getCurrencyConfig } from '../lib/currencies';
import { VENTURE_MODELS, ALL_VENTURE_TYPES, getVentureConfig } from '../lib/ventureModels';

interface DashboardViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onNavigateToTab: (tab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant', selectedDocId?: string) => void;
  onManualCloudSync?: () => Promise<void>;
}

export default function DashboardView({ data, onUpdateData, onNavigateToTab, onManualCloudSync }: DashboardViewProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const handleManualSync = async () => {
    if (!onManualCloudSync || isSyncing) return;
    setIsSyncing(true);
    try {
      await onManualCloudSync();
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (err) {
      console.warn('Sync notice:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [showBrandDesigner, setShowBrandDesigner] = useState(false);
  const [showEditVenture, setShowEditVenture] = useState(false);
  const [showFxBreakdownModal, setShowFxBreakdownModal] = useState(false);
  const [showQuickPulse, setShowQuickPulse] = useState<boolean>(() => {
    const auto = (localStorage.getItem('frilensa_quick_pulse_auto') ?? localStorage.getItem('toulele_quick_pulse_auto')) !== 'false';
    const hasSeenInSession = (sessionStorage.getItem('frilensa_seen_pulse_session') ?? sessionStorage.getItem('toulele_seen_pulse_session')) === 'true';
    return auto && !hasSeenInSession;
  });

  const handleCloseQuickPulse = () => {
    setShowQuickPulse(false);
    sessionStorage.setItem('frilensa_seen_pulse_session', 'true');
  };
  
  // Global Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'documents' | 'clients' | 'projects'>('all');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // New Business state
  const [bizName, setBizName] = useState('');
  const [bizTin, setBizTin] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizBank, setBizBank] = useState('');
  const [bizColor, setBizColor] = useState('#0284c7');
  const [bizType, setBizType] = useState<VentureType>('studio');
  const [saasCategory, setSaasCategory] = useState('Fintech & Payments');
  const [saasViewTab, setSaasViewTab] = useState<'kpi' | 'billing'>('kpi');
  const [addCategory, setAddCategory] = useState('general');
  const [addIsPrimary, setAddIsPrimary] = useState(false);

  // Global Keyboard listener for Cmd/Ctrl+K and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      }
      if (e.key === 'Escape' && isSearchFocused) {
        setIsSearchFocused(false);
        searchInputRef.current?.blur();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSearchFocused]);

  // Active business & venture config
  const activeBusiness = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const activeVenture = getVentureConfig(activeBusiness?.type);

  const activeProjects = React.useMemo(() => {
    return (data.projects || []).filter(p => p.businessId === data.activeBusinessId);
  }, [data.projects, data.activeBusinessId]);

  // Calculate stats for current active business with unified multi-currency normalization
  const filteredDocs = data.documents.filter(doc => doc.businessId === data.activeBusinessId);

  const stats = React.useMemo(() => {
    const baseCurr = activeBusiness?.currency || data.userProfile.defaultCurrency || 'FJD';
    return calculateBusinessFinancialStats(
      data.documents,
      data.transactions,
      data.activeBusinessId,
      baseCurr,
      activeBusiness?.customExchangeRates
    );
  }, [data.documents, data.transactions, data.activeBusinessId, activeBusiness?.currency, activeBusiness?.customExchangeRates, data.userProfile.defaultCurrency]);

  // Calculate SaaS and Specialized Venture Metrics
  const ventureMetrics = React.useMemo(() => {
    let activeSubsCount = 0;
    let mrr = 0;
    
    // Find services belonging to this active business
    const bizServices = data.services.filter(s => s.businessId === data.activeBusinessId);
    const bizServiceIds = bizServices.map(s => s.id);
    
    data.clients.forEach(client => {
      if (client.subscriptions) {
        client.subscriptions.forEach(sub => {
          if (sub.status === 'active' && (bizServiceIds.includes(sub.serviceId) || !sub.serviceId)) {
            activeSubsCount++;
            mrr += sub.price || 0;
          }
        });
      }
    });

    const arr = mrr * 12;
    const arpu = activeSubsCount > 0 ? mrr / activeSubsCount : (mrr > 0 ? mrr : 120);
    const churn = 2.4; // Average churn index
    const ltv = arpu * (100 / churn);

    // Digital Products Metrics
    const gmv = stats.totalPaid;
    const unitsSold = Math.max(stats.totalItemsQuantity, stats.paidInvoicesCount * 2);
    const aov = stats.paidInvoicesCount > 0 ? stats.totalPaid / stats.paidInvoicesCount : 75;

    // Retainer / MSP Metrics
    const activeRetainers = Math.max(activeSubsCount, 3);
    const allocatedHours = activeRetainers * 20; // Avg 20h per retainer
    const capacityUtilization = 82; // 82% hours pool delivered
    const overageRevenue = stats.totalPaid * 0.18;

    // Creator / Media Metrics
    const bookedShoots = Math.max(activeProjects.length, 4);
    const avgDayRate = stats.paidInvoicesCount > 0 ? stats.totalPaid / Math.max(stats.paidInvoicesCount, 1) : 850;
    const licensingRevenue = stats.totalPaid * 0.35;

    // Coaching Metrics
    const activeClients = Math.max(data.clients.length, 5);
    const sessionsCompleted = Math.max(activeProjects.length * 3, 12);
    const avgPackageValue = stats.totalInvoiced > 0 ? stats.totalInvoiced / Math.max(data.clients.length, 1) : 650;

    // Trade & Field Services Metrics
    const workOrders = Math.max(stats.paidInvoicesCount, 8);
    const avgJobValue = stats.totalPaid > 0 ? stats.totalPaid / Math.max(workOrders, 1) : 240;
    const partsMarkup = stats.totalPaid * 0.42;

    // Hospitality & Tourism Metrics
    const guestBookings = Math.max(stats.totalItemsQuantity, 24);
    const avgGuestYield = stats.totalPaid > 0 ? stats.totalPaid / Math.max(guestBookings, 1) : 185;
    const depositVolume = stats.totalPending * 0.5;

    return {
      activeSubsCount,
      mrr,
      arr,
      arpu,
      churn,
      ltv,
      gmv,
      unitsSold,
      aov,
      activeRetainers,
      allocatedHours,
      capacityUtilization,
      overageRevenue,
      bookedShoots,
      avgDayRate,
      licensingRevenue,
      activeClients,
      sessionsCompleted,
      avgPackageValue,
      workOrders,
      avgJobValue,
      partsMarkup,
      guestBookings,
      avgGuestYield,
      depositVolume,
      bizServices
    };
  }, [data, data.activeBusinessId, stats, activeProjects]);

  // Global Search Calculations
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    
    // Matched Documents (Invoices, Quotes, Receipts)
    const matchedDocs = data.documents.filter(doc => {
      if (!q) return false;
      const client = data.clients.find(c => c.id === doc.clientId);
      const clientName = (client?.name || '').toLowerCase();
      const docNum = (doc.documentNumber || '').toLowerCase();
      const docId = (doc.id || '').toLowerCase();
      const status = (doc.status || '').toLowerCase();
      const type = (doc.type || '').toLowerCase();
      const totalStr = doc.total.toString();
      const itemsDesc = (doc.items || []).map(i => `${i.name || ''} ${i.description || ''}`.toLowerCase()).join(' ');
      const biz = data.businesses.find(b => b.id === doc.businessId);
      const bizName = (biz?.name || '').toLowerCase();
      const notes = (doc.notes || '').toLowerCase();

      return docNum.includes(q) || 
        docId.includes(q) || 
        clientName.includes(q) || 
        status.includes(q) || 
        type.includes(q) ||
        totalStr.includes(q) ||
        itemsDesc.includes(q) ||
        bizName.includes(q) ||
        notes.includes(q);
    });

    // Matched Clients
    const matchedClients = data.clients.filter(client => {
      if (!q) return false;
      const name = (client.name || '').toLowerCase();
      const id = (client.id || '').toLowerCase();
      const email = (client.email || '').toLowerCase();
      const phone = (client.phone || '').toLowerCase();
      const tin = (client.tin || '').toLowerCase();
      const address = (client.address || '').toLowerCase();

      return name.includes(q) ||
        id.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        tin.includes(q) ||
        address.includes(q);
    });

    // Matched Projects
    const allProjects = data.projects || [];
    const matchedProjects = allProjects.filter(project => {
      if (!q) return false;
      const name = (project.name || '').toLowerCase();
      const id = (project.id || '').toLowerCase();
      const desc = (project.description || '').toLowerCase();
      const status = (project.status || '').toLowerCase();
      const client = data.clients.find(c => c.id === project.clientId);
      const clientName = (client?.name || '').toLowerCase();
      const taskTitles = (project.tasks || []).map(t => `${t.title || ''} ${t.description || ''}`.toLowerCase()).join(' ');

      return name.includes(q) ||
        id.includes(q) ||
        desc.includes(q) ||
        status.includes(q) ||
        clientName.includes(q) ||
        taskTitles.includes(q);
    });

    const totalMatches = matchedDocs.length + matchedClients.length + matchedProjects.length;

    return {
      documents: matchedDocs,
      clients: matchedClients,
      projects: matchedProjects,
      totalMatches
    };
  }, [searchQuery, data.documents, data.clients, data.projects, data.businesses]);

  const handleSelectDocument = (doc: CRMDocument) => {
    if (doc.businessId && doc.businessId !== data.activeBusinessId) {
      handleSwitchBusiness(doc.businessId);
    }
    setIsSearchFocused(false);
    setSearchQuery('');
    onNavigateToTab('billing', doc.id);
  };

  const handleSelectClient = (client: Client) => {
    setIsSearchFocused(false);
    setSearchQuery('');
    onNavigateToTab('clients');
  };

  const handleSelectProject = (project: Project) => {
    if (project.businessId && project.businessId !== data.activeBusinessId) {
      handleSwitchBusiness(project.businessId);
    }
    setIsSearchFocused(false);
    setSearchQuery('');
    onNavigateToTab('projects');
  };

  const handleSwitchBusiness = (id: string) => {
    onUpdateData({
      ...data,
      activeBusinessId: id
    });
  };

  const handleAddBusiness = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizName || !bizTin) return;

    const presets: Record<string, { label: string; value: string; isPreset: boolean }[]> = {
      boutique: [
        { label: 'Size Chart Link', value: 'https://shop.bula.fj/sizes', isPreset: true },
        { label: 'Production Lead Time', value: '7 Business Days', isPreset: true },
        { label: 'Social Shop Handle', value: '@BulaClothingFiji', isPreset: true }
      ],
      plumber: [
        { label: 'Plumbing License Registration #', value: 'PL-2026-991', isPreset: true },
        { label: 'Emergency Dispatch Phone', value: '+679 888 1234', isPreset: true }
      ],
      mc: [
        { label: 'Audio & Stage Requirements', value: '2 Wireless Mics, XLR Out', isPreset: true },
        { label: 'Non-Refundable Booking Deposit', value: '25% on confirmation', isPreset: true }
      ],
      band: [
        { label: 'Band Technical Rider Link', value: 'https://band.bula.fj/rider.pdf', isPreset: true },
        { label: 'Number of Band Members', value: '5 Musicians', isPreset: true }
      ],
      production: [
        { label: 'Primary Gear Package', value: 'Sony FX3 + Wireless DJI Audio', isPreset: true },
        { label: 'Shoot Duration', value: 'Standard 8-Hour Production Day', isPreset: true }
      ],
      taxi: [
        { label: 'Vehicle Plate Number', value: 'LT-1002', isPreset: true },
        { label: 'LTA Permit Number', value: 'LTA-TX-2026-441', isPreset: true }
      ],
      general: [
        { label: 'Payment Terms', value: '7 Days net billing', isPreset: true }
      ]
    };

    const newBiz: Business = {
      id: `biz-${Date.now()}`,
      name: bizName,
      tin: bizTin,
      address: bizAddress,
      email: bizEmail,
      phone: bizPhone,
      bankDetails: bizBank,
      colorTheme: bizColor,
      type: bizType,
      saasAppCategory: bizType === 'saas' ? saasCategory : undefined,
      category: addCategory,
      isPrimary: addIsPrimary || data.businesses.length === 0,
      customFields: presets[addCategory] || []
    };

    let updatedBusinesses = [...data.businesses];
    if (newBiz.isPrimary) {
      updatedBusinesses = updatedBusinesses.map(b => ({ ...b, isPrimary: false }));
    }
    updatedBusinesses.push(newBiz);

    onUpdateData({
      ...data,
      businesses: updatedBusinesses,
      activeBusinessId: newBiz.id // Automatically switch to the new business
    });

    // Reset Form
    setBizName('');
    setBizTin('');
    setBizAddress('');
    setBizEmail('');
    setBizPhone('');
    setBizBank('');
    setBizType('studio');
    setSaasCategory('Fintech');
    setBizColor('#0284c7');
    setAddCategory('general');
    setAddIsPrimary(false);
    setShowAddBusiness(false);
  };

  const handleSaveBrand = (updatedBiz: Business) => {
    const updatedBusinesses = data.businesses.map(b => b.id === updatedBiz.id ? updatedBiz : b);
    onUpdateData({
      ...data,
      businesses: updatedBusinesses
    });
    setShowBrandDesigner(false);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto pb-24 font-sans select-none">
      
      {/* Top Welcome Panel & Business Switcher */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Fiji & Pacific Freelance CRM</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-1.5 font-display">
            Bula, {data.userProfile.name.split(' ')[0]}! <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
          </h2>
        </div>
        
        {/* Quick Actions & Avatar */}
        <div className="flex items-center gap-2">
          {onManualCloudSync && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className={`border px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95 ${
                syncSuccess
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/90'
              }`}
              title="Sync workspace across devices via Cloud Firestore"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-600' : syncSuccess ? 'text-emerald-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">Cloud</span>
              <span>{syncSuccess ? 'Synced' : isSyncing ? 'Syncing...' : 'Sync'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowQuickPulse(true)}
            className="bg-gradient-to-r from-sky-500/10 to-teal-500/10 hover:from-sky-500/20 hover:to-teal-500/20 text-sky-700 border border-sky-200/80 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95"
            title="Open Activity Summary & Quick Access"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span className="hidden sm:inline">Activity</span>
            <span>Pulse</span>
          </button>

          <div className="w-9 h-9 bg-slate-100 rounded-full border border-slate-200 flex items-center justify-center text-xs font-bold text-sky-700 shadow-xs">
            {data.userProfile.name.charAt(0)}{data.userProfile.name.split(' ')[1]?.charAt(0) || ''}
          </div>
        </div>
      </div>

      {/* Global Universal Search Bar (Invoices, Clients, Projects) */}
      <div ref={searchContainerRef} className="relative z-30">
        <div 
          className={`bg-white rounded-2xl border transition-all duration-200 flex items-center px-3.5 py-2.5 shadow-xs ${
            isSearchFocused 
              ? 'border-sky-500 ring-2 ring-sky-100 shadow-md shadow-sky-500/5' 
              : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <Search className={`w-4 h-4 mr-2.5 shrink-0 transition-colors ${
            isSearchFocused || searchQuery ? 'text-sky-600' : 'text-slate-400'
          }`} />
          
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            placeholder="Search invoices, clients, projects (e.g. INV-2026, Vodafone)..."
            className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 font-medium focus:outline-none"
          />

          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <kbd className="text-[9px] font-mono font-bold bg-slate-100 text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">⌘K</kbd>
            </div>
          )}
        </div>

        {/* Search Results / Suggestions Dropdown */}
        <AnimatePresence>
          {isSearchFocused && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden z-40 max-h-[440px] flex flex-col"
            >
              {/* Filter Tabs Bar */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50/90 border-b border-slate-100 text-[10px] font-bold shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setSearchFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      searchFilter === 'all'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    All {searchQuery && `(${searchResults.totalMatches})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchFilter('documents')}
                    className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
                      searchFilter === 'documents'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    Invoices {searchQuery && `(${searchResults.documents.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchFilter('clients')}
                    className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
                      searchFilter === 'clients'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    Clients {searchQuery && `(${searchResults.clients.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchFilter('projects')}
                    className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
                      searchFilter === 'projects'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    <FolderKanban className="w-3 h-3" />
                    Projects {searchQuery && `(${searchResults.projects.length})`}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsSearchFocused(false);
                    setSearchQuery('');
                  }}
                  className="text-slate-400 hover:text-slate-600 text-[10px] flex items-center gap-0.5 px-1 py-0.5 rounded"
                >
                  <X className="w-3 h-3" />
                  <span className="hidden sm:inline">Close</span>
                </button>
              </div>

              {/* Content area */}
              <div className="overflow-y-auto p-2 space-y-3 smooth-scroll">
                
                {/* 1. If Query is Empty: Display Quick Suggestions & Recent Records */}
                {!searchQuery && (
                  <div className="space-y-3 p-1">
                    {/* Quick Filters */}
                    <div>
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5 px-1">
                        Quick Filters
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSearchQuery('invoice')}
                          className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 text-[10px] font-bold rounded-lg border border-sky-200/60 transition-colors flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3 text-sky-600" /> Invoices
                        </button>
                        <button
                          type="button"
                          onClick={() => setSearchQuery('paid')}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-200/60 transition-colors flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Paid Status
                        </button>
                        <button
                          type="button"
                          onClick={() => setSearchQuery('quote')}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold rounded-lg border border-amber-200/60 transition-colors flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3 text-amber-600" /> Quotes
                        </button>
                        <button
                          type="button"
                          onClick={() => setSearchQuery('receipt')}
                          className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 text-[10px] font-bold rounded-lg border border-teal-200/60 transition-colors flex items-center gap-1"
                        >
                          <Receipt className="w-3 h-3 text-teal-600" /> Receipts
                        </button>
                      </div>
                    </div>

                    {/* Recent Invoices / Documents Preview */}
                    {data.documents.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                            Recent Invoices & Quotes
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono">Latest 3</span>
                        </div>
                        <div className="space-y-1">
                          {data.documents.slice(0, 3).map((doc) => {
                            const client = data.clients.find(c => c.id === doc.clientId);
                            return (
                              <div
                                key={doc.id}
                                onClick={() => handleSelectDocument(doc)}
                                className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-100 hover:border-sky-200 cursor-pointer transition-all text-left group"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className={`w-7 h-7 rounded-lg text-[9px] font-extrabold flex items-center justify-center shrink-0 ${
                                    doc.type === 'quote' ? 'bg-amber-100 text-amber-800' :
                                    doc.type === 'receipt' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                                  }`}>
                                    {doc.type === 'quote' ? 'QUO' : doc.type === 'receipt' ? 'REC' : 'INV'}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-800 truncate group-hover:text-sky-700">
                                      {doc.documentNumber} • {client?.name || 'Client'}
                                    </p>
                                    <p className="text-[9px] text-slate-400 font-mono">
                                      {doc.issueDate} • Status: <span className="capitalize font-bold text-slate-600">{doc.status}</span>
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[10px] font-extrabold text-slate-800 font-mono block">
                                    {data.userProfile.defaultCurrency} {doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[8px] text-sky-600 font-bold group-hover:underline flex items-center justify-end gap-0.5">
                                    Open <ChevronRight className="w-2.5 h-2.5" />
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Active Projects Preview */}
                    {(data.projects || []).length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                            Active Projects
                          </span>
                        </div>
                        <div className="space-y-1">
                          {(data.projects || []).slice(0, 2).map((proj) => (
                            <div
                              key={proj.id}
                              onClick={() => handleSelectProject(proj)}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-100 hover:border-sky-200 cursor-pointer transition-all text-left group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FolderKanban className="w-4 h-4 text-sky-600 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold text-slate-800 truncate group-hover:text-sky-700">
                                    {proj.name}
                                  </p>
                                  <p className="text-[9px] text-slate-400">
                                    {proj.status === 'in_progress' ? '⚡ In Progress' : proj.status === 'completed' ? '✓ Completed' : '⏸ On Hold'}
                                  </p>
                                </div>
                              </div>
                              <span className="text-[9px] text-sky-600 font-bold group-hover:underline flex items-center gap-0.5 shrink-0">
                                View <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. When Query is Active: Display Matches By Category */}
                {searchQuery && searchResults.totalMatches === 0 && (
                  <div className="text-center py-8 px-4">
                    <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Search className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">No matching records found</p>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto">
                      No invoices, clients, or projects match "<span className="font-semibold text-slate-600">{searchQuery}</span>". Try searching by ID (e.g. INV-2026), client name, or service term.
                    </p>
                  </div>
                )}

                {/* A. Matched Documents */}
                {searchQuery && (searchFilter === 'all' || searchFilter === 'documents') && searchResults.documents.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <FileText className="w-3 h-3 text-sky-600" />
                        Invoices & Billing ({searchResults.documents.length})
                      </span>
                    </div>
                    <div className="space-y-1">
                      {searchResults.documents.map((doc) => {
                        const client = data.clients.find(c => c.id === doc.clientId);
                        const biz = data.businesses.find(b => b.id === doc.businessId);
                        return (
                          <div
                            key={doc.id}
                            onClick={() => handleSelectDocument(doc)}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-100 hover:border-sky-200 cursor-pointer transition-all text-left group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-8 h-8 rounded-lg text-[9px] font-extrabold flex flex-col items-center justify-center shrink-0 border ${
                                doc.type === 'quote' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                doc.type === 'receipt' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-sky-50 text-sky-700 border-sky-200'
                              }`}>
                                <span className="leading-none">{doc.type === 'quote' ? 'QUO' : doc.type === 'receipt' ? 'REC' : 'INV'}</span>
                                <span className="text-[7.5px] opacity-75 font-mono">#{doc.documentNumber.split('-').pop()}</span>
                              </span>
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-slate-800 truncate group-hover:text-sky-700">
                                  {doc.documentNumber} • {client?.name || 'Client'}
                                </p>
                                <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-mono mt-0.5">
                                  <span>{doc.issueDate}</span>
                                  <span>•</span>
                                  <span className={`px-1 rounded font-bold uppercase text-[8px] ${
                                    doc.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                                    doc.status === 'sent' ? 'bg-sky-100 text-sky-800' :
                                    doc.status === 'draft' ? 'bg-slate-200 text-slate-700' : 'bg-red-100 text-red-800'
                                  }`}>
                                    {doc.status}
                                  </span>
                                  {biz && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate max-w-[90px]">{biz.name}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[11px] font-black text-slate-800 font-mono block">
                                {data.userProfile.defaultCurrency} {doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[8.5px] text-sky-600 font-bold group-hover:underline flex items-center justify-end gap-0.5">
                                Open Editor <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* B. Matched Clients */}
                {searchQuery && (searchFilter === 'all' || searchFilter === 'clients') && searchResults.clients.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <Users className="w-3 h-3 text-indigo-600" />
                        Clients ({searchResults.clients.length})
                      </span>
                    </div>
                    <div className="space-y-1">
                      {searchResults.clients.map((client) => {
                        const clientDocs = data.documents.filter(d => d.clientId === client.id);
                        return (
                          <div
                            key={client.id}
                            onClick={() => handleSelectClient(client)}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 cursor-pointer transition-all text-left group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-200">
                                {client.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-slate-800 truncate group-hover:text-indigo-700">
                                  {client.name}
                                </p>
                                <p className="text-[9px] text-slate-400 truncate mt-0.5">
                                  {client.email || client.phone || (client.tin ? `TIN: ${client.tin}` : client.address || 'Client Contact')}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[9px] font-bold text-slate-600 block">
                                {clientDocs.length} {clientDocs.length === 1 ? 'doc' : 'docs'}
                              </span>
                              <span className="text-[8.5px] text-indigo-600 font-bold group-hover:underline flex items-center justify-end gap-0.5">
                                View Profile <ChevronRight className="w-2.5 h-2.5" />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* C. Matched Projects */}
                {searchQuery && (searchFilter === 'all' || searchFilter === 'projects') && searchResults.projects.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <FolderKanban className="w-3 h-3 text-sky-600" />
                        Projects ({searchResults.projects.length})
                      </span>
                    </div>
                    <div className="space-y-1">
                      {searchResults.projects.map((proj) => {
                        const totalTasks = proj.tasks?.length || 0;
                        const doneTasks = proj.tasks?.filter(t => t.status === 'done').length || 0;
                        const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
                        const client = data.clients.find(c => c.id === proj.clientId);
                        return (
                          <div
                            key={proj.id}
                            onClick={() => handleSelectProject(proj)}
                            className="p-2.5 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-100 hover:border-sky-200 cursor-pointer transition-all text-left group space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <FolderKanban className="w-4 h-4 text-sky-600 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold text-slate-800 truncate group-hover:text-sky-700">
                                    {proj.name}
                                  </p>
                                  <p className="text-[9px] text-slate-400 truncate flex items-center gap-1">
                                    <span>{client?.name || 'Venture Project'}</span>
                                    <span>•</span>
                                    <ProjectCurrencyDisplay 
                                      amount={proj.cost} 
                                      currency={resolveProjectCurrency(proj, client, data.userProfile.defaultCurrency)}
                                      baseCurrency={data.userProfile.defaultCurrency}
                                      variant="inline"
                                      showFlag={false}
                                      className="text-[9px]"
                                    />
                                  </p>
                                </div>
                              </div>
                              <span className={`text-[8.5px] font-extrabold px-1.5 py-0.5 rounded shrink-0 uppercase ${
                                proj.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                                proj.status === 'in_progress' ? 'bg-sky-100 text-sky-800' :
                                proj.status === 'on_hold' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                              }`}>
                                {proj.status.replace('_', ' ')}
                              </span>
                            </div>

                            {totalTasks > 0 && (
                              <div className="space-y-0.5">
                                <div className="flex justify-between text-[8px] text-slate-400 font-medium">
                                  <span>Milestone Progress</span>
                                  <span>{progress}% ({doneTasks}/{totalTasks})</span>
                                </div>
                                <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-sky-500 h-full rounded-full" 
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Business Hub selector */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-sky-600" /> Active Venture
          </label>
          <button 
            onClick={() => setShowAddBusiness(true)}
            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> New Venture
          </button>
        </div>

        {/* Business Selector Radio Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none snap-x">
          {data.businesses.map((biz) => {
            const isActive = biz.id === data.activeBusinessId;
            return (
              <button
                key={biz.id}
                onClick={() => handleSwitchBusiness(biz.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 snap-center ${
                  isActive 
                    ? 'bg-sky-50 border-sky-200 text-sky-700 shadow-sm shadow-sky-100' 
                    : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: biz.colorTheme || '#0284c7' }} />
                  {biz.name}
                </div>
              </button>
            );
          })}
        </div>

        {activeBusiness && (
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5 bg-slate-50/55 p-2 rounded-xl border border-slate-100">
              <div className="flex items-center gap-1.5">
                {activeBusiness.isPrimary ? (
                  <span className="bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider flex items-center gap-0.5">
                    🇫🇯 Primary Fiji Business
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      const updated = data.businesses.map(b => ({
                        ...b,
                        isPrimary: b.id === activeBusiness.id
                      }));
                      onUpdateData({ ...data, businesses: updated });
                    }}
                    className="bg-slate-200/80 hover:bg-slate-250 text-slate-700 text-[9px] font-bold px-2 py-0.5 rounded-full border border-slate-300 uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Set as Primary
                  </button>
                )}
                
                <span className="bg-sky-50 text-sky-700 text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border border-sky-100 uppercase tracking-wider">
                  {activeBusiness.category === 'boutique' && '👔 Boutique Clothing'}
                  {activeBusiness.category === 'plumber' && '🔧 Plumbing Service'}
                  {activeBusiness.category === 'mc' && '🎙️ Professional MC'}
                  {activeBusiness.category === 'band' && '🎸 Music Band'}
                  {activeBusiness.category === 'production' && '🎬 Production Co'}
                  {activeBusiness.category === 'taxi' && '🚕 Taxi / Transport'}
                  {(!activeBusiness.category || activeBusiness.category === 'general') && '💼 General Niche'}
                </span>
              </div>
              
              {activeBusiness.mPaisaId && (
                <span className="bg-rose-50 text-rose-700 text-[9px] font-mono font-extrabold px-2 py-0.5 rounded-full border border-rose-100">
                  📱 m-Paisa: {activeBusiness.mPaisaId}
                </span>
              )}
            </div>

            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <div className="flex items-center gap-2">
                {/* Custom Branding Logo Indicator */}
                {(!activeBusiness.logoType || activeBusiness.logoType === 'symbol') && (
                  <div 
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: activeBusiness.colorTheme || '#0284c7' }}
                  >
                    {activeBusiness.logoSymbol === 'Briefcase' && <Briefcase className="w-4 h-4" />}
                    {activeBusiness.logoSymbol === 'Building2' && <Building2 className="w-4 h-4" />}
                    {activeBusiness.logoSymbol === 'ShieldCheck' && <ShieldCheck className="w-4 h-4" />}
                    {activeBusiness.logoSymbol === 'Sparkles' && <Sparkles className="w-4 h-4" />}
                    {(!activeBusiness.logoSymbol || activeBusiness.logoSymbol === 'Waves') && <Waves className="w-4 h-4" />}
                  </div>
                )}
                {activeBusiness.logoType === 'text' && (
                  <div 
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white tracking-wider"
                    style={{ backgroundColor: activeBusiness.colorTheme || '#0284c7' }}
                  >
                    {activeBusiness.logoText || 'LOGO'}
                  </div>
                )}
                {activeBusiness.logoType === 'image' && activeBusiness.logoUrl && (
                  <img 
                    src={activeBusiness.logoUrl} 
                    alt="Logo" 
                    className="h-7 w-auto object-contain"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Brand Identity</span>
                  <span className="text-[11px] font-semibold text-slate-700 block truncate max-w-[150px]">
                    {activeBusiness.brandSlogan ? `"${activeBusiness.brandSlogan}"` : 'No Slogan Registered'}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setShowEditVenture(true)}
                  className="text-[10px] bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200/60 font-semibold py-1 px-2.5 rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Edit Venture Profile, Legal TIN & Banking Credentials"
                >
                  <Building2 className="w-3 h-3" /> Edit Profile
                </button>
                <button
                  onClick={() => setShowBrandDesigner(true)}
                  className="text-[10px] bg-slate-200/70 text-slate-700 font-semibold py-1 px-2.5 rounded-lg hover:bg-slate-250 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Palette className="w-3 h-3" /> Design Logo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
              <div>
                <span className="font-semibold block text-[10px] text-slate-400">BUSINESS TIN</span>
                <span className="font-mono text-[10px]">{activeBusiness.tin || 'Not Configured'}</span>
              </div>
              <div>
                <span className="font-semibold block text-[10px] text-slate-400">VENTURE MODEL</span>
                <span className={`font-semibold capitalize inline-flex items-center gap-1 ${activeVenture.badgeText}`}>
                  <span>{activeVenture.shortLabel}</span>
                </span>
              </div>
              <div>
                <span className="font-semibold block text-[10px] text-slate-400">
                  {activeBusiness.type === 'saas' ? 'CATEGORY' : 'INDUSTRY / VAT'}
                </span>
                <span className="font-semibold text-slate-700 truncate block">
                  {activeBusiness.saasAppCategory || activeBusiness.category || `${data.userProfile.defaultVatRate ?? 12.5}% Standard`}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Financial Metrics Section */}
      <div>
        {activeBusiness?.type && activeBusiness.type !== 'studio' && (
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-[10px] font-bold mb-3 border border-slate-200/40">
            <button
              type="button"
              onClick={() => setSaasViewTab('kpi')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                saasViewTab === 'kpi' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{activeVenture.shortLabel} Specialized Metrics</span>
            </button>
            <button
              type="button"
              onClick={() => setSaasViewTab('billing')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                saasViewTab === 'billing' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Standard Cash & VAT Flow</span>
            </button>
          </div>
        )}

        {activeBusiness?.type && activeBusiness.type !== 'studio' && saasViewTab === 'kpi' ? (
          /* Venture KPIs Grid */
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {/* SaaS Model */}
            {activeBusiness.type === 'saas' && (
              <>
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-md shadow-emerald-600/10 relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                    <TrendingUp className="w-24 h-24" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 block">Monthly Recurring (MRR)</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xs opacity-90">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-extrabold tracking-tight">
                      {ventureMetrics.mrr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] opacity-75 mt-2 block flex items-center gap-1">
                    <Layers className="w-3 h-3" /> ARR: {data.userProfile.defaultCurrency} {ventureMetrics.arr.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm relative overflow-hidden">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Active Subscribers</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xl font-extrabold tracking-tight">{ventureMetrics.activeSubsCount}</span>
                    <span className="text-xs text-slate-500 ml-1">accounts</span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-2 block flex items-center gap-1">
                    <Users className="w-3 h-3 text-emerald-500" /> ARPU: {data.userProfile.defaultCurrency} {ventureMetrics.arpu.toFixed(0)}/mo
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Customer LTV</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-bold tracking-tight">
                      {ventureMetrics.ltv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-2 block flex items-center gap-1">
                    <Percent className="w-3 h-3 text-indigo-500" /> Avg Churn: {ventureMetrics.churn}%
                  </span>
                </div>
              </>
            )}

            {/* Digital Products Model */}
            {activeBusiness.type === 'digital_products' && (
              <>
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-md shadow-emerald-600/10 relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                    <ShoppingBag className="w-24 h-24" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 block">Gross Merch Value (GMV)</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xs opacity-90">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-extrabold tracking-tight">
                      {ventureMetrics.gmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] opacity-75 mt-2 block flex items-center gap-1">
                    <Check className="w-3 h-3" /> Direct digital sales
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Units Delivered</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xl font-extrabold tracking-tight">{ventureMetrics.unitsSold}</span>
                    <span className="text-xs text-slate-500 ml-1">downloads</span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-2 block flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-emerald-500" /> Templates & assets
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Average Order Value</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-bold tracking-tight">
                      {ventureMetrics.aov.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-2 block flex items-center gap-1">
                    <Percent className="w-3 h-3 text-sky-500" /> Cart spend per buyer
                  </span>
                </div>
              </>
            )}

            {/* Retainer & MSP Model */}
            {activeBusiness.type === 'retainer_msp' && (
              <>
                <div className="bg-gradient-to-br from-amber-500 to-amber-700 rounded-2xl p-4 text-white shadow-md shadow-amber-500/10 relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                    <Clock className="w-24 h-24" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 block">Active Retainers</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-extrabold tracking-tight">{ventureMetrics.activeRetainers}</span>
                    <span className="text-xs opacity-90 ml-1">contracts</span>
                  </div>
                  <span className="text-[9px] opacity-85 mt-2 block flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {ventureMetrics.allocatedHours} hrs committed pool
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Capacity Utilization</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xl font-extrabold tracking-tight">{ventureMetrics.capacityUtilization}%</span>
                  </div>
                  <span className="text-[9px] text-emerald-600 mt-2 block font-semibold">
                    Optimal SLA bandwidth
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Overage Billables</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-bold tracking-tight">
                      {ventureMetrics.overageRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-amber-600 mt-2 block">
                    Beyond monthly quota
                  </span>
                </div>
              </>
            )}

            {/* Media & Creator Model */}
            {activeBusiness.type === 'creator_media' && (
              <>
                <div className="bg-gradient-to-br from-rose-500 to-pink-700 rounded-2xl p-4 text-white shadow-md shadow-rose-500/10 relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                    <Camera className="w-24 h-24" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 block">Booked Shoots</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-extrabold tracking-tight">{ventureMetrics.bookedShoots}</span>
                    <span className="text-xs opacity-90 ml-1">production days</span>
                  </div>
                  <span className="text-[9px] opacity-85 mt-2 block flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Calendar schedule
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Average Day Rate</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-extrabold tracking-tight">
                      {ventureMetrics.avgDayRate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-2 block">
                    Base filming & drone rate
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Usage Rights & Buyouts</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-bold tracking-tight">
                      {ventureMetrics.licensingRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-rose-600 mt-2 block font-semibold">
                    Broadcast & digital licenses
                  </span>
                </div>
              </>
            )}

            {/* Coaching & Training Model */}
            {activeBusiness.type === 'coaching' && (
              <>
                <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-4 text-white shadow-md shadow-purple-600/10 relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                    <GraduationCap className="w-24 h-24" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 block">Active Coachees</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-extrabold tracking-tight">{ventureMetrics.activeClients}</span>
                    <span className="text-xs opacity-90 ml-1">clients</span>
                  </div>
                  <span className="text-[9px] opacity-85 mt-2 block flex items-center gap-1">
                    <Users className="w-3 h-3" /> In mentorship programs
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Sessions Completed</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xl font-extrabold tracking-tight">{ventureMetrics.sessionsCompleted}</span>
                    <span className="text-xs text-slate-500 ml-1">calls</span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-2 block">
                    1-on-1 and cohort workshops
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Avg Package Deal</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-bold tracking-tight">
                      {ventureMetrics.avgPackageValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-purple-600 mt-2 block font-semibold">
                    Advisory bundle size
                  </span>
                </div>
              </>
            )}

            {/* Trades & Field Services Model */}
            {activeBusiness.type === 'trade_services' && (
              <>
                <div className="bg-gradient-to-br from-amber-600 to-orange-700 rounded-2xl p-4 text-white shadow-md shadow-amber-600/10 relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                    <Wrench className="w-24 h-24" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 block">Completed Work Orders</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-extrabold tracking-tight">{ventureMetrics.workOrders}</span>
                    <span className="text-xs opacity-90 ml-1">jobs</span>
                  </div>
                  <span className="text-[9px] opacity-85 mt-2 block flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Field labor & site visits
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Average Job Value</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-extrabold tracking-tight">
                      {ventureMetrics.avgJobValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-2 block">
                    Labor + callout + parts
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Materials & Parts</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-bold tracking-tight">
                      {ventureMetrics.partsMarkup.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-amber-700 mt-2 block font-semibold">
                    Hardware & consumables
                  </span>
                </div>
              </>
            )}

            {/* Tourism & Hospitality Model */}
            {activeBusiness.type === 'hospitality_tourism' && (
              <>
                <div className="bg-gradient-to-br from-teal-600 to-emerald-700 rounded-2xl p-4 text-white shadow-md shadow-teal-600/10 relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                    <Palmtree className="w-24 h-24" />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 block">Total Guests Hosted</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-extrabold tracking-tight">{ventureMetrics.guestBookings}</span>
                    <span className="text-xs opacity-90 ml-1">passengers</span>
                  </div>
                  <span className="text-[9px] opacity-85 mt-2 block flex items-center gap-1">
                    <Palmtree className="w-3 h-3" /> Day tours & charters
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Avg Spend / Guest</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-extrabold tracking-tight">
                      {ventureMetrics.avgGuestYield.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-2 block">
                    Tickets, lunch & add-ons
                  </span>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Advance Deposits</span>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                    <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                    <span className="text-xl font-bold tracking-tight">
                      {ventureMetrics.depositVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-teal-600 mt-2 block font-semibold">
                    Upcoming reservations
                  </span>
                </div>
              </>
            )}

            {/* 4th Card - VAT Estimation across all specialized models */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Fiji VAT Collected ({data.userProfile.defaultVatRate ?? 12.5}%)</span>
              <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                <span className="text-xl font-bold tracking-tight">
                  {stats.totalVatCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <span className="text-[9px] text-emerald-600 font-semibold mt-2 block flex items-center gap-1">
                <Check className="w-2.5 h-2.5" /> {stats.totalVatCollected === 0 && stats.totalPaid > 0 ? 'Zero-Rated Offshore Exports (0% VAT)' : 'Compliant VAT estimation'}
              </span>
            </div>
          </div>
        ) : (
          /* Standard Invoicing / VAT Cards */
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {/* Paid Card */}
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-md shadow-emerald-500/10 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-10">
                <CheckCircle2 className="w-24 h-24" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 block">Total Collected</span>
                  {stats.hasForeignIncome && (
                    <span className="bg-white/20 text-white text-[8.5px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-xs">
                      <Globe className="w-2.5 h-2.5" /> Multi-Currency
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xs opacity-90">{data.userProfile.defaultCurrency}</span>
                  <span className="text-xl font-extrabold tracking-tight">
                    {stats.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {stats.hasForeignIncome ? (
                <div className="mt-2 pt-2 border-t border-white/20">
                  <button 
                    onClick={() => setShowFxBreakdownModal(true)}
                    className="w-full text-left bg-black/15 hover:bg-black/25 text-white p-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-between group"
                    title="Click to view foreign currency conversion and ledger reconciliation breakdown"
                  >
                    <div className="min-w-0 pr-1">
                      <span className="text-[8px] uppercase font-bold opacity-80 block tracking-tight">Foreign Remittance</span>
                      <span className="text-[10px] font-bold truncate block text-emerald-100">{stats.primaryForeignSummary}</span>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                </div>
              ) : (
                <span className="text-[9px] opacity-75 mt-2 block flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Paid Invoices & Receipts
                </span>
              )}
            </div>

            {/* Pending Card */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm relative overflow-hidden">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Pending Invoices</span>
              <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                <span className="text-xl font-extrabold tracking-tight">
                  {stats.totalPending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 mt-2 block flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-500" /> Draft & Sent Status
              </span>
            </div>

            {/* Quotes Value */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Total Quotes Offered</span>
              <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                <span className="text-xl font-bold tracking-tight">
                  {stats.totalQuotes.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 mt-2 block">Outstanding Proposals</span>
            </div>

            {/* Total VAT Estimated / Collected */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Fiji VAT Collected ({data.userProfile.defaultVatRate ?? 12.5}%)</span>
              <div className="mt-1 flex items-baseline gap-1 text-slate-800">
                <span className="text-xs text-slate-500">{data.userProfile.defaultCurrency}</span>
                <span className="text-xl font-bold tracking-tight">
                  {stats.totalVatCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {stats.totalVatCollected === 0 && stats.totalPaid > 0 ? (
                <span className="text-[9px] text-emerald-600 font-semibold mt-2 block flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" /> Zero-Rated Offshore Exports (0% VAT)
                </span>
              ) : (
                <span className="text-[9px] text-teal-600 font-semibold mt-2 block flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" /> For VAT compliance return
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions (Bento Grid Style) */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Quick Actions</h3>
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          <button
            onClick={() => onNavigateToTab('billing', 'NEW_QUOTE')}
            className="bg-white hover:bg-slate-50 border border-slate-100 p-2.5 text-center flex flex-col items-center justify-center transition-all group active:scale-95 rounded-2xl shadow-2xs"
          >
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 mb-1.5 group-hover:scale-110 transition-transform">
              <FileText className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-700">Quote</span>
          </button>

          <button
            onClick={() => onNavigateToTab('billing', 'NEW_INVOICE')}
            className="bg-white hover:bg-slate-50 border border-slate-100 p-2.5 text-center flex flex-col items-center justify-center transition-all group active:scale-95 rounded-2xl shadow-2xs"
          >
            <div className="w-9 h-9 bg-sky-50 rounded-xl flex items-center justify-center text-sky-600 mb-1.5 group-hover:scale-110 transition-transform">
              <ArrowUpRight className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-700">Invoice</span>
          </button>

          <button
            onClick={() => onNavigateToTab('billing', 'NEW_RECEIPT')}
            className="bg-white hover:bg-slate-50 border border-slate-100 p-2.5 text-center flex flex-col items-center justify-center transition-all group active:scale-95 rounded-2xl shadow-2xs"
          >
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-1.5 group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-700">Receipt</span>
          </button>

          <button
            onClick={() => onNavigateToTab('clients')}
            className="bg-white hover:bg-slate-50 border border-slate-100 p-2.5 text-center flex flex-col items-center justify-center transition-all group active:scale-95 rounded-2xl shadow-2xs"
          >
            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-1.5 group-hover:scale-110 transition-transform">
              <UserPlus className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-700">Client</span>
          </button>

          <button
            onClick={() => onNavigateToTab('projects')}
            className="bg-white hover:bg-slate-50 border border-slate-100 p-2.5 text-center flex flex-col items-center justify-center transition-all group active:scale-95 rounded-2xl shadow-2xs"
          >
            <div className="w-9 h-9 bg-sky-50 rounded-xl flex items-center justify-center text-sky-600 mb-1.5 group-hover:scale-110 transition-transform">
              <FolderKanban className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-700">Projects</span>
          </button>
        </div>
      </div>

      {/* Fiji Directory & Booking Discovery Card */}
      <div 
        onClick={() => onNavigateToTab('directory')}
        className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white rounded-2xl p-4.5 border border-sky-900/50 shadow-xs cursor-pointer hover:border-sky-500/50 transition-all flex items-center justify-between group"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30 group-hover:scale-105 transition-transform shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs md:text-sm font-bold text-white tracking-tight font-display">Fiji Freelancer & Business Directory</h4>
              <span className="bg-sky-500/20 text-sky-300 text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase border border-sky-400/30">
                Bookings
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">
              Find Fiji service providers on Frilensa, list your business and receive booking requests.
            </p>
          </div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center group-hover:bg-sky-500 group-hover:text-slate-950 transition-colors shrink-0 ml-2">
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>

      {/* 2-Column Responsive Layout for Projects and Recent History on Tablets / PC */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Active Projects & Milestones Widget */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Venture Projects</h3>
            <button 
              onClick={() => onNavigateToTab('projects')}
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center transition-all"
            >
              Manage
            </button>
          </div>

          {activeProjects.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-slate-100 shadow-xs h-[calc(100%-2rem)] flex flex-col items-center justify-center">
              <p className="text-xs text-slate-400 leading-relaxed">No projects currently active for this venture.</p>
              <button
                onClick={() => onNavigateToTab('projects')}
                className="mt-3 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1.5 px-4 rounded-xl transition-colors cursor-pointer"
              >
                Start New Project
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {activeProjects.slice(0, 4).map((proj) => {
                const totalTasks = proj.tasks?.length || 0;
                const completedTasks = proj.tasks?.filter(t => t.status === 'done').length || 0;
                const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                const client = data.clients.find(c => c.id === proj.clientId);
                const projCurrency = resolveProjectCurrency(proj, client, data.userProfile.defaultCurrency);
                
                return (
                  <div
                    key={proj.id}
                    onClick={() => onNavigateToTab('projects')}
                    className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs hover:border-sky-200 cursor-pointer transition-colors space-y-2.5 group"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 pr-2">
                        <h4 className="text-xs font-bold text-slate-800 truncate leading-tight group-hover:text-sky-700 transition-colors">{proj.name}</h4>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{proj.startDate} to {proj.endDate}</p>
                      </div>
                      <ProjectCurrencyDisplay 
                        amount={proj.cost}
                        currency={projCurrency}
                        baseCurrency={data.userProfile.defaultCurrency}
                        variant="badge"
                        rateType={proj.rateType}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                        <span>Milestones</span>
                        <span>{progress}% ({completedTasks}/{totalTasks})</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-sky-450 to-sky-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Recent Invoices & Quotes</h3>
            <button 
              onClick={() => onNavigateToTab('billing')}
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center transition-all"
            >
              All Docs
            </button>
          </div>

          {filteredDocs.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center border border-dashed border-slate-200 h-[calc(100%-2rem)] flex flex-col items-center justify-center">
              <p className="text-xs text-slate-400">No recent quotes, invoices or receipts generated yet for this venture.</p>
              <button
                onClick={() => onNavigateToTab('billing', 'NEW_INVOICE')}
                className="mt-3 text-xs bg-sky-600 text-white font-bold py-1.5 px-4 rounded-xl cursor-pointer hover:bg-sky-500 shadow-xs transition-colors"
              >
                Generate First Invoice
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredDocs.slice(0, 4).map((doc) => {
                const client = data.clients.find(c => c.id === doc.clientId);
                
                let typeLabel = "Invoice";
                let colorClasses = "bg-sky-50 text-sky-700 border-sky-100";
                if (doc.type === 'quote') {
                  typeLabel = "Quote";
                  colorClasses = "bg-amber-50 text-amber-700 border-amber-100";
                } else if (doc.type === 'receipt') {
                  typeLabel = "Receipt";
                  colorClasses = "bg-emerald-50 text-emerald-700 border-emerald-100";
                }

                return (
                  <motion.div
                    key={doc.id}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onNavigateToTab('billing', doc.id)}
                    className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between cursor-pointer hover:border-sky-200 transition-all"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl border flex flex-col items-center justify-center shrink-0 ${colorClasses}`}>
                        <span className="text-[8px] font-extrabold uppercase tracking-tight leading-none">
                          {typeLabel.slice(0, 3)}
                        </span>
                        <span className="text-[9px] font-semibold mt-0.5 font-mono">
                          #{doc.documentNumber.split('-').pop()}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{client?.name || 'Unknown Client'}</h4>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>{doc.issueDate}</span>
                          <span>•</span>
                          <span className={`px-1.5 py-0.2 rounded text-[8.5px] font-bold uppercase ${
                            doc.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                            doc.status === 'sent' ? 'bg-sky-50 text-sky-600' :
                            doc.status === 'draft' ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-600'
                          }`}>
                            {doc.status}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-400 font-semibold block">{doc.currency || data.userProfile.defaultCurrency}</span>
                      <span className="text-xs font-extrabold text-slate-800 font-mono">
                        {doc.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {(() => {
                        const conv = getDocumentHomeValues(doc, data.userProfile.defaultCurrency || 'FJD', activeBusiness?.customExchangeRates, data.transactions);
                        if (!conv.isForeign) return null;
                        return (
                          <span className="text-[9px] text-emerald-600 font-bold block font-mono">
                            ≈ {data.userProfile.defaultCurrency} ${conv.homeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        );
                      })()}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Secure Recent Activity & Audit Trail Component */}
      <RecentActivityLog 
        data={data} 
        onNavigateToTab={onNavigateToTab} 
        maxDisplay={8} 
        showFullControls={true} 
      />

      {/* Add Business Modal Overlay */}
      {showAddBusiness && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-6 w-full max-w-sm border border-slate-100 shadow-2xl space-y-4"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-sky-600" /> New Consulting Business
              </h3>
              <button 
                onClick={() => setShowAddBusiness(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full bg-slate-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddBusiness} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Business / Practice Name *</label>
                <input
                  type="text"
                  required
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="e.g. Sera Tech Advisory Fiji"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Venture Business Model</label>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {ALL_VENTURE_TYPES.map((vType) => {
                    const cfg = VENTURE_MODELS[vType];
                    const isSelected = bizType === vType;
                    return (
                      <button
                        key={vType}
                        type="button"
                        onClick={() => {
                          setBizType(vType);
                          setSaasCategory(cfg.defaultCategories[0] || '');
                        }}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-50 border-sky-300 text-sky-900 shadow-2xs'
                            : 'bg-slate-50 border-slate-200/70 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px]">{cfg.shortLabel}</span>
                          {isSelected && <Check className="w-3 h-3 text-sky-600" />}
                        </div>
                        <p className="text-[9px] text-slate-500 mt-0.5 line-clamp-1">
                          {cfg.tagline}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Industry / Category Niche</label>
                <select
                  value={saasCategory || VENTURE_MODELS[bizType]?.defaultCategories[0] || ''}
                  onChange={(e) => setSaasCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                >
                  {VENTURE_MODELS[bizType]?.defaultCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <p className="text-[9px] text-slate-400 mt-0.5">Optimizes your invoicing templates, VAT rules, and KPI dashboards automatically.</p>
              </div>

              {/* Primary Business Check */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="flex-1 pr-2">
                  <span className="text-[10px] font-bold text-slate-700 block">Set as Primary Business</span>
                  <p className="text-[9px] text-slate-400 leading-tight">Will load as your default billing profile.</p>
                </div>
                <input
                  type="checkbox"
                  checked={addIsPrimary}
                  onChange={(e) => setAddIsPrimary(e.target.checked)}
                  className="w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-0 cursor-pointer shrink-0"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Fiji TIN *</label>
                  <input
                    type="text"
                    required
                    value={bizTin}
                    onChange={(e) => setBizTin(e.target.value)}
                    placeholder="e.g. 50-12345-0-1"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Phone Number</label>
                  <input
                    type="text"
                    value={bizPhone}
                    onChange={(e) => setBizPhone(e.target.value)}
                    placeholder="e.g. +679 999 1234"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Email Address</label>
                <input
                  type="email"
                  value={bizEmail}
                  onChange={(e) => setBizEmail(e.target.value)}
                  placeholder="e.g. billing@biz.com.fj"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Physical Address</label>
                <input
                  type="text"
                  value={bizAddress}
                  onChange={(e) => setBizAddress(e.target.value)}
                  placeholder="e.g. Suva Business Center, Fiji"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Bank Payment Instructions</label>
                <textarea
                  value={bizBank}
                  onChange={(e) => setBizBank(e.target.value)}
                  placeholder="Bank: ANZ Fiji, Account No., Branch, M-Paisa ID"
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-1.5 px-3 text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Venture Brand Color</label>
                <div className="flex gap-2.5 mt-1.5">
                  {['#0284c7', '#059669', '#7c3aed', '#db2777', '#ea580c'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBizColor(c)}
                      className={`w-6 h-6 rounded-full transition-all border-2 ${
                        bizColor === c ? 'border-slate-800 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddBusiness(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-xl text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 rounded-xl text-xs transition-all"
                >
                  Register Venture
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Brand guidelines customizer */}
      {showBrandDesigner && activeBusiness && (
        <BrandDesignerModal
          business={activeBusiness}
          onSave={handleSaveBrand}
          onClose={() => setShowBrandDesigner(false)}
        />
      )}

      {/* Edit Active Venture Profile & Entity Modal */}
      {showEditVenture && activeBusiness && (
        <EditVentureModal
          business={activeBusiness}
          onSave={(updatedBiz) => {
            const updated = data.businesses.map(b => b.id === updatedBiz.id ? updatedBiz : b);
            onUpdateData({
              ...data,
              businesses: updated
            });
            setShowEditVenture(false);
          }}
          onClose={() => setShowEditVenture(false)}
        />
      )}

      {/* Returning User Activity Pulse & Quick Access Prompt */}
      <QuickAccessPrompt
        data={data}
        isOpen={showQuickPulse}
        onClose={handleCloseQuickPulse}
        onNavigateToTab={onNavigateToTab}
      />

      {/* Multi-Currency & Inward TT Remittance Ledger Breakdown */}
      <MultiCurrencyBreakdownModal
        isOpen={showFxBreakdownModal}
        onClose={() => setShowFxBreakdownModal(false)}
        data={data}
        activeBusiness={activeBusiness}
        stats={stats}
        onNavigateToTab={onNavigateToTab}
      />
    </div>
  );
}
