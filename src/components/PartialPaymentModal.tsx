import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, DollarSign, X, Check, AlertCircle, Percent, Receipt, ArrowRight } from 'lucide-react';
import { CRMDocument, CRMData, PaymentAttachment } from '../types';
import { getCurrencyConfig } from '../lib/currencies';
import DateInput from './DateInput';
import PaymentAttachmentWidget from './PaymentAttachmentWidget';

interface PartialPaymentModalProps {
  isOpen: boolean;
  document: CRMDocument | null;
  data: CRMData;
  onClose: () => void;
  onSavePartial: (
    docId: string,
    partialAmount: number,
    paymentMethod: string,
    paymentDate: string,
    notes: string,
    attachments?: PaymentAttachment[]
  ) => void;
}

export default function PartialPaymentModal({
  isOpen,
  document,
  data,
  onClose,
  onSavePartial
}: PartialPaymentModalProps) {
  if (!isOpen || !document) return null;

  const docCurrency = document.currency || data.userProfile.defaultCurrency || 'FJD';
  const currencyCfg = getCurrencyConfig(docCurrency);
  const client = data.clients.find(c => c.id === document.clientId);

  const initialAmount = document.partiallyPaidAmount || document.paidAmountForeign || Number((document.total * 0.5).toFixed(2));
  const [partialAmount, setPartialAmount] = useState<number>(initialAmount);
  const [paymentMethod, setPaymentMethod] = useState<string>(document.paymentMethod || 'Vodafone M-PAiSA');
  const [paymentDate, setPaymentDate] = useState<string>(
    document.paymentDate || new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>(
    document.paymentExchangeNotes || 'Part payment received.'
  );
  const [attachments, setAttachments] = useState<PaymentAttachment[]>(() => {
    return document.paymentAttachments || [];
  });

  useEffect(() => {
    if (document) {
      setPartialAmount(document.partiallyPaidAmount || document.paidAmountForeign || Number((document.total * 0.5).toFixed(2)));
      setPaymentMethod(document.paymentMethod || 'Vodafone M-PAiSA');
      setPaymentDate(document.paymentDate || new Date().toISOString().split('T')[0]);
      setAttachments(document.paymentAttachments || []);
    }
  }, [document]);

  const totalAmount = document.total;
  const remainingBalance = Math.max(0, totalAmount - (partialAmount || 0));
  const percentagePaid = totalAmount > 0 ? Math.min(100, Math.round(((partialAmount || 0) / totalAmount) * 100)) : 0;

  const handleApplyPreset = (pct: number) => {
    const calculated = Number(((totalAmount * pct) / 100).toFixed(2));
    setPartialAmount(calculated);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (partialAmount <= 0) {
      alert('Enter an amount greater than 0.');
      return;
    }
    onSavePartial(document.id, partialAmount, paymentMethod, paymentDate, notes, attachments);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl w-full max-w-md border border-slate-100 shadow-2xl overflow-hidden text-left"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-white/15 rounded-xl backdrop-blur-xs">
              <Clock className="w-5 h-5 text-amber-100" />
            </span>
            <div>
              <h3 className="text-sm font-black tracking-tight">Record part payment</h3>
              <p className="text-[11px] text-amber-100/90 font-mono">
                Invoice #{document.documentNumber} • {client?.name || 'Client'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleFormSubmit} className="p-5 space-y-4 text-xs text-slate-700">
          {/* Invoice Summary Box */}
          <div className="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-3.5 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-bold">Invoice total:</span>
              <span className="font-mono font-black text-slate-800 text-sm">
                {docCurrency} {currencyCfg.symbol}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] font-bold">
                <span className="text-amber-800">Paid: {docCurrency} {currencyCfg.symbol}{(partialAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ({percentagePaid}%)</span>
                <span className="text-slate-500">Remaining: {docCurrency} {currencyCfg.symbol}{remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-amber-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${percentagePaid}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Quick amounts
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: '25%', pct: 25 },
                { label: '33%', pct: 33.333 },
                { label: '50%', pct: 50 },
                { label: '75%', pct: 75 }
              ].map(preset => (
                <button
                  key={preset.pct}
                  type="button"
                  onClick={() => handleApplyPreset(preset.pct)}
                  className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                    Math.abs(percentagePaid - Math.round(preset.pct)) <= 1
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-amber-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Partial Amount Input */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Amount received ({docCurrency}) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold">
                {currencyCfg.symbol}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={totalAmount}
                required
                value={partialAmount || ''}
                onChange={(e) => setPartialAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Payment Method & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Payment method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="Vodafone M-PAiSA">Vodafone M-PAiSA</option>
                <option value="Digicel MyCash">Digicel MyCash</option>
                <option value="ANZ Fiji Bank Transfer">ANZ Fiji Bank Transfer</option>
                <option value="Westpac Fiji Transfer">Westpac Fiji Transfer</option>
                <option value="BSP Fiji Bank Transfer">BSP Fiji Bank Transfer</option>
                <option value="Bred Bank Fiji">Bred Bank Fiji</option>
                <option value="Credit/Debit Card">Credit/Debit Card</option>
                <option value="Cash / Cheque">Cash / Cheque</option>
                <option value="Overseas Wire (TT)">Overseas Wire (TT)</option>
              </select>
            </div>

            <div>
              <DateInput
                label="Date received"
                value={paymentDate}
                onChange={setPaymentDate}
                align="right"
                customPresets={[
                  { label: 'Today', special: 'today' },
                  { label: 'Yesterday', daysOffset: -1 },
                ]}
              />
            </div>
          </div>

          {/* Reference Notes */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Reference or notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. M-PAiSA ref 98721, 50% deposit"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Payment Proof & Attachments Widget */}
          <div className="bg-slate-50/90 p-3 rounded-2xl border border-slate-200/80">
            <PaymentAttachmentWidget
              attachments={attachments}
              onChange={setAttachments}
              title="Proof of payment"
              description="Attach a transfer receipt, remittance advice or wallet screenshot."
              allowCamera={true}
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-all shadow-md shadow-amber-600/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              Save payment
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
