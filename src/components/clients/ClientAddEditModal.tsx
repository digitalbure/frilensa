import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { UserPlus, Edit3, X, Building2, User, Mail, Phone, MapPin, ShieldCheck, Coins } from 'lucide-react';
import { Client } from '../../types';
import { SUPPORTED_CURRENCIES } from '../../lib/currencies';

interface ClientAddEditModalProps {
  isOpen: boolean;
  editingClient: Client | null;
  defaultCurrency: string;
  onClose: () => void;
  onSave: (clientData: Omit<Client, 'id'>, id?: string) => void;
}

export default function ClientAddEditModal({
  isOpen,
  editingClient,
  defaultCurrency,
  onClose,
  onSave
}: ClientAddEditModalProps) {
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [tin, setTin] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency || 'FJD');

  useEffect(() => {
    if (editingClient) {
      setName(editingClient.name || '');
      setContactPerson(editingClient.contactPerson || editingClient.contactName || '');
      setEmail(editingClient.email || '');
      setPhone(editingClient.phone || '');
      setAddress(editingClient.address || '');
      setTin(editingClient.tin || '');
      setCurrency(editingClient.currency || defaultCurrency || 'FJD');
    } else {
      setName('');
      setContactPerson('');
      setEmail('');
      setPhone('');
      setAddress('');
      setTin('');
      setCurrency(defaultCurrency || 'FJD');
    }
  }, [editingClient, defaultCurrency, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      contactPerson: contactPerson.trim() || undefined,
      contactName: contactPerson.trim() || undefined,
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      tin: tin.trim() || undefined,
      currency: currency || defaultCurrency || 'FJD'
    }, editingClient?.id);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 10 }}
        className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-lg border border-slate-200 shadow-2xl space-y-5 my-auto"
      >
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              {editingClient ? <Edit3 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                {editingClient ? 'Edit Client Profile' : 'Register New Client'}
              </h3>
              <p className="text-xs text-slate-500">
                {editingClient ? 'Update organization identity, tax & currency' : 'Add organization to your CRM directory'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Client / Organization Name *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">
                <Building2 className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. The Church of Jesus Christ of Latter-day Saints / Carpenters Fiji"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 placeholder-slate-400 transition-all font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Contact Representative
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Ropate Qalo / Mere Ratuvili"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 placeholder-slate-400 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Fiji Tax TIN
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={tin}
                  onChange={(e) => setTin(e.target.value)}
                  placeholder="e.g. 50-12345-0-9"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs font-mono focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 placeholder-slate-400 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. accounts@client.com.fj"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 placeholder-slate-400 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Phone Number
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400">
                  <Phone className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +679 992 4811"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 placeholder-slate-400 transition-all"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Billing Address
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">
                <MapPin className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 14 Victoria Parade, Suva, Fiji"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 placeholder-slate-400 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Billing Currency</span>
              <span className="text-slate-400 font-normal normal-case text-[11px]">Applied to invoices & quotes</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">
                <Coins className="w-4 h-4" />
              </span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:border-slate-900 text-slate-900 transition-all font-medium cursor-pointer"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} - {c.name} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-xs active:scale-98 cursor-pointer"
            >
              {editingClient ? 'Save Changes' : 'Register Client'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
