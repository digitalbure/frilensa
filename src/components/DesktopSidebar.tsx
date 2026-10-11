import React, { useState, useRef, useEffect } from 'react';
import { inboxDocumentCount } from '../lib/inbox';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, Layers, Users, Briefcase, Settings, FolderKanban, Globe, Sparkles,
  Building2, Plus, ChevronDown, Check, LogOut, ShieldCheck, Calculator, ArrowUpRight, Zap,
  ShoppingBag, Clock, Camera, GraduationCap, Wrench, Palmtree, Edit2, Sliders
} from 'lucide-react';
import { CRMData, Business, VentureType } from '../types';
import { VENTURE_MODELS, ALL_VENTURE_TYPES, getVentureConfig } from '../lib/ventureModels';
import EditVentureModal from './EditVentureModal';

interface DesktopSidebarProps {
  activeTab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant';
  onChangeTab: (tab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant') => void;
  crmData: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onSignOut: () => void;
  onOpenAdminPanel?: () => void;
  onOpenQuickPulse?: () => void;
  onOpenFxCalc?: () => void;
}

export default function DesktopSidebar({
  activeTab,
  onChangeTab,
  crmData,
  onUpdateData,
  onSignOut,
  onOpenAdminPanel,
  onOpenQuickPulse,
  onOpenFxCalc
}: DesktopSidebarProps) {
  const [showBizDropdown, setShowBizDropdown] = useState(false);
  const [showAddBizModal, setShowAddBizModal] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside and escape to dismiss business dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(event.target as Node)) {
        setShowBizDropdown(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowBizDropdown(false);
      }
    };
    if (showBizDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showBizDropdown]);

  // New business form states
  const [newBizName, setNewBizName] = useState('');
  const [newBizType, setNewBizType] = useState<VentureType>('studio');
  const [newBizTin, setNewBizTin] = useState('');
  const [newBizCategory, setNewBizCategory] = useState('');
  const [newBizColor, setNewBizColor] = useState('#0284c7');

  const activeBusiness = crmData.businesses?.find(b => b.id === crmData.activeBusinessId) || crmData.businesses?.[0];
  const activeVentureConfig = getVentureConfig(activeBusiness?.type);

  const attentionCount = inboxDocumentCount(crmData);

  const pendingInvoicesCount = crmData.documents?.filter(
    d => d.type === 'invoice' && (d.status === 'sent' || d.status === 'partial') && d.businessId === crmData.activeBusinessId
  ).length || 0;

  const activeProjectsCount = crmData.projects?.filter(
    p => p.status === 'in_progress' && p.businessId === crmData.activeBusinessId
  ).length || 0;

  const navItems = [
    { id: 'dashboard' as const, label: 'Home', icon: LayoutDashboard, badge: attentionCount > 0 ? `${attentionCount} new` : undefined, badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    { id: 'billing' as const, label: 'Billing', icon: Layers, badge: pendingInvoicesCount > 0 ? `${pendingInvoicesCount} due` : undefined, badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    { id: 'clients' as const, label: 'Clients', icon: Users, badge: crmData.clients?.length ? `${crmData.clients.length}` : undefined, badgeColor: 'bg-slate-800 text-slate-300 border-slate-700' },
    { id: 'projects' as const, label: 'Projects', icon: FolderKanban, badge: activeProjectsCount > 0 ? `${activeProjectsCount}` : undefined, badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
    { id: 'services' as const, label: 'Finance', icon: Briefcase, badge: undefined },
    { id: 'directory' as const, label: 'Directory', icon: Globe, badge: undefined, badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    { id: 'assistant' as const, label: 'AI assistant', icon: Sparkles, badge: 'AI', badgeColor: 'bg-gradient-to-r from-amber-500/20 to-sky-500/20 text-amber-300 border-amber-500/30' },
    { id: 'settings' as const, label: 'Settings', icon: Settings, badge: undefined },
  ];

  const handleSelectBusiness = (bizId: string) => {
    onUpdateData({
      ...crmData,
      activeBusinessId: bizId
    });
    setShowBizDropdown(false);
  };

  const handleCreateBusiness = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBizName.trim()) return;

    const vConfig = getVentureConfig(newBizType);

    const newBiz: Business = {
      id: `biz-${Date.now()}`,
      name: newBizName.trim(),
      type: newBizType,
      saasAppCategory: newBizCategory || vConfig.defaultCategories[0] || 'General',
      tin: newBizTin.trim() || '10-00000-0-0',
      address: 'Suva, Fiji',
      email: crmData.userProfile?.email || 'business@example.com',
      phone: crmData.userProfile?.phone || '+679 000 0000',
      colorTheme: newBizColor,
      brandSlogan: vConfig.tagline,
      isPrimary: (crmData.businesses?.length || 0) === 0
    };

    onUpdateData({
      ...crmData,
      businesses: [...(crmData.businesses || []), newBiz],
      activeBusinessId: newBiz.id
    });

    setNewBizName('');
    setNewBizTin('');
    setNewBizCategory('');
    setShowAddBizModal(false);
    setShowBizDropdown(false);
  };

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col bg-slate-900 border-r border-slate-800/90 text-slate-300 h-screen select-none relative z-20">
      
      {/* Brand Header */}
      <div className="p-4 lg:p-5 border-b border-slate-800/90 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-teal-400 flex items-center justify-center text-white font-black text-sm shadow-md shadow-sky-500/20">
            F
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-base tracking-tight font-display">Frilensa</span>
              <span className="text-[8px] bg-sky-500/20 text-sky-300 font-extrabold px-1.5 py-0.5 rounded border border-sky-400/30 uppercase tracking-widest font-mono">
                PRO
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Synced</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenQuickPulse}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer border border-slate-700/60"
          title="Recent activity"
        >
          <Zap className="w-4 h-4" />
        </button>
      </div>

      {/* Business Workspace Switcher */}
      <div className="p-3 lg:p-4 border-b border-slate-800/80 shrink-0 relative" ref={workspaceDropdownRef}>
        <div className="flex items-center justify-between px-2 mb-1.5">
          <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
            Business
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (activeBusiness) {
                  setEditingBusiness(activeBusiness);
                  setShowBizDropdown(false);
                }
              }}
              className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-0.5 cursor-pointer transition-colors"
              title="Edit business profile"
            >
              <Edit2 className="w-2.5 h-2.5" />
              <span>Edit profile</span>
            </button>
            <span className="text-[8.5px] font-semibold text-slate-500">
              • {crmData.businesses?.length || 1} businesses
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowBizDropdown(!showBizDropdown)}
          className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div 
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-inner"
              style={{ backgroundColor: activeBusiness?.colorTheme || '#0284c7' }}
            >
              {activeBusiness?.name?.charAt(0) || 'B'}
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white truncate group-hover:text-sky-300 transition-colors">
                {activeBusiness?.name || 'My Business'}
              </h4>
              <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span>{activeVentureConfig.shortLabel}</span>
                {activeBusiness?.saasAppCategory && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400">{activeBusiness.saasAppCategory}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${showBizDropdown ? 'rotate-180 text-sky-400' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        <AnimatePresence>
          {showBizDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute left-3 right-3 top-full mt-1.5 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-2 z-50 space-y-1 ring-1 ring-black/60 backdrop-blur-md"
            >
              <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Switch business</span>
              </div>
              
              <div className="max-h-56 overflow-y-auto space-y-1 scrollbar-none">
                {crmData.businesses?.map((biz) => {
                  const bConfig = getVentureConfig(biz.type);
                  const isSelected = biz.id === crmData.activeBusinessId;

                  return (
                    <div
                      key={biz.id}
                      className={`group w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors ${
                        isSelected 
                          ? 'bg-sky-600 text-white font-bold' 
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectBusiness(biz.id)}
                        className="flex items-center gap-2 truncate min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0" 
                          style={{ backgroundColor: biz.colorTheme || '#0284c7' }} 
                        />
                        <div className="truncate">
                          <span className="truncate block">{biz.name}</span>
                          <span className={`text-[9px] block ${isSelected ? 'text-sky-100 font-normal' : 'text-slate-500'}`}>
                            {bConfig.shortLabel} {biz.tin ? `• ${biz.tin}` : ''}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0 ml-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBusiness(biz);
                            setShowBizDropdown(false);
                          }}
                          className={`p-1 rounded-md transition-colors cursor-pointer ${
                            isSelected 
                              ? 'text-white/80 hover:text-white hover:bg-sky-700' 
                              : 'text-slate-400 hover:text-sky-300 hover:bg-slate-700'
                          }`}
                          title={`Edit ${biz.name}`}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-white shrink-0 ml-0.5" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBizModal(true);
                    setShowBizDropdown(false);
                  }}
                  className="flex-1 flex items-center gap-1.5 p-2 rounded-xl text-xs font-bold text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer truncate"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Add business</span>
                </button>

                {activeBusiness && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBusiness(activeBusiness);
                      setShowBizDropdown(false);
                    }}
                    className="flex items-center gap-1 p-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                    title="Edit business profile"
                  >
                    <Sliders className="w-3.5 h-3.5 text-sky-400" />
                    <span>Edit profile</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-none" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all relative group cursor-pointer ${
                isActive
                  ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                }`} />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge && (
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border shrink-0 ${
                  isActive ? 'bg-white/20 text-white border-white/30' : (item.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700')
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Launch & Tools Bar */}
      <div className="p-3 border-t border-slate-800/80 space-y-2 shrink-0">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChangeTab('billing')}
            className="flex-1 bg-gradient-to-r from-sky-600 to-teal-500 hover:from-sky-500 hover:to-teal-400 text-white font-bold py-2 px-2.5 rounded-xl text-[10.5px] flex items-center justify-center gap-1.5 transition-all shadow-md shadow-sky-500/10 cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New invoice</span>
          </button>

          <button
            type="button"
            onClick={onOpenFxCalc}
            title="Currency converter"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-sky-300 border border-slate-700/60 transition-colors cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
          </button>
        </div>

        {/* Super Admin Panel Access */}
        {onOpenAdminPanel && (
          <button
            type="button"
            onClick={onOpenAdminPanel}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-[10px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Admin
            </span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* User Profile & Sign Out Footer */}
      <div className="p-3 lg:p-4 bg-slate-950/60 border-t border-slate-800/90 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-sky-400 shrink-0 shadow-inner">
            {crmData.userProfile?.name?.charAt(0) || 'U'}
          </div>
          <div className="min-w-0">
            <h5 className="text-xs font-bold text-slate-200 truncate">
              {crmData.userProfile?.name || 'Your account'}
            </h5>
            <p className="text-[9.5px] text-slate-400 truncate">
              {crmData.userProfile?.email || 'Signed in'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          title="Sign out"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Add New Business Modal */}
      <AnimatePresence>
        {showAddBizModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-700 text-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Add a business</h3>
                    <p className="text-[10px] text-slate-400">Keep a separate business or brand in its own workspace</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddBizModal(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateBusiness} className="space-y-3.5">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                    Business name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Suva Digital Studio"
                    value={newBizName}
                    onChange={(e) => setNewBizName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold text-slate-300 block mb-1.5">
                    Business type
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {ALL_VENTURE_TYPES.map((vType) => {
                      const cfg = VENTURE_MODELS[vType];
                      const isSelected = newBizType === vType;
                      return (
                        <button
                          key={vType}
                          type="button"
                          onClick={() => {
                            setNewBizType(vType);
                            setNewBizCategory(cfg.defaultCategories[0] || '');
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-sky-500/15 border-sky-500 text-white ring-1 ring-sky-500'
                              : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs">{cfg.shortLabel}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                          </div>
                          <p className="text-[9.5px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                            {cfg.tagline}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                      Category
                    </label>
                    <select
                      value={newBizCategory || VENTURE_MODELS[newBizType]?.defaultCategories[0] || ''}
                      onChange={(e) => setNewBizCategory(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                    >
                      {VENTURE_MODELS[newBizType]?.defaultCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                      TIN (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 50-99812-0-0"
                      value={newBizTin}
                      onChange={(e) => setNewBizTin(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                    Brand colour
                  </label>
                  <div className="flex items-center gap-2">
                    {['#0284c7', '#059669', '#d97706', '#7c3aed', '#db2777', '#2563eb'].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewBizColor(c)}
                        className={`w-7 h-7 rounded-lg transition-transform ${newBizColor === c ? 'scale-115 ring-2 ring-white shadow-md' : 'opacity-80 hover:opacity-100'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddBizModal(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 rounded-xl text-xs cursor-pointer shadow-md"
                  >
                    Add business
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Edit Venture Profile & Entity Modal */}
        {editingBusiness && (
          <EditVentureModal
            business={editingBusiness}
            onSave={(updatedBiz) => {
              const updatedList = (crmData.businesses || []).map(b => b.id === updatedBiz.id ? updatedBiz : b);
              onUpdateData({
                ...crmData,
                businesses: updatedList
              });
              setEditingBusiness(null);
            }}
            onClose={() => setEditingBusiness(null)}
          />
        )}
      </AnimatePresence>
    </aside>
  );
}
