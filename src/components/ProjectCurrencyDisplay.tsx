import React from 'react';
import { getCurrencyConfig, convertCurrency } from '../lib/currencies';
import { ArrowRightLeft } from 'lucide-react';

interface ProjectCurrencyDisplayProps {
  amount: number;
  currency?: string;
  baseCurrency?: string;
  variant?: 'pill' | 'badge' | 'inline' | 'compact' | 'card-header' | 'table' | 'full';
  showFlag?: boolean;
  showConversion?: boolean;
  rateType?: 'flat' | 'hourly' | 'monthly';
  className?: string;
}

export default function ProjectCurrencyDisplay({
  amount = 0,
  currency = 'FJD',
  baseCurrency = 'FJD',
  variant = 'pill',
  showFlag = true,
  showConversion = true,
  rateType,
  className = ''
}: ProjectCurrencyDisplayProps) {
  const projCurrencyCode = (currency || 'FJD').toUpperCase();
  const baseCurrencyCode = (baseCurrency || 'FJD').toUpperCase();
  const isForeign = projCurrencyCode !== baseCurrencyCode;

  const projCfg = getCurrencyConfig(projCurrencyCode);
  const baseCfg = getCurrencyConfig(baseCurrencyCode);

  const numAmount = Number(amount) || 0;
  const { convertedAmount, rate } = convertCurrency(numAmount, projCurrencyCode, baseCurrencyCode);

  // Formatted strings
  const formattedNative = `${projCfg.symbol}${numAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const formattedConverted = `${baseCfg.symbol}${convertedAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const rateTypeSuffix = rateType ? (
    <span className="text-[8.5px] font-sans font-normal opacity-75 ml-0.5">
      /{rateType === 'hourly' ? 'hr' : rateType === 'monthly' ? 'mo' : 'flat'}
    </span>
  ) : null;

  // 1. INLINE VARIANT
  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-bold ${className}`}>
        {showFlag && <span className="text-xs">{projCfg.flag}</span>}
        <span>{projCurrencyCode} {numAmount.toLocaleString()}</span>
        {rateTypeSuffix}
        {isForeign && showConversion && (
          <span className="text-sky-600 font-medium text-[9px] ml-1">
            (≈ {baseCurrencyCode} {formattedConverted})
          </span>
        )}
      </span>
    );
  }

  // 2. COMPACT (for Kanban cards, lists, or tight table cells)
  if (variant === 'compact') {
    return (
      <div className={`inline-flex flex-col items-end text-right ${className}`}>
        <div className="flex items-center gap-1 text-[10.5px] font-mono font-black text-slate-900">
          {showFlag && <span className="text-xs">{projCfg.flag}</span>}
          <span>{projCurrencyCode} {numAmount.toLocaleString()}</span>
          {rateTypeSuffix}
        </div>
        {isForeign && showConversion && (
          <span className="text-[8.5px] font-medium text-sky-600 font-mono tracking-tight flex items-center gap-0.5">
            <span>≈ {baseCurrencyCode} {formattedConverted}</span>
          </span>
        )}
      </div>
    );
  }

  // 3. BADGE (for Dashboard Venture Projects and Project Card Headers)
  if (variant === 'badge' || variant === 'pill') {
    if (!isForeign || !showConversion) {
      return (
        <div className={`inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-xl text-slate-800 shadow-2xs font-mono ${className}`}>
          {showFlag && <span className="text-xs">{projCfg.flag}</span>}
          <span className="text-[11px] font-black">{projCurrencyCode} {numAmount.toLocaleString()}</span>
          {rateTypeSuffix}
        </div>
      );
    }

    // Graceful Multi-Currency Dual Badge
    return (
      <div 
        className={`inline-flex flex-col items-end bg-gradient-to-br from-slate-50 to-sky-50/50 border border-sky-200/70 hover:border-sky-300 px-2.5 py-1 rounded-xl shadow-2xs transition-all text-right group ${className}`}
        title={`Project currency: ${projCfg.name} (${projCurrencyCode})\nIn your currency: ~${baseCurrencyCode} ${formattedConverted} (1 ${projCurrencyCode} ≈ ${rate} ${baseCurrencyCode})`}
      >
        <div className="flex items-center gap-1 text-[11px] font-mono font-black text-slate-900 leading-tight">
          {showFlag && <span className="text-xs shrink-0">{projCfg.flag}</span>}
          <span>{projCurrencyCode} {numAmount.toLocaleString()}</span>
          {rateTypeSuffix}
        </div>
        <div className="flex items-center gap-0.5 text-[8.5px] font-semibold text-sky-700 font-mono tracking-tight mt-0.5">
          <ArrowRightLeft className="w-2.5 h-2.5 text-sky-500 shrink-0" />
          <span>≈ {baseCurrencyCode} {formattedConverted}</span>
        </div>
      </div>
    );
  }

  // 4. CARD HEADER (Large display with explicit FX context)
  if (variant === 'card-header' || variant === 'full') {
    return (
      <div className={`space-y-1 ${className}`}>
        <div className="flex items-center gap-1.5">
          {showFlag && <span className="text-base">{projCfg.flag}</span>}
          <span className="text-sm font-black font-mono text-slate-900">
            {projCurrencyCode} {numAmount.toLocaleString()}
          </span>
          <span className="text-[10px] font-semibold text-slate-500 font-sans px-1.5 py-0.5 rounded bg-slate-100 uppercase tracking-wider">
            {projCfg.name}
          </span>
          {rateTypeSuffix}
        </div>

        {isForeign && showConversion && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-sky-700 bg-sky-50/80 border border-sky-200/70 px-2 py-1 rounded-lg">
            <ArrowRightLeft className="w-3 h-3 text-sky-600 shrink-0" />
            <span>
              <strong>≈ {baseCurrencyCode} {formattedConverted}</strong> in your currency (1 {projCurrencyCode} ≈ {rate} {baseCurrencyCode})
            </span>
          </div>
        )}
      </div>
    );
  }

  // Fallback table/standard
  return (
    <div className={`text-right ${className}`}>
      <span className="font-mono font-bold text-slate-800 text-xs">
        {projCfg.flag} {projCurrencyCode} {numAmount.toLocaleString()}
      </span>
      {isForeign && showConversion && (
        <span className="block text-[9px] font-mono text-sky-600">
          ≈ {baseCurrencyCode} {formattedConverted}
        </span>
      )}
    </div>
  );
}
