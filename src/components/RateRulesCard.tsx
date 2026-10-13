import React, { useState } from 'react';
import { Percent, Plus, Trash2, Calculator, ChevronRight } from 'lucide-react';
import { CRMData, RateRule } from '../types';

// Services → Rate rules: surcharges, discounts and multipliers (weekend, rush, after hours), and a
// calculator showing what a service costs with them applied.
export default function RateRulesCard({ data, onUpdateData }: { data: CRMData; onUpdateData: (d: CRMData) => void }) {
  const rateRules: RateRule[] = data.rateRules || [];
  const services = (data.services || []).filter(s => !s.businessId || s.businessId === data.activeBusinessId);

  // Rates module states
  const [showAddRule, setShowAddRule] = useState(false);


  // Form state for rate modifiers
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState<'surcharge' | 'discount' | 'multiplier'>('multiplier');
  const [ruleValue, setRuleValue] = useState(1.5);
  const [ruleUnit, setRuleUnit] = useState<'percent' | 'flat' | 'multiplier'>('multiplier');
  const [ruleApplies, setRuleApplies] = useState<'all' | 'weekend' | 'rush' | 'after-hours'>('weekend');
  const [ruleDesc, setRuleDesc] = useState('');

  // Rate playground interactive states
  const [selectedPlaygroundSrv, setSelectedPlaygroundSrv] = useState<string>('');
  const [playgroundHours, setPlaygroundHours] = useState(10);
  const [activePlaygroundRules, setActivePlaygroundRules] = useState<string[]>(['rule-1', 'rule-2']);

  // Create a new rate rule (Weekend, Rush, Discount)
  const handleAddRateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName || ruleValue === 0) return;

    const newRule: RateRule = {
      id: `rule-${Date.now()}`,
      name: ruleName,
      type: ruleType,
      value: Number(ruleValue),
      unit: ruleUnit,
      appliesTo: ruleApplies,
      description: ruleDesc || `${ruleName} custom rule`,
      isActive: true
    };

    onUpdateData({
      ...data,
      rateRules: [...rateRules, newRule]
    });

    // Reset and close
    setRuleName('');
    setRuleDesc('');
    setShowAddRule(false);
    setActivePlaygroundRules(prev => [...prev, newRule.id]);
  };

  const handleToggleRuleActive = (id: string) => {
    const updated = rateRules.map(r => 
      r.id === id ? { ...r, isActive: !r.isActive } : r
    );
    onUpdateData({
      ...data,
      rateRules: updated
    });
  };

  const handleDeleteRule = (id: string) => {
    if (confirm('Delete this rate rule?')) {
      onUpdateData({
        ...data,
        rateRules: rateRules.filter(r => r.id !== id)
      });
      setActivePlaygroundRules(prev => prev.filter(rid => rid !== id));
    }
  };


  // Calculate live dynamic rates based on chosen options
  const selectedService = services.find(s => s.id === selectedPlaygroundSrv) || services[0];
  
  const calculatePlaygroundRate = () => {
    if (!selectedService) return { baseRate: 0, subtotal: 0, surcharges: 0, discounts: 0, multiplierLabel: '', rawTotal: 0, vatAmount: 0, totalRate: 0, finalRatePerUnit: 0, breakdownSteps: [] as string[] };

    let currentRate = selectedService.rate;
    let baseRate = selectedService.rate;
    let subtotal = currentRate * (selectedService.unit === 'Hour' ? playgroundHours : 1);
    let surcharges = 0;
    let discounts = 0;
    let multiplierMultiplier = 1;
    const steps: string[] = [`Base rate: FJD $${baseRate.toFixed(2)} per ${selectedService.unit.toLowerCase()}`];

    // Read active rules selected in checklist
    activePlaygroundRules.forEach(ruleId => {
      const rule = rateRules.find(r => r.id === ruleId);
      if (rule && rule.isActive) {
        if (rule.type === 'multiplier') {
          multiplierMultiplier *= rule.value;
          steps.push(`${rule.name}: ${rule.value}x`);
        } else if (rule.type === 'surcharge') {
          if (rule.unit === 'flat') {
            surcharges += rule.value;
            steps.push(`${rule.name}: +FJD $${rule.value.toFixed(2)}`);
          } else {
            const surchargeAmt = (baseRate * rule.value) / 100;
            surcharges += surchargeAmt;
            steps.push(`${rule.name}: +${rule.value}% (+FJD $${surchargeAmt.toFixed(2)})`);
          }
        } else if (rule.type === 'discount') {
          if (rule.unit === 'flat') {
            discounts += Math.abs(rule.value);
            steps.push(`${rule.name}: -FJD $${Math.abs(rule.value).toFixed(2)}`);
          } else {
            const discountAmt = (baseRate * Math.abs(rule.value)) / 100;
            discounts += discountAmt;
            steps.push(`${rule.name}: -${Math.abs(rule.value)}% (-FJD $${discountAmt.toFixed(2)})`);
          }
        }
      }
    });

    // Multipliers affect base hourly/flat rate first
    const rateWithMultiplier = baseRate * multiplierMultiplier;
    const finalRatePerUnit = rateWithMultiplier + surcharges - discounts;
    const rawTotal = finalRatePerUnit * (selectedService.unit === 'Hour' ? playgroundHours : 1);

    // standard VAT included component (default 12.5% or configured)
    const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
    const vatDivisor = 1 + (currentVatRate / 100);
    const vatIncluded = rawTotal - (rawTotal / vatDivisor);

    return {
      baseRate,
      finalRatePerUnit,
      rawTotal,
      vatAmount: vatIncluded,
      breakdownSteps: steps
    };
  };

  const ratePlaygroundResults = calculatePlaygroundRate();

  return (
    <div className="space-y-4">
            {/* Dynamic Rate Modifiers Builder Section */}
            <div className="bg-white border border-zinc-150 rounded-2xl p-4 shadow-sm space-y-3.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Percent className="w-4.5 h-4.5 text-indigo-600" />
                  <h3 className="text-xs font-black uppercase text-zinc-500 tracking-wider font-sans">Rate rules</h3>
                </div>
                <button
                  onClick={() => setShowAddRule(!showAddRule)}
                  className="text-[9.5px] bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-2 py-1 rounded-lg flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add rule
                </button>
              </div>

              {/* Form to add custom RateRule */}
              {showAddRule && (
                <form onSubmit={handleAddRateRule} className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-3 text-zinc-800 animate-fade-in">
                  <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider block">New rate rule</span>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Night shift"
                        value={ruleName}
                        onChange={(e) => setRuleName(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Applies to</label>
                      <select
                        value={ruleApplies}
                        onChange={(e) => setRuleApplies(e.target.value as any)}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px]"
                      >
                        <option value="weekend">Weekends</option>
                        <option value="rush">Rush jobs</option>
                        <option value="after-hours">After hours</option>
                        <option value="all">All work</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Type</label>
                      <select
                        value={ruleType}
                        onChange={(e) => {
                          setRuleType(e.target.value as any);
                          if (e.target.value === 'multiplier') {
                            setRuleUnit('multiplier');
                            setRuleValue(1.5);
                          } else {
                            setRuleUnit('flat');
                            setRuleValue(50);
                          }
                        }}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px]"
                      >
                        <option value="multiplier">Multiplier (e.g. 1.5x)</option>
                        <option value="surcharge">Surcharge</option>
                        <option value="discount">Discount</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Value</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={ruleValue}
                        onChange={(e) => setRuleValue(Number(e.target.value))}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Unit</label>
                      <select
                        value={ruleUnit}
                        onChange={(e) => setRuleUnit(e.target.value as any)}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px]"
                      >
                        {ruleType === 'multiplier' ? (
                          <option value="multiplier">Multiplier (x)</option>
                        ) : (
                          <>
                            <option value="flat">Fixed amount (FJD)</option>
                            <option value="percent">Percentage (%)</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-zinc-500 uppercase block">Description</label>
                      <input
                        type="text"
                        placeholder="e.g. Weekend rates apply"
                        value={ruleDesc}
                        onChange={(e) => setRuleDesc(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-lg p-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddRule(false)}
                      className="bg-zinc-200 text-zinc-700 text-[10px] font-bold px-3 py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg animate-pulse"
                    >
                      Save rule
                    </button>
                  </div>
                </form>
              )}

              {rateRules.length === 0 && !showAddRule && (
                <p className="text-[11px] text-zinc-500">No rate rules yet. Add one for weekend, rush or after-hours work, or a standing discount.</p>
              )}
              <div className="space-y-2.5">
                {rateRules.map((rule) => (
                  <div key={rule.id} className="p-3 bg-zinc-50 border border-zinc-150 rounded-xl flex items-center justify-between group">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="p-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs">
                          {rule.type === 'multiplier' ? '✖' : rule.type === 'surcharge' ? '➕' : '➖'}
                        </span>
                        <h4 className="text-[10.5px] font-black text-zinc-800 truncate leading-snug">{rule.name}</h4>
                        <span className="text-[7.5px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-800 px-1 rounded">
                          {rule.appliesTo}
                        </span>
                      </div>
                      <p className="text-[9.5px] text-zinc-400 mt-1 leading-normal">{rule.description}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono font-black text-zinc-900">
                        {rule.type === 'multiplier' 
                          ? `${rule.value}x` 
                          : `${rule.value > 0 ? '+' : ''}FJD $${Math.abs(rule.value).toFixed(2)}${rule.unit === 'percent' ? '%' : ''}`
                        }
                      </span>
                      
                      <button
                        onClick={() => handleToggleRuleActive(rule.id)}
                        className={`text-[8.5px] font-extrabold px-2 py-1 rounded-lg transition-all ${
                          rule.isActive 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-zinc-200 text-zinc-500'
                        }`}
                      >
                        {rule.isActive ? 'On' : 'Off'}
                      </button>

                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-600 rounded transition-all"
                        title="Delete rule"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>


            {/* Interactive Dynamic Rate Playground Simulator */}
            <div className="bg-indigo-950 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden space-y-4">
              <div className="absolute right-0 top-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-800 text-sky-400 rounded-xl">
                  <Calculator className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-sky-400">Rate calculator</h4>
                  <p className="text-[9px] text-zinc-300">See what a service costs with your rate rules applied.</p>
                </div>
              </div>

              {services.length === 0 && (
                <p className="text-[11px] text-zinc-300">Add a service on the <strong>Services</strong> tab to try your rate rules on it.</p>
              )}

              {/* Selector */}
              <div className="space-y-3 pt-1 text-zinc-800">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-indigo-300 tracking-wider block">1. Service</label>
                  <select
                    value={selectedPlaygroundSrv}
                    onChange={(e) => setSelectedPlaygroundSrv(e.target.value)}
                    className="w-full bg-white border border-indigo-900 rounded-xl p-2 text-xs font-bold text-zinc-800 focus:outline-none"
                  >
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (FJD ${s.rate}/{s.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedService?.unit === 'Hour' && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[8px] font-black uppercase text-indigo-300 tracking-wider">2. Hours</label>
                      <span className="text-[10px] text-sky-400 font-mono font-bold">{playgroundHours} hrs</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="120"
                      value={playgroundHours}
                      onChange={(e) => setPlaygroundHours(Number(e.target.value))}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>
                )}

                {/* Modifiers checklist inside sandbox */}
                <div className="space-y-1 text-white">
                  <label className="text-[8px] font-black uppercase text-indigo-300 tracking-wider block">3. Rate rules</label>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {rateRules.map((rule) => {
                      const isRuleChecked = activePlaygroundRules.includes(rule.id) && rule.isActive;
                      return (
                        <button
                          key={rule.id}
                          type="button"
                          onClick={() => {
                            if (activePlaygroundRules.includes(rule.id)) {
                              setActivePlaygroundRules(prev => prev.filter(rid => rid !== rule.id));
                            } else {
                              setActivePlaygroundRules(prev => [...prev, rule.id]);
                            }
                          }}
                          className={`p-2 rounded-xl text-[9.5px] font-extrabold text-left transition-all border flex items-center justify-between ${
                            isRuleChecked 
                              ? 'bg-indigo-900/80 border-sky-400 text-white shadow-xs' 
                              : 'bg-indigo-950/40 border-indigo-900 text-zinc-400 hover:text-zinc-300'
                          }`}
                        >
                          <span className="truncate pr-1">{rule.name}</span>
                          <span className="font-mono text-[9px] text-sky-400">
                            {rule.type === 'multiplier' ? `${rule.value}x` : `${rule.value > 0 ? '+' : '-'}${Math.abs(rule.value)}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Dynamic Rate Receipt Render */}
              <div className="bg-indigo-950/60 border border-indigo-900 rounded-2xl p-4 space-y-3 font-mono">
                <div className="flex justify-between items-center border-b border-indigo-900 pb-1.5">
                  <span className="text-[8px] font-extrabold text-indigo-300 uppercase tracking-widest">Breakdown</span>
                  <span className="text-[8px] bg-indigo-900 text-sky-400 px-1.5 py-0.5 rounded font-bold uppercase">Estimate</span>
                </div>

                <div className="space-y-1 text-zinc-300 text-[10px] leading-relaxed">
                  {ratePlaygroundResults.breakdownSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <ChevronRight className="w-3 h-3 text-sky-400 shrink-0" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-indigo-900 pt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>Rate per unit</span>
                    <span>FJD ${ratePlaygroundResults.finalRatePerUnit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-indigo-300">
                    <span>VAT included ({data.userProfile.defaultVatRate ?? 12.5}%)</span>
                    <span>FJD ${ratePlaygroundResults.vatAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-white font-black text-sm pt-1 border-t border-dashed border-indigo-900/50">
                    <span className="font-display">Total to client</span>
                    <span className="font-mono text-sky-400">FJD ${ratePlaygroundResults.rawTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
    </div>
  );
}
