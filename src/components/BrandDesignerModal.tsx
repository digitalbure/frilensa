import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Palette, Sparkles, Waves, Briefcase, Building2, ShieldCheck, 
  Layout, Image, Type, Check, RefreshCw, Upload, Eye, Wand2, ArrowRight
} from 'lucide-react';
import { Business } from '../types';
import { extractPaletteFromImage, ExtractedPalette } from '../lib/colorExtractor';

interface BrandDesignerModalProps {
  business: Business;
  onSave: (updatedBusiness: Business) => void;
  onClose: () => void;
}

export default function BrandDesignerModal({ business, onSave, onClose }: BrandDesignerModalProps) {
  const [logoType, setLogoType] = useState<'text' | 'symbol' | 'image'>(business.logoType || (business.logoUrl ? 'image' : 'symbol'));
  const [logoText, setLogoText] = useState(business.logoText || business.name.slice(0, 3).toUpperCase());
  const [logoSymbol, setLogoSymbol] = useState(business.logoSymbol || 'Waves');
  const [logoUrl, setLogoUrl] = useState(business.logoUrl || '');
  const [colorTheme, setColorTheme] = useState(business.colorTheme || '#0284c7');
  const [brandSlogan, setBrandSlogan] = useState(business.brandSlogan || '');
  const [headerStyle, setHeaderStyle] = useState<'minimal' | 'modern' | 'bold'>(business.headerStyle || 'modern');

  // Auto-extracted palette state
  const [extractedPalette, setExtractedPalette] = useState<ExtractedPalette | null>(null);
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [autoAppliedNotice, setAutoAppliedNotice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Popular branding preset colors for professional Fiji firms
  const PRESET_COLORS = [
    { hex: '#0284c7', name: 'Suva Reef Blue' },
    { hex: '#0d9488', name: 'Coral Teal' },
    { hex: '#059669', name: 'Rainforest Emerald' },
    { hex: '#7c3aed', name: 'Pacific Amethyst' },
    { hex: '#db2777', name: 'Hibiscus Pink' },
    { hex: '#ea580c', name: 'Savusavu Sunset' },
    { hex: '#18181b', name: 'Executive Obsidian' },
  ];

  const SYMBOLS = [
    { id: 'Waves', label: 'Pacific Waves', icon: Waves },
    { id: 'Briefcase', label: 'Consultant Pack', icon: Briefcase },
    { id: 'Building2', label: 'Suva Corporate', icon: Building2 },
    { id: 'ShieldCheck', label: 'FRCA Compliance', icon: ShieldCheck },
    { id: 'Sparkles', label: 'Digital Magic', icon: Sparkles },
  ];

  // Auto extract colors whenever logoUrl changes
  useEffect(() => {
    if (logoUrl) {
      handleExtractFromUrl(logoUrl, false);
    }
  }, [logoUrl]);

  const handleExtractFromUrl = async (url: string, autoApply = false) => {
    if (!url) return;
    setIsExtractingColors(true);
    try {
      const palette = await extractPaletteFromImage(url);
      setExtractedPalette(palette);
      if (autoApply && palette.primary) {
        setColorTheme(palette.primary);
        setAutoAppliedNotice(true);
        setTimeout(() => setAutoAppliedNotice(false), 3000);
      }
    } catch (e) {
      console.warn('Could not extract palette from image:', e);
    } finally {
      setIsExtractingColors(false);
    }
  };

  const handleSave = () => {
    onSave({
      ...business,
      logoType,
      logoText,
      logoSymbol,
      logoUrl,
      colorTheme,
      brandSlogan,
      headerStyle
    });
  };

  // Convert uploaded image to base64 DataURL and trigger automatic color extraction
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultUrl = reader.result as string;
        setLogoUrl(resultUrl);
        setLogoType('image');
        handleExtractFromUrl(resultUrl, true); // auto-apply extracted primary color on new upload
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultUrl = reader.result as string;
        setLogoUrl(resultUrl);
        setLogoType('image');
        handleExtractFromUrl(resultUrl, true);
      };
      reader.readAsDataURL(file);
    }
  };

  const applyExtractedScheme = (hexColor: string) => {
    setColorTheme(hexColor);
    setAutoAppliedNotice(true);
    setTimeout(() => setAutoAppliedNotice(false), 2500);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-55 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)'
      }}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md border border-zinc-100 shadow-2xl space-y-4 my-auto max-h-[92vh] overflow-y-auto scrollbar-none text-left"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold block">Logo & Brand Identity</span>
            <h3 className="text-base font-bold text-zinc-900 tracking-tight flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-sky-600" />
              {business.name}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-950 rounded-full bg-zinc-50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Document Header Preview */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/70 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
              <Eye className="w-3 h-3 text-slate-400" /> Live Document & Invoice Preview
            </span>
            {autoAppliedNotice && (
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <Check className="w-2.5 h-2.5" /> Logo Colors Applied!
              </span>
            )}
          </div>
          
          <div className="w-full bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs flex justify-between items-center text-left relative overflow-hidden">
            {/* Top color bar */}
            <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: colorTheme }} />

            {/* Logo area */}
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              {logoType === 'symbol' && (
                <div 
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                  style={{ backgroundColor: colorTheme }}
                >
                  {logoSymbol === 'Waves' && <Waves className="w-4.5 h-4.5" />}
                  {logoSymbol === 'Briefcase' && <Briefcase className="w-4.5 h-4.5" />}
                  {logoSymbol === 'Building2' && <Building2 className="w-4.5 h-4.5" />}
                  {logoSymbol === 'ShieldCheck' && <ShieldCheck className="w-4.5 h-4.5" />}
                  {logoSymbol === 'Sparkles' && <Sparkles className="w-4.5 h-4.5" />}
                </div>
              )}
              {logoType === 'text' && (
                <div 
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-white tracking-wider shrink-0 shadow-xs"
                  style={{ backgroundColor: colorTheme }}
                >
                  {logoText || 'LOGO'}
                </div>
              )}
              {logoType === 'image' && logoUrl && (
                <img 
                  src={logoUrl} 
                  alt="Custom Logo" 
                  className="h-9 max-w-[120px] w-auto object-contain rounded-md shrink-0 border border-slate-100 p-0.5 bg-white"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              )}
              {logoType === 'image' && !logoUrl && (
                <div className="w-9 h-9 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-[9px] text-slate-400 shrink-0">
                  No Logo
                </div>
              )}
              <div className="min-w-0">
                <h4 className="text-xs font-extrabold text-slate-900 leading-tight truncate">{business.name}</h4>
                <span className="text-[9px] text-slate-400 block font-normal leading-tight truncate mt-0.5">
                  {brandSlogan || 'Suva, Fiji Islands • TIN Verified'}
                </span>
              </div>
            </div>

            <div className="text-right text-[9px] text-slate-400 uppercase font-mono leading-tight shrink-0">
              <span className="block font-black" style={{ color: colorTheme }}>Tax Invoice</span>
              <span className="text-slate-600 font-bold">#INV-1001</span>
            </div>
          </div>
        </div>

        {/* Logo Configuration & Upload */}
        <div className="space-y-2 text-xs">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Company Logo Format
          </label>
          
          {/* Logo Type Selector */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setLogoType('image')}
              className={`py-1.5 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                logoType === 'image' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Image className="w-3.5 h-3.5" /> Image Logo
            </button>
            <button
              type="button"
              onClick={() => setLogoType('symbol')}
              className={`py-1.5 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                logoType === 'symbol' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Palette className="w-3.5 h-3.5" /> Symbol Icon
            </button>
            <button
              type="button"
              onClick={() => setLogoType('text')}
              className={`py-1.5 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                logoType === 'text' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Type className="w-3.5 h-3.5" /> Monogram
            </button>
          </div>

          {/* Image Upload Area with Drag & Drop */}
          {logoType === 'image' && (
            <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-xl p-3.5 text-center bg-white transition-colors cursor-pointer flex flex-col items-center justify-center gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-8 h-8 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-800 block">
                    Click to upload or drag logo here
                  </span>
                  <span className="text-[9px] text-slate-400">
                    PNG, JPEG, WebP or SVG (auto-extracts brand colors)
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </div>

              {/* Or URL input */}
              <div className="pt-1">
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Or Paste Direct Image Web URL
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="flex-1 bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-sky-500"
                  />
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="text-xs text-rose-600 font-bold px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Symbol selector */}
          {logoType === 'symbol' && (
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Choose Brand Symbol Icon</span>
              <div className="grid grid-cols-5 gap-1.5">
                {SYMBOLS.map((sym) => {
                  const Icon = sym.icon;
                  return (
                    <button
                      key={sym.id}
                      type="button"
                      onClick={() => setLogoSymbol(sym.id)}
                      className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center gap-1 transition-all cursor-pointer ${
                        logoSymbol === sym.id 
                          ? 'bg-white border-slate-900 text-slate-950 font-bold shadow-xs' 
                          : 'bg-white/60 border-slate-200 text-slate-500 hover:bg-white'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[8px] leading-none whitespace-nowrap">{sym.label.split(' ')[1]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monogram input */}
          {logoType === 'text' && (
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Enter Monogram / Initials (2–4 Chars)</span>
              <input
                type="text"
                maxLength={4}
                value={logoText}
                onChange={(e) => setLogoText(e.target.value.toUpperCase())}
                placeholder="e.g. FJS"
                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-mono font-bold text-slate-800"
              />
            </div>
          )}
        </div>

        {/* Auto-Extracted Color Scheme from Logo */}
        {extractedPalette && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-3.5 space-y-2 text-xs"
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-sky-950 text-[11px] flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-sky-600" />
                Auto-Extracted Palette from Logo
              </span>
              <button
                type="button"
                onClick={() => applyExtractedScheme(extractedPalette.primary)}
                className="text-[10px] font-bold text-white bg-sky-600 hover:bg-sky-700 px-2 py-0.5 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1"
              >
                Apply Primary <ArrowRight className="w-2.5 h-2.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              {extractedPalette.palette.map((hex, idx) => (
                <button
                  key={`${hex}-${idx}`}
                  type="button"
                  onClick={() => applyExtractedScheme(hex)}
                  className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-transform hover:scale-110 shadow-2xs relative cursor-pointer ${
                    colorTheme.toLowerCase() === hex.toLowerCase() ? 'ring-2 ring-sky-600 ring-offset-1 border-white scale-105' : 'border-black/10'
                  }`}
                  style={{ backgroundColor: hex }}
                  title={`Extracted Swatch ${hex} (Click to set as Brand Color)`}
                >
                  {colorTheme.toLowerCase() === hex.toLowerCase() && (
                    <Check className="w-3.5 h-3.5 text-white stroke-[3px] drop-shadow-xs" />
                  )}
                </button>
              ))}
              <span className="text-[10px] text-sky-800 font-mono font-bold uppercase ml-1">
                {colorTheme}
              </span>
            </div>
          </motion.div>
        )}

        {/* Color Palette customization presets */}
        <div className="space-y-1.5 text-xs">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Palette className="w-3.5 h-3.5 text-slate-400" /> Document Theme Color
            </span>
            {logoUrl && !extractedPalette && (
              <button
                type="button"
                onClick={() => handleExtractFromUrl(logoUrl, true)}
                className="text-[10px] text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isExtractingColors ? 'animate-spin' : ''}`} /> Scan Logo Colors
              </button>
            )}
          </label>
          
          <div className="flex gap-1.5 flex-wrap items-center">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() => setColorTheme(preset.hex)}
                className="w-6 h-6 rounded-full border border-black/10 flex items-center justify-center transition-transform hover:scale-110 relative cursor-pointer"
                style={{ backgroundColor: preset.hex }}
                title={preset.name}
              >
                {colorTheme === preset.hex && (
                  <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
                )}
              </button>
            ))}
            
            <div className="flex items-center ml-1 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 gap-1.5">
              <input
                type="color"
                value={colorTheme}
                onChange={(e) => setColorTheme(e.target.value)}
                className="w-5 h-5 border-0 p-0 rounded-full cursor-pointer overflow-hidden outline-none bg-transparent"
                title="Custom Color Picker"
              />
              <span className="text-[10px] font-mono font-bold text-slate-600 uppercase">
                {colorTheme}
              </span>
            </div>
          </div>
        </div>

        {/* Brand Slogan / Tagline */}
        <div className="space-y-1 text-xs">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Brand Slogan / Tagline
          </label>
          <input
            type="text"
            value={brandSlogan}
            onChange={(e) => setBrandSlogan(e.target.value)}
            placeholder="e.g. Fiji's Premier Digital Agency & IT Consultancy"
            className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:border-sky-600 text-slate-800 placeholder-slate-400 transition-colors"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-md shadow-sky-600/20 cursor-pointer"
          >
            Save Brand Guidelines
          </button>
        </div>
      </motion.div>
    </div>
  );
}

