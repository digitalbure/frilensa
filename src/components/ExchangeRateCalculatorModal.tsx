import React, { useState, useMemo } from 'react';
import {
  X,
  ArrowRightLeft,
  DollarSign,
  Calculator,
  Copy,
  Check,
  FilePlus,
  Info,
  TrendingUp,
  Percent,
  Landmark,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { SUPPORTED_CURRENCIES, getCurrencyConfig, formatCurrencyAmount } from '../lib/currencies';
import { CRMData } from '../types';

interface ExchangeRateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  homeCurrency?: string;
  defaultTargetCurrency?: string;
  defaultAmount?: number;
  workingCurrencies?: string[];
  customExchangeRates?: Record<string, number>;
  data?: CRMData;
  onCreateDocumentWithFx?: (params: {
    currency: string;
    amount: number;
    exchangeRate: number;
    fjdEquivalent: number;
    notes: string;
  }) => void;
  onApplyExpenseWithFx?: (params: {
    foreignCurrency: string;
    foreignAmount: number;
    exchangeRate: number;
    homeAmount: number;
    notes: string;
  }) => void;
  mode?: 'billing' | 'expense' | 'general';
}

export default function ExchangeRateCalculatorModal({
  isOpen,
  onClose,
  homeCurrency = 'FJD',
  defaultTargetCurrency = 'AUD',
  defaultAmount = 1000,
  workingCurrencies,
  customExchangeRates,
  data,
  onCreateDocumentWithFx,
  onApplyExpenseWithFx,
  mode = 'general'
}: ExchangeRateCalculatorModalProps) {
  if (!isOpen) return null;

  // Calculation Mode: 'forward' (Foreign -> FJD) vs 'reverse' (Desired FJD -> Required Foreign)
  const [calcMode, setCalcMode] = useState<'forward' | 'reverse'>('forward');

  // Selected Target Foreign Currency
  const [targetCurrency, setTargetCurrency] = useState<string>(defaultTargetCurrency);
  
  // Base Amount Input (Foreign in forward mode, FJD in reverse mode)
  const [baseAmount, setBaseAmount] = useState<number>(defaultAmount);

  // Exchange Rate (1 Target Currency = X FJD)
  const targetConfig = useMemo(() => getCurrencyConfig(targetCurrency), [targetCurrency]);
  const initialRate = customExchangeRates?.[defaultTargetCurrency] ?? targetConfig.approxFjdMultiplier ?? 1.485;
  const [exchangeRate, setExchangeRate] = useState<number>(initialRate);

  // Rate orientation toggle: 'targetToHome' (1 AUD = 1.485 FJD) vs 'homeToTarget' (1 FJD = 0.673 AUD)
  const [rateDirection, setRateDirection] = useState<'targetToHome' | 'homeToTarget'>('targetToHome');

  // Bank Wire / Intermediary Fee deduction in FJD
  const [includeBankFee, setIncludeBankFee] = useState<boolean>(false);
  const [bankFeeAmount, setBankFeeAmount] = useState<number>(15.0); // Standard TT / wire fee in FJD

  // VAT & Tax Estimation toggle
  const [includeVat, setIncludeVat] = useState<boolean>(false);
  const [vatRate, setVatRate] = useState<number>(data?.userProfile?.defaultVatRate || 15);

  // Copy feedback state
  const [copied, setCopied] = useState<boolean>(false);

  // When target currency changes, update default exchange rate if matching
  const handleSelectCurrency = (code: string) => {
    setTargetCurrency(code);
    const customRate = customExchangeRates?.[code];
    if (customRate) {
      setExchangeRate(customRate);
    } else {
      const cfg = getCurrencyConfig(code);
      if (cfg.approxFjdMultiplier) {
        setExchangeRate(cfg.approxFjdMultiplier);
      }
    }
  };

  // Reset to benchmark rate
  const handleResetBenchmarkRate = () => {
    const customRate = customExchangeRates?.[targetCurrency];
    if (customRate) {
      setExchangeRate(customRate);
    } else {
      const cfg = getCurrencyConfig(targetCurrency);
      setExchangeRate(cfg.approxFjdMultiplier || 1.0);
    }
  };

  // Calculations
  const calculations = useMemo(() => {
    const safeAmount = Math.max(0, Number(baseAmount) || 0);
    const safeRate = Math.max(0.0001, Number(exchangeRate) || 1.0);
    const safeFee = includeBankFee ? Math.max(0, Number(bankFeeAmount) || 0) : 0;

    if (calcMode === 'forward') {
      // Forward Mode: Base is Foreign Currency (e.g. 1000 AUD)
      const foreignAmount = safeAmount;
      const grossFjd = foreignAmount * safeRate;
      const vatFjd = includeVat ? (grossFjd * (vatRate / 100)) : 0;
      const totalWithVatFjd = grossFjd + vatFjd;
      const netFjd = Math.max(0, grossFjd - safeFee);
      const effectiveRate = foreignAmount > 0 ? netFjd / foreignAmount : safeRate;

      return {
        mode: 'forward',
        foreignCurrency: targetCurrency,
        foreignAmount,
        exchangeRate: safeRate,
        grossFjd,
        vatFjd,
        totalWithVatFjd,
        bankFee: safeFee,
        netFjd,
        effectiveRate,
        requiredForeign: foreignAmount,
        fjdResult: grossFjd
      };
    } else {
      // Reverse Mode: Base is desired FJD (e.g. FJ$ 2000)
      const desiredFjd = safeAmount;
      const grossNeededFjd = desiredFjd + safeFee;
      const foreignAmountRequired = safeRate > 0 ? grossNeededFjd / safeRate : 0;
      const vatFjd = includeVat ? (desiredFjd * (vatRate / 100)) : 0;

      return {
        mode: 'reverse',
        foreignCurrency: targetCurrency,
        foreignAmount: foreignAmountRequired,
        exchangeRate: safeRate,
        grossFjd: grossNeededFjd,
        vatFjd,
        totalWithVatFjd: grossNeededFjd + vatFjd,
        bankFee: safeFee,
        netFjd: desiredFjd,
        effectiveRate: safeRate,
        requiredForeign: foreignAmountRequired,
        fjdResult: desiredFjd
      };
    }
  }, [calcMode, targetCurrency, baseAmount, exchangeRate, includeBankFee, bankFeeAmount, includeVat, vatRate]);

  // Copy breakdown to clipboard
  const handleCopyBreakdown = async () => {
    try {
      const cfg = getCurrencyConfig(targetCurrency);
      let text = '';
      if (calcMode === 'forward') {
        text = `Currency conversion:
• Amount: ${cfg.code} ${calculations.foreignAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
• Exchange rate: 1 ${cfg.code} = ${calculations.exchangeRate.toFixed(4)} ${homeCurrency}
• Converted: ${homeCurrency} $${calculations.grossFjd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        if (includeBankFee && calculations.bankFee > 0) {
          text += `\n• Bank fee: -${homeCurrency} $${calculations.bankFee.toFixed(2)}`;
          text += `\n• Received: ${homeCurrency} $${calculations.netFjd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
          text += `\n• Effective rate: 1 ${cfg.code} = ${calculations.effectiveRate.toFixed(4)} ${homeCurrency}`;
        }
      } else {
        text = `Quote to receive ${homeCurrency} $${calculations.netFjd.toLocaleString(undefined, { minimumFractionDigits: 2 })}:
• Quote: ${cfg.code} ${calculations.requiredForeign.toLocaleString(undefined, { minimumFractionDigits: 2 })}
• Exchange rate: 1 ${cfg.code} = ${calculations.exchangeRate.toFixed(4)} ${homeCurrency}
• Converted: ${homeCurrency} $${calculations.grossFjd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      }

      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Quick Preset Base Amounts
  const quickPresets = calcMode === 'forward' 
    ? [250, 500, 1000, 2500, 5000, 10000]
    : [500, 1000, 2000, 3500, 5000, 10000];

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50 animate-fade-in overflow-y-auto"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)'
      }}
    >
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[92vh] flex flex-col text-left">
        
        {/* Header */}
        <div className="bg-linear-to-r from-slate-900 via-sky-950 to-slate-900 p-4 text-white flex items-center justify-between relative shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">Exchange rate calculator</h3>
                <span className="bg-sky-500/30 text-sky-200 border border-sky-400/30 text-[9px] font-extrabold px-2 py-0.5 rounded-full font-mono">
                  FJD
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Convert foreign currency to Fiji dollars (FJD)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-slate-700 flex-1">
          
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setCalcMode('forward')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                calcMode === 'forward'
                  ? 'bg-white text-sky-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-sky-600" />
              <span>Foreign &rarr; FJD</span>
            </button>
            <button
              type="button"
              onClick={() => setCalcMode('reverse')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                calcMode === 'reverse'
                  ? 'bg-white text-sky-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Work out a quote</span>
            </button>
          </div>

          {/* Currency Selector & Quick Flag Chips */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <GlobeIcon className="w-3.5 h-3.5 text-sky-600" /> Currency
              </label>
              <span className="text-[10px] text-slate-400">
                Converting to <strong>{homeCurrency} (FJ$)</strong>
              </span>
            </div>

            <div className="relative">
              <select
                value={targetCurrency}
                onChange={(e) => handleSelectCurrency(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} ({c.symbol}) &mdash; {c.name} &bull; about 1 {c.code} = {c.approxFjdMultiplier} FJD
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Popular Currency Chips */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                <span>{workingCurrencies && workingCurrencies.length > 0 ? 'Your currencies' : 'Common currencies'}</span>
                {customExchangeRates && Object.keys(customExchangeRates).length > 0 && (
                  <span className="text-sky-600 font-semibold lowercase">using your saved rates</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-0.5">
                {(workingCurrencies && workingCurrencies.length > 0
                  ? workingCurrencies.filter(c => c !== homeCurrency)
                  : ['AUD', 'USD', 'NZD', 'EUR', 'GBP', 'CAD', 'SGD', 'JPY']
                ).map((code) => {
                  const cfg = getCurrencyConfig(code);
                  const isSelected = targetCurrency === code;
                  const hasCustom = !!customExchangeRates?.[code];
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleSelectCurrency(code)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      <span>{cfg.flag}</span>
                      <span>{code}</span>
                      {hasCustom && (
                        <span className={`text-[8px] px-1 py-0.2 rounded font-mono ${isSelected ? 'bg-sky-800 text-sky-100' : 'bg-sky-100 text-sky-700'}`}>
                          Fixed
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Grid of Inputs: Base Amount & Exchange Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            
            {/* Base Amount */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                {calcMode === 'forward'
                  ? `Amount (${targetConfig.code} ${targetConfig.symbol})`
                  : `Amount you want (${homeCurrency} FJ$)`}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
                  {calcMode === 'forward' ? targetConfig.symbol : 'FJ$'}
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={baseAmount || ''}
                  onChange={(e) => setBaseAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                />
              </div>

              {/* Quick Amount Pills */}
              <div className="flex flex-wrap gap-1 pt-1">
                {quickPresets.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setBaseAmount(amt)}
                    className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                      baseAmount === amt
                        ? 'bg-sky-50 text-sky-700 border-sky-300'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    ${amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Exchange Rate Input */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Exchange rate
                </label>
                <button
                  type="button"
                  onClick={handleResetBenchmarkRate}
                  title="Reset to the default rate"
                  className="text-[9.5px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-0.5 cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Reset
                </button>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
                  Rate
                </span>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={exchangeRate || ''}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                  placeholder="1.0000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-12 pr-3 text-sm font-mono font-bold text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                />
              </div>

              <div className="text-[10px] text-slate-500 pt-0.5 flex items-center justify-between">
                <span>
                  1 {targetConfig.code} = <strong>{exchangeRate ? exchangeRate.toFixed(4) : '0.0000'} FJD</strong>
                </span>
                {exchangeRate > 0 && (
                  <span className="text-slate-400 text-[9px]">
                    (1 FJD = {(1 / exchangeRate).toFixed(4)} {targetConfig.code})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Optional Bank Wire & VAT Deductions Accordion */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-slate-600" />
                <span className="font-bold text-slate-700 text-[11px]">Bank transfer fee</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBankFee}
                  onChange={(e) => setIncludeBankFee(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-600"></div>
              </label>
            </div>

            {includeBankFee && (
              <div className="pt-1.5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 animate-fade-in">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Transfer fee (FJD)</label>
                  <div className="relative mt-1">
                    <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400">FJ$</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={bankFeeAmount}
                      onChange={(e) => setBankFeeAmount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-2 text-xs font-bold text-slate-700"
                    />
                  </div>
                </div>
                <div className="flex items-end pb-1 text-[10px] text-slate-500">
                  <span>Banks in Fiji often charge FJ$10–25 per international transfer. Check with yours.</span>
                </div>
              </div>
            )}
          </div>

          {/* PRIMARY CALCULATION RESULT CARD */}
          <div className="bg-linear-to-br from-sky-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-sky-700/40 relative overflow-hidden">
            
            {/* Background ambient glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between text-sky-200 text-[10.5px] uppercase font-bold tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-sky-400" />
                {calcMode === 'forward' ? 'Amount in FJD' : 'Amount to quote'}
              </span>
              <span className="bg-sky-400/20 text-sky-200 text-[9px] px-2 py-0.5 rounded-full font-mono">
                {calculations.foreignCurrency} &harr; {homeCurrency}
              </span>
            </div>

            {/* Big Main Converted Number */}
            <div className="my-2">
              {calcMode === 'forward' ? (
                <div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight flex items-baseline gap-1.5">
                    <span className="text-sky-300 text-lg font-bold">FJ$</span>
                    {calculations.grossFjd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xs font-semibold text-slate-300 font-sans ml-1">FJD</span>
                  </div>
                  <p className="text-[11px] text-sky-200/80 mt-1">
                    {targetConfig.symbol}{calculations.foreignAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {targetConfig.code} &times; {calculations.exchangeRate.toFixed(4)}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-amber-300 tracking-tight flex items-baseline gap-1.5">
                    <span className="text-amber-200 text-lg font-bold">{targetConfig.symbol}</span>
                    {calculations.requiredForeign.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xs font-semibold text-slate-300 font-sans ml-1">{targetConfig.code}</span>
                  </div>
                  <p className="text-[11px] text-sky-200/80 mt-1">
                    Quote this to receive FJ$ {calculations.netFjd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>

            {/* Breakdown itemized list */}
            <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5 text-[11px]">
              <div className="flex justify-between text-slate-300">
                <span>Foreign amount:</span>
                <span className="font-mono font-bold text-white">
                  {targetConfig.code} {targetConfig.symbol}{calculations.foreignAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Exchange rate:</span>
                <span className="font-mono text-sky-300">
                  1 {targetConfig.code} = {calculations.exchangeRate.toFixed(4)} FJD
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>In FJD:</span>
                <span className="font-mono font-bold text-white">
                  FJ$ {calculations.grossFjd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              {includeBankFee && calculations.bankFee > 0 && (
                <>
                  <div className="flex justify-between text-rose-300">
                    <span>Bank fee:</span>
                    <span className="font-mono">- FJ$ {calculations.bankFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-300 font-bold pt-1 border-t border-white/10">
                    <span>You receive:</span>
                    <span className="font-mono">FJ$ {calculations.netFjd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-300 text-[10px]">
                    <span>Effective rate:</span>
                    <span className="font-mono text-emerald-400">
                      1 {targetConfig.code} = {calculations.effectiveRate.toFixed(4)} FJD
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Benchmark Reference Rates Table Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2 text-left">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-sky-600" /> Reference rates
              </span>
              <span className="text-[9.5px] text-slate-400">Approximate, in FJD</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10.5px]">
              {SUPPORTED_CURRENCIES.slice(1, 9).map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleSelectCurrency(c.code)}
                  className={`p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                    targetCurrency === c.code
                      ? 'bg-sky-50 border-sky-300 text-sky-900 font-bold'
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs">{c.flag} {c.code}</span>
                    <span className="font-mono font-bold text-[10px] text-slate-800">
                      {c.approxFjdMultiplier}
                    </span>
                  </div>
                  <span className="text-[8.5px] text-slate-400 truncate block mt-0.5">
                    1 {c.code} &approx; ${c.approxFjdMultiplier} FJD
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyBreakdown}
            className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Copy summary</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            {onApplyExpenseWithFx && (
              <button
                type="button"
                onClick={() => {
                  const foreignAmt = calcMode === 'forward' ? calculations.foreignAmount : calculations.requiredForeign;
                  onApplyExpenseWithFx({
                    foreignCurrency: targetCurrency,
                    foreignAmount: foreignAmt,
                    exchangeRate: calculations.exchangeRate,
                    homeAmount: calculations.grossFjd,
                    notes: `Foreign expense paid in ${targetCurrency} (${targetCurrency} $${foreignAmt.toFixed(2)} @ 1 ${targetCurrency} = ${calculations.exchangeRate.toFixed(4)} ${homeCurrency} = ${homeCurrency} $${calculations.grossFjd.toFixed(2)})`
                  });
                  onClose();
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm shadow-emerald-600/20 cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Use for expense ({homeCurrency} ${calculations.grossFjd.toFixed(2)})</span>
              </button>
            )}

            {onCreateDocumentWithFx && (
              <button
                type="button"
                onClick={() => {
                  onCreateDocumentWithFx({
                    currency: targetCurrency,
                    amount: calcMode === 'forward' ? calculations.foreignAmount : calculations.requiredForeign,
                    exchangeRate: calculations.exchangeRate,
                    fjdEquivalent: calculations.grossFjd,
                    notes: `Billed in ${targetCurrency} at 1 ${targetCurrency} = ${calculations.exchangeRate.toFixed(4)} ${homeCurrency} (${homeCurrency} equivalent: $${calculations.grossFjd.toFixed(2)})`
                  });
                  onClose();
                }}
                className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm shadow-sky-600/20 cursor-pointer"
              >
                <FilePlus className="w-3.5 h-3.5" />
                <span>Draft invoice in {targetCurrency}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10" strokeWidth="2" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" strokeWidth="2" />
    </svg>
  );
}
