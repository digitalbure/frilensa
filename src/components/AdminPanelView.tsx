import AdminDirectoryManager from './AdminDirectoryManager';
import AdminErrorsView from './AdminErrorsView';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, Users, TrendingUp, Cpu, ToggleLeft, ToggleRight, 
  Search, Check, X, Shield, RefreshCw, Settings, DollarSign, 
  HelpCircle, Eye, Edit2, CheckCircle2, AlertTriangle, ArrowRight,
  ChevronRight, Sparkles, Building2, Smartphone, Plus, Trash2, Percent,
  Sliders, Lock, Unlock, Layers, FileText, Database, ShieldCheck,
  CheckCircle, Zap, Wallet, HandCoins, Scale, Palette, Globe, Mail, Phone, Image as ImageIcon,
  KeyRound, UserPlus, UserCheck, Copy, Send, Ban, Key, EyeOff, Calendar, Clock
} from 'lucide-react';
import { CRMData, TaxConfig, FeeConfig, PlanTier, PlanFeatureConfig, PlatformSettings, EscrowContract, UserInvite, RegistrationMode } from '../types';
import { DEFAULT_PLATFORM_SETTINGS } from '../data/mockData';

interface Tenant {
  id: string;
  name: string;
  owner: string;
  email: string;
  location: string;
  plan: PlanTier;
  status: 'active' | 'trial' | 'suspended';
  mrr: number;
  clientsCount: number;
  projectsCount: number;
  aiUsage: number;
  tin: string;
}

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
  const activePlanTier = platformSettings.activePlan || 'free';

  // Selected Plan for Editing in Plans Tab
  const [selectedPlanTab, setSelectedPlanTab] = useState<PlanTier>('free');

  // Platform Statutory Taxes
  const platformTaxes = crmData.platformTaxes || [];
  const platformFees = crmData.platformFees || [];

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
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'branding' | 'auth_access' | 'taxes_fees' | 'tenants' | 'billing' | 'directory' | 'errors'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Invite Creator Form State
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteCode, setNewInviteCode] = useState('');
  const [newInviteRole, setNewInviteRole] = useState<'freelancer' | 'client' | 'accountant'>('freelancer');
  const [newInvitePlan, setNewInvitePlan] = useState<PlanTier>('pro');
  const [newInviteNotes, setNewInviteNotes] = useState('');
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Tenants Data
  const [tenants, setTenants] = useState<Tenant[]>([
    {
      id: 'ten-current',
      name: crmData.businesses[0]?.name || (crmData.userProfile?.name ? `${crmData.userProfile.name}'s workspace` : 'Main workspace'),
      owner: crmData.userProfile?.name || 'Workspace owner',
      email: crmData.userProfile?.email || 'admin@workspace.fj',
      location: crmData.userProfile?.city || 'Suva, Viti Levu',
      plan: activePlanTier,
      status: 'active',
      mrr: activePlanTier === 'premium' ? 50 : activePlanTier === 'pro' ? 25 : 0,
      clientsCount: crmData.clients?.length || 0,
      projectsCount: crmData.projects?.length || 0,
      aiUsage: 4,
      tin: crmData.userProfile?.tin || '50-12345-0-1'
    },
    {
      id: 'ten-1',
      name: 'Viti Creative Studio',
      owner: 'Sereana Prasad',
      email: 'sereana@viticreative.com',
      location: 'Suva, Viti Levu',
      plan: 'pro',
      status: 'active',
      mrr: 25,
      clientsCount: 14,
      projectsCount: 3,
      aiUsage: 18,
      tin: '50-10024-0-1'
    },
    {
      id: 'ten-2',
      name: 'Kava Software Solutions',
      owner: 'Jone Waqanitoga',
      email: 'jone@kavasoft.com',
      location: 'Nadi, Viti Levu',
      plan: 'premium',
      status: 'active',
      mrr: 50,
      clientsCount: 29,
      projectsCount: 8,
      aiUsage: 42,
      tin: '50-88321-2-9'
    },
    {
      id: 'ten-3',
      name: 'Coral Web Agency',
      owner: 'Alisi Sovasova',
      email: 'alisi@coralagency.fj',
      location: 'Lautoka',
      plan: 'pro',
      status: 'trial',
      mrr: 0,
      clientsCount: 4,
      projectsCount: 1,
      aiUsage: 6,
      tin: '50-77443-1-0'
    }
  ]);

  // Pending M-Paisa / Bank offline payments
  const [pendingPayments, setPendingPayments] = useState<PendingSubscriptionPayment[]>([
    {
      id: 'pay-101',
      tenantName: 'Viti Creative Studio',
      amount: 25.00,
      plan: 'pro',
      method: 'M-Paisa',
      refCode: 'MP-994821',
      date: '2026-08-23'
    },
    {
      id: 'pay-102',
      tenantName: 'Coral Web Agency',
      amount: 50.00,
      plan: 'premium',
      method: 'BSP Transfer',
      refCode: 'BSP-TX-88129',
      date: '2026-08-24'
    }
  ]);

  const showToast = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Helper to commit platform settings
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
  const handleUpdatePlanLimit = (planId: PlanTier, limitKey: keyof typeof platformSettings.plans.free.limits, value: number) => {
    const updatedPlans = {
      ...platformSettings.plans,
      [planId]: {
        ...platformSettings.plans[planId],
        limits: {
          ...platformSettings.plans[planId].limits,
          [limitKey]: value
        }
      }
    };
    commitPlatformSettings({
      ...platformSettings,
      plans: updatedPlans
    });
  };

  // Update Plan Price
  const handleUpdatePlanPrice = (planId: PlanTier, price: number) => {
    const updatedPlans = {
      ...platformSettings.plans,
      [planId]: {
        ...platformSettings.plans[planId],
        price: Number(price) || 0
      }
    };
    commitPlatformSettings({
      ...platformSettings,
      plans: updatedPlans
    });
  };

  // Toggle Plan Feature Flag
  const handleTogglePlanFeature = (planId: PlanTier, featureKey: keyof typeof platformSettings.plans.free.features) => {
    const currentVal = platformSettings.plans[planId].features[featureKey];
    const updatedPlans = {
      ...platformSettings.plans,
      [planId]: {
        ...platformSettings.plans[planId],
        features: {
          ...platformSettings.plans[planId].features,
          [featureKey]: !currentVal
        }
      }
    };
    commitPlatformSettings({
      ...platformSettings,
      plans: updatedPlans
    });
  };

  // Switch Active Workspace Subscription Tier
  const handleSwitchActivePlan = (planId: PlanTier) => {
    const updatedSettings = {
      ...platformSettings,
      activePlan: planId
    };
    commitPlatformSettings(updatedSettings);
    // Update current tenant record in UI list
    setTenants(prev => prev.map(t => t.id === 'ten-current' ? { ...t, plan: planId, mrr: platformSettings.plans[planId].price } : t));
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

    const updatedTaxes = [...platformTaxes, newTax];
    const updatedData: CRMData = {
      ...crmData,
      platformTaxes: updatedTaxes
    };
    onUpdateCrmData(updatedData);

    setNewTaxName('');
    setNewTaxRate(12.5);
    setNewTaxDesc('');
    setNewTaxIsDefault(false);
    showToast('Tax added.');
  };

  // Toggle Tax Status
  const handleToggleTax = (taxId: string) => {
    const updatedTaxes = platformTaxes.map(t => t.id === taxId ? { ...t, isActive: !t.isActive } : t);
    onUpdateCrmData({
      ...crmData,
      platformTaxes: updatedTaxes
    });
  };

  // Delete Platform Tax
  const handleDeleteTax = (taxId: string) => {
    const updatedTaxes = platformTaxes.filter(t => t.id !== taxId);
    onUpdateCrmData({
      ...crmData,
      platformTaxes: updatedTaxes
    });
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

    const updatedFees = [...platformFees, newFee];
    const updatedData: CRMData = {
      ...crmData,
      platformFees: updatedFees
    };
    onUpdateCrmData(updatedData);

    setNewFeeName('');
    setNewFeeRate(2.5);
    setNewFeeDesc('');
    setNewFeeIsDefault(false);
    showToast('Fee added.');
  };

  // Toggle Fee Status
  const handleToggleFee = (feeId: string) => {
    const updatedFees = platformFees.map(f => f.id === feeId ? { ...f, isActive: !f.isActive } : f);
    onUpdateCrmData({
      ...crmData,
      platformFees: updatedFees
    });
  };

  // Delete Platform Fee
  const handleDeleteFee = (feeId: string) => {
    const updatedFees = platformFees.filter(f => f.id !== feeId);
    onUpdateCrmData({
      ...crmData,
      platformFees: updatedFees
    });
  };

  // Approve Subscription Payment
  const handleApprovePayment = (payId: string) => {
    const pay = pendingPayments.find(p => p.id === payId);
    if (!pay) return;

    setTenants(prev => prev.map(t => {
      if (t.name === pay.tenantName) {
        return {
          ...t,
          status: 'active',
          plan: pay.plan,
          mrr: pay.amount
        };
      }
      return t;
    }));

    setPendingPayments(prev => prev.filter(p => p.id !== payId));
    showToast(`Payment of FJD $${pay.amount} approved for ${pay.tenantName}.`);
  };

  // Reject Payment
  const handleRejectPayment = (payId: string) => {
    setPendingPayments(prev => prev.filter(p => p.id !== payId));
    showToast('Payment rejected.');
  };


  // Metrics
  const totalSaasMRR = tenants.reduce((acc, t) => acc + (t.status === 'active' ? t.mrr : 0), 0);
  const activeTenantsCount = tenants.filter(t => t.status === 'active').length;

  const currentPlanConfig = platformSettings.plans[selectedPlanTab];

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
            <span className={`text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase ${
              (platformSettings.registrationMode || 'open') === 'open' 
                ? 'bg-emerald-500/20 text-emerald-300' 
                : (platformSettings.registrationMode === 'invite_only') 
                  ? 'bg-amber-500/20 text-amber-300' 
                  : 'bg-rose-500/20 text-rose-300'
            }`}>
              {platformSettings.registrationMode || 'open'}
            </span>
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
            <span>Workspaces ({tenants.length})</span>
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
            <span>Payments ({pendingPayments.length})</span>
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

          {/* ================= TAB: FIJI DIRECTORY & BOOKINGS CONTROL ================= */}
          {activeTab === 'directory' && (
            <div className="space-y-5">
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
                        (platformSettings.directoryEnabled !== false)
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}>
                        {(platformSettings.directoryEnabled !== false) ? 'ON' : 'OFF'}
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
                      const newStatus = platformSettings.directoryEnabled === false ? true : false;
                      const newSettings = { ...platformSettings, directoryEnabled: newStatus };
                      setPlatformSettings(newSettings);
                      onUpdateCrmData({
                        ...crmData,
                        platformSettings: newSettings
                      });
                      showToast(newStatus ? 'Directory turned on.' : 'Directory turned off.');
                    }}
                    className={`transition-colors p-1 ${(platformSettings.directoryEnabled !== false) ? 'text-emerald-400' : 'text-slate-600'}`}
                  >
                    {(platformSettings.directoryEnabled !== false) ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
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
                      {platformSettings.enforcePaidForDirectory !== false ? 'Pro and Premium only' : 'All plans'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newEnforce = platformSettings.enforcePaidForDirectory === false ? true : false;
                        const newSettings = { ...platformSettings, enforcePaidForDirectory: newEnforce };
                        setPlatformSettings(newSettings);
                        onUpdateCrmData({
                          ...crmData,
                          platformSettings: newSettings
                        });
                        showToast(newEnforce ? 'Free accounts are now hidden from the directory.' : 'Directory is now open to all plans.');
                      }}
                      className={`transition-colors p-1 ${(platformSettings.enforcePaidForDirectory !== false) ? 'text-sky-400' : 'text-slate-600'}`}
                    >
                      {(platformSettings.enforcePaidForDirectory !== false) ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-200">What this means</p>
                  <p className="text-[11px] leading-relaxed">
                    {platformSettings.enforcePaidForDirectory !== false ? (
                      <><strong>Free accounts are hidden</strong> from directory search. Pro and Premium users who set their profile to Public can be found and booked by clients.</>
                    ) : (
                      <><strong>Free accounts can be listed too</strong> if their profile is public and you've verified them.</>
                    )}
                  </p>
                </div>
              </div>

              <AdminDirectoryManager crmData={crmData} onUpdateCrmData={onUpdateCrmData} showToast={showToast} />

            </div>
          )}

          {/* ================= TAB 0: APP BRANDING & PLATFORM IDENTITY ================= */}
          {activeTab === 'branding' && (
            <div className="space-y-5">
              {/* Top Banner / Status Overview */}
              <div className="bg-gradient-to-r from-sky-950/60 via-slate-900 to-teal-950/60 border border-sky-500/30 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div 
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-md border border-white/20 shrink-0"
                    style={{ backgroundColor: platformSettings.platformPrimaryColor || '#0284c7' }}
                  >
                    {platformSettings.platformLogoType === 'image' && platformSettings.platformLogoUrl ? (
                      <img src={platformSettings.platformLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain" />
                    ) : platformSettings.platformLogoType === 'text' ? (
                      <span className="font-extrabold text-white text-xs tracking-wider">
                        {platformSettings.platformLogoSymbol || platformSettings.platformName?.slice(0, 3).toUpperCase() || 'TLE'}
                      </span>
                    ) : (
                      <span>{platformSettings.platformLogoSymbol || '🌴'}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100">
                        {platformSettings.platformName || 'Frilensa'}
                      </h3>
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Live
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      {platformSettings.platformTagline || 'Invoicing and bookkeeping for Fiji businesses'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      commitPlatformSettings({
                        ...platformSettings,
                        platformName: 'Frilensa',
                        platformTagline: 'Invoicing and bookkeeping for Fiji businesses',
                        platformSupportEmail: 'support@frilensa.com',
                        platformSupportPhone: '+679 330 1234',
                        platformLogoType: 'symbol',
                        platformLogoSymbol: '🌴',
                        platformLogoUrl: '/pwa-icon.svg',
                        platformPrimaryColor: '#0284c7',
                        platformAccentColor: '#0d9488',
                        platformFooterNote: 'frilensa.com'
                      });
                      showToast('Branding reset to the Frilensa defaults.');
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-slate-700"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>

              {/* Branding Configuration Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* General Brand Details */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-sky-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                        App details
                      </h4>
                    </div>
                    <span className="text-[9px] text-slate-400">Shown in the header</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      App name
                    </label>
                    <input
                      type="text"
                      value={platformSettings.platformName || ''}
                      onChange={(e) => {
                        commitPlatformSettings({
                          ...platformSettings,
                          platformName: e.target.value
                        });
                      }}
                      placeholder="e.g. Frilensa"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Tagline
                    </label>
                    <input
                      type="text"
                      value={platformSettings.platformTagline || ''}
                      onChange={(e) => {
                        commitPlatformSettings({
                          ...platformSettings,
                          platformTagline: e.target.value
                        });
                      }}
                      placeholder="e.g. Invoicing and bookkeeping for Fiji businesses"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Support email
                      </label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                        <input
                          type="email"
                          value={platformSettings.platformSupportEmail || ''}
                          onChange={(e) => {
                            commitPlatformSettings({
                              ...platformSettings,
                              platformSupportEmail: e.target.value
                            });
                          }}
                          placeholder="support@frilensa.com"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-8 pr-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Support phone
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          value={platformSettings.platformSupportPhone || ''}
                          onChange={(e) => {
                            commitPlatformSettings({
                              ...platformSettings,
                              platformSupportPhone: e.target.value
                            });
                          }}
                          placeholder="+679 330 1234"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-8 pr-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Footer text
                    </label>
                    <input
                      type="text"
                      value={platformSettings.platformFooterNote || ''}
                      onChange={(e) => {
                        commitPlatformSettings({
                          ...platformSettings,
                          platformFooterNote: e.target.value
                        });
                      }}
                      placeholder="e.g. frilensa.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Logo & Theme Customizer */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-teal-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                        Logo and colours
                      </h4>
                    </div>
                    <span className="text-[9px] text-slate-400">Appearance</span>
                  </div>

                  {/* Logo Style Switcher */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Logo type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['symbol', 'text', 'image'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            commitPlatformSettings({
                              ...platformSettings,
                              platformLogoType: type
                            });
                          }}
                          className={`py-1.5 rounded-xl text-xs font-bold capitalize transition-all border ${
                            (platformSettings.platformLogoType || 'symbol') === type
                              ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic Logo Input */}
                  {(platformSettings.platformLogoType || 'symbol') === 'symbol' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Logo emoji
                      </label>
                      <div className="flex items-center gap-2">
                        {['🌴', '🌺', '🌊', '⚡', '💼', '🚀', '⭐', '🛡️'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              commitPlatformSettings({
                                ...platformSettings,
                                platformLogoSymbol: emoji
                              });
                            }}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-all border ${
                              (platformSettings.platformLogoSymbol || '🌴') === emoji
                                ? 'bg-sky-500/20 border-sky-400 scale-110'
                                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                        <input
                          type="text"
                          value={platformSettings.platformLogoSymbol || '🌴'}
                          onChange={(e) => {
                            commitPlatformSettings({
                              ...platformSettings,
                              platformLogoSymbol: e.target.value
                            });
                          }}
                          maxLength={3}
                          className="w-12 bg-slate-950 border border-slate-800 rounded-xl text-center text-sm py-1 font-bold text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  )}

                  {platformSettings.platformLogoType === 'text' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Logo text (2–4 characters)
                      </label>
                      <input
                        type="text"
                        value={platformSettings.platformLogoSymbol || 'TLE'}
                        onChange={(e) => {
                          commitPlatformSettings({
                            ...platformSettings,
                            platformLogoSymbol: e.target.value.toUpperCase()
                          });
                        }}
                        maxLength={5}
                        placeholder="TLE"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs font-mono font-bold text-white focus:outline-none focus:border-sky-500 uppercase tracking-widest"
                      />
                    </div>
                  )}

                  {platformSettings.platformLogoType === 'image' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Logo image URL
                      </label>
                      <div className="relative">
                        <ImageIcon className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          value={platformSettings.platformLogoUrl || '/pwa-icon.svg'}
                          onChange={(e) => {
                            commitPlatformSettings({
                              ...platformSettings,
                              platformLogoUrl: e.target.value
                            });
                          }}
                          placeholder="/pwa-icon.svg or https://…"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-8 pr-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Colors */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Primary colour
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={platformSettings.platformPrimaryColor || '#0284c7'}
                          onChange={(e) => {
                            commitPlatformSettings({
                              ...platformSettings,
                              platformPrimaryColor: e.target.value
                            });
                          }}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <span className="text-xs font-mono text-slate-300 font-bold">
                          {platformSettings.platformPrimaryColor || '#0284c7'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Accent colour
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={platformSettings.platformAccentColor || '#0d9488'}
                          onChange={(e) => {
                            commitPlatformSettings({
                              ...platformSettings,
                              platformAccentColor: e.target.value
                            });
                          }}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <span className="text-xs font-mono text-slate-300 font-bold">
                          {platformSettings.platformAccentColor || '#0d9488'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* Real World Operational Readiness Assessment */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-3 shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      What's live
                    </h4>
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Live
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed">
                  These features are switched on for users:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-200">Cloud storage</p>
                      <p className="text-[10px] text-slate-400">Clients, invoices, receipts and settings are saved to each user's account online.</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-200">Fiji tax calculations</p>
                      <p className="text-[10px] text-slate-400">VAT (12.5%), ECAL and STT calculations, with the business TIN on PDF invoices.</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-emerald-300">AI assistant and receipt scanning</p>
                      <p className="text-[10px] text-slate-400">AI reads bank statements and receipts and answers questions about Fiji business tax.</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-200">Offline use and M-PAiSA payment links</p>
                      <p className="text-[10px] text-slate-400">M-PAiSA QR codes, invoices sent by WhatsApp, and access to your books offline.</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ================= TAB: REGISTRATION & OTP ACCESS CONTROL ================= */}
          {activeTab === 'auth_access' && (
            <div className="space-y-5">
              {/* Top Banner */}
              <div className="bg-gradient-to-r from-sky-950/60 via-slate-900 to-indigo-950/60 border border-sky-500/30 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30 shrink-0">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100">
                        Sign-ups and verification codes
                      </h3>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                        (platformSettings.registrationMode || 'open') === 'open'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : (platformSettings.registrationMode === 'invite_only')
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}>
                        {platformSettings.registrationMode === 'open' ? 'Open' : platformSettings.registrationMode === 'invite_only' ? 'Invite only' : 'Closed'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Choose who can sign up, invite people on a set plan, and turn verification codes on or off.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      commitPlatformSettings({
                        ...platformSettings,
                        registrationMode: 'open',
                        enableEmailOtp: true,
                        enablePhoneOtp: true
                      });
                      showToast('Sign-ups reset to open, with verification codes on.');
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>

              {/* 1. Account Registration Mode Selector */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Who can sign up
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400">All new accounts</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1: Open */}
                  <div
                    onClick={() => {
                      commitPlatformSettings({
                        ...platformSettings,
                        registrationMode: 'open'
                      });
                      showToast('Sign-ups are open to everyone.');
                    }}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      (platformSettings.registrationMode || 'open') === 'open'
                        ? 'border-emerald-500 bg-emerald-950/20 text-slate-100 shadow-md shadow-emerald-950/40'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Unlock className="w-4 h-4 text-emerald-400" />
                          <span className="font-bold text-xs">Open</span>
                        </div>
                        {(platformSettings.registrationMode || 'open') === 'open' && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Anyone can sign up from the login screen.
                      </p>
                    </div>
                    <span className="mt-3 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                      Default
                    </span>
                  </div>

                  {/* Option 2: Invite-Only */}
                  <div
                    onClick={() => {
                      commitPlatformSettings({
                        ...platformSettings,
                        registrationMode: 'invite_only'
                      });
                      showToast('Sign-ups are now invite only.');
                    }}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      platformSettings.registrationMode === 'invite_only'
                        ? 'border-amber-500 bg-amber-950/20 text-slate-100 shadow-md shadow-amber-950/40'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserPlus className="w-4 h-4 text-amber-400" />
                          <span className="font-bold text-xs">Invite only</span>
                        </div>
                        {platformSettings.registrationMode === 'invite_only' && (
                          <CheckCircle2 className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Only people with an invite code or link can sign up.
                      </p>
                    </div>
                    <span className="mt-3 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                      Restricted
                    </span>
                  </div>

                  {/* Option 3: Disabled */}
                  <div
                    onClick={() => {
                      commitPlatformSettings({
                        ...platformSettings,
                        registrationMode: 'disabled'
                      });
                      showToast('Sign-ups are closed.');
                    }}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      platformSettings.registrationMode === 'disabled'
                        ? 'border-rose-500 bg-rose-950/20 text-slate-100 shadow-md shadow-rose-950/40'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Ban className="w-4 h-4 text-rose-400" />
                          <span className="font-bold text-xs">Closed</span>
                        </div>
                        {platformSettings.registrationMode === 'disabled' && (
                          <CheckCircle2 className="w-4 h-4 text-rose-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        No new sign-ups. Existing users can still sign in.
                      </p>
                    </div>
                    <span className="mt-3 text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                      Closed
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. OTP Verification Toggles (Email & Phone OTP) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-sky-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Verification codes
                    </h4>
                  </div>
                  <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded">
                    Setup
                  </span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-[11px] text-slate-300 leading-relaxed flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-100">Before email or SMS is set up:</strong> turn codes off so people can sign up while you wait for mail server or Vodafone/Digicel SMS credentials.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* Email OTP Toggle */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-sky-400" />
                        <span className="text-xs font-bold text-slate-200">Email code</span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {platformSettings.enableEmailOtp !== false 
                          ? 'On: new users enter a 6-digit code sent by email' 
                          : 'Off: users sign up without an email code'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = platformSettings.enableEmailOtp === false;
                        commitPlatformSettings({
                          ...platformSettings,
                          enableEmailOtp: nextVal
                        });
                        showToast(`Email codes turned ${nextVal ? 'on' : 'off'}.`);
                      }}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        platformSettings.enableEmailOtp !== false ? 'bg-sky-500' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                        platformSettings.enableEmailOtp !== false ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  {/* Phone / SMS OTP Toggle */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-slate-200">SMS code</span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {platformSettings.enablePhoneOtp !== false 
                          ? 'On: users enter a code sent by SMS when signing in by mobile' 
                          : 'Off: no SMS code needed'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = platformSettings.enablePhoneOtp === false;
                        commitPlatformSettings({
                          ...platformSettings,
                          enablePhoneOtp: nextVal
                        });
                        showToast(`SMS codes turned ${nextVal ? 'on' : 'off'}.`);
                      }}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        platformSettings.enablePhoneOtp !== false ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                        platformSettings.enablePhoneOtp !== false ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  {/* Platform Default Inactivity Session Timeout */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-slate-200">Sign out after inactivity</span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Default for all users who haven't set their own.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {[
                        { label: '5m', value: 5 },
                        { label: '15m (default)', value: 15 },
                        { label: '30m', value: 30 },
                        { label: '60m', value: 60 },
                        { label: 'Off', value: 0 }
                      ].map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => {
                            commitPlatformSettings({
                              ...platformSettings,
                              defaultInactivityTimeoutMinutes: t.value
                            });
                            showToast(`Inactivity sign-out ${t.value === 0 ? 'turned off' : `set to ${t.value} minutes`}.`);
                          }}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer border ${
                            (platformSettings.defaultInactivityTimeoutMinutes ?? 15) === t.value
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Invite Code Generator & Active Invites Manager */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-sky-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Invites
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {(platformSettings.invites || []).length} invites
                  </span>
                </div>

                {/* Creator Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const codeToUse = newInviteCode.trim().toUpperCase() || `BULA-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
                    
                    const newInv: UserInvite = {
                      id: `inv-${Date.now()}`,
                      code: codeToUse,
                      email: newInviteEmail.trim() || undefined,
                      role: newInviteRole,
                      plan: newInvitePlan,
                      invitedBy: crmData.userProfile?.name || 'Super Admin',
                      createdAt: new Date().toISOString().split('T')[0],
                      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                      used: false,
                      notes: newInviteNotes.trim() || 'Admin invite'
                    };

                    const currentInvites = platformSettings.invites || [];
                    commitPlatformSettings({
                      ...platformSettings,
                      invites: [newInv, ...currentInvites]
                    });

                    setNewInviteEmail('');
                    setNewInviteCode('');
                    setNewInviteNotes('');
                    showToast(`Invite code ${codeToUse} created.`);
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    New invite
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        Email (optional)
                      </label>
                      <input
                        type="email"
                        value={newInviteEmail}
                        onChange={(e) => setNewInviteEmail(e.target.value)}
                        placeholder="e.g. dev@suva.fj"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        Role
                      </label>
                      <select
                        value={newInviteRole}
                        onChange={(e) => setNewInviteRole(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      >
                        <option value="freelancer">Freelancer</option>
                        <option value="client">Client</option>
                        <option value="accountant">Accountant</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        Plan
                      </label>
                      <select
                        value={newInvitePlan}
                        onChange={(e) => setNewInvitePlan(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      >
                        <option value="free">Free ($0/mo)</option>
                        <option value="pro">Pro ($25/mo)</option>
                        <option value="premium">Premium ($50/mo)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        Invite code (leave blank to generate one)
                      </label>
                      <input
                        type="text"
                        value={newInviteCode}
                        onChange={(e) => setNewInviteCode(e.target.value.toUpperCase())}
                        placeholder="e.g. BULA-SUVA-2026"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                        Notes
                      </label>
                      <input
                        type="text"
                        value={newInviteNotes}
                        onChange={(e) => setNewInviteNotes(e.target.value)}
                        placeholder="e.g. Early partner access with Pro plan"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Create invite
                    </button>
                  </div>
                </form>

                {/* Invites Table */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Invites sent
                  </span>

                  {(platformSettings.invites || []).length === 0 ? (
                    <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center text-slate-400 text-xs">
                      No invites yet. Create one above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(platformSettings.invites || []).map((inv) => {
                        const inviteUrl = typeof window !== 'undefined'
                          ? `${window.location.origin}/?invite=${inv.code}`
                          : `https://frilensa.com/?invite=${inv.code}`;
                        const isCopied = copiedInviteId === inv.id;

                        return (
                          <div
                            key={inv.id}
                            className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-slate-100 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-sky-400">
                                  {inv.code}
                                </span>
                                <span className="bg-sky-500/20 text-sky-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                  {inv.plan} plan
                                </span>
                                <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                  {inv.role}
                                </span>
                                {inv.used ? (
                                  <span className="bg-slate-800 text-slate-400 text-[9px] px-1.5 py-0.2 rounded font-bold">
                                    Used
                                  </span>
                                ) : (
                                  <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.2 rounded font-bold border border-emerald-500/30">
                                    Active
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                                {inv.email && <span>For: <strong className="text-slate-200">{inv.email}</strong></span>}
                                <span>Expires: {inv.expiresAt}</span>
                                {inv.notes && <span className="italic text-slate-500">"{inv.notes}"</span>}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(inviteUrl);
                                  setCopiedInviteId(inv.id);
                                  setTimeout(() => setCopiedInviteId(null), 2000);
                                  showToast('Invite link copied.');
                                }}
                                className="bg-slate-900 hover:bg-slate-800 text-slate-200 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1 cursor-pointer transition-all"
                              >
                                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span>{isCopied ? 'Copied' : 'Copy link'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (platformSettings.invites || []).filter(i => i.id !== inv.id);
                                  commitPlatformSettings({
                                    ...platformSettings,
                                    invites: updated
                                  });
                                  showToast('Invite revoked.');
                                }}
                                className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-950/40 transition-colors cursor-pointer"
                                title="Revoke invite"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ================= TAB 1: PLANS & FEATURE TOGGLES ================= */}
          {activeTab === 'plans' && (
            <div className="space-y-5">
              
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
                    Current plan: <span className="text-sky-400 font-bold uppercase">{platformSettings.plans[activePlanTier].name}</span> (FJD ${platformSettings.plans[activePlanTier].price}/mo)
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
                  const p = platformSettings.plans[tier];
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
              
              {/* Global System Tax Variables */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>Tax defaults</span>
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Default VAT rate</label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        step="0.5"
                        value={platformSettings.defaultVatRate}
                        onChange={(e) => commitPlatformSettings({ ...platformSettings, defaultVatRate: Number(e.target.value) })}
                        className="w-20 bg-slate-900 border border-slate-800 rounded-lg py-1 px-2 text-xs font-mono font-bold text-sky-400"
                      />
                      <span className="text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Default currency</label>
                    <input
                      type="text"
                      value={platformSettings.defaultCurrency}
                      onChange={(e) => commitPlatformSettings({ ...platformSettings, defaultCurrency: e.target.value.toUpperCase() })}
                      className="w-20 bg-slate-900 border border-slate-800 rounded-lg py-1 px-2 text-xs font-mono font-bold text-slate-200 mt-1"
                    />
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-300 uppercase block">Require TIN</span>
                      <span className="text-[8.5px] text-slate-500">Require TIN on docs {'>'} $100</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => commitPlatformSettings({ ...platformSettings, enforceFRCSTIN: !platformSettings.enforceFRCSTIN })}
                      className={`p-1 ${platformSettings.enforceFRCSTIN ? 'text-emerald-400' : 'text-slate-600'}`}
                    >
                      {platformSettings.enforceFRCSTIN ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                  </div>
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
            <div className="space-y-4">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by business name or TIN"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Tenants Grid */}
              <div className="space-y-2">
                {tenants
                  .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.tin.includes(searchQuery))
                  .map((tenant) => (
                    <div
                      key={tenant.id}
                      className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-slate-700 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100">{tenant.name}</span>
                          <span className="text-[9px] bg-slate-800 text-sky-300 uppercase font-mono font-black px-2 py-0.5 rounded-md border border-slate-700">
                            {tenant.plan}
                          </span>
                          <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold ${
                            tenant.status === 'active' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                          }`}>
                            {tenant.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Owner: <span className="text-slate-300 font-medium">{tenant.owner}</span> • TIN: <span className="font-mono text-sky-400">{tenant.tin}</span> • {tenant.location}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <div className="text-right mr-2">
                          <span className="text-xs font-mono font-black text-slate-200 block">FJD ${tenant.mrr}/mo</span>
                          <span className="text-[9px] text-slate-500">{tenant.clientsCount} clients</span>
                        </div>

                        <select
                          value={tenant.plan}
                          onChange={(e) => {
                            const newPlan = e.target.value as PlanTier;
                            setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, plan: newPlan, mrr: platformSettings.plans[newPlan].price } : t));
                            if (tenant.id === 'ten-current') {
                              handleSwitchActivePlan(newPlan);
                            }
                          }}
                          className="bg-slate-950 border border-slate-800 rounded-lg py-1 px-2 text-[10px] text-slate-200"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="premium">Premium</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            onImpersonate(tenant.name, crmData);
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

            </div>
          )}

          {/* ================= TAB 4: BILLING & APPROVALS ================= */}
          {activeTab === 'billing' && (
            <div className="space-y-4">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Payments to check ({pendingPayments.length})
                  </h4>
                  <p className="text-[10px] text-slate-400">Check M-PAiSA references and BSP bank transfers before approving</p>
                </div>
              </div>

              {pendingPayments.length === 0 ? (
                <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                  <p className="text-xs font-bold text-slate-300">No payments to check</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Manual subscription payments will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingPayments.map((pay) => (
                    <div key={pay.id} className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100">{pay.tenantName}</span>
                          <span className="text-[9px] bg-emerald-950 text-emerald-400 font-mono font-bold px-2 py-0.5 rounded border border-emerald-800">
                            {pay.method}
                          </span>
                          <span className="text-[9px] bg-sky-950 text-sky-300 font-bold uppercase px-1.5 py-0.5 rounded">
                            {pay.plan} plan
                          </span>
                        </div>
                        <div className="text-[9.5px] text-slate-400 space-y-0.5 mt-1 font-mono">
                          <p>Reference: <span className="text-slate-200 font-bold">{pay.refCode}</span></p>
                          <p>Date: {pay.date}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span className="text-sm font-black text-slate-100 font-mono mr-2">FJD ${pay.amount.toFixed(2)}</span>
                        <button
                          onClick={() => handleRejectPayment(pay.id)}
                          className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 p-2 rounded-xl border border-rose-500/30 transition-all"
                          title="Reject"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleApprovePayment(pay.id)}
                          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Approve</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* ================= TAB 5: MRR ANALYTICS ================= */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Monthly recurring revenue</span>
                  <span className="text-xl font-black text-slate-100 font-mono mt-1 block">FJD ${totalSaasMRR}</span>
                  <span className="text-[9px] text-emerald-400 font-bold block mt-0.5">From subscriptions</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Active workspaces</span>
                  <span className="text-xl font-black text-slate-100 font-mono mt-1 block">{activeTenantsCount}</span>
                  <span className="text-[9px] text-sky-400 font-bold block mt-0.5">Workspaces in use</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Clients</span>
                  <span className="text-xl font-black text-slate-100 font-mono mt-1 block">
                    {tenants.reduce((acc, t) => acc + t.clientsCount, 0)}
                  </span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Across all workspaces</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">AI receipt scans</span>
                  <span className="text-xl font-black text-slate-100 font-mono mt-1 block">—</span>
                  <span className="text-[9px] text-rose-400 block mt-0.5">Not tracked yet</span>
                </div>
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
