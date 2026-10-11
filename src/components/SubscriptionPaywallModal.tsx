import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Zap, Check, ShieldCheck, Sparkles, Smartphone, CreditCard, 
  Building2, ArrowRight, X, CheckCircle2, Lock, Star, HelpCircle,
  Clock, RefreshCw
} from 'lucide-react';
import { PlanTier, PlatformSettings, CRMData } from '../types';

interface SubscriptionPaywallModalProps {
  currentPlan: PlanTier;
  onClose: () => void;
  onUpgradePlan: (newPlan: PlanTier, paymentDetails?: any) => void;
  reason?: string; // Optional message e.g. "You reached the limit of 5 invoices on Free plan"
}

export default function SubscriptionPaywallModal({
  currentPlan,
  onClose,
  onUpgradePlan,
  reason
}: SubscriptionPaywallModalProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(currentPlan === 'free' ? 'pro' : 'premium');

  const plans = [
    {
      id: 'free' as PlanTier,
      name: 'Free Starter',
      tagline: 'For solo freelancers starting out in Fiji',
      monthlyPrice: 0,
      annualPrice: 0,
      badge: 'Current Plan',
      features: [
        'Up to 5 invoices a month',
        'Up to 3 active clients',
        '1 business profile',
        'PDF export',
        'Community support',
      ],
      limits: 'Basic Features'
    },
    {
      id: 'pro' as PlanTier,
      name: 'Freelance Pro',
      tagline: 'For working consultants, developers and creatives',
      monthlyPrice: 25,
      annualPrice: 240, // $20/mo
      badge: 'Most Popular',
      popular: true,
      features: [
        'Unlimited invoices and receipts',
        'Up to 30 clients and projects',
        '3 business profiles',
        'AI receipt and invoice scanning',
        'Recurring invoices and retainers',
        'Your own logo and brand colour',
        'Escrow wallet',
        'M-PAiSA and MyCash payments',
        'Standard support'
      ],
      limits: 'High Quota'
    },
    {
      id: 'premium' as PlanTier,
      name: 'Agency Premium',
      tagline: 'For studios, agencies and teams',
      monthlyPrice: 50,
      annualPrice: 480, // $40/mo
      badge: 'Best Value',
      features: [
        'Unlimited invoices, clients and projects',
        'Up to 10 business profiles',
        'Client portal',
        'Invoices in FJD, AUD, USD and NZD',
        'Bank statement import and reconciliation',
        '200 AI scans a month'
      ],
      limits: 'Unlimited Scale'
    }
  ];

  const currentPlanObj = plans.find(p => p.id === selectedPlan) || plans[1];
  const price = billingCycle === 'annual' ? currentPlanObj.annualPrice : currentPlanObj.monthlyPrice;
  const monthlyEquivalent = billingCycle === 'annual' ? Math.round(currentPlanObj.annualPrice / 12) : currentPlanObj.monthlyPrice;

  return (
    <div 
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)'
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* Modal Top Bar */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">Plans</h3>
              <p className="text-[10px] text-slate-400">All plans are free during early access</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 text-slate-700 font-sans text-xs">
          
          {/* Reason Alert (if triggered by hitting quota) */}
          {reason && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3.5 flex items-center gap-3">
              <Zap className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <strong className="block text-xs">Upgrade needed</strong>
                <p className="text-[11px] text-amber-800">{reason}</p>
              </div>
            </div>
          )}

          <>
              {/* Header Title & Billing Cycle Toggle */}
              <div className="text-center space-y-3 max-w-xl mx-auto">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Choose a plan
                </h2>
                <p className="text-slate-500 text-xs sm:text-sm">
                  Invoices with Fiji VAT, M-PAiSA payments, escrow and room for more than one business.
                </p>

                {/* Monthly / Annual Toggle */}
                <div className="inline-flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 mt-2">
                  <button
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle('annual')}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      billingCycle === 'annual' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>Annual</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                      billingCycle === 'annual' ? 'bg-amber-400 text-slate-950' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      SAVE 20%
                    </span>
                  </button>
                </div>
              </div>

              {/* Plan Pricing Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {plans.map((plan) => {
                  const isSelected = selectedPlan === plan.id;
                  const isCurrent = currentPlan === plan.id;
                  const planPrice = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
                  const perMonth = billingCycle === 'annual' ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;

                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`rounded-3xl p-5 border-2 transition-all cursor-pointer flex flex-col justify-between relative ${
                        isSelected 
                          ? 'border-sky-600 bg-sky-50/40 shadow-lg scale-[1.02]' 
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      {/* Popular / Recommended Badge */}
                      {plan.popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-sky-600 text-white font-black text-[9px] uppercase tracking-wider px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
                          Recommended
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-start">
                            <h4 className="font-black text-slate-900 text-base">{plan.name}</h4>
                            {isCurrent && (
                              <span className="bg-slate-100 text-slate-700 text-[9px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-snug">{plan.tagline}</p>
                        </div>

                        {/* Price */}
                        <div className="py-2 border-y border-slate-100">
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs font-bold text-slate-400">FJD</span>
                            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
                              ${perMonth}
                            </span>
                            <span className="text-[11px] text-slate-500">/ month</span>
                          </div>
                          {billingCycle === 'annual' && planPrice > 0 && (
                            <p className="text-[10px] text-sky-700 font-semibold mt-0.5">
                              FJD ${planPrice} a year (2 months free)
                            </p>
                          )}
                        </div>

                        {/* Feature List */}
                        <ul className="space-y-2 text-[11px]">
                          {plan.features.map((feat, fIdx) => (
                            <li key={fIdx} className="flex items-start gap-2 text-slate-600">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Select Plan Button */}
                      <div className="pt-5 mt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpgradePlan(plan.id, { method: 'early_access', billingCycle, amount: 0 });
                            onClose();
                          }}
                          className={`w-full py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            isSelected 
                              ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-md' 
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                          }`}
                        >
                          {isCurrent ? 'Keep plan' : plan.id === 'free' ? 'Switch to Free' : 'Choose ' + plan.name}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-100 text-center text-[11px] text-slate-500">
                Online billing isn&apos;t connected yet. During early access you can switch plans at no charge.
              </div>
          </>

        </div>

        {/* Modal Bottom Bar */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <span className="text-[10px] text-slate-400">Frilensa • Suva, Fiji</span>
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-900 font-bold px-4 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
