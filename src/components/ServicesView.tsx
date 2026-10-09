import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Briefcase, Plus, Search, DollarSign, Tag, Edit3, Trash2, X, AlertCircle, HelpCircle,
  Clapperboard, Code, Scale, Wrench, Hammer, Sparkles, Compass, Check, Layers,
  ArrowRight, Download, Filter, CheckCircle2, ShieldCheck, Box, RefreshCw,
  TrendingUp, FileText, Table, Grid, BarChart3, Clock, Percent, Shield, Copy
} from 'lucide-react';
import { CRMData, ProductService, ActivityLog } from '../types';
import { INDUSTRY_PRESETS, getIndustryPreset, IndustryPreset } from '../lib/industryPresets';
import { getCurrencyConfig } from '../lib/currencies';
import RateSheetModal from './RateSheetModal';
import BulkRateAdjustModal from './BulkRateAdjustModal';

interface ServicesViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
}

const ITEM_TYPES = [
  { id: 'service', label: 'Service / Consulting', icon: Briefcase, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'labor', label: 'Labor / Technical Work', icon: Wrench, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'parts', label: 'Parts & Materials', icon: Box, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'equipment_rental', label: 'Equipment Rental', icon: Clapperboard, color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'consultation', label: 'Advisory / Consultation', icon: Scale, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'retainer', label: 'Retainer / Subscription', icon: Layers, color: 'bg-sky-50 text-sky-700 border-sky-200' }
];

export default function ServicesView({ data, onUpdateData }: ServicesViewProps) {
  const [activeTab, setActiveTab] = useState<'catalogue' | 'matrix' | 'margins' | 'packs'>('catalogue');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndustryFilter, setSelectedIndustryFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showRateSheetModal, setShowRateSheetModal] = useState(false);
  const [showBulkAdjustModal, setShowBulkAdjustModal] = useState(false);
  const [presetToImport, setPresetToImport] = useState<IndustryPreset | null>(null);
  const [selectedPresetServices, setSelectedPresetServices] = useState<number[]>([]);
  const [editingService, setEditingService] = useState<ProductService | null>(null);
  const [importSuccessToast, setImportSuccessToast] = useState<string | null>(null);

  // Form states for Add / Edit
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState<number>(100);
  const [costPrice, setCostPrice] = useState<number>(40);
  const [unit, setUnit] = useState('Hour');
  const [customUnit, setCustomUnit] = useState('');
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [itemType, setItemType] = useState<string>('service');
  const [category, setCategory] = useState('');
  const [industryId, setIndustryId] = useState<string>('general_consulting');
  const [srvType, setSrvType] = useState<'service' | 'saas'>('service');
  const [billingInterval, setBillingInterval] = useState<'one-time' | 'monthly' | 'annual'>('one-time');
  const [businessId, setBusinessId] = useState(data.activeBusinessId || data.businesses[0]?.id || '');
  
  // Rate Tier Variants
  const [rushRate, setRushRate] = useState<number | undefined>(undefined);
  const [weekendRate, setWeekendRate] = useState<number | undefined>(undefined);
  const [retainerRate, setRetainerRate] = useState<number | undefined>(undefined);
  const [minQuantity, setMinQuantity] = useState<number>(1);
  const [stockQuantity, setStockQuantity] = useState<number | undefined>(undefined);
  const [isTaxable, setIsTaxable] = useState<boolean>(true);
  const [tagsInput, setTagsInput] = useState<string>('');

  const activeBusiness = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const currencyConfig = getCurrencyConfig(data.userProfile.defaultCurrency || 'FJD');

  // Categories list
  const allCategories = useMemo(() => {
    return Array.from(new Set(data.services.map(s => s.category || 'General Services'))).filter(Boolean);
  }, [data.services]);

  // Key KPI metrics for rates and catalogue
  const metrics = useMemo(() => {
    const totalItems = data.services.length;
    const activeItems = data.services.filter(s => s.isActive !== false).length;
    const avgRate = totalItems > 0 ? data.services.reduce((acc, s) => acc + s.rate, 0) / totalItems : 0;
    
    // Inventory value (stock * cost)
    const stockVal = data.services.reduce((acc, s) => {
      if (s.stockQuantity && s.costPrice) {
        return acc + (s.stockQuantity * s.costPrice);
      }
      return acc;
    }, 0);

    // Margins
    const itemsWithCost = data.services.filter(s => s.costPrice && s.costPrice > 0);
    const avgMargin = itemsWithCost.length > 0 
      ? itemsWithCost.reduce((acc, s) => acc + (((s.rate - (s.costPrice || 0)) / s.rate) * 100), 0) / itemsWithCost.length
      : 0;

    return { totalItems, activeItems, avgRate, stockVal, avgMargin };
  }, [data.services]);

  // Filter services
  const filteredServices = useMemo(() => {
    return data.services.filter(srv => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        srv.name.toLowerCase().includes(q) ||
        (srv.description && srv.description.toLowerCase().includes(q)) ||
        (srv.sku && srv.sku.toLowerCase().includes(q)) ||
        srv.unit.toLowerCase().includes(q) ||
        (srv.category && srv.category.toLowerCase().includes(q)) ||
        (srv.tags && srv.tags.some(t => t.toLowerCase().includes(q)));

      const matchesIndustry = selectedIndustryFilter === 'all' || srv.industryId === selectedIndustryFilter;
      const matchesType = selectedTypeFilter === 'all' || 
        (selectedTypeFilter === 'saas' ? srv.type === 'saas' : srv.itemType === selectedTypeFilter);
      const matchesCategory = selectedCategoryFilter === 'all' || (srv.category || 'General Services') === selectedCategoryFilter;

      return matchesSearch && matchesIndustry && matchesType && matchesCategory;
    });
  }, [data.services, searchQuery, selectedIndustryFilter, selectedTypeFilter, selectedCategoryFilter]);

  const handleOpenAdd = () => {
    setEditingService(null);
    setName('');
    setSku(`SKU-${Math.floor(1000 + Math.random() * 9000)}`);
    setDescription('');
    setRate(120);
    setCostPrice(45);
    setUnit('Hour');
    setIsCustomUnit(false);
    setCustomUnit('');
    setItemType('service');
    setCategory('');
    setIndustryId('general_consulting');
    setSrvType('service');
    setBillingInterval('one-time');
    setBusinessId(data.activeBusinessId || data.businesses[0]?.id || '');
    setRushRate(180);
    setWeekendRate(200);
    setRetainerRate(100);
    setMinQuantity(1);
    setStockQuantity(undefined);
    setIsTaxable(true);
    setTagsInput('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (srv: ProductService) => {
    setEditingService(srv);
    setName(srv.name);
    setSku(srv.sku || '');
    setDescription(srv.description);
    setRate(srv.rate);
    setCostPrice(srv.costPrice || 0);
    
    // Check preset units
    const currentPreset = getIndustryPreset(srv.industryId);
    const inPreset = currentPreset.defaultUnits.includes(srv.unit);
    if (inPreset) {
      setUnit(srv.unit);
      setIsCustomUnit(false);
      setCustomUnit('');
    } else {
      setUnit('custom');
      setIsCustomUnit(true);
      setCustomUnit(srv.unit);
    }

    setItemType(srv.itemType || (srv.type === 'saas' ? 'retainer' : 'service'));
    setCategory(srv.category || '');
    setIndustryId(srv.industryId || 'general_consulting');
    setSrvType(srv.type || 'service');
    setBillingInterval(srv.billingInterval || 'one-time');
    setBusinessId(srv.businessId || data.activeBusinessId || data.businesses[0]?.id || '');
    setRushRate(srv.rushRate);
    setWeekendRate(srv.weekendRate);
    setRetainerRate(srv.retainerRate);
    setMinQuantity(srv.minQuantity || 1);
    setStockQuantity(srv.stockQuantity);
    setIsTaxable(srv.isTaxable !== false);
    setTagsInput(srv.tags ? srv.tags.join(', ') : '');
    setShowAddModal(true);
  };

  const handleDeleteService = (id: string) => {
    const target = data.services.find(s => s.id === id);
    if (confirm(`Are you sure you want to delete "${target?.name || 'this item'}" from your catalog?`)) {
      const updatedServices = data.services.filter(s => s.id !== id);
      
      const newLog: ActivityLog = {
        id: `act-del-srv-${Date.now()}`,
        type: 'rate_updated',
        title: `Item Removed: ${target?.name || 'Service'}`,
        description: `Removed catalogue item #${target?.sku || id} (${currencyConfig.symbol}${target?.rate.toFixed(2)}/${target?.unit}).`,
        timestamp: new Date().toISOString(),
        entityType: 'service',
        entityId: id,
        badgeColor: 'amber'
      };

      onUpdateData({
        ...data,
        services: updatedServices,
        activityLogs: [newLog, ...(data.activityLogs || [])]
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || rate <= 0) return;

    const finalUnit = isCustomUnit && customUnit.trim() ? customUnit.trim() : unit;
    const parsedTags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : undefined;

    if (editingService) {
      // Update
      const updatedServices = data.services.map(s => 
        s.id === editingService.id 
          ? { 
              ...s, 
              name: name.trim(),
              sku: sku.trim() || undefined,
              description: description.trim(), 
              rate: Number(rate), 
              costPrice: costPrice > 0 ? Number(costPrice) : undefined,
              unit: finalUnit, 
              type: srvType, 
              billingInterval, 
              businessId,
              category: category.trim() || undefined,
              itemType: itemType as any,
              industryId,
              rushRate: rushRate && rushRate > 0 ? Number(rushRate) : undefined,
              weekendRate: weekendRate && weekendRate > 0 ? Number(weekendRate) : undefined,
              retainerRate: retainerRate && retainerRate > 0 ? Number(retainerRate) : undefined,
              minQuantity: Number(minQuantity) || 1,
              stockQuantity: stockQuantity !== undefined && stockQuantity >= 0 ? Number(stockQuantity) : undefined,
              isTaxable,
              tags: parsedTags,
              isActive: true
            }
          : s
      );

      const newLog: ActivityLog = {
        id: `act-edit-srv-${Date.now()}`,
        type: 'rate_updated',
        title: `Catalogue Rate Updated: ${name.trim()}`,
        description: `Updated rates & terms for ${name.trim()} to ${currencyConfig.symbol}${Number(rate).toFixed(2)}/${finalUnit}.`,
        timestamp: new Date().toISOString(),
        entityType: 'service',
        entityId: editingService.id,
        amount: Number(rate),
        currency: currencyConfig.code,
        badgeColor: 'amber'
      };

      onUpdateData({
        ...data,
        services: updatedServices,
        activityLogs: [newLog, ...(data.activityLogs || [])]
      });
    } else {
      // Create
      const newService: ProductService = {
        id: `srv-${Date.now()}`,
        name: name.trim(),
        sku: sku.trim() || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
        description: description.trim(),
        rate: Number(rate),
        costPrice: costPrice > 0 ? Number(costPrice) : undefined,
        unit: finalUnit,
        type: srvType,
        billingInterval,
        businessId,
        category: category.trim() || undefined,
        itemType: itemType as any,
        industryId,
        rushRate: rushRate && rushRate > 0 ? Number(rushRate) : undefined,
        weekendRate: weekendRate && weekendRate > 0 ? Number(weekendRate) : undefined,
        retainerRate: retainerRate && retainerRate > 0 ? Number(retainerRate) : undefined,
        minQuantity: Number(minQuantity) || 1,
        stockQuantity: stockQuantity !== undefined && stockQuantity >= 0 ? Number(stockQuantity) : undefined,
        isTaxable,
        tags: parsedTags,
        isActive: true
      };

      const newLog: ActivityLog = {
        id: `act-new-srv-${Date.now()}`,
        type: 'service_created',
        title: `New Item Added: ${name.trim()}`,
        description: `Added new catalogue item #${newService.sku} at ${currencyConfig.symbol}${Number(rate).toFixed(2)}/${finalUnit}.`,
        timestamp: new Date().toISOString(),
        entityType: 'service',
        entityId: newService.id,
        amount: Number(rate),
        currency: currencyConfig.code,
        badgeColor: 'amber'
      };

      onUpdateData({
        ...data,
        services: [...data.services, newService],
        activityLogs: [newLog, ...(data.activityLogs || [])]
      });
    }

    setShowAddModal(false);
  };

  // Open preset importer modal
  const handleOpenPresetModal = (preset: IndustryPreset) => {
    setPresetToImport(preset);
    setSelectedPresetServices(preset.sampleServices.map((_, idx) => idx));
    setShowPresetModal(true);
  };

  const handleImportPresetServices = () => {
    if (!presetToImport) return;

    const targetBizId = data.activeBusinessId || data.businesses[0]?.id || '';
    const newItems: ProductService[] = presetToImport.sampleServices
      .filter((_, idx) => selectedPresetServices.includes(idx))
      .map((item, idx) => ({
        ...item,
        id: `srv-${Date.now()}-${idx}`,
        sku: `IMP-${presetToImport.id.slice(0, 3).toUpperCase()}-${Math.floor(100 + idx)}`,
        businessId: targetBizId,
        industryId: presetToImport.id,
        costPrice: Math.round(item.rate * 0.45 * 100) / 100,
        rushRate: Math.round(item.rate * 1.5 * 100) / 100,
        weekendRate: Math.round(item.rate * 1.75 * 100) / 100,
        retainerRate: Math.round(item.rate * 0.85 * 100) / 100,
        isTaxable: true,
        isActive: true
      }));

    const newLog: ActivityLog = {
      id: `act-import-pack-${Date.now()}`,
      type: 'rate_updated',
      title: `Industry Pack Imported: ${presetToImport.name}`,
      description: `Imported ${newItems.length} professional catalog rate items into venture '${activeBusiness.name}'.`,
      timestamp: new Date().toISOString(),
      entityType: 'service',
      badgeColor: 'amber'
    };

    onUpdateData({
      ...data,
      services: [...data.services, ...newItems],
      activityLogs: [newLog, ...(data.activityLogs || [])]
    });

    setShowPresetModal(false);
    setImportSuccessToast(`Imported ${newItems.length} catalog items from ${presetToImport.name}!`);
    setTimeout(() => setImportSuccessToast(null), 4000);
  };

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'Clapperboard': return <Clapperboard className="w-4 h-4" />;
      case 'Code': return <Code className="w-4 h-4" />;
      case 'Scale': return <Scale className="w-4 h-4" />;
      case 'Wrench': return <Wrench className="w-4 h-4" />;
      case 'Hammer': return <Hammer className="w-4 h-4" />;
      case 'Sparkles': return <Sparkles className="w-4 h-4" />;
      default: return <Briefcase className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto pb-28 font-sans select-none">
      
      {/* Top Header with Module Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold block">
              Pacific Commercial Suite
            </span>
            <span className="bg-sky-50 text-sky-700 border border-sky-200/80 text-[8.5px] font-extrabold px-2 py-0.2 rounded-full uppercase flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5" /> Rate Protection & Margins
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
            <Briefcase className="w-5 h-5 text-sky-600" />
            <span>Products, Services & Rates Catalogue</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Centralized catalogue management: SKU tracking, multi-tier pricing (Rush, Weekend, VIP Retainer), unit cost margins & instant client rate card generation.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => setShowRateSheetModal(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 border border-slate-200 transition-all shadow-2xs cursor-pointer"
            title="Generate exportable client rate card"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Rate Sheet</span>
          </button>

          <button
            onClick={() => setShowBulkAdjustModal(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 border border-slate-200 transition-all shadow-2xs cursor-pointer"
            title="Bulk adjust prices by percentage or margin"
          >
            <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
            <span>Bulk Rates</span>
          </button>

          <button
            onClick={() => handleOpenPresetModal(INDUSTRY_PRESETS[0])}
            className="bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 border border-sky-200 transition-all active:scale-95 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Packs</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs space-y-0.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Catalogue Items</span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-slate-900 font-mono">{metrics.totalItems}</span>
            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
              {metrics.activeItems} Active
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs space-y-0.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Average Rate</span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-slate-900 font-mono">
              {currencyConfig.symbol} {metrics.avgRate.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">per unit</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs space-y-0.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Average Profit Margin</span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-emerald-700 font-mono">
              {metrics.avgMargin > 0 ? `${metrics.avgMargin.toFixed(1)}%` : 'N/A'}
            </span>
            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
              Gross
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs space-y-0.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Inventory Stock</span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-slate-900 font-mono">
              {currencyConfig.symbol} {metrics.stockVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-sky-600 font-semibold bg-sky-50 px-1.5 py-0.2 rounded border border-sky-100">
              Valuation
            </span>
          </div>
        </div>
      </div>

      {/* Module Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {[
            { id: 'catalogue', label: 'Catalogue Directory', icon: Grid },
            { id: 'matrix', label: 'Multi-Tier Rates Matrix', icon: Layers },
            { id: 'margins', label: 'Cost & Profit Margins', icon: BarChart3 },
            { id: 'packs', label: 'Industry Packs', icon: Download }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'catalogue' && (
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
              title="Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
              title="Table View"
            >
              <Table className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-2.5 text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items, SKU code, service name, labor, equipment or unit..."
            className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs font-sans text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            <option value="all">All Categories ({data.services.length})</option>
            {allCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            <option value="all">All Item Types</option>
            {ITEM_TYPES.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          <select
            value={selectedIndustryFilter}
            onChange={(e) => setSelectedIndustryFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            <option value="all">All Industry Sectors</option>
            {INDUSTRY_PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: CATALOGUE DIRECTORY (Cards or Table) */}
      {activeTab === 'catalogue' && (
        <>
          {filteredServices.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-3xl p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto border border-sky-100">
                <Briefcase className="w-6 h-6" />
              </div>
              <div className="max-w-sm mx-auto space-y-1">
                <h3 className="text-sm font-bold text-slate-800">No Services or Products Found</h3>
                <p className="text-xs text-slate-500">
                  {searchQuery || selectedCategoryFilter !== 'all' || selectedTypeFilter !== 'all'
                    ? 'No catalogue items matched your filter criteria.'
                    : 'Start your catalogue with pre-configured industry rates or create a custom service.'}
                </p>
              </div>
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => handleOpenPresetModal(INDUSTRY_PRESETS[0])}
                  className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  Browse Industry Packs
                </button>
                <button
                  onClick={handleOpenAdd}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2 px-4 rounded-xl transition-all cursor-pointer"
                >
                  Create Custom Service
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredServices.map((srv) => {
                const associatedBiz = data.businesses.find(b => b.id === srv.businessId);
                const itemTypeMeta = ITEM_TYPES.find(t => t.id === srv.itemType) || ITEM_TYPES[0];
                const profit = srv.costPrice ? srv.rate - srv.costPrice : null;
                const margin = profit && srv.rate > 0 ? (profit / srv.rate) * 100 : null;

                return (
                  <div
                    key={srv.id}
                    className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 hover:shadow-sm transition-all group"
                  >
                    <div>
                      {/* Top Badges & Actions */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[8.5px] font-bold uppercase px-2 py-0.5 rounded-md border tracking-wider shrink-0 ${itemTypeMeta.color}`}>
                              {itemTypeMeta.label}
                            </span>
                            {srv.sku && (
                              <span className="bg-slate-100 text-slate-600 text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-200">
                                {srv.sku}
                              </span>
                            )}
                          </div>

                          <h3 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-sky-700 transition-colors">
                            {srv.name}
                          </h3>
                        </div>

                        <div className="flex space-x-1 shrink-0">
                          <button
                            onClick={() => handleOpenEdit(srv)}
                            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                            title="Edit Item"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteService(srv.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                        {srv.description || 'Standard catalogue item without extra scope description.'}
                      </p>

                      {/* Multi-tier pricing preview pills */}
                      {(srv.rushRate || srv.weekendRate || srv.retainerRate) && (
                        <div className="flex items-center gap-1 flex-wrap mt-2.5 pt-2 border-t border-slate-100 text-[9.5px]">
                          {srv.rushRate && (
                            <span className="bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded font-mono">
                              ⚡ Rush: ${srv.rushRate.toFixed(2)}
                            </span>
                          )}
                          {srv.weekendRate && (
                            <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.2 rounded font-mono">
                              🌙 Wknd: ${srv.weekendRate.toFixed(2)}
                            </span>
                          )}
                          {srv.retainerRate && (
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded font-mono">
                              💎 VIP: ${srv.retainerRate.toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer Rate and Cost/Margin */}
                    <div className="mt-3.5 pt-2.5 border-t border-slate-100 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[10px] text-slate-400 font-semibold">{currencyConfig.code}</span>
                          <span className="text-base font-extrabold text-slate-900 font-mono">
                            {currencyConfig.symbol} {srv.rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-slate-400">/ {srv.unit}</span>
                        </div>

                        {margin !== null && (
                          <span className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border font-mono ${
                            margin >= 50 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            margin >= 25 ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {margin.toFixed(0)}% Margin
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{srv.category || 'General'}</span>
                        {srv.stockQuantity !== undefined && (
                          <span className="font-mono text-slate-600 font-semibold">
                            Stock: {srv.stockQuantity} units
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Item & SKU</th>
                      <th className="py-3 px-3">Classification</th>
                      <th className="py-3 px-3 text-right">Base Rate</th>
                      <th className="py-3 px-3 text-right">Cost Price</th>
                      <th className="py-3 px-3 text-right">Margin %</th>
                      <th className="py-3 px-3 text-right">Rush / Wknd</th>
                      <th className="py-3 px-3 text-right">Stock</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredServices.map((srv) => {
                      const itemTypeMeta = ITEM_TYPES.find(t => t.id === srv.itemType) || ITEM_TYPES[0];
                      const profit = srv.costPrice ? srv.rate - srv.costPrice : null;
                      const margin = profit && srv.rate > 0 ? (profit / srv.rate) * 100 : null;

                      return (
                        <tr key={srv.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{srv.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{srv.sku || 'No SKU'} • {srv.category || 'General'}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`text-[8.5px] font-bold uppercase px-2 py-0.5 rounded-md border tracking-wider ${itemTypeMeta.color}`}>
                              {itemTypeMeta.label}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            ${srv.rate.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">/{srv.unit}</span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            {srv.costPrice ? `$${srv.costPrice.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {margin !== null ? (
                              <span className={`font-bold ${margin >= 40 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                {margin.toFixed(1)}%
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[10.5px]">
                            {srv.rushRate ? `$${srv.rushRate.toFixed(0)}` : '—'} / {srv.weekendRate ? `$${srv.weekendRate.toFixed(0)}` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {srv.stockQuantity !== undefined ? srv.stockQuantity : 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEdit(srv)}
                                className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteService(srv.id)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: MULTI-TIER RATES MATRIX */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span>Multi-Tier Pricing Matrix</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Compare Base Standard vs Rush/Urgent, Weekend/After-Hours, and Retainer/VIP client rates.
                </p>
              </div>
              <button
                onClick={() => setShowBulkAdjustModal(true)}
                className="text-xs bg-slate-900 text-white font-semibold py-1.5 px-3 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Adjust Tier Rates</span>
              </button>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Service / Deliverable</th>
                    <th className="py-2.5 px-3 text-right">Base Standard</th>
                    <th className="py-2.5 px-3 text-right text-amber-700 bg-amber-50/50">⚡ Urgent / Rush</th>
                    <th className="py-2.5 px-3 text-right text-indigo-700 bg-indigo-50/50">🌙 Weekend / After-Hrs</th>
                    <th className="py-2.5 px-3 text-right text-emerald-700 bg-emerald-50/50">💎 VIP Retainer</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredServices.map((srv) => (
                    <tr key={srv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{srv.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{srv.sku || 'No SKU'} • per {srv.unit}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        ${srv.rate.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-800 bg-amber-50/30">
                        {srv.rushRate ? `$${srv.rushRate.toFixed(2)}` : (
                          <span className="text-slate-300 font-normal text-[10px]">None set</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-800 bg-indigo-50/30">
                        {srv.weekendRate ? `$${srv.weekendRate.toFixed(2)}` : (
                          <span className="text-slate-300 font-normal text-[10px]">None set</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/30">
                        {srv.retainerRate ? `$${srv.retainerRate.toFixed(2)}` : (
                          <span className="text-slate-300 font-normal text-[10px]">None set</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleOpenEdit(srv)}
                          className="text-[10.5px] font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
                        >
                          Edit Tiers
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COST & PROFIT MARGINS */}
      {activeTab === 'margins' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  <span>Cost, Markup & Profit Margins</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Analyze internal unit delivery cost vs client selling price and net margin return.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Catalogue Deliverable</th>
                    <th className="py-2.5 px-3 text-right">Internal Cost</th>
                    <th className="py-2.5 px-3 text-right">Client Selling Rate</th>
                    <th className="py-2.5 px-3 text-right text-emerald-700">Profit / Unit</th>
                    <th className="py-2.5 px-3 text-right">Markup %</th>
                    <th className="py-2.5 px-3 text-right">Gross Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredServices.map((srv) => {
                    const cost = srv.costPrice || 0;
                    const profit = srv.rate - cost;
                    const markup = cost > 0 ? (profit / cost) * 100 : 0;
                    const margin = srv.rate > 0 ? (profit / srv.rate) * 100 : 0;

                    return (
                      <tr key={srv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{srv.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{srv.sku || 'No SKU'} • per {srv.unit}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          ${cost.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          ${srv.rate.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                          +${profit.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {cost > 0 ? `${markup.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className={`font-bold px-1.5 py-0.2 rounded border ${
                            margin >= 50 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            margin >= 25 ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {margin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: INDUSTRY PACKS PRESETS */}
      {activeTab === 'packs' && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200/90 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span>Pre-Configured Pacific & Global Industry Rate Packs</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Select an industry preset pack below to preview standard market rates, units, and 1-click import into your catalogue.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {INDUSTRY_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-sky-300 hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-xl bg-sky-50 text-sky-700 border border-sky-100">
                        {getPresetIcon(preset.iconName)}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 font-mono">
                        {preset.sampleServices.length} items
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{preset.name}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{preset.tagline}</p>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{preset.badge}</span>
                    <button
                      onClick={() => handleOpenPresetModal(preset)}
                      className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1.5 px-3 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Preview Pack</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Service Modal Overlay */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.97, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-2xl border border-slate-200 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-sky-600" /> 
                    {editingService ? 'Edit Catalogue Item & Rates' : 'Add New Catalogue Product / Service'}
                  </h3>
                  <p className="text-xs text-slate-400">Configure base price, SKU, cost margin & multi-tier rush rates.</p>
                </div>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                {/* 2-Column: Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Item / Service Name *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Director of Photography (DP) Day Rate"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">SKU / Product Code</label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="e.g. FLM-DP-01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Classification & Venture */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Classification *</label>
                    <select
                      value={itemType}
                      onChange={(e) => {
                        setItemType(e.target.value);
                        if (e.target.value === 'retainer') {
                          setSrvType('saas');
                          setBillingInterval('monthly');
                        } else {
                          setSrvType('service');
                          setBillingInterval('one-time');
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                    >
                      {ITEM_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Associated Venture *</label>
                    <select
                      value={businessId}
                      onChange={(e) => setBusinessId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                    >
                      {data.businesses.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category Tag</label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="e.g. Camera & Lighting, Web Engineering"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Scope Description */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scope Deliverables Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detailed scope of service, deliverables, kit included, or warranty terms..."
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                {/* Base Selling Rate, Cost Price & Unit */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-sky-600" />
                    <span>Base Rates & Internal Costing</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Selling Rate ({currencyConfig.code}) *
                      </label>
                      <input
                        type="number"
                        required
                        min={0.01}
                        step="any"
                        value={rate}
                        onChange={(e) => setRate(Number(e.target.value))}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Internal Cost Price ({currencyConfig.code})
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={costPrice}
                        onChange={(e) => setCostPrice(Number(e.target.value))}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Billing Unit *</label>
                      <select
                        value={isCustomUnit ? 'custom' : unit}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setIsCustomUnit(true);
                          } else {
                            setIsCustomUnit(false);
                            setUnit(e.target.value);
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                      >
                        <option value="Hour">Hour</option>
                        <option value="Day">Day</option>
                        <option value="Flat Fee">Flat Fee</option>
                        <option value="Project">Project</option>
                        <option value="Month">Month</option>
                        <option value="Shoot Day">Shoot Day</option>
                        <option value="Sprint">Sprint</option>
                        <option value="Item">Item</option>
                        <option value="custom">+ Custom Unit...</option>
                      </select>
                    </div>
                  </div>

                  {isCustomUnit && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Custom Unit Name</label>
                      <input
                        type="text"
                        required
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="e.g. Kilometre, Tonne, Screen"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800"
                      />
                    </div>
                  )}

                  {/* Live Profit Preview */}
                  {rate > 0 && costPrice > 0 && (
                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        Net Profit: <strong className="text-emerald-700 font-mono">+${(rate - costPrice).toFixed(2)}</strong> / unit
                      </span>
                      <span className="font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {(((rate - costPrice) / rate) * 100).toFixed(1)}% Margin
                      </span>
                    </div>
                  )}
                </div>

                {/* Multi-Tier Variant Rates (Rush, Weekend, Retainer) */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                    <span>Multi-Tier Rate Variants</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        ⚡ Rush / Urgent Rate ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={rushRate || ''}
                        onChange={(e) => setRushRate(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 180.00"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        🌙 Weekend / After-Hours ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={weekendRate || ''}
                        onChange={(e) => setWeekendRate(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 210.00"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        💎 Retainer / VIP Rate ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={retainerRate || ''}
                        onChange={(e) => setRetainerRate(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 100.00"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Inventory Stock & Taxability */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Min Order / Hours</label>
                    <input
                      type="number"
                      min={1}
                      value={minQuantity}
                      onChange={(e) => setMinQuantity(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inventory Stock (Units)</label>
                    <input
                      type="number"
                      min={0}
                      value={stockQuantity !== undefined ? stockQuantity : ''}
                      onChange={(e) => setStockQuantity(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Leave blank for services"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                      <input
                        type="checkbox"
                        checked={isTaxable}
                        onChange={(e) => setIsTaxable(e.target.checked)}
                        className="rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <span>Apply Fiji VAT ({data.userProfile.defaultVatRate || 12.5}%)</span>
                    </label>
                  </div>
                </div>

                {/* Tags input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="e.g. Popular, Bespoke, High-Demand, Gear Rental"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                {/* Modal Actions */}
                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                  >
                    {editingService ? 'Save Changes' : 'Save Catalogue Item'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preset Importer Modal */}
      <AnimatePresence>
        {showPresetModal && presetToImport && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl w-full max-w-2xl border border-slate-200 shadow-2xl overflow-hidden my-auto"
            >
              {/* Modal Header */}
              <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30">
                    {getPresetIcon(presetToImport.iconName)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      {presetToImport.name} Pack
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {presetToImport.tagline}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPresetModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Preset Selector Tabs */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 overflow-x-auto flex gap-2">
                {INDUSTRY_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPresetToImport(p);
                      setSelectedPresetServices(p.sampleServices.map((_, i) => i));
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      presetToImport.id === p.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {p.name.split(',')[0]}
                  </button>
                ))}
              </div>

              {/* Modal Body */}
              <div className="p-5 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Select Services to Import
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Standard industry rates, custom billing units & scope descriptions.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedPresetServices.length === presetToImport.sampleServices.length) {
                        setSelectedPresetServices([]);
                      } else {
                        setSelectedPresetServices(presetToImport.sampleServices.map((_, i) => i));
                      }
                    }}
                    className="text-xs text-sky-600 hover:text-sky-700 font-semibold cursor-pointer"
                  >
                    {selectedPresetServices.length === presetToImport.sampleServices.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="space-y-2.5">
                  {presetToImport.sampleServices.map((service, index) => {
                    const isSelected = selectedPresetServices.includes(index);
                    return (
                      <div
                        key={index}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedPresetServices(prev => prev.filter(i => i !== index));
                          } else {
                            setSelectedPresetServices(prev => [...prev, index]);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                          isSelected
                            ? 'bg-sky-50/50 border-sky-300 ring-1 ring-sky-300'
                            : 'bg-white border-slate-200 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="pt-0.5 shrink-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h5 className="text-xs font-bold text-slate-900 truncate">
                              {service.name}
                            </h5>
                            <span className="text-xs font-bold font-mono text-slate-900 shrink-0">
                              {currencyConfig.symbol} {service.rate.toFixed(2)} / {service.unit}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            {service.description}
                          </p>

                          <div className="flex items-center gap-1.5 mt-2">
                            <span className="bg-slate-100 text-slate-600 text-[8.5px] font-semibold px-2 py-0.5 rounded">
                              Unit: {service.unit}
                            </span>
                            {service.category && (
                              <span className="bg-slate-100 text-slate-700 text-[8.5px] font-semibold px-2 py-0.5 rounded">
                                Category: {service.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  <strong>{selectedPresetServices.length}</strong> items selected for venture <strong>{activeBusiness.name}</strong>
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPresetModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={selectedPresetServices.length === 0}
                    onClick={handleImportPresetServices}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Import Selected Items</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rate Sheet Modal */}
      {showRateSheetModal && (
        <RateSheetModal 
          data={data} 
          onClose={() => setShowRateSheetModal(false)} 
        />
      )}

      {/* Bulk Rate Adjuster Modal */}
      {showBulkAdjustModal && (
        <BulkRateAdjustModal
          data={data}
          onUpdateData={onUpdateData}
          onClose={() => setShowBulkAdjustModal(false)}
        />
      )}

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {importSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 z-50 text-xs border border-slate-700"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{importSuccessToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
