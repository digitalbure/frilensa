import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Building2, X, Check, Globe, Phone, Mail, MapPin, 
  CreditCard, Smartphone, ShieldCheck, Palette, Sparkles,
  Upload, Tag, ChevronDown, Award
} from 'lucide-react';
import { Business, VentureType } from '../types';
import { VENTURE_MODELS, ALL_VENTURE_TYPES, getVentureConfig } from '../lib/ventureModels';
import { extractPaletteFromImage } from '../lib/colorExtractor';

interface EditVentureModalProps {
  business: Business;
  onSave: (updatedBusiness: Business) => void;
  onClose: () => void;
}

export default function EditVentureModal({
  business,
  onSave,
  onClose
}: EditVentureModalProps) {
  const [name, setName] = useState(business.name || '');
  const [tin, setTin] = useState(business.tin || '');
  const [registrationNumber, setRegistrationNumber] = useState(business.registrationNumber || '');
  const [address, setAddress] = useState(business.address || '');
  const [email, setEmail] = useState(business.email || '');
  const [phone, setPhone] = useState(business.phone || '');
  const [bankDetails, setBankDetails] = useState(business.bankDetails || '');
  const [mPaisaId, setMPaisaId] = useState(business.mPaisaId || '');
  const [myCashId, setMyCashId] = useState(business.myCashId || '');
  const [colorTheme, setColorTheme] = useState(business.colorTheme || '#0284c7');
  const [type, setType] = useState<VentureType>(business.type || 'studio');
  const [brandSlogan, setBrandSlogan] = useState(business.brandSlogan || '');
  const [category, setCategory] = useState(business.saasAppCategory || business.category || '');
  const [logoUrl, setLogoUrl] = useState(business.logoUrl || '');
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ventureConfig = getVentureConfig(type);

  const PRESET_COLORS = [
    { hex: '#0284c7', name: 'Suva Reef' },
    { hex: '#0d9488', name: 'Coral Teal' },
    { hex: '#059669', name: 'Emerald' },
    { hex: '#7c3aed', name: 'Amethyst' },
    { hex: '#ea580c', name: 'Sunset' },
    { hex: '#db2777', name: 'Hibiscus' },
    { hex: '#0f172a', name: 'Obsidian' }
  ];

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const resultUrl = reader.result as string;
        setLogoUrl(resultUrl);
        setIsExtractingColors(true);
        try {
          const palette = await extractPaletteFromImage(resultUrl);
          if (palette?.primary) {
            setColorTheme(palette.primary);
          }
        } catch {
          // ignore extraction error
        } finally {
          setIsExtractingColors(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setStatusError('Venture Name is required.');
      return;
    }

    const updated: Business = {
      ...business,
      name: name.trim(),
      tin: tin.trim() || '10-00000-0-0',
      registrationNumber: registrationNumber.trim() || undefined,
      address: address.trim() || 'Suva, Fiji',
      email: email.trim() || 'contact@example.com',
      phone: phone.trim() || '+679 000 0000',
      bankDetails: bankDetails.trim() || undefined,
      mPaisaId: mPaisaId.trim() || undefined,
      myCashId: myCashId.trim() || undefined,
      colorTheme,
      type,
      saasAppCategory: category.trim() || ventureConfig.defaultCategories[0] || 'General',
      brandSlogan: brandSlogan.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
      logoType: logoUrl ? 'image' : business.logoType || 'symbol'
    };

    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-slate-900 border border-slate-700 text-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base shadow-inner shrink-0"
              style={{ backgroundColor: colorTheme }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-md" referrerPolicy="no-referrer" />
              ) : (
                name.charAt(0) || 'V'
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Edit Venture Profile & Entity
                </h3>
                <span className="text-[9px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded-full uppercase">
                  {ventureConfig.shortLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Update legal business name, Fiji FRCS TIN, banking credentials, and contact details
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 scrollbar-thin">
          {statusError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {statusError}
            </div>
          )}

          {/* Business Model Selector */}
          <div>
            <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-300 block mb-2 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-sky-400" />
              <span>Venture Archetype / Business Model</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_VENTURE_TYPES.map((vType) => {
                const cfg = VENTURE_MODELS[vType];
                const isSelected = type === vType;
                return (
                  <button
                    key={vType}
                    type="button"
                    onClick={() => {
                      setType(vType);
                      if (!category || ventureConfig.defaultCategories.includes(category)) {
                        setCategory(cfg.defaultCategories[0] || '');
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600/20 border-sky-400 text-white font-bold ring-1 ring-sky-400/50'
                        : 'bg-slate-800/60 border-slate-700/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className="text-xs font-bold truncate">{cfg.shortLabel}</div>
                    <div className="text-[9.5px] text-slate-400 truncate mt-0.5">{cfg.defaultCategories[0] || 'Services'}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Basic Entity Names & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                Business / Brand Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Street Level Digital Pte Ltd"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                Industry / Category Tag
              </label>
              <input
                type="text"
                placeholder={`e.g. ${ventureConfig.defaultCategories[0] || 'Creative Services'}`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Legal Compliance (TIN & Reg Number) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-300 block mb-1 flex items-center justify-between">
                <span>Fiji FRCS Business TIN</span>
                <span className="text-[9px] text-emerald-400 font-normal">Official Tax ID</span>
              </label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 text-emerald-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="e.g. 50-12345-0-0"
                  value={tin}
                  onChange={(e) => setTin(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-300 block mb-1 flex items-center justify-between">
                <span>Company / Registration No.</span>
                <span className="text-[9px] text-slate-400 font-normal">ROC / BN / Lic.</span>
              </label>
              <input
                type="text"
                placeholder="e.g. ROC-2024-9872"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Contact Details (Email, Phone, Address) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                Business Email
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  placeholder="accounts@streetlevel.com.fj"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8.5 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                Business Phone
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="+679 991 2345"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8.5 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-bold text-slate-300 block mb-1">
                Physical City / Address
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Suva, Fiji"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8.5 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Banking & Mobile Wallets */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-sky-400" />
                <span>Pacific Banking & Payment Settlement</span>
              </span>
              <span className="text-[10px] text-slate-400">Printed on invoice footers</span>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                Bank Account Details (BSP / Westpac / ANZ / BRED / HFC)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Bank South Pacific (BSP) Fiji&#10;Account: 123456789 | BSB: 069-001 | Branch: Suva Central"
                value={bankDetails}
                onChange={(e) => setBankDetails(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1 flex items-center gap-1">
                  <Smartphone className="w-3 h-3 text-rose-400" />
                  <span>Vodafone M-Paisa Merchant / Mobile</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 7771234 or Merchant ID"
                  value={mPaisaId}
                  onChange={(e) => setMPaisaId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1 flex items-center gap-1">
                  <Smartphone className="w-3 h-3 text-teal-400" />
                  <span>Digicel MyCash Mobile Number</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 8881234"
                  value={myCashId}
                  onChange={(e) => setMyCashId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Branding, Logo & Color Theme */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-amber-400" />
                <span>Visual Branding & Theme Accent</span>
              </span>
              <span className="text-[10px] text-slate-400">Reflected across top navigation & invoices</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                  Brand Tagline / Slogan
                </label>
                <input
                  type="text"
                  placeholder='e.g. "Creative Digital Media & Software Engineering"'
                  value={brandSlogan}
                  onChange={(e) => setBrandSlogan(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                  Brand Logo Image
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-sky-400 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Logo File</span>
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="text-[10px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                  {isExtractingColors && (
                    <span className="text-[10px] text-amber-400 animate-pulse">Extracting palette...</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1.5">
                Venture Color Theme
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setColorTheme(c.hex)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-transform cursor-pointer ${
                      colorTheme.toLowerCase() === c.hex.toLowerCase() ? 'scale-115 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  >
                    {colorTheme.toLowerCase() === c.hex.toLowerCase() && (
                      <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                    )}
                  </button>
                ))}
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-[10px] text-slate-400 font-mono">Custom:</span>
                  <input
                    type="color"
                    value={colorTheme}
                    onChange={(e) => setColorTheme(e.target.value)}
                    className="w-7 h-7 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-teal-500 hover:from-sky-500 hover:to-teal-400 text-white text-xs font-bold transition-all shadow-md shadow-sky-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>Save Venture Profile</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
