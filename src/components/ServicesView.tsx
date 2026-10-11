import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Briefcase, Plus, Search, Edit3, Trash2, X,
  Clapperboard, Code, Scale, Wrench, Hammer, Sparkles, Layers,
  Download, CheckCircle2, Box, TrendingUp, FileText, Table, Grid, BarChart3, Package, Receipt
} from 'lucide-react';
import { CRMData, ProductService, ActivityLog } from '../types';
import { INDUSTRY_PRESETS, IndustryPreset } from '../lib/industryPresets';
import { getCurrencyConfig } from '../lib/currencies';
import RateSheetModal from './RateSheetModal';
import BulkRateAdjustModal from './BulkRateAdjustModal';

interface ServicesViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
}

const ITEM_TYPES = [
  { id: 'service', label: 'Service', icon: Briefcase, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'product', label: 'Product', icon: Package, color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'labor', label: 'Labour', icon: Wrench, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'parts', label: 'Parts and materials', icon: Box, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'equipment_rental', label: 'Equipment hire', icon: Clapperboard, color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'consultation', label: 'Consultation', icon: Scale, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'retainer', label: 'Retainer or subscription', icon: Layers, color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'disbursement', label: 'Disbursement', icon: Receipt, color: 'bg-slate-50 text-slate-700 border-slate-200' }
];

const UNIT_OPTIONS = ['Hour', 'Day', 'Half Day', 'Flat Fee', 'Project', 'Month', 'Shoot Day', 'Sprint', 'Item'];

const DEFAULT_CATEGORY = 'General';

const getMargin = (srv: ProductService): number | null => {
  if (!srv.costPrice || srv.costPrice <= 0 || !srv.rate || srv.rate <= 0) return null;
  return ((srv.rate - srv.costPrice) / srv.rate) * 100;
};

const marginBadgeClass = (margin: number) =>
  margin >= 50 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
  margin >= 25 ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-amber-50 text-amber-700 border-amber-200';

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

  // Form state for add / edit (0 = left blank for rate and cost)
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [unit, setUnit] = useState('Hour');
  const [customUnit, setCustomUnit] = useState('');
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [itemType, setItemType] = useState<string>('service');
  const [category, setCategory] = useState('');
  const [industryId, setIndustryId] = useState<string>('general_consulting');
  const [srvType, setSrvType] = useState<'service' | 'saas'>('service');
  const [billingInterval, setBillingInterval] = useState<'one-time' | 'monthly' | 'annual'>('one-time');
  const [businessId, setBusinessId] = useState(data.activeBusinessId || data.businesses[0]?.id || '');

  // Rate tiers
  const [rushRate, setRushRate] = useState<number | undefined>(undefined);
  const [weekendRate, setWeekendRate] = useState<number | undefined>(undefined);
  const [retainerRate, setRetainerRate] = useState<number | undefined>(undefined);
  const [minQuantity, setMinQuantity] = useState<number>(1);
  const [stockQuantity, setStockQuantity] = useState<number | undefined>(undefined);
  const [isTaxable, setIsTaxable] = useState<boolean>(true);
  const [showOnRateCard, setShowOnRateCard] = useState<boolean>(true);
  const [tagsInput, setTagsInput] = useState<string>('');

  const activeBusiness = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const currencyConfig = getCurrencyConfig(data.userProfile.defaultCurrency || 'FJD');
  const sym = currencyConfig.symbol;
  const money = (n: number) => `${sym} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Only the active business's items (plus items not linked to any business)
  const businessServices = useMemo(
    () => (data.services || []).filter(s => !s.businessId || s.businessId === data.activeBusinessId),
    [data.services, data.activeBusinessId]
  );

  const allCategories = useMemo(() => {
    return Array.from(new Set(businessServices.map(s => s.category || DEFAULT_CATEGORY))).filter(Boolean);
  }, [businessServices]);

  const metrics = useMemo(() => {
    const totalItems = businessServices.length;
    const activeItems = businessServices.filter(s => s.isActive !== false).length;

    const stockedItems = businessServices.filter(s => s.stockQuantity !== undefined && s.stockQuantity > 0 && s.costPrice && s.costPrice > 0);
    const stockVal = stockedItems.reduce((acc, s) => acc + (s.stockQuantity || 0) * (s.costPrice || 0), 0);

    const margins = businessServices.map(getMargin).filter((m): m is number => m !== null);
    const avgMargin = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : null;

    return { totalItems, activeItems, stockVal, hasStock: stockedItems.length > 0, avgMargin, marginCount: margins.length };
  }, [businessServices]);

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return businessServices.filter(srv => {
      const matchesSearch = !q ||
        srv.name.toLowerCase().includes(q) ||
        (srv.description && srv.description.toLowerCase().includes(q)) ||
        (srv.sku && srv.sku.toLowerCase().includes(q)) ||
        (srv.unit && srv.unit.toLowerCase().includes(q)) ||
        (srv.category && srv.category.toLowerCase().includes(q)) ||
        (srv.tags && srv.tags.some(t => t.toLowerCase().includes(q)));

      const matchesIndustry = selectedIndustryFilter === 'all' || srv.industryId === selectedIndustryFilter;
      const matchesType = selectedTypeFilter === 'all' || (srv.itemType || 'service') === selectedTypeFilter;
      const matchesCategory = selectedCategoryFilter === 'all' || (srv.category || DEFAULT_CATEGORY) === selectedCategoryFilter;

      return matchesSearch && matchesIndustry && matchesType && matchesCategory;
    });
  }, [businessServices, searchQuery, selectedIndustryFilter, selectedTypeFilter, selectedCategoryFilter]);

  const hasActiveFilters = !!searchQuery.trim() || selectedCategoryFilter !== 'all' || selectedTypeFilter !== 'all' || selectedIndustryFilter !== 'all';

  const handleOpenAdd = () => {
    setEditingService(null);
    setName('');
    setSku('');
    setDescription('');
    setRate(0);
    setCostPrice(0);
    setUnit('Hour');
    setIsCustomUnit(false);
    setCustomUnit('');
    setItemType('service');
    setCategory('');
    setIndustryId('general_consulting');
    setSrvType('service');
    setBillingInterval('one-time');
    setBusinessId(data.activeBusinessId || data.businesses[0]?.id || '');
    setRushRate(undefined);
    setWeekendRate(undefined);
    setRetainerRate(undefined);
    setMinQuantity(1);
    setStockQuantity(undefined);
    setIsTaxable(true);
    setShowOnRateCard(true);
    setTagsInput('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (srv: ProductService) => {
    setEditingService(srv);
    setName(srv.name);
    setSku(srv.sku || '');
    setDescription(srv.description || '');
    setRate(srv.rate || 0);
    setCostPrice(srv.costPrice || 0);

    if (UNIT_OPTIONS.includes(srv.unit)) {
      setUnit(srv.unit);
      setIsCustomUnit(false);
      setCustomUnit('');
    } else {
      setUnit('custom');
      setIsCustomUnit(true);
      setCustomUnit(srv.unit || '');
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
    setShowOnRateCard(srv.showOnRateCard !== false);
    setTagsInput(srv.tags ? srv.tags.join(', ') : '');
    setShowAddModal(true);
  };

  const handleDeleteService = (id: string) => {
    const target = data.services.find(s => s.id === id);
    if (!target) return;
    if (!window.confirm(`Delete "${target.name}"? This can't be undone.`)) return;

    const newLog: ActivityLog = {
      id: `act-del-srv-${Date.now()}`,
      type: 'rate_updated',
      title: `Item deleted: ${target.name}`,
      description: `Deleted ${target.name}${target.sku ? ` (${target.sku})` : ''}, ${sym}${target.rate.toFixed(2)} per ${target.unit}.`,
      timestamp: new Date().toISOString(),
      entityType: 'service',
      entityId: id,
      badgeColor: 'amber'
    };

    onUpdateData({
      ...data,
      services: data.services.filter(s => s.id !== id),
      activityLogs: [newLog, ...(data.activityLogs || [])]
    });
  };

  const optionalRate = (v: number | undefined) => (v !== undefined && v > 0 ? Number(v) : undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !(rate > 0)) return;

    const finalUnit = isCustomUnit ? customUnit.trim() : unit;
    if (!finalUnit) return;
    const parsedTags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

    const fields = {
      name: name.trim(),
      sku: sku.trim() || undefined,
      description: description.trim(),
      rate: Number(rate),
      costPrice: costPrice > 0 ? Number(costPrice) : undefined,
      unit: finalUnit,
      type: srvType,
      billingInterval,
      businessId: businessId || undefined,
      category: category.trim() || undefined,
      itemType: itemType as ProductService['itemType'],
      industryId,
      rushRate: optionalRate(rushRate),
      weekendRate: optionalRate(weekendRate),
      retainerRate: optionalRate(retainerRate),
      minQuantity: Number(minQuantity) || 1,
      stockQuantity: stockQuantity !== undefined && stockQuantity >= 0 ? Number(stockQuantity) : undefined,
      isTaxable,
      showOnRateCard,
      tags: parsedTags.length > 0 ? parsedTags : undefined
    };

    if (editingService) {
      const updatedServices = data.services.map(s =>
        s.id === editingService.id ? { ...s, ...fields } : s
      );

      const newLog: ActivityLog = {
        id: `act-edit-srv-${Date.now()}`,
        type: 'rate_updated',
        title: `Item updated: ${fields.name}`,
        description: `${fields.name} is now ${sym}${fields.rate.toFixed(2)} per ${finalUnit}.`,
        timestamp: new Date().toISOString(),
        entityType: 'service',
        entityId: editingService.id,
        amount: fields.rate,
        currency: currencyConfig.code,
        badgeColor: 'amber'
      };

      onUpdateData({
        ...data,
        services: updatedServices,
        activityLogs: [newLog, ...(data.activityLogs || [])]
      });
    } else {
      const newService: ProductService = {
        id: `srv-${Date.now()}`,
        ...fields,
        isActive: true
      };

      const newLog: ActivityLog = {
        id: `act-new-srv-${Date.now()}`,
        type: 'service_created',
        title: `Item added: ${fields.name}`,
        description: `Added ${fields.name} at ${sym}${fields.rate.toFixed(2)} per ${finalUnit}.`,
        timestamp: new Date().toISOString(),
        entityType: 'service',
        entityId: newService.id,
        amount: fields.rate,
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

  const handleOpenPresetModal = (preset: IndustryPreset) => {
    setPresetToImport(preset);
    setSelectedPresetServices(preset.sampleServices.map((_, idx) => idx));
    setShowPresetModal(true);
  };

  const handleImportPresetServices = () => {
    if (!presetToImport) return;

    const targetBizId = data.activeBusinessId || data.businesses[0]?.id || undefined;
    const stamp = Date.now();
    const newItems: ProductService[] = presetToImport.sampleServices
      .filter((_, idx) => selectedPresetServices.includes(idx))
      .map((item, idx) => ({
        ...item,
        id: `srv-${stamp}-${idx}`,
        businessId: targetBizId,
        industryId: presetToImport.id,
        isTaxable: item.isTaxable !== false,
        isActive: true
      }));

    if (newItems.length === 0) return;

    const newLog: ActivityLog = {
      id: `act-import-pack-${stamp}`,
      type: 'rate_updated',
      title: `Starter pack added: ${presetToImport.name}`,
      description: `Added ${newItems.length} items${activeBusiness ? ` to ${activeBusiness.name}` : ''}.`,
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
    setImportSuccessToast(`Added ${newItems.length} ${newItems.length === 1 ? 'item' : 'items'} from ${presetToImport.name}`);
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

  const hiddenLabel = (
    <span className="text-[10px] text-slate-400 font-medium">Hidden from rate card</span>
  );

  const emptyTabMessage = (
    <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-500">
      {hasActiveFilters ? 'No items match your search or filters.' : 'No items yet. Add an item or a starter pack first.'}
    </div>
  );

  const inputClass = 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const inputWhiteClass = 'w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const labelClass = 'block text-[11px] font-semibold text-slate-600';

  return (
    <div className="space-y-4 min-w-0">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Services and rates</h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            The services and products you charge for{activeBusiness ? ` in ${activeBusiness.name}` : ''}, with their rates and costs.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowRateSheetModal(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Rate sheet</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBulkAdjustModal(true)}
            disabled={businessServices.length === 0}
            className="bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
          >
            <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
            <span>Adjust prices</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add item</span>
          </button>
        </div>
      </div>

      {/* Summary (real numbers only) */}
      {metrics.totalItems > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 block">Items</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-900 font-mono">{metrics.totalItems}</span>
              {metrics.activeItems !== metrics.totalItems && (
                <span className="text-[11px] text-slate-500">{metrics.activeItems} active</span>
              )}
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 block">Average margin</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-900 font-mono">
                {metrics.avgMargin !== null ? `${metrics.avgMargin.toFixed(1)}%` : '—'}
              </span>
              <span className="text-[11px] text-slate-500">
                {metrics.avgMargin !== null
                  ? `${metrics.marginCount} of ${metrics.totalItems} with a cost price`
                  : 'Add cost prices to see this'}
              </span>
            </div>
          </div>

          {metrics.hasStock && (
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 space-y-0.5">
              <span className="text-[11px] font-semibold text-slate-500 block">Stock value at cost</span>
              <span className="text-lg font-bold text-slate-900 font-mono block">{money(metrics.stockVal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
          {[
            { id: 'catalogue', label: 'Catalogue', icon: Grid },
            { id: 'matrix', label: 'Rate tiers', icon: Layers },
            { id: 'margins', label: 'Margins', icon: BarChart3 },
            { id: 'packs', label: 'Starter packs', icon: Download }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-slate-900 text-white'
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
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
              title="Cards"
              aria-label="Show as cards"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
              title="Table"
              aria-label="Show as table"
            >
              <Table className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Search and filters */}
      {activeTab !== 'packs' && (
        <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center justify-between">
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-3.5 top-2.5 text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, code, category or unit"
              className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer max-w-full"
            >
              <option value="all">All categories</option>
              {allCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer max-w-full"
            >
              <option value="all">All types</option>
              {ITEM_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>

            <select
              value={selectedIndustryFilter}
              onChange={(e) => setSelectedIndustryFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer max-w-full"
            >
              <option value="all">All industries</option>
              {INDUSTRY_PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Catalogue */}
      {activeTab === 'catalogue' && (
        <>
          {filteredServices.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center mx-auto border border-slate-100">
                <Briefcase className="w-5 h-5" />
              </div>
              <div className="max-w-sm mx-auto space-y-1">
                <h3 className="text-sm font-bold text-slate-800">
                  {hasActiveFilters ? 'No matching items' : 'No items yet'}
                </h3>
                <p className="text-xs text-slate-500">
                  {hasActiveFilters
                    ? 'Try a different search or clear the filters.'
                    : 'Add the services and products you charge for, or start from a starter pack for your industry.'}
                </p>
              </div>
              {!hasActiveFilters && (
                <div className="pt-1 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenAdd}
                    className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-4 rounded-xl transition-colors cursor-pointer"
                  >
                    Add item
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('packs')}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2 px-4 rounded-xl transition-colors cursor-pointer"
                  >
                    Browse starter packs
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredServices.map((srv) => {
                const itemTypeMeta = ITEM_TYPES.find(t => t.id === srv.itemType) || ITEM_TYPES[0];
                const margin = getMargin(srv);

                return (
                  <div
                    key={srv.id}
                    className={`bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col justify-between hover:border-slate-300 transition-colors min-w-0 ${srv.isActive === false ? 'opacity-60' : ''}`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${itemTypeMeta.color}`}>
                              {itemTypeMeta.label}
                            </span>
                            {srv.sku && (
                              <span className="bg-slate-100 text-slate-600 text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200">
                                {srv.sku}
                              </span>
                            )}
                            {srv.isActive === false && (
                              <span className="text-[10px] text-slate-400 font-medium">Inactive</span>
                            )}
                          </div>

                          <h3 className="text-sm font-bold text-slate-900 leading-snug break-words">
                            {srv.name}
                          </h3>
                        </div>

                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(srv)}
                            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit"
                            aria-label={`Edit ${srv.name}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteService(srv.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete"
                            aria-label={`Delete ${srv.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {srv.description && (
                        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                          {srv.description}
                        </p>
                      )}

                      {(srv.rushRate || srv.weekendRate || srv.retainerRate) && (
                        <div className="flex items-center gap-1 flex-wrap mt-2.5 pt-2 border-t border-slate-100 text-[10px]">
                          {srv.rushRate && (
                            <span className="bg-slate-50 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
                              Rush {sym}{srv.rushRate.toFixed(2)}
                            </span>
                          )}
                          {srv.weekendRate && (
                            <span className="bg-slate-50 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
                              Weekend {sym}{srv.weekendRate.toFixed(2)}
                            </span>
                          )}
                          {srv.retainerRate && (
                            <span className="bg-slate-50 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
                              Retainer {sym}{srv.retainerRate.toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-baseline gap-1">
                          <span className="text-base font-bold text-slate-900 font-mono">{money(srv.rate)}</span>
                          <span className="text-[11px] text-slate-400">/ {srv.unit}</span>
                        </div>

                        {margin !== null && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border font-mono ${marginBadgeClass(margin)}`}>
                            {margin.toFixed(0)}% margin
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-400">
                        <span>{srv.category || DEFAULT_CATEGORY}</span>
                        <div className="flex items-center gap-2">
                          {srv.showOnRateCard === false && hiddenLabel}
                          {srv.stockQuantity !== undefined && (
                            <span className="font-mono text-slate-600">{srv.stockQuantity} in stock</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4">Item</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Rate</th>
                      <th className="py-2.5 px-3 text-right">Cost</th>
                      <th className="py-2.5 px-3 text-right">Margin</th>
                      <th className="py-2.5 px-3 text-right">Stock</th>
                      <th className="py-2.5 px-4 text-center"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredServices.map((srv) => {
                      const itemTypeMeta = ITEM_TYPES.find(t => t.id === srv.itemType) || ITEM_TYPES[0];
                      const margin = getMargin(srv);

                      return (
                        <tr key={srv.id} className={`hover:bg-slate-50/70 transition-colors ${srv.isActive === false ? 'opacity-60' : ''}`}>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900">{srv.name}</div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                              <span>{[srv.sku, srv.category || DEFAULT_CATEGORY].filter(Boolean).join(' · ')}</span>
                              {srv.showOnRateCard === false && <>· {hiddenLabel}</>}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${itemTypeMeta.color}`}>
                              {itemTypeMeta.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {money(srv.rate)} <span className="text-[11px] font-normal text-slate-400">/ {srv.unit}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                            {srv.costPrice ? money(srv.costPrice) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                            {margin !== null ? `${margin.toFixed(1)}%` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {srv.stockQuantity !== undefined ? srv.stockQuantity : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(srv)}
                                className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                                title="Edit"
                                aria-label={`Edit ${srv.name}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteService(srv.id)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                title="Delete"
                                aria-label={`Delete ${srv.name}`}
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

      {/* Rate tiers */}
      {activeTab === 'matrix' && (
        filteredServices.length === 0 ? emptyTabMessage : (
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Your standard rate next to any rush, weekend and retainer rates you've set.
              </p>
              <button
                type="button"
                onClick={() => setShowBulkAdjustModal(true)}
                className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-1.5 px-3 rounded-xl flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Adjust prices</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3 text-right">Standard</th>
                    <th className="py-2.5 px-3 text-right">Rush</th>
                    <th className="py-2.5 px-3 text-right">Weekend / after hours</th>
                    <th className="py-2.5 px-3 text-right">Retainer</th>
                    <th className="py-2.5 px-3 text-center"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredServices.map((srv) => (
                    <tr key={srv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{srv.name}</div>
                        <div className="text-[11px] text-slate-400">per {srv.unit}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {money(srv.rate)}
                      </td>
                      {[srv.rushRate, srv.weekendRate, srv.retainerRate].map((tier, i) => (
                        <td key={i} className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                          {tier ? money(tier) : <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(srv)}
                          className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Margins */}
      {activeTab === 'margins' && (
        filteredServices.length === 0 ? emptyTabMessage : (
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <p className="text-xs text-slate-500">
              What each item costs you against what you charge. Add a cost price to an item to see its margin.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3 text-right">Your cost</th>
                    <th className="py-2.5 px-3 text-right">Rate</th>
                    <th className="py-2.5 px-3 text-right">Profit per unit</th>
                    <th className="py-2.5 px-3 text-right">Markup</th>
                    <th className="py-2.5 px-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredServices.map((srv) => {
                    const hasCost = !!srv.costPrice && srv.costPrice > 0;
                    const cost = srv.costPrice || 0;
                    const profit = srv.rate - cost;
                    const markup = hasCost ? (profit / cost) * 100 : null;
                    const margin = getMargin(srv);

                    return (
                      <tr key={srv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{srv.name}</div>
                          <div className="text-[11px] text-slate-400">per {srv.unit}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                          {hasCost ? money(cost) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {money(srv.rate)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono whitespace-nowrap ${hasCost ? (profit >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-slate-400'}`}>
                          {hasCost ? `${profit >= 0 ? '+' : '-'}${money(Math.abs(profit))}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {markup !== null ? `${markup.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {margin !== null ? (
                            <span className={`font-semibold px-1.5 py-0.5 rounded border ${marginBadgeClass(margin)}`}>
                              {margin.toFixed(1)}%
                            </span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Starter packs */}
      {activeTab === 'packs' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Common items and typical rates for your industry. Pick the ones you want, then change the rates to match yours.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {INDUSTRY_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="bg-white p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-colors flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-100">
                      {getPresetIcon(preset.iconName)}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {preset.sampleServices.length} items
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{preset.name}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{preset.description}</p>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleOpenPresetModal(preset)}
                    className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1.5 px-3 rounded-xl transition-colors cursor-pointer"
                  >
                    View items
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / edit modal */}
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
                <h3 className="text-sm font-bold text-slate-900">
                  {editingService ? 'Edit item' : 'Add item'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Website design"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Item code</label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="Optional, e.g. WEB-01"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Type</label>
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
                      className={`${inputClass} cursor-pointer`}
                    >
                      {ITEM_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {data.businesses.length > 1 && (
                    <div>
                      <label className={labelClass}>Business</label>
                      <select
                        value={businessId}
                        onChange={(e) => setBusinessId(e.target.value)}
                        className={`${inputClass} cursor-pointer`}
                      >
                        {data.businesses.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className={labelClass}>Category</label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="e.g. Design"
                      list="services-category-options"
                      className={inputClass}
                    />
                    <datalist id="services-category-options">
                      {allCategories.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's included"
                    rows={2}
                    className={`${inputClass} placeholder-slate-400`}
                  />
                </div>

                {/* Rate, cost and unit */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>Rate ({currencyConfig.code}) *</label>
                      <input
                        type="number"
                        required
                        min={0.01}
                        step="any"
                        value={rate || ''}
                        onChange={(e) => setRate(Number(e.target.value))}
                        className={`${inputWhiteClass} font-mono font-semibold`}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Your cost ({currencyConfig.code})</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={costPrice || ''}
                        onChange={(e) => setCostPrice(Number(e.target.value))}
                        placeholder="Optional"
                        className={`${inputWhiteClass} font-mono`}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Per *</label>
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
                        className={`${inputWhiteClass} cursor-pointer`}
                      >
                        {UNIT_OPTIONS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                        <option value="custom">Other</option>
                      </select>
                    </div>
                  </div>

                  {isCustomUnit && (
                    <div>
                      <label className={labelClass}>Unit name *</label>
                      <input
                        type="text"
                        required
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="e.g. Kilometre, Tonne, Page"
                        className={inputWhiteClass}
                      />
                    </div>
                  )}

                  {rate > 0 && costPrice > 0 && (
                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-600">
                      <span>
                        Profit: <strong className={`font-mono ${rate - costPrice >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rate - costPrice >= 0 ? '+' : '-'}{money(Math.abs(rate - costPrice))}</strong> per unit
                      </span>
                      <span className="font-mono">
                        {(((rate - costPrice) / rate) * 100).toFixed(1)}% margin
                      </span>
                    </div>
                  )}
                </div>

                {/* Rate tiers */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block">Other rates</span>
                    <span className="text-[11px] text-slate-500">Optional. Leave blank if you don't charge differently.</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>Rush ({currencyConfig.code})</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={rushRate ?? ''}
                        onChange={(e) => setRushRate(e.target.value ? Number(e.target.value) : undefined)}
                        className={`${inputWhiteClass} font-mono`}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Weekend / after hours ({currencyConfig.code})</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={weekendRate ?? ''}
                        onChange={(e) => setWeekendRate(e.target.value ? Number(e.target.value) : undefined)}
                        className={`${inputWhiteClass} font-mono`}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Retainer ({currencyConfig.code})</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={retainerRate ?? ''}
                        onChange={(e) => setRetainerRate(e.target.value ? Number(e.target.value) : undefined)}
                        className={`${inputWhiteClass} font-mono`}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Minimum quantity</label>
                    <input
                      type="number"
                      min={1}
                      step="any"
                      value={minQuantity}
                      onChange={(e) => setMinQuantity(Number(e.target.value))}
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>In stock</label>
                    <input
                      type="number"
                      min={0}
                      value={stockQuantity !== undefined ? stockQuantity : ''}
                      onChange={(e) => setStockQuantity(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Leave blank for services"
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  <div className="flex items-center sm:pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                      <input
                        type="checkbox"
                        checked={isTaxable}
                        onChange={(e) => setIsTaxable(e.target.checked)}
                        className="rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <span>Charge VAT ({data.userProfile.defaultVatRate ?? 12.5}%)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={showOnRateCard}
                      onChange={(e) => setShowOnRateCard(e.target.checked)}
                      className="rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span>Show on rate card</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mt-1 ml-6">
                    Clients see this item, its rate and description on your shareable rate card.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Tags</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="Separate with commas"
                    className={inputClass}
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {editingService ? 'Save changes' : 'Add item'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Starter pack modal */}
      <AnimatePresence>
        {showPresetModal && presetToImport && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl w-full max-w-2xl border border-slate-200 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
            >
              <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl border border-slate-100 shrink-0">
                    {getPresetIcon(presetToImport.iconName)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900">{presetToImport.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Pick the items to add. You can change any rate afterwards.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPresetModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 overflow-x-auto flex gap-2 shrink-0">
                {INDUSTRY_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPresetToImport(p);
                      setSelectedPresetServices(p.sampleServices.map((_, i) => i));
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      presetToImport.id === p.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {p.name.split(',')[0]}
                  </button>
                ))}
              </div>

              <div className="p-5 space-y-3 overflow-y-auto flex-1">
                <div className="flex items-center justify-end">
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
                    {selectedPresetServices.length === presetToImport.sampleServices.length ? 'Select none' : 'Select all'}
                  </button>
                </div>

                <div className="space-y-2">
                  {presetToImport.sampleServices.map((service, index) => {
                    const isSelected = selectedPresetServices.includes(index);
                    const toggle = () => {
                      setSelectedPresetServices(prev =>
                        prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
                      );
                    };
                    return (
                      <label
                        key={`${presetToImport.id}-${index}`}
                        className={`p-3.5 rounded-2xl border transition-colors cursor-pointer flex items-start gap-3 ${
                          isSelected ? 'bg-sky-50/50 border-sky-300' : 'bg-white border-slate-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={toggle}
                          className="mt-0.5 w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                            <span className="text-xs font-bold text-slate-900">{service.name}</span>
                            <span className="text-xs font-semibold font-mono text-slate-900 shrink-0">
                              {money(service.rate)} / {service.unit}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{service.description}</p>
                          {service.category && (
                            <span className="inline-block mt-1.5 bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">
                              {service.category}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <span className="text-xs text-slate-500">
                  {selectedPresetServices.length} selected{activeBusiness ? <> for <strong>{activeBusiness.name}</strong></> : null}
                </span>

                <div className="flex gap-2 justify-end">
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
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
                  >
                    Add {selectedPresetServices.length} {selectedPresetServices.length === 1 ? 'item' : 'items'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showRateSheetModal && (
        <RateSheetModal
          data={data}
          onClose={() => setShowRateSheetModal(false)}
        />
      )}

      {showBulkAdjustModal && (
        <BulkRateAdjustModal
          data={data}
          onUpdateData={onUpdateData}
          onClose={() => setShowBulkAdjustModal(false)}
        />
      )}

      <AnimatePresence>
        {importSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 z-50 text-xs border border-slate-700"
            role="status"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{importSuccessToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
