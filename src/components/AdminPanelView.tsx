import AdminDirectoryManager from './AdminDirectoryManager';
import AdminErrorsView from './AdminErrorsView';
import AdminBrandingView from './AdminBrandingView';
import AdminAccessView from './AdminAccessView';
import AdminWorkspacesView, { type AdminWorkspace } from './AdminWorkspacesView';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, Users, TrendingUp, Cpu, ToggleLeft, ToggleRight, 
  Search, Check, X, Shield, RefreshCw, Settings, DollarSign, 
  HelpCircle, Eye, Edit2, CheckCircle2, AlertTriangle, ArrowRight,
  ChevronRight, Sparkles, Building2, Smartphone, Plus, Trash2, Percent,
  Sliders, Lock, Unlock, Layers, FileText, Database, ShieldCheck,
  CheckCircle, Zap, Wallet, HandCoins, Scale, Palette, Globe, Mail, Phone, Image as ImageIcon,
  KeyRound, UserPlus, UserCheck, Copy, Send, Ban, Key, EyeOff, Calendar, Clock
, Store, Power, BarChart3
} from 'lucide-react';
import { CRMData, TaxConfig, FeeConfig, PlanTier, PlanFeatureConfig, PlatformSettings, EscrowContract, UserInvite, RegistrationMode } from '../types';
import { DEFAULT_PLATFORM_SETTINGS } from '../data/mockData';
import AdminMarketplaceView from './marketplace/AdminMarketplaceView';
import AdminBillingView from './AdminBillingView';
import AdminModulesView from './AdminModulesView';
import AdminAnalyticsView from './AdminAnalyticsView';
import { auth } from '../lib/firebase';
import { refreshBilling, useBilling } from '../lib/billingClient';
import { cleanPlatformConfig, savePlatformConfig, usePlatformConfig, type PlatformConfig } from '../lib/platformConfig';


interface PendingSubscriptionPayment {
  id: string;
  tenantName: string;
  amount: number;
  plan: 'pro' | 'premium';
  method: 'M-Paisa' | 'BSP Transfer' | 'Westpac Transfer';
  refCode: string;
  date: string;
}

interface AdminPanelViewProps {
  onClose: () => void;
  crmData: CRMData;
  onUpdateCrmData: (newData: CRMData) => void;
  onImpersonate: (tenantName: string, simulatedData: any) => void;
}

export default function AdminPanelView({ onClose, crmData, onUpdateCrmData, onImpersonate }: AdminPanelViewProps) {
  // SaaS Platform Settings & Plans
  const currentSettings: PlatformSettings = crmData.platformSettings || DEFAULT_PLATFORM_SETTINGS;
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(currentSettings);

  // Active Plan
  const myBilling = useBilling();
  const activePlanTier = myBilling?.plan || platformSettings.activePlan || 'free';

  // Selected Plan for Editing in Plans Tab
  const [selectedPlanTab, setSelectedPlanTab] = useState<PlanTier>('free');

  // Plans, taxes, fees and the default VAT rate are platform-wide: saved on the server for every account.
  // Until they're first published, this admin's own workspace copy is shown so earlier edits aren't lost.
  const platformState = usePlatformConfig();
  const fromWorkspace = (): PlatformConfig => cleanPlatformConfig({
    plans: currentSettings.plans,
    platformTaxes: crmData.platformTaxes || [],
    platformFees: crmData.platformFees || [],
    defaultVatRate: currentSettings.defaultVatRate,
    directory: { enabled: currentSettings.directoryEnabled !== false, paidOnly: currentSettings.enforcePaidForDirectory !== false }
  });
  const [config, setConfig] = useState<PlatformConfig>(() => platformState.saved ? platformState.config : fromWorkspace());
  const [configSaving, setConfigSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (platformState.saved && !saveTimer.current) setConfig(platformState.config);
  }, [platformState]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  const platformTaxes = config.platformTaxes;
  const platformFees = config.platformFees;

  // Platform Taxes Form State
  const [newTaxName, setNewTaxName] = useState('');
  const [newTaxRate, setNewTaxRate] = useState<number>(12.5);
  const [newTaxRateType, setNewTaxRateType] = useState<'percentage' | 'flat'>('percentage');
  const [newTaxCategory, setNewTaxCategory] = useState<'vat' | 'ecal' | 'stt' | 'levy' | 'custom'>('custom');
  const [newTaxIsDefault, setNewTaxIsDefault] = useState(false);
  const [newTaxDesc, setNewTaxDesc] = useState('');

  // Platform Fees Form State
  const [newFeeName, setNewFeeName] = useState('');
  const [newFeeRate, setNewFeeRate] = useState<number>(2.5);
  const [newFeeRateType, setNewFeeRateType] = useState<'percentage' | 'flat'>('percentage');
  const [newFeeCategory, setNewFeeCategory] = useState<'service' | 'handling' | 'processing' | 'delivery' | 'setup' | 'custom'>('processing');
  const [newFeeIsDefault, setNewFeeIsDefault] = useState(false);
  const [newFeeDesc, setNewFeeDesc] = useState('');
  
  // Navigation Tabs within Admin Panel
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'branding' | 'auth_access' | 'taxes_fees' | 'tenants' | 'billing' | 'directory' | 'errors' | 'marketplace' | 'modules' | 'analytics'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Invite Creator Form State
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteCode, setNewInviteCode] = useState('');
  const [newInviteRole, setNewInviteRole] = useState<'freelancer' | 'client' | 'accountant'>('freelancer');
  const [newInvitePlan, setNewInvitePlan] = useState<PlanTier>('pro');
  const [newInviteNotes, setNewInviteNotes] = useState('');
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Every real workspace (server: GET /api/admin/workspaces)
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[] | null>(null);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const loadWorkspaces = () => fetch('/api/admin/workspaces')
    .then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || `Request failed (${r.status})`); return b; })
    .then(b => { setWorkspaces(b.workspaces); setWorkspacesError(null); })
    .catch(err => setWorkspacesError(err.message));
  useEffect(() => { loadWorkspaces(); }, []);
  const changeWorkspacePlan = async (w: AdminWorkspace, plan: string) => {
    const r = await fetch(`/api/admin/workspaces/${encodeURIComponent(w.uid)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { showToast(b?.error || 'Could not change the plan.'); return; }
    setWorkspaces(list => (list || []).map(x => x.uid === w.uid ? { ...x, plan } : x));
    showToast(`${w.name || w.email} is now on ${plan.charAt(0).toUpperCase() + plan.slice(1)}.`);
  };

  // Pending M-Paisa / Bank offline payments
  // Manual subscription payments to check. Nothing records these yet, so the list starts empty.
  const [pendingPayments, setPendingPayments] = useState<PendingSubscriptionPayment[]>([]);

  const showToast = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Saves the platform-wide config. Typed values wait a moment so each keystroke isn't a save.
  const commitConfig = (next: PlatformConfig, opts: { wait?: boolean; message?: string } = {}) => {
    setConfig(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const run = async () => {
      saveTimer.current = null;
      setConfigSaving(true);
      try {
        await savePlatformConfig(next);
        showToast(opts.message || 'Saved for every account.');
      } catch (err: any) {
        showToast(err?.message || "Couldn't save. Try again.");
        if (platformState.saved) setConfig(platformState.config);
      } finally {
        setConfigSaving(false);
      }
    };
    if (opts.wait) saveTimer.current = setTimeout(run, 700);
    else run();
  };

  // Helper to commit this admin's own workspace settings (their own plan)
  const commitPlatformSettings = (newSettings: PlatformSettings) => {
    setPlatformSettings(newSettings);
    const updatedData: CRMData = {
      ...crmData,
      platformSettings: newSettings
    };
    onUpdateCrmData(updatedData);
    showToast('Settings saved.');
  };

  // Update Plan Limits
  const handleUpdatePlanLimit = (planId: PlanTier, limitKey: keyof PlanFeatureConfig['limits'], value: number) => {
    const plan = config.plans[planId];
    commitConfig({ ...config, plans: { ...config.plans, [planId]: { ...plan, limits: { ...plan.limits, [limitKey]: Number.isFinite(value) ? value : 0 } } } }, { wait: true });
  };

  // Update Plan Price
  const handleUpdatePlanPrice = (planId: PlanTier, price: number) => {
    commitConfig({ ...config, plans: { ...config.plans, [planId]: { ...config.plans[planId], price: Math.max(0, Number(price) || 0) } } }, { wait: true });
  };

  const handleUpdatePlanText = (planId: PlanTier, field: 'name' | 'description', value: string) => {
    commitConfig({ ...config, plans: { ...config.plans, [planId]: { ...config.plans[planId], [field]: value } } });
  };

  // Toggle Plan Feature Flag
  const handleTogglePlanFeature = (planId: PlanTier, featureKey: keyof PlanFeatureConfig['features']) => {
    const plan = config.plans[planId];
    commitConfig({ ...config, plans: { ...config.plans, [planId]: { ...plan, features: { ...plan.features, [featureKey]: !plan.features[featureKey] } } } });
  };

  // Switch Active Workspace Subscription Tier
  // Your own plan, set on the server like any other account's (open-ended, as an admin grant).
  const handleSwitchActivePlan = async (planId: PlanTier) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const res = await fetch(`/api/admin/billing/subscriptions/${encodeURIComponent(uid)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: planId, note: 'Admin’s own plan' }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not change your plan.');
      setPlatformSettings({ ...platformSettings, activePlan: planId });
      await refreshBilling();
      showToast('Your plan is updated.');
    } catch (err: any) { showToast(err.message); }
  };

  // Add Platform Tax
  const handleAddPlatformTax = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaxName.trim()) return;

    const newTax: TaxConfig = {
      id: `ptax-${Date.now()}`,
      name: newTaxName.trim(),
      rate: Number(newTaxRate) || 0,
      rateType: newTaxRateType,
      scope: 'platform',
      category: newTaxCategory,
      isDefault: newTaxIsDefault,
      isActive: true,
      description: newTaxDesc.trim() || undefined
    };

    commitConfig({ ...config, platformTaxes: [...platformTaxes, newTax] }, { message: 'Tax added for every account.' });

    setNewTaxName('');
    setNewTaxRate(12.5);
    setNewTaxDesc('');
    setNewTaxIsDefault(false);
  };

  // Toggle Tax Status
  const handleToggleTax = (taxId: string) => {
    commitConfig({ ...config, platformTaxes: platformTaxes.map(t => t.id === taxId ? { ...t, isActive: !t.isActive } : t) });
  };

  // Delete Platform Tax
  const handleDeleteTax = (taxId: string) => {
    const tax = platformTaxes.find(t => t.id === taxId);
    if (tax && !confirm(`Remove "${tax.name}" for every account? Invoices already issued keep it.`)) return;
    commitConfig({ ...config, platformTaxes: platformTaxes.filter(t => t.id !== taxId) }, { message: 'Tax removed.' });
  };

  // Add Platform Fee
  const handleAddPlatformFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeeName.trim()) return;

    const newFee: FeeConfig = {
      id: `pfee-${Date.now()}`,
      name: newFeeName.trim(),
      rate: Number(newFeeRate) || 0,
      rateType: newFeeRateType,
      scope: 'platform',
      category: newFeeCategory,
      isDefault: newFeeIsDefault,
      isActive: true,
      description: newFeeDesc.trim() || undefined
    };

    commitConfig({ ...config, platformFees: [...platformFees, newFee] }, { message: 'Fee added for every account.' });

    setNewFeeName('');
    setNewFeeRate(2.5);
    setNewFeeDesc('');
    setNewFeeIsDefault(false);
  };

  // Toggle Fee Status
  const handleToggleFee = (feeId: string) => {
    commitConfig({ ...config, platformFees: platformFees.map(f => f.id === feeId ? { ...f, isActive: !f.isActive } : f) });
  };

  // Delete Platform Fee
  const handleDeleteFee = (feeId: string) => {
    const fee = platformFees.find(f => f.id === feeId);
    if (fee && !confirm(`Remove "${fee.name}" for every account? Invoices already issued keep it.`)) return;
    commitConfig({ ...config, platformFees: platformFees.filter(f => f.id !== feeId) }, { message: 'Fee removed.' });
  };

  // Approve Subscription Payment
  const handleApprovePayment = (payId: string) => {
    const pay = pendingPayments.find(p => p.id === payId);
    if (!pay) return;

    setPendingPayments(prev => prev.filter(p => p.id !== payId));
    showToast(`Payment of FJD $${pay.amount} approved for ${pay.tenantName}.`);
  };

  // Reject Payment
  const handleRejectPayment = (payId: string) => {
    setPendingPayments(prev => prev.filter(p => p.id !== payId));
    showToast('Payment rejected.');
  };


  // Metrics
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeWorkspacesCount = (workspaces || []).filter(w => new Date(w.lastSignInAt || w.updatedAt || 0).getTime() >= monthAgo).length;
  const paidWorkspacesCount = (workspaces || []).filter(w => w.plan === 'pro' || w.plan === 'premium').length;

  const currentPlanConfig = config.plans[selectedPlanTab];

  // Shown on the Plans and Taxes tabs: whether these settings reach everyone yet.
  const publishNotice = (
    <div className={`p-3 rounded-2xl border text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${platformState.saved ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-amber-950/40 border-amber-800 text-amber-200'}`}>
      <span>
        {platformState.saved
          ? <>These apply to every account. Changes save automatically{configSaving ? ' (saving…)' : ''}.{activeTab === 'taxes_fees' ? ' Invoices and quotes already issued keep the rates they were issued with.' : ''}</>
          : <>Not published yet: every account still uses the standard plans, taxes and directory settings. Publish these to apply them to everyone.</>}
      </span>
      {!platformState.saved && (
        <button type="button" disabled={configSaving} onClick={() => commitConfig(config, { message: 'Published for every account.' })} className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-bold shrink-0 cursor-pointer disabled:opacity-50">
          {configSaving ? 'Publishing…' : 'Publish to every account'}
        </button>
      )}
    </div>
  );

  return (
    <div 
      className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)'
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-200">
        
        {/* Admin Header */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100 tracking-tight">Admin</h2>
                <span className="text-[9px] bg-sky-500/20 text-sky-300 font-mono font-bold px-2 py-0.5 rounded-full border border-sky-500/30">
                  Owner only
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Plans, limits, features, and platform taxes and fees</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccessMsg && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                <span>{saveSuccessMsg}</span>
              </span>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Admin Subnav */}
        <div className="bg-slate-900/60 px-5 py-2 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('branding')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'branding'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Branding</span>
          </button>

          <button
            onClick={() => setActiveTab('auth_access')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'auth_access'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Sign-ups</span>
          </button>

          <button
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'directory'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Directory</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('modules')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'modules'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>Modules</span>
          </button>

          <button
            onClick={() => setActiveTab('marketplace')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'marketplace'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Marketplace</span>
          </button>

          <button
            onClick={() => setActiveTab('errors')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'errors'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>App errors</span>
          </button>

          <button
            onClick={() => setActiveTab('plans')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'plans'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Plans</span>
          </button>

          <button
            onClick={() => setActiveTab('taxes_fees')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'taxes_fees'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Percent className="w-3.5 h-3.5" />
            <span>Taxes and fees</span>
          </button>

          <button
            onClick={() => setActiveTab('tenants')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'tenants'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Workspaces{workspaces ? ` (${workspaces.length})` : ''}</span>
          </button>

          <button
            onClick={() => setActiveTab('billing')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'billing'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Billing</span>
          </button>

          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Revenue</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-950/40">

          {activeTab === 'errors' && <AdminErrorsView showToast={showToast} />}
          {activeTab === 'marketplace' && <AdminMarketplaceView showToast={showToast} />}
          {activeTab === 'analytics' && <AdminAnalyticsView />}
          {activeTab === 'modules' && (
            <AdminModulesView
              modules={config.modules}
              onOpenTab={setActiveTab}
              onSave={next => commitConfig({ ...config, modules: next }, { message: 'Module settings saved for everyone.' })}
            />
          )}

          {/* ================= TAB: FIJI DIRECTORY & BOOKINGS CONTROL ================= */}
          {activeTab === 'directory' && (
            <div className="space-y-5">
              {publishNotice}

              {/* Directory Status Header Banner */}
              <div className="bg-gradient-to-r from-sky-950/70 via-slate-900 to-indigo-950/70 border border-sky-500/30 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center text-xl shadow-md border border-sky-500/30 shrink-0">
                    <Globe className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-100">Business directory</h3>
                      <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                        config.directory.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}>
                        {config.directory.enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Choose who appears in the public directory and mark businesses as verified.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span className="text-xs font-bold text-slate-300">Public directory:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newStatus = !config.directory.enabled;
                      commitConfig({ ...config, directory: { ...config.directory, enabled: newStatus } }, { message: newStatus ? 'Directory turned on for everyone.' : 'Directory turned off for everyone.' });
                    }}
                    className={`transition-colors p-1 ${config.directory.enabled ? 'text-emerald-400' : 'text-slate-600'}`}
                  >
                    {config.directory.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                  </button>
                </div>
              </div>

              {/* Requirement Rule: Non-Paying User Exclusion Control */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-sky-400" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-100">Paid plan required to be listed</h4>
                      <p className="text-xs text-slate-400">
                        Only show businesses on Pro or Premium in the public directory.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-slate-300">
                      {config.directory.paidOnly ? 'Pro and Premium only' : 'All plans'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newEnforce = !config.directory.paidOnly;
                        commitConfig({ ...config, directory: { ...config.directory, paidOnly: newEnforce } }, { message: newEnforce ? 'Free accounts are now hidden from the directory.' : 'Directory is now open to all plans.' });
                      }}
                      className={`transition-colors p-1 ${config.directory.paidOnly ? 'text-sky-400' : 'text-slate-600'}`}
                    >
                      {config.directory.paidOnly ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-200">What this means</p>
                  <p className="text-[11px] leading-relaxed">
                    {config.directory.paidOnly ? (
                      <><strong>Free accounts are hidden</strong> from directory search. Pro and Premium users who set their profile to Public can be found and booked by clients.</>
                    ) : (
                      <><strong>Every account can list its business</strong>, whatever its plan.</>
                    )}
                  </p>
                </div>
              </div>

              <AdminDirectoryManager crmData={crmData} onUpdateCrmData={onUpdateCrmData} showToast={showToast} />

            </div>
          )}

          {/* ================= TAB 0: APP BRANDING & PLATFORM IDENTITY ================= */}
          {activeTab === 'branding' && <AdminBrandingView showToast={showToast} />}

          {/* ================= TAB: REGISTRATION & OTP ACCESS CONTROL ================= */}
          {activeTab === 'auth_access' && <AdminAccessView showToast={showToast} />}

          {/* ================= TAB 1: PLANS & FEATURE TOGGLES ================= */}
          {activeTab === 'plans' && (
            <div className="space-y-5">
              {publishNotice}
              
              {/* Active Workspace Plan Switcher Box */}
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                <div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Your workspace plan
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Current plan: <span className="text-sky-400 font-bold uppercase">{config.plans[activePlanTier].name}</span> (FJD ${config.plans[activePlanTier].price}/mo)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {(['free', 'pro', 'premium'] as PlanTier[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => handleSwitchActivePlan(tier)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase transition-all ${
                        activePlanTier === tier
                          ? 'bg-sky-400 text-slate-950 shadow-md'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plan Selection Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                {(['free', 'pro', 'premium'] as PlanTier[]).map((tier) => {
                  const p = config.plans[tier];
                  return (
                    <button
                      key={tier}
                      onClick={() => setSelectedPlanTab(tier)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                        selectedPlanTab === tier
                          ? 'bg-slate-800 text-sky-400 border border-sky-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.badgeColor }} />
                      <span>{p.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 font-normal">
                        (FJD ${p.price}/mo)
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selected Plan Details & Limits Editor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Left: Plan Pricing & Quota Item Limits */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-sky-400" />
                        <span>Limits ({currentPlanConfig.name})</span>
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{currentPlanConfig.description}</p>
                    </div>
                  </div>

                  {/* Name and description, as shown in the plan picker */}
                  <div className="grid grid-cols-1 gap-2" key={`plan-text-${selectedPlanTab}-${platformState.updatedAt}`}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Plan name
                      <input
                        type="text"
                        maxLength={40}
                        defaultValue={currentPlanConfig.name}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== currentPlanConfig.name) handleUpdatePlanText(selectedPlanTab, 'name', v); }}
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs font-bold text-slate-100 normal-case tracking-normal focus:outline-none focus:border-sky-500"
                      />
                    </label>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Short description
                      <input
                        type="text"
                        maxLength={200}
                        defaultValue={currentPlanConfig.description}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v !== currentPlanConfig.description) handleUpdatePlanText(selectedPlanTab, 'description', v); }}
                        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100 normal-case tracking-normal font-normal focus:outline-none focus:border-sky-500"
                      />
                    </label>
                  </div>

                  {/* Monthly Pricing */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Monthly price (FJD $)
                    </label>
                    <div className="relative mt-1">
                      <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        min="0"
                        value={currentPlanConfig.price}
                        onChange={(e) => handleUpdatePlanPrice(selectedPlanTab, Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 pl-9 pr-3 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* Numerical Limit Fields */}
                  <div className="space-y-3 pt-1">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-300 uppercase">Invoices per month</label>
                        <span className="text-[9px] text-slate-400">(-1 for unlimited)</span>
                      </div>
                      <input
                        type="number"
                        value={currentPlanConfig.limits.maxInvoicesPerMonth}
                        onChange={(e) => handleUpdatePlanLimit(selectedPlanTab, 'maxInvoicesPerMonth', Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-100 mt-1 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-300 uppercase">Clients</label>
                        <span className="text-[9px] text-slate-400">(-1 for unlimited)</span>
                      </div>
                      <input
                        type="number"
                        value={currentPlanConfig.limits.maxClients}
                        onChange={(e) => handleUpdatePlanLimit(selectedPlanTab, 'maxClients', Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-100 mt-1 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-300 uppercase">Services</label>
                        <span className="text-[9px] text-slate-400">(-1 for unlimited)</span>
                      </div>
                      <input
                        type="number"
                        value={currentPlanConfig.limits.maxServices}
                        onChange={(e) => handleUpdatePlanLimit(selectedPlanTab, 'maxServices', Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-100 mt-1 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-300 uppercase">Businesses</label>
                        <span className="text-[9px] text-slate-400">Businesses per account</span>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={currentPlanConfig.limits.maxBusinesses}
                        onChange={(e) => handleUpdatePlanLimit(selectedPlanTab, 'maxBusinesses', Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-100 mt-1 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-300 uppercase">Active projects</label>
                        <span className="text-[9px] text-slate-400">(-1 for unlimited)</span>
                      </div>
                      <input
                        type="number"
                        value={currentPlanConfig.limits.maxProjects}
                        onChange={(e) => handleUpdatePlanLimit(selectedPlanTab, 'maxProjects', Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-100 mt-1 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-300 uppercase">AI receipt scans per month</label>
                        <span className="text-[9px] text-slate-400">Monthly allowance</span>
                      </div>
                      <input
                        type="number"
                        value={currentPlanConfig.limits.maxAiScansPerMonth}
                        onChange={(e) => handleUpdatePlanLimit(selectedPlanTab, 'maxAiScansPerMonth', Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-100 mt-1 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Right: Feature Toggles (Switches) */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <div className="border-b border-slate-800 pb-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Features ({currentPlanConfig.name})</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Turn features on or off for this plan.
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    
                    {/* Toggle: AI Receipt OCR */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">AI receipt scanning</span>
                        <span className="text-[9px] text-slate-500">AI reads and categorises receipts</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlanFeature(selectedPlanTab, 'allowAiReceiptOcr')}
                        className={`transition-colors p-1 ${currentPlanConfig.features.allowAiReceiptOcr ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {currentPlanConfig.features.allowAiReceiptOcr ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>

                    {/* Toggle: Client Portal */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Client portal</span>
                        <span className="text-[9px] text-slate-500">Clients sign in with a PIN to download documents and send questions</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlanFeature(selectedPlanTab, 'allowClientPortal')}
                        className={`transition-colors p-1 ${currentPlanConfig.features.allowClientPortal ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {currentPlanConfig.features.allowClientPortal ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>

                    {/* Toggle: Recurring Invoices */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Recurring invoices</span>
                        <span className="text-[9px] text-slate-500">Monthly billing and retainers on a schedule</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlanFeature(selectedPlanTab, 'allowRecurringInvoices')}
                        className={`transition-colors p-1 ${currentPlanConfig.features.allowRecurringInvoices ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {currentPlanConfig.features.allowRecurringInvoices ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>

                    {/* Toggle: Multi-Currency */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Multiple currencies (AUD / NZD / USD)</span>
                        <span className="text-[9px] text-slate-500">Bill clients in the Pacific and overseas</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlanFeature(selectedPlanTab, 'allowMultiCurrency')}
                        className={`transition-colors p-1 ${currentPlanConfig.features.allowMultiCurrency ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {currentPlanConfig.features.allowMultiCurrency ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>

                    {/* Toggle: Custom Branding */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Custom branding</span>
                        <span className="text-[9px] text-slate-500">Own logo, header style and colours</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlanFeature(selectedPlanTab, 'allowCustomBranding')}
                        className={`transition-colors p-1 ${currentPlanConfig.features.allowCustomBranding ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {currentPlanConfig.features.allowCustomBranding ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>

                    {/* Toggle: Bank & M-Paisa Reconciliation */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Bank and M-PAiSA reconciliation</span>
                        <span className="text-[9px] text-slate-500">Match bank statement lines to the books</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlanFeature(selectedPlanTab, 'allowBankReconciliation')}
                        className={`transition-colors p-1 ${currentPlanConfig.features.allowBankReconciliation ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {currentPlanConfig.features.allowBankReconciliation ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>

                    {/* Toggle: Custom Tax Rules */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Custom taxes and levies</span>
                        <span className="text-[9px] text-slate-500">Set ECAL, STT and handling fees per business</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlanFeature(selectedPlanTab, 'allowCustomTaxRules')}
                        className={`transition-colors p-1 ${currentPlanConfig.features.allowCustomTaxRules ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {currentPlanConfig.features.allowCustomTaxRules ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>

                    {/* Toggle: Direct Support Chat */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Client messages</span>
                        <span className="text-[9px] text-slate-500">Clients can send questions about their documents</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlanFeature(selectedPlanTab, 'allowDirectSupportChat')}
                        className={`transition-colors p-1 ${currentPlanConfig.features.allowDirectSupportChat ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {currentPlanConfig.features.allowDirectSupportChat ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>

                    {/* Toggle: Export PDF */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">PDF export</span>
                        <span className="text-[9px] text-slate-500">Download tax invoices and receipts as PDFs</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePlanFeature(selectedPlanTab, 'allowExportPdf')}
                        className={`transition-colors p-1 ${currentPlanConfig.features.allowExportPdf ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {currentPlanConfig.features.allowExportPdf ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                    </div>

                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ================= TAB 2: STATUTORY TAXES & FEES ================= */}
          {activeTab === 'taxes_fees' && (
            <div className="space-y-5">
              {publishNotice}
              
              {/* Global System Tax Variables */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>Tax defaults</span>
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Standard VAT rate</label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={config.defaultVatRate}
                        onChange={(e) => commitConfig({ ...config, defaultVatRate: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }, { wait: true })}
                        className="w-20 bg-slate-900 border border-slate-800 rounded-lg py-1 px-2 text-xs font-mono font-bold text-sky-400"
                      />
                      <span className="text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>
                  <p className="sm:col-span-2 text-[10px] text-slate-400 leading-relaxed self-center">
                    New accounts start with this rate when they set up. Each business can change its own rate in Settings, and that rate is what goes on its invoices.
                  </p>
                </div>
              </div>

              {/* Platform Statutory Taxes CRUD */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Taxes and levies ({platformTaxes.length})
                    </h4>
                    <p className="text-[10px] text-slate-400">Taxes every business can apply</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {platformTaxes.map((tax) => (
                    <div key={tax.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100">{tax.name}</span>
                          <span className="text-[9px] bg-sky-950 text-sky-300 px-2 py-0.5 rounded-full font-mono font-bold border border-sky-800">
                            {tax.rateType === 'percentage' ? `${tax.rate}%` : `FJD $${tax.rate.toFixed(2)}`}
                          </span>
                          {tax.isDefault && (
                            <span className="text-[8px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                              Auto-applied
                            </span>
                          )}
                        </div>
                        {tax.description && <p className="text-[9.5px] text-slate-400 mt-0.5">{tax.description}</p>}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleTax(tax.id)}
                          className={`p-1 ${tax.isActive ? 'text-emerald-400' : 'text-slate-600'}`}
                          title="Turn on or off"
                        >
                          {tax.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTax(tax.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Statutory Tax Form */}
                <form onSubmit={handleAddPlatformTax} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block">+ Add tax</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={newTaxName}
                      onChange={(e) => setNewTaxName(e.target.value)}
                      placeholder="e.g. Environment levy"
                      className="bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-100"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={newTaxRate}
                        onChange={(e) => setNewTaxRate(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-sky-400"
                      />
                      <select
                        value={newTaxRateType}
                        onChange={(e) => setNewTaxRateType(e.target.value as any)}
                        className="bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-slate-200"
                      >
                        <option value="percentage">%</option>
                        <option value="flat">Flat $</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add tax</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Platform Fees CRUD */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Payment fees ({platformFees.length})
                    </h4>
                    <p className="text-[10px] text-slate-400">Surcharges added when clients pay online</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {platformFees.map((fee) => (
                    <div key={fee.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100">{fee.name}</span>
                          <span className="text-[9px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-800">
                            {fee.rateType === 'percentage' ? `${fee.rate}%` : `FJD $${fee.rate.toFixed(2)}`}
                          </span>
                        </div>
                        {fee.description && <p className="text-[9.5px] text-slate-400 mt-0.5">{fee.description}</p>}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleFee(fee.id)}
                          className={`p-1 ${fee.isActive ? 'text-emerald-400' : 'text-slate-600'}`}
                        >
                          {fee.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFee(fee.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Platform Fee Form */}
                <form onSubmit={handleAddPlatformFee} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block">+ Add fee</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={newFeeName}
                      onChange={(e) => setNewFeeName(e.target.value)}
                      placeholder="e.g. Card processing fee"
                      className="bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-100"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={newFeeRate}
                        onChange={(e) => setNewFeeRate(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-xs font-mono font-bold text-emerald-400"
                      />
                      <select
                        value={newFeeRateType}
                        onChange={(e) => setNewFeeRateType(e.target.value as any)}
                        className="bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-slate-200"
                      >
                        <option value="percentage">%</option>
                        <option value="flat">Flat $</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add fee</span>
                    </button>
                  </div>
                </form>
              </div>

            </div>
          )}

          {/* ================= TAB 3: TENANTS MANAGEMENT ================= */}
          {activeTab === 'tenants' && (
            <AdminWorkspacesView workspaces={workspaces} error={workspacesError} onReload={loadWorkspaces} onChangePlan={changeWorkspacePlan} />
          )}

          {/* ================= TAB 4: BILLING & APPROVALS ================= */}
          {activeTab === 'billing' && (
            <AdminBillingView
              billing={config.billing}
              showToast={showToast}
              onSave={async next => { commitConfig({ ...config, billing: next }, { message: next.enabled ? 'Billing settings saved. Paid plans are on.' : 'Billing settings saved.' }); }}
            />
          )}

          {/* ================= TAB 5: OVERVIEW ================= */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Workspaces', value: workspaces ? workspaces.length : '…', note: 'Accounts on Frilensa' },
                  { label: 'Active this month', value: workspaces ? activeWorkspacesCount : '…', note: 'Signed in or saved in the last 30 days' },
                  { label: 'Paid plans', value: workspaces ? paidWorkspacesCount : '…', note: 'On Pro or Premium' },
                  { label: 'Documents', value: workspaces ? workspaces.reduce((a, w) => a + w.documents, 0) : '…', note: `Quotes, invoices and receipts · ${workspaces ? workspaces.reduce((a, w) => a + w.clients, 0) : '…'} clients` }
                ].map(c => (
                  <div key={c.label} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">{c.label}</span>
                    <span className="text-xl font-black text-slate-100 font-mono mt-1 block">{c.value}</span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">{c.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer info bar */}
        <div className="bg-slate-950 px-5 py-2.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Frilensa admin</span>
          <span>Signed in as admin</span>
        </div>

      </div>
    </div>
  );
}
