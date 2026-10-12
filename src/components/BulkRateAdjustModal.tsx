import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, TrendingUp, Check, ArrowRight } from 'lucide-react';
import { CRMData, ProductService } from '../types';
import { getCurrencyConfig } from '../lib/currencies';

interface BulkRateAdjustModalProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onClose: () => void;
}

export default function BulkRateAdjustModal({ data, onUpdateData, onClose }: BulkRateAdjustModalProps) {
  const [adjustType, setAdjustType] = useState<'percent' | 'flat' | 'margin_target'>('percent');
  const [percentDelta, setPercentDelta] = useState<number>(10);
  const [flatDelta, setFlatDelta] = useState<number>(15);
  const [targetMargin, setTargetMargin] = useState<number>(45);
  const [targetCategory, setTargetCategory] = useState<string>('all');
  const [includeTierRates, setIncludeTierRates] = useState<boolean>(true);
  const [roundingRule, setRoundingRule] = useState<'none' | 'nearest_5' | 'nearest_10' | 'two_decimals'>('two_decimals');

  const currencyConfig = getCurrencyConfig(data.userProfile.defaultCurrency || 'FJD');
  const sym = currencyConfig.symbol;

  // Only the active business's items are shown or changed; other businesses' items are left as they are
  const inBusiness = (s: ProductService) => !s.businessId || s.businessId === data.activeBusinessId;
  const allServices = data.services || [];
  const businessServices = allServices.filter(inBusiness);
  const categories = Array.from(new Set(businessServices.map(s => s.category || 'General'))).filter(Boolean);

  const isTarget = (srv: ProductService) =>
    inBusiness(srv) &&
    (targetCategory === 'all' || (srv.category || 'General') === targetCategory) &&
    // Target margin needs a cost price to work from
    (adjustType !== 'margin_target' || (!!srv.costPrice && srv.costPrice > 0));

  // Compute live preview of adjustments
  const previewServices = useMemo(() => {
    return allServices.map(srv => {
      if (!isTarget(srv)) return srv;

      let newRate = srv.rate;
      if (adjustType === 'percent') {
        newRate = Math.max(0, srv.rate * (1 + percentDelta / 100));
      } else if (adjustType === 'flat') {
        newRate = Math.max(1, srv.rate + flatDelta);
      } else if (adjustType === 'margin_target' && srv.costPrice) {
        // Selling price = cost / (1 - margin)
        const desiredMarginFrac = Math.min(0.95, Math.max(0, targetMargin / 100));
        newRate = srv.costPrice / (1 - desiredMarginFrac);
      }

      // Apply rounding
      if (roundingRule === 'nearest_5') {
        newRate = Math.round(newRate / 5) * 5;
      } else if (roundingRule === 'nearest_10') {
        newRate = Math.round(newRate / 10) * 10;
      } else {
        newRate = Math.round(newRate * 100) / 100;
      }

      // Scale multi-tier rates proportionally if selected
      const multiplier = srv.rate > 0 ? newRate / srv.rate : 1;
      const newRushRate = srv.rushRate && includeTierRates ? Math.round(srv.rushRate * multiplier * 100) / 100 : srv.rushRate;
      const newWeekendRate = srv.weekendRate && includeTierRates ? Math.round(srv.weekendRate * multiplier * 100) / 100 : srv.weekendRate;
      const newRetainerRate = srv.retainerRate && includeTierRates ? Math.round(srv.retainerRate * multiplier * 100) / 100 : srv.retainerRate;

      return {
        ...srv,
        rate: newRate,
        rushRate: newRushRate,
        weekendRate: newWeekendRate,
        retainerRate: newRetainerRate
      };
    });
  }, [data.services, data.activeBusinessId, adjustType, percentDelta, flatDelta, targetMargin, targetCategory, includeTierRates, roundingRule]);

  const affectedCount = allServices.filter(isTarget).length;
  const skippedNoCost = adjustType === 'margin_target'
    ? businessServices.filter(s => (targetCategory === 'all' || (s.category || 'General') === targetCategory) && !(s.costPrice && s.costPrice > 0)).length
    : 0;

  const handleApply = () => {
    // Record to Activity Log
    const newLog = {
      id: `act-bulk-${Date.now()}`,
      type: 'rate_updated' as const,
      title: `Rates updated (${affectedCount} items)`,
      description: adjustType === 'percent' 
        ? `Changed ${affectedCount} rates by ${percentDelta >= 0 ? '+' : ''}${percentDelta}%${targetCategory !== 'all' ? ` in ${targetCategory}` : ''}.`
        : adjustType === 'flat'
        ? `Changed ${affectedCount} rates by ${flatDelta >= 0 ? '+' : '-'}${sym}${Math.abs(flatDelta)}${targetCategory !== 'all' ? ` in ${targetCategory}` : ''}.`
        : `Set ${affectedCount} items to a ${targetMargin}% gross margin.`,
      timestamp: new Date().toISOString(),
      entityType: 'service' as const,
      badgeColor: 'amber' as const
    };

    if (affectedCount === 0) return;

    onUpdateData({
      ...data,
      services: previewServices,
      activityLogs: [newLog, ...(data.activityLogs || [])]
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-3xl w-full max-w-2xl border border-slate-200 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 text-slate-200 flex items-center justify-center border border-white/15 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Adjust prices
              </h3>
              <p className="text-xs text-slate-300">
                Change prices across your catalogue or in one category, and preview the result.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Controls */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 bg-slate-50/50">
          {/* Adjustment Mode Selector */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Adjust by
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAdjustType('percent')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  adjustType === 'percent'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="text-xs font-bold block">Percentage (%)</span>
                <span className="text-[10px] opacity-75">Raise or lower by a percentage</span>
              </button>

              <button
                type="button"
                onClick={() => setAdjustType('flat')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  adjustType === 'flat'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="text-xs font-bold block">Flat amount (+/-)</span>
                <span className="text-[10px] opacity-75">Add or subtract a fixed amount</span>
              </button>

              <button
                type="button"
                onClick={() => setAdjustType('margin_target')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  adjustType === 'margin_target'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="text-xs font-bold block">Target margin %</span>
                <span className="text-[10px] opacity-75">Price from cost</span>
              </button>
            </div>
          </div>

          {/* Value Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-slate-200/80">
            {adjustType === 'percent' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Percentage (%)
                </label>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <input
                    type="number"
                    step="0.5"
                    value={percentDelta}
                    onChange={(e) => setPercentDelta(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <div className="flex flex-wrap gap-1">
                    {[-10, -5, 5, 10, 15, 20].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setPercentDelta(v)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                          percentDelta === v ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {v > 0 ? `+${v}%` : `${v}%`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adjustType === 'flat' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Amount ({currencyConfig.code})
                </label>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <input
                    type="number"
                    step="0.01"
                    value={flatDelta}
                    onChange={(e) => setFlatDelta(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <div className="flex flex-wrap gap-1">
                    {[5, 10, 25, 50, 100].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFlatDelta(v)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                          flatDelta === v ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        +{sym}{v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adjustType === 'margin_target' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Target gross margin %
                </label>
                <input
                  type="number"
                  min="5"
                  max="90"
                  value={targetMargin}
                  onChange={(e) => setTargetMargin(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold font-mono text-slate-800 mt-1 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Sets each rate from its cost price. Items without a cost price are left as they are.
                </p>
              </div>
            )}

            {/* Target Category Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Category
              </label>
              <select
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs mt-1 text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
              >
                <option value="all">All categories ({businessServices.length} items)</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Options & Rounding */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-white p-3.5 rounded-2xl border border-slate-200/80">
            <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTierRates}
                onChange={(e) => setIncludeTierRates(e.target.checked)}
                className="rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
              <span>Scale rush, weekend and retainer rates too</span>
            </label>

            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] text-slate-500 font-semibold">Rounding:</span>
              <select
                value={roundingRule}
                onChange={(e) => setRoundingRule(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 cursor-pointer"
              >
                <option value="two_decimals">Exact (cents)</option>
                <option value="nearest_5">Nearest {sym}5</option>
                <option value="nearest_10">Nearest {sym}10</option>
              </select>
            </div>
          </div>

          {/* Live Preview List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">
                Preview ({affectedCount} {affectedCount === 1 ? 'item' : 'items'} will change)
              </span>
              {skippedNoCost > 0 && (
                <span className="text-[11px] text-slate-500">{skippedNoCost} without a cost price skipped</span>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-2xl bg-white p-2">
              {businessServices.length === 0 && (
                <p className="text-xs text-slate-500 p-2">No items to adjust yet.</p>
              )}
              {previewServices.map((prev, i) => {
                const orig = allServices[i];
                if (!orig || !inBusiness(orig)) return null;
                const isChanged = orig.rate !== prev.rate;

                return (
                  <div
                    key={prev.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                      isChanged ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50/40 border-slate-100 opacity-60'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <h5 className="font-bold text-slate-900 truncate">{prev.name}</h5>
                      <span className="text-[10px] text-slate-400">{prev.category || 'General'} • per {prev.unit}</span>
                    </div>

                    <div className="flex items-center gap-2 font-mono shrink-0">
                      <span className="text-slate-400 line-through text-[11px]">
                        {sym}{orig.rate.toFixed(2)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className={`font-bold text-xs ${isChanged ? 'text-amber-700 font-extrabold' : 'text-slate-700'}`}>
                        {sym}{prev.rate.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={affectedCount === 0}
            className="disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Update {affectedCount} {affectedCount === 1 ? 'item' : 'items'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
