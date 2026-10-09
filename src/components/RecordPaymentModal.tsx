import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, ArrowRightLeft, CheckCircle2, X, Percent, 
  Building2, ShieldCheck, Clock, AlertCircle, Info, Sparkles, 
  HelpCircle, Receipt, ArrowDownRight, Wallet, Check
} from 'lucide-react';
import { CRMDocument, CRMData, Business, Client, PaymentAttachment } from '../types';
import { SUPPORTED_CURRENCIES, getCurrencyConfig, computeFxConversion, formatCurrencyAmount } from '../lib/currencies';
import PaymentAttachmentWidget from './PaymentAttachmentWidget';

interface RecordPaymentModalProps {
  isOpen: boolean;
  document: CRMDocument | null;
  data: CRMData;
  onClose: () => void;
  onConfirmPayment: (
    docId: string,
    paymentDetails: {
      paymentMethod: string;
      paidAmountForeign?: number;
      paidAmountHome?: number;
      exchangeRate?: number;
      bankFeesDeduction?: number;
      netReceivedHome?: number;
      paymentExchangeNotes?: string;
      notes?: string;
      paymentDate?: string;
      autoLogTransaction?: boolean;
      paymentAttachments?: PaymentAttachment[];
    }
  ) => void;
}

export default function RecordPaymentModal({
  isOpen,
  document,
  data,
  onClose,
  onConfirmPayment
}: RecordPaymentModalProps) {
  if (!isOpen || !document) return null;

  const homeCurrency = data.userProfile.defaultCurrency || 'FJD';
  const docCurrency = document.currency || homeCurrency;
  const isForeignCurrency = docCurrency.toUpperCase() !== homeCurrency.toUpperCase();

  const docCurrencyCfg = getCurrencyConfig(docCurrency);
  const homeCurrencyCfg = getCurrencyConfig(homeCurrency);
  const client = data.clients.find(c => c.id === document.clientId);
  const business = data.businesses.find(b => b.id === document.businessId) || data.businesses[0];

  // Form states
  const [foreignAmount, setForeignAmount] = useState<number>(document.total);
  const [exchangeRate, setExchangeRate] = useState<number>(() => {
    return document.exchangeRate || docCurrencyCfg.approxFjdMultiplier || 1.485;
  });
  const [grossHomeAmount, setGrossHomeAmount] = useState<number>(() => {
    if (document.paidAmountHome) return document.paidAmountHome;
    const rate = document.exchangeRate || docCurrencyCfg.approxFjdMultiplier || 1.0;
    return Number((document.total * rate).toFixed(2));
  });
  const [calculationMode, setCalculationMode] = useState<'rate' | 'gross'>('rate');
  const [bankDeduction, setBankDeduction] = useState<number>(document.bankFeesDeduction || 0);
  const [paymentMethod, setPaymentMethod] = useState<string>(() => {
    if (document.paymentMethod) return document.paymentMethod;
    return isForeignCurrency ? 'Overseas Telegraphic Transfer (TT)' : 'Vodafone M-PAiSA';
  });
  const [paymentDate, setPaymentDate] = useState<string>(() => {
    return document.paymentDate || new Date().toISOString().split('T')[0];
  });
  const [referenceNotes, setReferenceNotes] = useState<string>(() => {
    return document.paymentExchangeNotes || '';
  });
  const [notes, setNotes] = useState<string>(() => {
    return document.notes || '';
  });
  const [autoLogTx, setAutoLogTx] = useState<boolean>(true);
  const [attachments, setAttachments] = useState<PaymentAttachment[]>(() => {
    return document.paymentAttachments || [];
  });

  // Sync state if document changes
  useEffect(() => {
    if (!document) return;
    setForeignAmount(document.total);
    const rate = document.exchangeRate || docCurrencyCfg.approxFjdMultiplier || 1.485;
    setExchangeRate(rate);
    setGrossHomeAmount(document.paidAmountHome || Number((document.total * rate).toFixed(2)));
    setCalculationMode('rate');
    setBankDeduction(document.bankFeesDeduction || 0);
    setPaymentMethod(document.paymentMethod || (isForeignCurrency ? 'Overseas Telegraphic Transfer (TT)' : 'Vodafone M-PAiSA'));
    setPaymentDate(document.paymentDate || new Date().toISOString().split('T')[0]);
    setReferenceNotes(document.paymentExchangeNotes || '');
    setNotes(document.notes || '');
    setAttachments(document.paymentAttachments || []);
  }, [document?.id]);

  // Sync calculations whenever inputs change
  const fxResult = computeFxConversion({
    foreignAmount,
    foreignCurrency: docCurrency,
    homeCurrency,
    exchangeRate: calculationMode === 'rate' ? exchangeRate : undefined,
    grossHomeAmount: calculationMode === 'gross' ? grossHomeAmount : undefined,
    bankFeesDeduction: bankDeduction
  });

  const handleRateChange = (newRate: number) => {
    setCalculationMode('rate');
    setExchangeRate(newRate);
    if (foreignAmount > 0) {
      setGrossHomeAmount(Number((foreignAmount * newRate).toFixed(2)));
    }
  };

  const handleGrossChange = (newGross: number) => {
    setCalculationMode('gross');
    setGrossHomeAmount(newGross);
    if (foreignAmount > 0) {
      setExchangeRate(Number((newGross / foreignAmount).toFixed(4)));
    }
  };

  const handleForeignAmountChange = (newForeign: number) => {
    setForeignAmount(newForeign);
    if (calculationMode === 'rate') {
      setGrossHomeAmount(Number((newForeign * exchangeRate).toFixed(2)));
    } else if (newForeign > 0) {
      setExchangeRate(Number((grossHomeAmount / newForeign).toFixed(4)));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isForeignCurrency) {
      onConfirmPayment(document.id, {
        paymentMethod,
        paidAmountForeign: foreignAmount,
        paidAmountHome: fxResult.grossHomeAmount,
        exchangeRate: fxResult.exchangeRate,
        bankFeesDeduction: fxResult.bankFeesDeduction,
        netReceivedHome: fxResult.netReceivedHome,
        paymentExchangeNotes: referenceNotes.trim() || `Paid ${docCurrency} ${foreignAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} @ ${fxResult.exchangeRate} ${homeCurrency}/${docCurrency}. Fee: ${homeCurrency} $${fxResult.bankFeesDeduction}. Net: ${homeCurrency} $${fxResult.netReceivedHome.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
        notes: notes.trim(),
        paymentDate,
        autoLogTransaction: autoLogTx,
        paymentAttachments: attachments
      });
    } else {
      // Local currency payment
      const gross = foreignAmount;
      const deduction = bankDeduction;
      const net = Math.max(0, gross - deduction);

      onConfirmPayment(document.id, {
        paymentMethod,
        paidAmountForeign: gross,
        paidAmountHome: gross,
        exchangeRate: 1.0,
        bankFeesDeduction: deduction,
        netReceivedHome: net,
        paymentExchangeNotes: referenceNotes.trim() || (deduction > 0 ? `Transaction fee: ${homeCurrency} $${deduction}. Net banked: ${homeCurrency} $${net.toFixed(2)}.` : undefined),
        notes: notes.trim(),
        paymentDate,
        autoLogTransaction: autoLogTx,
        paymentAttachments: attachments
      });
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white p-5 relative shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1 text-sky-300 text-[10px] font-extrabold uppercase tracking-wider">
              <Receipt className="w-3.5 h-3.5" />
              <span>Record Payment & Exchange Settlement</span>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                  <span>{document.documentNumber}</span>
                  <span className="text-xs font-normal text-slate-300">({document.type.toUpperCase()})</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Client: <strong className="text-white">{client?.name || 'Valued Client'}</strong>
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Billed Total</span>
                <span className="text-base font-black font-mono text-emerald-400 flex items-center justify-end gap-1">
                  <span>{docCurrencyCfg.flag}</span>
                  <span>{docCurrency} ${document.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-left flex-1">
            
            {/* Multi-Currency Conversion Workspace */}
            {isForeignCurrency ? (
              <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sky-900 font-extrabold text-xs">
                    <ArrowRightLeft className="w-4 h-4 text-sky-600" />
                    <span>Foreign Currency Conversion & Deductions</span>
                  </div>
                  <span className="bg-sky-200/70 text-sky-800 text-[9px] font-black px-2 py-0.5 rounded-full font-mono">
                    {docCurrency} ➔ {homeCurrency}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Foreign Amount Paid */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                      Foreign Amount Received ({docCurrency})
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                        {docCurrencyCfg.flag} {docCurrency}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={foreignAmount}
                        onChange={(e) => handleForeignAmountChange(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-300 rounded-xl py-2 pl-18 pr-3 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
                      />
                    </div>
                  </div>

                  {/* Calculation Mode Toggle & Exchange Rate */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        Exchange Rate (1 {docCurrency} = X {homeCurrency})
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRateChange(docCurrencyCfg.approxFjdMultiplier || 1.485)}
                        className="text-[9px] font-bold text-sky-700 hover:underline cursor-pointer flex items-center gap-0.5"
                        title="Reset to standard reference rate"
                      >
                        <Sparkles className="w-2.5 h-2.5" /> Est. Rate
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        required
                        value={exchangeRate}
                        onChange={(e) => handleRateChange(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
                        placeholder="e.g. 1.4850"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Gross Converted Home Amount */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                      Gross Banked in {homeCurrency} (Before Deductions)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                        {homeCurrencyCfg.flag} {homeCurrency}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={grossHomeAmount}
                        onChange={(e) => handleGrossChange(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-slate-300 rounded-xl py-2 pl-18 pr-3 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600"
                      />
                    </div>
                  </div>

                  {/* Bank Fees & International Wire Deductions */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                      Bank Wire / Intermediary Fee ({homeCurrency})
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                        {homeCurrencyCfg.flag} -
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={bankDeduction}
                        onChange={(e) => setBankDeduction(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full bg-white border border-slate-300 rounded-xl py-2 pl-12 pr-3 text-xs font-mono font-bold text-rose-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 mt-0.5 block">e.g. $15 telegraphic transfer fee</span>
                  </div>
                </div>

                {/* Net Summary Calculation Card */}
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[9.5px] font-extrabold text-emerald-800 uppercase tracking-wider block">
                      Net Banked Revenue ({homeCurrency})
                    </span>
                    <span className="text-[10px] text-emerald-700 flex items-center gap-1 mt-0.5">
                      <span>Effective Rate:</span>
                      <strong className="font-mono">1 {docCurrency} = {fxResult.effectiveNetExchangeRate} {homeCurrency}</strong>
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-base font-black font-mono text-emerald-950 block">
                      {homeCurrency} ${fxResult.netReceivedHome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {fxResult.bankFeesDeduction > 0 && (
                      <span className="text-[9px] text-rose-600 font-mono">
                        (-{homeCurrency} ${fxResult.bankFeesDeduction.toFixed(2)} fee)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Local Currency Settlement */
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                      Amount Paid ({homeCurrency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={foreignAmount}
                      onChange={(e) => setForeignAmount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                      Deductions / Gateway Fees ({homeCurrency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bankDeduction}
                      onChange={(e) => setBankDeduction(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-600"
                    />
                  </div>
                </div>

                {bankDeduction > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                    <span className="text-slate-500 font-bold">Net Banked:</span>
                    <span className="font-mono font-black text-emerald-700">
                      {homeCurrency} ${(Math.max(0, foreignAmount - bankDeduction)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Payment Method & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  Settlement Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-600 cursor-pointer"
                >
                  {isForeignCurrency ? (
                    <>
                      <option value="Overseas Telegraphic Transfer (TT)">Overseas Telegraphic Transfer (TT)</option>
                      <option value="ANZ Fiji International Wire">ANZ Fiji International Wire</option>
                      <option value="Westpac Fiji International TT">Westpac Fiji International TT</option>
                      <option value="BSP Fiji International Wire">BSP Fiji International Wire</option>
                      <option value="Vodafone M-PAiSA International">Vodafone M-PAiSA International Remittance</option>
                      <option value="Stripe / International Credit Card">Stripe / International Card</option>
                      <option value="PayPal / Payoneer">PayPal / Payoneer</option>
                      <option value="Foreign Currency Cash">Foreign Currency Cash</option>
                      <option value="Direct Bank Deposit">Direct Bank Deposit</option>
                    </>
                  ) : (
                    <>
                      <option value="Vodafone M-PAiSA">Vodafone M-PAiSA</option>
                      <option value="Digicel MyCash">Digicel MyCash</option>
                      <option value="Westpac Fiji Bank Transfer">Westpac Fiji Bank Transfer</option>
                      <option value="BSP Fiji Bank Transfer">BSP Fiji Bank Transfer</option>
                      <option value="ANZ Fiji Bank Transfer">ANZ Fiji Bank Transfer</option>
                      <option value="HFC Bank Transfer">HFC Bank Transfer</option>
                      <option value="Credit / Debit Card">Credit / Debit Card</option>
                      <option value="Cash / Cheque">Cash / Cheque</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            {/* Reference Number & Bank Notes */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                Reference ID / Transfer Memo (Optional)
              </label>
              <input
                type="text"
                value={referenceNotes}
                onChange={(e) => setReferenceNotes(e.target.value)}
                placeholder="e.g. TT Ref: ANZ-99824, M-Paisa Receipt #8812, etc."
                className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-600"
              />
            </div>

            {/* Auto-record in bookkeeping transactions checkbox */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/70">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 font-medium select-none">
                <input
                  type="checkbox"
                  checked={autoLogTx}
                  onChange={(e) => setAutoLogTx(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <div>
                  <span className="font-bold text-slate-800 block">Record in Cash Flow & Bookkeeping Ledger</span>
                  <span className="text-[10px] text-slate-500 block">
                    Automatically credits {homeCurrency} ${isForeignCurrency ? fxResult.netReceivedHome.toLocaleString(undefined, { minimumFractionDigits: 2 }) : (Math.max(0, foreignAmount - bankDeduction)).toLocaleString(undefined, { minimumFractionDigits: 2 })} into your reconciled financial records.
                  </span>
                </div>
              </label>
            </div>

            {/* Notes Section */}
            <div id="payment-modal-notes-section">
              <div className="flex items-center justify-between mb-1">
                <label 
                  htmlFor="payment-modal-notes-input" 
                  className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500"
                >
                  Notes (Optional)
                </label>
                {notes && (
                  <button
                    type="button"
                    onClick={() => setNotes('')}
                    className="text-[10px] text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <textarea
                id="payment-modal-notes-input"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Wire received in Westpac Suva branch, TT slip filed, payment verified with accountant."
                className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-600 resize-none transition-colors"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {[
                  'Payment cleared in full',
                  'Telegraphic transfer verified',
                  'Bank wire fee absorbed'
                ].map((tag, idx) => (
                  <button
                    key={tag}
                    id={`payment-note-preset-${idx}`}
                    type="button"
                    onClick={() => setNotes(prev => prev ? `${prev} • ${tag}` : tag)}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Record & Proof Attachments */}
            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/90">
              <PaymentAttachmentWidget
                attachments={attachments}
                onChange={setAttachments}
                title="Payment Proof & Remittance Records"
                description="Attach M-Paisa SMS screenshot, bank transfer receipt, telegraphic transfer slip, or deposit proof."
                allowCamera={true}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Log Payment</span>
              </button>
            </div>

          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
