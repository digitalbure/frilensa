import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Settings, User, ShieldCheck, Percent, HelpCircle, LogOut, RefreshCw, 
  Download, Upload, Check, AlertCircle, Sparkles, Code, ArrowRight,
  Building, Sliders, Trash2, Globe, Map, Plus, CheckCircle, Info, Heart,
  Briefcase, Building2, Waves, Smartphone, Wifi, CheckCircle2, Wand2, Image as ImageIcon,
  Cloud, MessageCircle, Share2, AtSign, X, ExternalLink, Hash, Link2,
  Clock, Timer, Lock, DollarSign, Coins, ArrowRightLeft, Calculator, Mail, Send
} from 'lucide-react';
import { CRMData, UserProfile, Business, FeeConfig, TaxConfig, BusinessSocial, SocialPlatform } from '../types';
import { INITIAL_CRM_DATA } from '../data/mockData';
import { extractPaletteFromImage, ExtractedPalette } from '../lib/colorExtractor';
import { mergeCRMData, loadLocalBackup, saveLocalBackup } from '../lib/db';
import BrandDesignerModal from './BrandDesignerModal';
import SubscriptionPaywallModal from './SubscriptionPaywallModal';
import ReleaseNotes from './ReleaseNotes';
import AutomationSettingsCard from './AutomationSettingsCard';
import { SUPPORTED_CURRENCIES, getCurrencyConfig, formatCurrencyAmount } from '../lib/currencies';
import { getEmailServiceConfig, sendTestEmail, EmailServiceConfig } from '../lib/emailService';
import firebaseConfig from '../../firebase-applet-config.json';

const CATEGORY_PRESETS: Record<string, { label: string; value: string; isPreset: boolean }[]> = {
  boutique: [
    { label: 'Size chart link', value: 'https://shop.bula.fj/sizes', isPreset: true },
    { label: 'Production lead time', value: '7 business days', isPreset: true },
    { label: 'Shop social handle', value: '@BulaClothingFiji', isPreset: true },
    { label: 'Local delivery', value: 'FJD $5.00 via Post Fiji', isPreset: true }
  ],
  plumber: [
    { label: 'Plumbing licence number', value: 'PL-2026-991', isPreset: true },
    { label: 'Emergency phone', value: '+679 888 1234', isPreset: true },
    { label: 'Emergency surcharge', value: 'FJD $50.00 flat, after hours', isPreset: true },
    { label: 'Call-out diagnostic fee', value: 'FJD $30.00', isPreset: true }
  ],
  mc: [
    { label: 'Audio and stage needs', value: '2 wireless mics, XLR out', isPreset: true },
    { label: 'Non-refundable deposit', value: '25% on confirmation', isPreset: true },
    { label: 'Sound check', value: '45 minutes before doors open', isPreset: true },
    { label: 'Overtime rate', value: 'FJD $100.00 / hour', isPreset: true }
  ],
  band: [
    { label: 'Technical rider link', value: 'https://band.bula.fj/rider.pdf', isPreset: true },
    { label: 'Band members', value: '5 musicians', isPreset: true },
    { label: 'Performance length', value: '3 sets of 45 minutes', isPreset: true },
    { label: 'Meals and drinks', value: 'Hot buffet and water provided', isPreset: true }
  ],
  production: [
    { label: 'Main gear', value: 'Sony FX3 + DJI wireless audio', isPreset: true },
    { label: 'Shoot length', value: '8-hour day', isPreset: true },
    { label: 'Footage backup', value: 'Two SSD copies, kept 30 days', isPreset: true },
    { label: 'Crew size', value: '3 (camera, lighting, audio)', isPreset: true }
  ],
  taxi: [
    { label: 'Plate number', value: 'LT-1002', isPreset: true },
    { label: 'LTA permit number', value: 'LTA-TX-2026-441', isPreset: true },
    { label: 'Flag fall', value: 'FJD $2.00', isPreset: true },
    { label: 'Rate per km', value: 'FJD $1.50 / km', isPreset: true },
    { label: 'Taxi stand', value: 'Suva Town Market Stand', isPreset: true }
  ],
  general: [
    { label: 'Payment terms', value: '7 days', isPreset: true },
    { label: 'Support email', value: 'support@venture.fj', isPreset: true }
  ]
};

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string; icon: string; placeholder: string; badgeStyle: string }[] = [
  { id: 'viber', label: 'Viber', icon: '💜', placeholder: 'e.g. +679 991 2345', badgeStyle: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬', placeholder: 'e.g. +679 991 2345', badgeStyle: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'facebook', label: 'Facebook', icon: '📘', placeholder: 'e.g. @streetlevel or fb.com/streetlevel', badgeStyle: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'instagram', label: 'Instagram', icon: '📸', placeholder: 'e.g. @streetlevel', badgeStyle: 'bg-pink-100 text-pink-800 border-pink-200' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', placeholder: 'e.g. linkedin.com/company/streetlevel', badgeStyle: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵', placeholder: 'e.g. @streetlevel', badgeStyle: 'bg-zinc-900 text-white border-zinc-700' },
  { id: 'youtube', label: 'YouTube', icon: '▶️', placeholder: 'e.g. youtube.com/@streetlevel', badgeStyle: 'bg-rose-100 text-rose-800 border-rose-200' },
  { id: 'x', label: 'X (Twitter)', icon: '✖️', placeholder: 'e.g. @streetlevel', badgeStyle: 'bg-zinc-850 text-white border-zinc-700' },
  { id: 'website', label: 'Website', icon: '🌐', placeholder: 'e.g. https://streetlevel.com.fj', badgeStyle: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { id: 'other', label: 'Other', icon: '🔗', placeholder: 'e.g. @handle or channel link', badgeStyle: 'bg-zinc-100 text-zinc-800 border-zinc-200' }
];

export const getSocialConfig = (platform: string) => {
  return SOCIAL_PLATFORMS.find(p => p.id === platform.toLowerCase()) || {
    id: 'other' as SocialPlatform,
    label: platform.charAt(0).toUpperCase() + platform.slice(1),
    icon: '🔗',
    placeholder: 'e.g. handle or link',
    badgeStyle: 'bg-zinc-100 text-zinc-800 border-zinc-200'
  };
};

interface SettingsViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onSignOut: () => void;
  onOpenAdminPanel?: () => void;
  onManualCloudSync?: () => Promise<void>;
}

export default function SettingsView({ data, onUpdateData, onSignOut, onOpenAdminPanel, onManualCloudSync }: SettingsViewProps) {
  const [showPaywall, setShowPaywall] = useState(false);
  // Profile state
  const [name, setName] = useState(data.userProfile.name);
  const [email, setEmail] = useState(data.userProfile.email);
  const [phone, setPhone] = useState(data.userProfile.phone || '+679 991 2345');
  const [tin, setTin] = useState(data.userProfile.tin);
  const [vatRate, setVatRate] = useState(data.userProfile.defaultVatRate);
  const [currency, setCurrency] = useState(data.userProfile.defaultCurrency);
  const [enableTax, setEnableTax] = useState(data.userProfile.enableTax !== false);
  const [inactivityTimeout, setInactivityTimeout] = useState<number>(
    data.userProfile.inactivityTimeoutMinutes ?? data.platformSettings?.defaultInactivityTimeoutMinutes ?? 15
  );

  // Backup & Import state
  const [showBackupArea, setShowBackupArea] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const activeBusiness = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];

  // Numbering & Prefix states
  const [docNumberMode, setDocNumberMode] = useState<'auto' | 'manual'>(activeBusiness?.docNumberMode || 'auto');
  const [invoicePrefix, setInvoicePrefix] = useState(activeBusiness?.invoicePrefix || 'INV');
  const [invoiceStartNumber, setInvoiceStartNumber] = useState(activeBusiness?.invoiceStartNumber ?? 1000);
  const [receiptPrefix, setReceiptPrefix] = useState(activeBusiness?.receiptPrefix || 'REC');
  const [receiptStartNumber, setReceiptStartNumber] = useState(activeBusiness?.receiptStartNumber ?? 1000);
  const [quotePrefix, setQuotePrefix] = useState(activeBusiness?.quotePrefix || 'QT');
  const [quoteStartNumber, setQuoteStartNumber] = useState(activeBusiness?.quoteStartNumber ?? 1000);

  // Business Profile states (Multiple Ventures Custom Fields)
  const [selectedBizId, setSelectedBizId] = useState(data.activeBusinessId || data.businesses[0]?.id || '');
  const [bizName, setBizName] = useState('');
  const [bizTin, setBizTin] = useState('');
  const [bizRegNumber, setBizRegNumber] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizBank, setBizBank] = useState('');
  const [bizColor, setBizColor] = useState('');
  const [bizType, setBizType] = useState<'studio' | 'saas'>('studio');
  const [bizBrandSlogan, setBizBrandSlogan] = useState('');
  const [bizLogoType, setBizLogoType] = useState<'text' | 'symbol' | 'image'>('symbol');
  const [bizLogoSymbol, setBizLogoSymbol] = useState('Sparkles');
  const [bizLogoText, setBizLogoText] = useState('');
  const [bizLogoUrl, setBizLogoUrl] = useState('');
  const [bizCategory, setBizCategory] = useState('general');
  const [bizIsPrimary, setBizIsPrimary] = useState(false);
  const [bizCustomFields, setBizCustomFields] = useState<{ label: string; value: string; isPreset?: boolean }[]>([]);
  const [newCustomLabel, setNewCustomLabel] = useState('');
  const [newCustomValue, setNewCustomValue] = useState('');
  const [mPaisaId, setMPaisaId] = useState('');
  const [myCashId, setMyCashId] = useState('');

  // Social handles state
  const [bizSocials, setBizSocials] = useState<BusinessSocial[]>([]);
  const [showAddSocial, setShowAddSocial] = useState(false);
  const [newSocialPlatform, setNewSocialPlatform] = useState<SocialPlatform>('whatsapp');
  const [newSocialHandle, setNewSocialHandle] = useState('');

  // Working Currencies & Multi-Currency Settings for Venture
  const [bizCurrency, setBizCurrency] = useState('FJD');
  const [bizWorkingCurrencies, setBizWorkingCurrencies] = useState<string[]>(['FJD', 'AUD', 'NZD', 'USD', 'EUR']);
  const [bizCustomExchangeRates, setBizCustomExchangeRates] = useState<Record<string, number>>({});
  const [selectedCurrencyToAdd, setSelectedCurrencyToAdd] = useState('');
  const [editingRateCode, setEditingRateCode] = useState<string>('AUD');
  const [customRateInput, setCustomRateInput] = useState<string>('1.4850');
  const [showRateOverrideEditor, setShowRateOverrideEditor] = useState(false);

  // Auto color extraction state for business logo
  const [bizExtractedPalette, setBizExtractedPalette] = useState<ExtractedPalette | null>(null);
  const [isExtractingBizColors, setIsExtractingBizColors] = useState(false);
  const [showBrandDesignerModal, setShowBrandDesignerModal] = useState(false);
  const bizFileInputRef = useRef<HTMLInputElement>(null);

  const handleExtractBizLogoColors = async (url: string, autoApply = false) => {
    if (!url) return;
    setIsExtractingBizColors(true);
    try {
      const palette = await extractPaletteFromImage(url);
      setBizExtractedPalette(palette);
      if (autoApply && palette.primary) {
        setBizColor(palette.primary);
      }
    } catch (err) {
      console.warn('Could not extract palette:', err);
    } finally {
      setIsExtractingBizColors(false);
    }
  };

  const handleBizLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultUrl = reader.result as string;
        setBizLogoUrl(resultUrl);
        setBizLogoType('image');
        handleExtractBizLogoColors(resultUrl, true);
      };
      reader.readAsDataURL(file);
    }
  };

  // SOuth Pacific regional target countries (mock status for expansion strategy)
  const [selectedRegion, setSelectedRegion] = useState<'FJ' | 'WS' | 'TO' | 'VU' | 'SB'>('FJ');

  // Business Custom Fees & Surcharges state
  const [newFeeName, setNewFeeName] = useState('');
  const [newFeeRate, setNewFeeRate] = useState<number>(5.0);
  const [newFeeRateType, setNewFeeRateType] = useState<'percentage' | 'flat'>('percentage');
  const [newFeeCategory, setNewFeeCategory] = useState<'service' | 'handling' | 'processing' | 'delivery' | 'setup' | 'custom'>('service');
  const [newFeeIsDefault, setNewFeeIsDefault] = useState(false);
  const [newFeeDescription, setNewFeeDescription] = useState('');

  // Transactional Email Service configuration state
  const [emailConfig, setEmailConfig] = useState<EmailServiceConfig | null>(null);
  const [testEmailRecipient, setTestEmailRecipient] = useState(data.userProfile.email || '');
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string; provider?: string } | null>(null);

  useEffect(() => {
    getEmailServiceConfig().then(cfg => setEmailConfig(cfg));
  }, []);

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient || !testEmailRecipient.includes('@')) {
      triggerStatus('Enter an email address to send the test to.', 'error');
      return;
    }
    setIsTestingEmail(true);
    setTestEmailResult(null);
    try {
      const activeBiz = data.businesses.find(b => b.id === selectedBizId) || data.businesses[0];
      const res = await sendTestEmail(testEmailRecipient.trim(), activeBiz?.name || 'Frilensa');
      setTestEmailResult(res);
      if (res.success) {
        triggerStatus(`Test email sent to ${testEmailRecipient}`, 'success');
      } else {
        triggerStatus(res.message || 'The test email could not be sent.', 'error');
      }
    } catch (err: any) {
      setTestEmailResult({
        success: false,
        message: err.message || 'The test email could not be sent. Try again.'
      });
      triggerStatus(err.message || 'The test email could not be sent. Try again.', 'error');
    } finally {
      setIsTestingEmail(false);
    }
  };

  // Load selected business settings
  useEffect(() => {
    const biz = data.businesses.find(b => b.id === selectedBizId);
    if (biz) {
      setBizName(biz.name || '');
      setBizTin(biz.tin || '');
      setBizRegNumber(biz.registrationNumber || '');
      setBizAddress(biz.address || '');
      setBizEmail(biz.email || '');
      setBizPhone(biz.phone || '');
      setBizBank(biz.bankDetails || '');
      setBizColor(biz.colorTheme || '#0284c7');
      setBizType(biz.type || 'studio');
      setBizBrandSlogan(biz.brandSlogan || '');
      setBizLogoType(biz.logoType || 'symbol');
      setBizLogoSymbol(biz.logoSymbol || 'Sparkles');
      setBizLogoText(biz.logoText || '');
      setBizLogoUrl(biz.logoUrl || '');
      setBizCategory(biz.category || 'general');
      setBizIsPrimary(!!biz.isPrimary);
      setBizCustomFields(biz.customFields || []);
      setMPaisaId(biz.mPaisaId || '');
      setMyCashId(biz.myCashId || '');
      setBizSocials(biz.socials || []);
      setShowAddSocial(false);
      setNewSocialHandle('');
      setBizCurrency(biz.currency || 'FJD');
      setBizWorkingCurrencies(
        biz.workingCurrencies && biz.workingCurrencies.length > 0
          ? biz.workingCurrencies
          : ['FJD', 'AUD', 'NZD', 'USD', 'EUR']
      );
      setBizCustomExchangeRates(biz.customExchangeRates || {});
      const firstAlt = (biz.workingCurrencies || ['AUD']).find(c => c !== (biz.currency || 'FJD')) || 'AUD';
      setEditingRateCode(firstAlt);
      const customRate = (biz.customExchangeRates || {})[firstAlt];
      const benchmarkRate = getCurrencyConfig(firstAlt).approxFjdMultiplier || 1.0;
      setCustomRateInput((customRate ?? benchmarkRate).toFixed(4));
    }
  }, [selectedBizId, data.businesses]);

  useEffect(() => {
    if (activeBusiness) {
      setDocNumberMode(activeBusiness.docNumberMode || 'auto');
      setInvoicePrefix(activeBusiness.invoicePrefix || 'INV');
      setInvoiceStartNumber(activeBusiness.invoiceStartNumber ?? 1000);
      setReceiptPrefix(activeBusiness.receiptPrefix || 'REC');
      setReceiptStartNumber(activeBusiness.receiptStartNumber ?? 1000);
      setQuotePrefix(activeBusiness.quotePrefix || 'QT');
      setQuoteStartNumber(activeBusiness.quoteStartNumber ?? 1000);
    }
  }, [data.activeBusinessId]);

  const handleSaveNumberingSettings = (e: React.FormEvent) => {
    e.preventDefault();
    
    const updatedBusinesses = data.businesses.map(b => {
      if (b.id === data.activeBusinessId) {
        return {
          ...b,
          docNumberMode,
          invoicePrefix,
          invoiceStartNumber: Number(invoiceStartNumber),
          receiptPrefix,
          receiptStartNumber: Number(receiptStartNumber),
          quotePrefix,
          quoteStartNumber: Number(quoteStartNumber)
        };
      }
      return b;
    });

    onUpdateData({
      ...data,
      businesses: updatedBusinesses
    });

    triggerStatus('Numbering saved', 'success');
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    const updatedProfile: UserProfile = {
      ...data.userProfile,
      name,
      email,
      phone,
      tin,
      defaultCurrency: currency,
      defaultVatRate: Number(vatRate),
      enableTax,
      inactivityTimeoutMinutes: Number(inactivityTimeout)
    };

    onUpdateData({
      ...data,
      userProfile: updatedProfile
    });

    triggerStatus('Settings saved', 'success');
  };

  const handleSaveBusinessProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizName || !bizTin) {
      triggerStatus('Enter a business name and TIN.', 'error');
      return;
    }

    let updatedBusinesses = data.businesses.map(b => {
      if (b.id === selectedBizId) {
        return {
          ...b,
          name: bizName,
          tin: bizTin,
          registrationNumber: bizRegNumber.trim() || undefined,
          address: bizAddress,
          email: bizEmail,
          phone: bizPhone,
          bankDetails: bizBank,
          colorTheme: bizColor,
          type: bizType,
          brandSlogan: bizBrandSlogan,
          logoType: bizLogoType,
          logoSymbol: bizLogoSymbol,
          logoText: bizLogoText,
          logoUrl: bizLogoUrl,
          category: bizCategory,
          isPrimary: bizIsPrimary,
          customFields: bizCustomFields,
          socials: bizSocials,
          mPaisaId,
          myCashId,
          currency: bizCurrency,
          workingCurrencies: bizWorkingCurrencies,
          customExchangeRates: bizCustomExchangeRates
        };
      }
      return b;
    });

    if (bizIsPrimary) {
      // Set all other businesses to non-primary
      updatedBusinesses = updatedBusinesses.map(b => {
        if (b.id !== selectedBizId) {
          return { ...b, isPrimary: false };
        }
        return b;
      });
    } else {
      // Check if there is another primary. If not, make this one primary.
      const hasPrimary = updatedBusinesses.some(b => b.isPrimary);
      if (!hasPrimary && updatedBusinesses.length > 0) {
        updatedBusinesses = updatedBusinesses.map(b => {
          if (b.id === selectedBizId) {
            return { ...b, isPrimary: true };
          }
          return b;
        });
        setBizIsPrimary(true);
      }
    }

    onUpdateData({
      ...data,
      businesses: updatedBusinesses
    });

    triggerStatus('Business saved', 'success');
  };

  const handleAddSocial = () => {
    if (!newSocialHandle.trim()) {
      triggerStatus('Enter a handle, phone number or link.', 'error');
      return;
    }
    const newSocialItem: BusinessSocial = {
      id: `soc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      platform: newSocialPlatform,
      handle: newSocialHandle.trim()
    };
    setBizSocials([...bizSocials, newSocialItem]);
    setNewSocialHandle('');
    setShowAddSocial(false);
    triggerStatus(`Added ${getSocialConfig(newSocialPlatform).label}. Save the business to keep it.`, 'success');
  };

  const handleRemoveSocial = (index: number) => {
    const updated = bizSocials.filter((_, idx) => idx !== index);
    setBizSocials(updated);
    triggerStatus('Removed. Save the business to keep this change.', 'success');
  };

  const handleApplyCategoryPresets = (categoryKey: string) => {
    const presets = CATEGORY_PRESETS[categoryKey] || [];
    setBizCustomFields(presets);
    setBizCategory(categoryKey);
    triggerStatus(`Loaded the ${categoryKey} fields`, 'success');
  };

  const handleAddCustomField = () => {
    if (!newCustomLabel.trim()) {
      triggerStatus('Enter a field name.', 'error');
      return;
    }
    const exists = bizCustomFields.some(cf => cf.label.toLowerCase() === newCustomLabel.trim().toLowerCase());
    if (exists) {
      triggerStatus('A field with that name already exists.', 'error');
      return;
    }
    setBizCustomFields([...bizCustomFields, { label: newCustomLabel.trim(), value: newCustomValue.trim(), isPreset: false }]);
    setNewCustomLabel('');
    setNewCustomValue('');
    triggerStatus('Field added. Save the business to keep it.', 'success');
  };

  const handleRemoveCustomField = (index: number) => {
    const filtered = bizCustomFields.filter((_, idx) => idx !== index);
    setBizCustomFields(filtered);
    triggerStatus('Field removed. Save the business to keep this change.', 'success');
  };

  const handleAddWorkingCurrency = (code: string) => {
    const upper = code.trim().toUpperCase();
    if (!upper) return;
    if (bizWorkingCurrencies.includes(upper)) {
      triggerStatus(`${upper} is already in your currencies`, 'error');
      return;
    }
    setBizWorkingCurrencies([...bizWorkingCurrencies, upper]);
    triggerStatus(`Added ${upper}. Save the business to keep it.`, 'success');
    setSelectedCurrencyToAdd('');
  };

  const handleRemoveWorkingCurrency = (code: string) => {
    if (code === bizCurrency) {
      triggerStatus(`${bizCurrency} is your base currency, so it can't be removed.`, 'error');
      return;
    }
    if (bizWorkingCurrencies.length <= 1) {
      triggerStatus('Keep at least one currency.', 'error');
      return;
    }
    setBizWorkingCurrencies(bizWorkingCurrencies.filter(c => c !== code));
    if (bizCustomExchangeRates[code]) {
      const updatedRates = { ...bizCustomExchangeRates };
      delete updatedRates[code];
      setBizCustomExchangeRates(updatedRates);
    }
    triggerStatus(`Removed ${code}. Save the business to keep this change.`, 'success');
  };

  const handleSelectRateOverrideCode = (code: string) => {
    setEditingRateCode(code);
    const existing = bizCustomExchangeRates[code];
    const benchmark = getCurrencyConfig(code).approxFjdMultiplier || 1.0;
    setCustomRateInput((existing ?? benchmark).toFixed(4));
  };

  const handleSaveCustomRateOverride = () => {
    const rate = parseFloat(customRateInput);
    if (isNaN(rate) || rate <= 0) {
      triggerStatus('Enter an exchange rate above 0.', 'error');
      return;
    }
    setBizCustomExchangeRates({
      ...bizCustomExchangeRates,
      [editingRateCode]: rate
    });
    triggerStatus(`Rate set: 1 ${editingRateCode} = ${rate.toFixed(4)} ${bizCurrency}. Save the business to keep it.`, 'success');
  };

  const handleResetCustomRate = (code: string) => {
    const updatedRates = { ...bizCustomExchangeRates };
    delete updatedRates[code];
    setBizCustomExchangeRates(updatedRates);
    const benchmarkRate = getCurrencyConfig(code).approxFjdMultiplier || 1.0;
    if (editingRateCode === code) {
      setCustomRateInput(benchmarkRate.toFixed(4));
    }
    triggerStatus(`${code} reset to the default rate (${benchmarkRate.toFixed(4)} ${bizCurrency})`, 'info');
  };

  const triggerStatus = (text: string, type: 'success' | 'error' | 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  const handleExportData = () => {
    try {
      const dataStr = JSON.stringify(data, null, 2);
      navigator.clipboard.writeText(dataStr);
      triggerStatus('Backup copied. Paste it into a file or notes app and keep it somewhere safe.', 'success');
    } catch (err) {
      triggerStatus('Couldn\'t copy the backup. Use Download backup instead.', 'error');
    }
  };

  const handleDownloadBackupFile = () => {
    try {
      const dataStr = JSON.stringify(data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `frilensa-crm-backup-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerStatus('Backup downloaded', 'success');
    } catch (err) {
      triggerStatus('The backup couldn\'t be downloaded. Try again.', 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content) as CRMData;
        if (parsed.userProfile && parsed.businesses) {
          const merged = mergeCRMData(data, parsed);
          onUpdateData(merged);
          saveLocalBackup(merged);
          triggerStatus('Backup imported and merged with your data', 'success');
        } else {
          triggerStatus('That file isn\'t a Frilensa backup.', 'error');
        }
      } catch (err) {
        triggerStatus('That file couldn\'t be read. Check it\'s a Frilensa backup (.json).', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestoreAutoBackup = () => {
    const backup = loadLocalBackup();
    if (!backup || !backup.businesses || backup.businesses.length === 0) {
      triggerStatus('No automatic backup found on this device.', 'error');
      return;
    }
    if (confirm('Restore records (including transactions) from the automatic backup on this device? They\'ll be merged with your current data.')) {
      const merged = mergeCRMData(data, backup);
      onUpdateData(merged);
      saveLocalBackup(merged);
      const txCount = merged.transactions?.length || 0;
      triggerStatus(`Restored ${txCount} transaction(s) from the backup`, 'success');
    }
  };

  const handleImportData = () => {
    if (!importJson) {
      triggerStatus('Paste your backup first.', 'error');
      return;
    }

    try {
      const parsed = JSON.parse(importJson) as CRMData;
      if (parsed.userProfile && parsed.businesses) {
        const merged = mergeCRMData(data, parsed);
        onUpdateData(merged);
        saveLocalBackup(merged);
        setImportJson('');
        setShowBackupArea(false);
        triggerStatus('Backup restored and merged with your data', 'success');
      } else {
        triggerStatus('That isn\'t a complete Frilensa backup.', 'error');
      }
    } catch (err) {
      triggerStatus('That backup couldn\'t be read. Check you pasted all of it.', 'error');
    }
  };


  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto pb-24 font-sans select-none">
      
      {/* Header */}
      <div>
        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium block">Fiji Freelancer CRM</span>
        <h2 className="text-xl md:text-2xl font-display font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5 mt-0.5">
          <Settings className="w-5 h-5 text-zinc-400" /> Settings & System
        </h2>
      </div>

      {statusMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-3.5 rounded-xl text-xs flex items-center border ${
            statusMessage.type === 'success' 
              ? 'bg-zinc-50 border-zinc-200 text-zinc-800' 
              : 'bg-red-50 border-red-100 text-red-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <Check className="w-4 h-4 text-zinc-900 shrink-0 mr-2" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mr-2" />
          )}
          {statusMessage.text}
        </motion.div>
      )}

      {/* Main configuration settings form */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-4 text-xs text-zinc-600">
        <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Consultant & Tax Profile</span>

        <div>
          <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Consultant Full Name *</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-2 text-zinc-400">
              <User className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 pl-8.5 pr-3 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900 focus:ring-0 transition-colors"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Primary billing email *</label>
            {data.userProfile.emailVerified !== false && (
              <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" /> Email Verified
              </span>
            )}
          </div>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 text-zinc-800 focus:outline-none focus:border-zinc-900 focus:ring-0 transition-colors"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Mobile Phone Number (M-Paisa / SMS)</label>
            {data.userProfile.phoneVerified !== false && (
              <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" /> Phone Verified
              </span>
            )}
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+679 991 2345"
            className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 font-mono text-zinc-800 focus:outline-none focus:border-zinc-900 focus:ring-0 transition-colors"
          />
          <p className="text-[9px] text-zinc-400 mt-1">Used for 2FA SMS security and direct client M-Paisa payment confirmations</p>
        </div>

        <div>
          <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Fiji Tax Identification Number (TIN)</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-2 text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={tin}
              onChange={(e) => setTin(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 pl-8.5 pr-3 text-xs font-mono text-zinc-800 focus:outline-none focus:border-zinc-900 focus:ring-0 transition-colors"
            />
          </div>
          <p className="text-[9px] text-zinc-400 mt-1">Required to generate lawful Fiji VAT Tax Invoices</p>
        </div>

        {/* Global Tax Component Toggle */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          enableTax ? 'bg-sky-50/70 border-sky-200' : 'bg-amber-50/70 border-amber-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className={`w-4 h-4 ${enableTax ? 'text-sky-600' : 'text-amber-600'}`} />
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  Fiji Statutory Tax Component (12.5% VAT)
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {enableTax ? 'VAT calculations enabled for all standard invoices' : 'Tax disabled / 0% VAT (Non-VAT Micro-Business Invoicing)'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnableTax(!enableTax)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                enableTax
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-amber-600 text-white shadow-xs'
              }`}
            >
              {enableTax ? 'Tax Engine: ON' : 'Tax Engine: OFF'}
            </button>
          </div>
          <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">
            <strong>Fiji VAT Act (Section 21 Exemption):</strong> Small businesses, sole proprietors, and freelancers with annual turnover under <strong>FJD $100,000</strong> are not legally required to register for VAT. When disabled, your invoices and quotes will automatically be issued tax-exempt without VAT surcharges.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Fiji VAT rate (%)</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-2 text-zinc-400">
                <Percent className="w-3.5 h-3.5" />
              </span>
              <input
                type="number"
                disabled={!enableTax}
                min={0}
                max={50}
                step="0.1"
                value={vatRate}
                onChange={(e) => setVatRate(Number(e.target.value))}
                className={`w-full bg-white border border-zinc-200 rounded-lg py-1.5 pl-8.5 pr-3 text-xs font-mono font-medium text-zinc-800 focus:outline-none focus:border-zinc-900 focus:ring-0 transition-colors ${!enableTax ? 'opacity-50 cursor-not-allowed bg-zinc-100' : ''}`}
              />
            </div>
            <span className="text-[9px] text-zinc-400 mt-1 block">Fiji statutory rate is 12.5% (adjustable with decimal precision)</span>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Standard Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 font-medium text-zinc-800 focus:outline-none focus:border-zinc-900 focus:ring-0 transition-colors appearance-none bg-no-repeat bg-[right_10px_center]"
            >
              <option value="FJD">FJD ($)</option>
              <option value="USD">USD ($)</option>
              <option value="AUD">AUD ($)</option>
              <option value="NZD">NZD ($)</option>
            </select>
            <span className="text-[9px] text-zinc-400 mt-1 block">Default currency symbol</span>
          </div>
        </div>

        {/* Email notifications */}
        <div className="p-3.5 rounded-xl border border-zinc-200/90 bg-zinc-50/70 flex items-center justify-between gap-3">
          <div>
            <span className="block text-[11px] font-bold text-zinc-900">Email notifications</span>
            <span className="text-[9px] text-zinc-500">
              Email me at {data.userProfile.email || 'my account email'} when a client reports a payment, accepts a quote, sends a message or books me.
            </span>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-semibold text-zinc-700 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={data.userProfile.emailNotifications !== false}
              onChange={(e) => onUpdateData({ ...data, userProfile: { ...data.userProfile, emailNotifications: e.target.checked } })}
              className="rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
            />
            On
          </label>
        </div>

        <AutomationSettingsCard data={data} onUpdateData={onUpdateData} onManualCloudSync={onManualCloudSync} />

        {/* Inactivity Auto-Logout Security Configuration */}
        <div className="p-3.5 rounded-xl border border-zinc-200/90 bg-zinc-50/70 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div>
                <span className="block text-[11px] font-bold text-zinc-900">Inactivity Session Timeout</span>
                <span className="text-[9px] text-zinc-500">Automatically logs out when idle to safeguard financial data & client records</span>
              </div>
            </div>
            <span className="text-[9px] font-mono font-bold bg-white text-zinc-800 px-2 py-0.5 rounded border border-zinc-200 shadow-2xs">
              {inactivityTimeout === 0 ? 'Disabled (Stay Signed In)' : `${inactivityTimeout} Minutes`}
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
            {[
              { label: '5 Min', value: 5, desc: 'High Security' },
              { label: '15 Min', value: 15, desc: 'Recommended' },
              { label: '30 Min', value: 30, desc: 'Standard' },
              { label: '1 Hour', value: 60, desc: 'Extended' },
              { label: '2 Hours', value: 120, desc: 'All Day' },
              { label: 'Disabled', value: 0, desc: 'Never' }
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setInactivityTimeout(option.value)}
                className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer border ${
                  inactivityTimeout === option.value
                    ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                <div className="text-[11px] font-bold">{option.label}</div>
                <div className={`text-[8px] ${inactivityTimeout === option.value ? 'text-zinc-300' : 'text-zinc-400'}`}>{option.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-zinc-400 leading-tight">
            When active, a 60-second warning countdown will appear before auto-logout occurs. Any mouse movement, click, or keystroke immediately resets the idle timer.
          </p>
        </div>

        <button
          type="submit"
          className="w-full bg-zinc-900 hover:bg-zinc-850 text-white font-medium py-2 rounded-lg text-xs transition-all shadow-xs cursor-pointer"
        >
          Update Settings Profile & Security
        </button>
      </form>

      {/* Multiple Business Profiles & Custom Fields Manager */}
      <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-4 text-xs text-zinc-600">
        <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
          <div className="flex items-center gap-1.5">
            <Building className="w-4 h-4 text-zinc-500" />
            <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Venture Profile Manager</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBrandDesignerModal(true)}
              className="bg-sky-50 text-sky-700 hover:bg-sky-100 text-[9px] font-bold px-2 py-1 rounded-lg border border-sky-200 uppercase tracking-wide flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Wand2 className="w-3 h-3 text-sky-600" />
              <span>Brand Studio & Palette</span>
            </button>
            {bizIsPrimary && (
              <span className="bg-emerald-50 text-emerald-700 text-[8px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider flex items-center gap-0.5 shrink-0">
                <CheckCircle className="w-2.5 h-2.5" /> Primary
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Select Venture to Configure</label>
          <select
            value={selectedBizId}
            onChange={(e) => setSelectedBizId(e.target.value)}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-1.5 px-3 text-xs font-semibold mt-1 text-zinc-800 focus:outline-none focus:border-zinc-900 focus:ring-0 transition-colors"
          >
            {data.businesses.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} {b.isPrimary ? ' (Primary)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Form for managing selected business */}
        <form onSubmit={handleSaveBusinessProfile} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Venture Name *</label>
              <input
                type="text"
                required
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="e.g. Street Level Digital"
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 text-zinc-850"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Venture TIN *</label>
              <input
                type="text"
                required
                value={bizTin}
                onChange={(e) => setBizTin(e.target.value)}
                placeholder="e.g. 50-12345-0-0"
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 font-mono text-zinc-850"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Business / Company Reg #</label>
              <input
                type="text"
                value={bizRegNumber}
                onChange={(e) => setBizRegNumber(e.target.value)}
                placeholder="e.g. ROC 2024-9812 / BN-1234"
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 font-mono text-zinc-850"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Billing Email</label>
              <input
                type="email"
                value={bizEmail}
                onChange={(e) => setBizEmail(e.target.value)}
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 text-zinc-850"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Phone Contact</label>
              <input
                type="text"
                value={bizPhone}
                onChange={(e) => setBizPhone(e.target.value)}
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 text-zinc-850"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Physical Address</label>
            <input
              type="text"
              value={bizAddress}
              onChange={(e) => setBizAddress(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 text-zinc-850"
            />
          </div>

          {/* Venture Socials & Messaging Channels */}
          <div className="space-y-2.5 pt-2 border-t border-dashed border-zinc-200">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Share2 className="w-3 h-3 text-zinc-400" />
                  <span>Socials & Messaging Channels</span>
                </label>
                <p className="text-[9px] text-zinc-400">
                  Add Viber, WhatsApp, Facebook, Instagram, LinkedIn, TikTok, etc. for invoices & customer portal.
                </p>
              </div>
              {!showAddSocial && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSocial(true);
                    setNewSocialHandle('');
                  }}
                  className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[10px] font-bold py-1 px-2.5 rounded-lg flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3 h-3 text-zinc-600" />
                  <span>Add Social</span>
                </button>
              )}
            </div>

            {/* List of existing socials */}
            {bizSocials.length === 0 && !showAddSocial ? (
              <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-3 text-center">
                <p className="text-[10px] text-zinc-400">No social or messaging channels linked yet.</p>
                <button
                  type="button"
                  onClick={() => setShowAddSocial(true)}
                  className="mt-1.5 text-[10px] text-sky-600 hover:text-sky-700 font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add Social Channel
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {bizSocials.map((social, idx) => {
                  const cfg = getSocialConfig(social.platform);
                  return (
                    <div
                      key={social.id || idx}
                      className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-2 px-3 flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 ${cfg.badgeStyle}`}>
                          <span>{cfg.icon}</span>
                          <span>{cfg.label}</span>
                        </span>
                        <span className="text-xs font-mono text-zinc-800 truncate select-all">
                          {social.handle}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSocial(idx)}
                        className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                        title="Remove social handle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Social Input form (revealed when Add button is clicked) */}
            {showAddSocial && (
              <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3 space-y-2.5 shadow-2xs">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-sky-900 uppercase tracking-wider flex items-center gap-1">
                    <Plus className="w-3 h-3 text-sky-600" />
                    <span>Select Platform & Handle</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddSocial(false)}
                    className="text-zinc-400 hover:text-zinc-700 p-0.5 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-sky-800 uppercase mb-0.5">Platform</label>
                    <select
                      value={newSocialPlatform}
                      onChange={(e) => setNewSocialPlatform(e.target.value as SocialPlatform)}
                      className="w-full bg-white border border-sky-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-sky-500 cursor-pointer"
                    >
                      {SOCIAL_PLATFORMS.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.icon} {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[9px] font-bold text-sky-800 uppercase mb-0.5">
                      Handle / Username / Mobile / URL
                    </label>
                    <input
                      type="text"
                      value={newSocialHandle}
                      onChange={(e) => setNewSocialHandle(e.target.value)}
                      placeholder={getSocialConfig(newSocialPlatform).placeholder}
                      className="w-full bg-white border border-sky-200 rounded-lg py-1.5 px-2.5 text-xs text-zinc-850 font-mono focus:outline-none focus:border-sky-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSocial();
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddSocial(false)}
                    className="px-3 py-1 bg-white hover:bg-zinc-100 text-zinc-600 text-[10px] font-semibold rounded-lg border border-zinc-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddSocial}
                    className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold rounded-lg transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    Add Channel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">M-Paisa Business ID</label>
              <input
                type="text"
                value={mPaisaId}
                onChange={(e) => setMPaisaId(e.target.value)}
                placeholder="e.g. 7771234"
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 font-mono text-zinc-850"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">MyCash QR ID</label>
              <input
                type="text"
                value={myCashId}
                onChange={(e) => setMyCashId(e.target.value)}
                placeholder="e.g. MC-9811"
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 font-mono text-zinc-850"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Fiji Bank Settlement Details</label>
            <textarea
              value={bizBank}
              onChange={(e) => setBizBank(e.target.value)}
              rows={3}
              placeholder="Bank Name, Account, Branch & BSB Code"
              className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 text-zinc-850 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Venture Theme Color</label>
                {bizLogoUrl && (
                  <button
                    type="button"
                    onClick={() => handleExtractBizLogoColors(bizLogoUrl, true)}
                    className="text-[9px] text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Wand2 className={`w-2.5 h-2.5 ${isExtractingBizColors ? 'animate-spin' : ''}`} />
                    Auto-extract from Logo
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={bizColor}
                  onChange={(e) => setBizColor(e.target.value)}
                  className="w-8 h-8 rounded border border-zinc-200 cursor-pointer p-0 bg-transparent"
                />
                <span className="font-mono text-[10px] uppercase font-bold text-zinc-700">{bizColor}</span>
              </div>
              {bizExtractedPalette && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[8px] text-zinc-400 font-bold uppercase">Logo Swatches:</span>
                  {bizExtractedPalette.palette.map((swatch, idx) => (
                    <button
                      key={`${swatch}-${idx}`}
                      type="button"
                      onClick={() => setBizColor(swatch)}
                      className={`w-4.5 h-4.5 rounded-full border border-black/10 transition-transform hover:scale-110 cursor-pointer ${
                        bizColor.toLowerCase() === swatch.toLowerCase() ? 'ring-2 ring-sky-600' : ''
                      }`}
                      style={{ backgroundColor: swatch }}
                      title={`Extracted color: ${swatch}`}
                    />
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Venture Model Type</label>
              <select
                value={bizType}
                onChange={(e) => setBizType(e.target.value as 'studio' | 'saas')}
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 font-semibold text-zinc-850"
              >
                <option value="studio">Tech/Creative Studio</option>
                <option value="saas">SaaS Subscription Product</option>
              </select>
            </div>
          </div>

          {/* Venture Branding & Logo Configuration */}
          <div className="space-y-3 pt-2 border-t border-dashed border-zinc-200">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Logo & Client Portal Branding
              </label>
              <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                White-Label Sync
              </span>
            </div>

            <div>
              <label className="block text-[9.5px] font-medium text-zinc-400 uppercase">Brand Slogan / Tagline</label>
              <input
                type="text"
                placeholder="e.g. Web Design & Bespoke App Development"
                value={bizBrandSlogan}
                onChange={(e) => setBizBrandSlogan(e.target.value)}
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-xs mt-1 text-zinc-850"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9px] font-medium text-zinc-400 uppercase">Logo Format</label>
                <select
                  value={bizLogoType}
                  onChange={(e) => setBizLogoType(e.target.value as 'text' | 'symbol' | 'image')}
                  className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2 text-xs mt-1 text-zinc-850"
                >
                  <option value="image">Custom Image / PNG</option>
                  <option value="symbol">Symbol Icon</option>
                  <option value="text">Monogram / Text</option>
                </select>
              </div>

              {bizLogoType === 'symbol' && (
                <div className="col-span-2">
                  <label className="block text-[9px] font-medium text-zinc-400 uppercase">Brand Symbol Icon</label>
                  <select
                    value={bizLogoSymbol}
                    onChange={(e) => setBizLogoSymbol(e.target.value)}
                    className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2 text-xs mt-1 text-zinc-850"
                  >
                    <option value="Sparkles">✨ Sparkles (Creative / Tech)</option>
                    <option value="Waves">🌊 Waves (Pacific / Ocean)</option>
                    <option value="Briefcase">💼 Briefcase (Consulting)</option>
                    <option value="Building2">🏢 Building (Corporate)</option>
                    <option value="ShieldCheck">🛡️ Shield (Security / Compliance)</option>
                    <option value="Globe">🌐 Globe (International / SaaS)</option>
                    <option value="Heart">❤️ Heart (Hospitality / Wellness)</option>
                  </select>
                </div>
              )}

              {bizLogoType === 'image' && (
                <div className="col-span-2 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-[9px] font-medium text-zinc-400 uppercase">Logo Image File or URL</label>
                    <button
                      type="button"
                      onClick={() => bizFileInputRef.current?.click()}
                      className="text-[9px] text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-2.5 h-2.5" /> Upload File
                    </button>
                    <input
                      ref={bizFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBizLogoFileUpload}
                      className="hidden"
                    />
                  </div>
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png or uploaded image"
                    value={bizLogoUrl}
                    onChange={(e) => {
                      setBizLogoUrl(e.target.value);
                      if (e.target.value) handleExtractBizLogoColors(e.target.value, false);
                    }}
                    className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2 text-xs mt-0.5 text-zinc-850 font-mono"
                  />
                </div>
              )}

              {bizLogoType === 'text' && (
                <div className="col-span-2">
                  <label className="block text-[9px] font-medium text-zinc-400 uppercase">Monogram / Abbreviation</label>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="e.g. BULA or BT"
                    value={bizLogoText}
                    onChange={(e) => setBizLogoText(e.target.value)}
                    className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2 text-xs mt-1 text-zinc-850 font-mono uppercase font-bold"
                  />
                </div>
              )}
            </div>

            {/* Live Branding Preview */}
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-150 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs"
                  style={{ backgroundColor: bizColor || '#0284c7' }}
                >
                  {bizLogoType === 'image' && bizLogoUrl ? (
                    <img src={bizLogoUrl} alt="Logo" className="h-7 w-auto object-contain" referrerPolicy="no-referrer" />
                  ) : bizLogoType === 'text' && bizLogoText ? (
                    <span className="font-mono text-[10px] tracking-wider">{bizLogoText}</span>
                  ) : (
                    <span>{bizLogoSymbol === 'Waves' ? '🌊' : bizLogoSymbol === 'Sparkles' ? '✨' : bizLogoSymbol === 'Briefcase' ? '💼' : bizLogoSymbol === 'Building2' ? '🏢' : bizLogoSymbol === 'ShieldCheck' ? '🛡️' : (bizName || 'B').charAt(0)}</span>
                  )}
                </div>
                <div>
                  <span className="font-bold text-xs text-zinc-900 block">{bizName || 'Business Venture'}</span>
                  <span className="text-[9px] text-zinc-400 block">{bizBrandSlogan || 'Client Portal Brand Preview'}</span>
                </div>
              </div>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded border border-zinc-200 bg-white" style={{ color: bizColor }}>
                {bizColor}
              </span>
            </div>
          </div>

          {/* Primary Designation toggle */}
          <div className="flex items-center justify-between bg-zinc-50 p-2.5 rounded-lg border border-zinc-150">
            <div className="flex-1 pr-2">
              <span className="font-bold text-zinc-750 block">Designate as Primary Profile</span>
              <p className="text-[9px] text-zinc-400">All default contracts, quotes and tax documents will load this company first.</p>
            </div>
            <input
              type="checkbox"
              checked={bizIsPrimary}
              disabled={bizIsPrimary && data.businesses.filter(b => b.isPrimary).length <= 1}
              onChange={(e) => setBizIsPrimary(e.target.checked)}
              className="w-4 h-4 rounded text-zinc-900 border-zinc-300 focus:ring-0 cursor-pointer shrink-0"
            />
          </div>

          {/* Venture Profession Category & Presets */}
          <div className="space-y-2 pt-2 border-t border-dashed border-zinc-200">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Profession Category</label>
              <span className="text-[8px] bg-sky-50 text-sky-700 font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide">Adjust Custom presets</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={bizCategory}
                onChange={(e) => setBizCategory(e.target.value)}
                className="col-span-1 bg-white border border-zinc-200 rounded-lg py-1.5 px-2.5 text-xs text-zinc-800"
              >
                <option value="general">💼 General / Freelance</option>
                <option value="boutique">👔 Boutique Clothing</option>
                <option value="plumber">🔧 Plumber</option>
                <option value="mc">🎙️ Professional MC</option>
                <option value="band">🎸 Music Band</option>
                <option value="production">🎬 Production Company</option>
                <option value="taxi">🚕 Taxi / Transport</option>
              </select>

              <button
                type="button"
                onClick={() => handleApplyCategoryPresets(bizCategory)}
                className="col-span-1 bg-sky-50 hover:bg-sky-100 text-sky-700 font-extrabold py-1 px-2.5 rounded-lg text-[10px] border border-sky-100/60 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" /> Load Field Presets
              </button>
            </div>
            <p className="text-[9px] text-zinc-400">
              Switching profession category and loading presets automatically configures custom data specifications (like vehicle plate, plumbing license, MC riders) onto your Tax Invoices and proposals.
            </p>
          </div>

          {/* Dynamic Custom Fields Editor */}
          <div className="space-y-3 pt-3 border-t border-dashed border-zinc-200">
            <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Venture-Specific Parameters & Custom Fields</span>
            
            {bizCustomFields.length === 0 ? (
              <div className="text-center py-4 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl text-zinc-400 text-[10px]">
                No custom fields are loaded for this business yet. Use presets above or add customized inputs below!
              </div>
            ) : (
              <div className="space-y-2">
                {bizCustomFields.map((cf, idx) => (
                  <div key={idx} className="bg-zinc-50 p-2.5 rounded-lg border border-zinc-200 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="block text-[8px] font-bold text-zinc-400 uppercase leading-none tracking-wide">{cf.label} {cf.isPreset ? '• Preset' : ''}</span>
                      <input
                        type="text"
                        value={cf.value}
                        onChange={(e) => {
                          const updated = [...bizCustomFields];
                          updated[idx].value = e.target.value;
                          setBizCustomFields(updated);
                        }}
                        placeholder="Enter value"
                        className="w-full bg-transparent border-none p-0 text-xs font-semibold text-zinc-800 focus:ring-0 mt-1 placeholder-zinc-300"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomField(idx)}
                      className="p-1 hover:bg-zinc-200 rounded text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Form component to add arbitrary custom fields */}
            <div className="bg-zinc-50/60 p-2.5 rounded-lg border border-zinc-150 space-y-2">
              <span className="block text-[8.5px] font-extrabold text-zinc-500 uppercase tracking-wider">Add Custom Field Input</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="e.g. License Number"
                  value={newCustomLabel}
                  onChange={(e) => setNewCustomLabel(e.target.value)}
                  className="bg-white border border-zinc-200 rounded py-1 px-2 text-[10px] text-zinc-800"
                />
                <input
                  type="text"
                  placeholder="Value details"
                  value={newCustomValue}
                  onChange={(e) => setNewCustomValue(e.target.value)}
                  className="bg-white border border-zinc-200 rounded py-1 px-2 text-[10px] text-zinc-800"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomField}
                className="w-full bg-zinc-200 hover:bg-zinc-250 text-zinc-700 font-bold py-1 px-2.5 rounded text-[9.5px] transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Insert New Custom Parameter
              </button>
            </div>
          </div>

          {/* Working Currencies & Multi-Currency Settings for International Projects */}
          <div className="space-y-3 pt-3 border-t border-dashed border-zinc-200">
            <div className="flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-sky-600" />
                  International Project Currencies
                </span>
                <span className="text-[9.5px] text-zinc-400 block mt-0.5">
                  Define working currencies accepted for cross-border client invoices, quotes, and foreign expenses.
                </span>
              </div>
              <span className="text-[8.5px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                Multi-Currency
              </span>
            </div>

            {/* Base Venture Currency */}
            <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-wide flex items-center gap-1">
                  <Coins className="w-3 h-3 text-amber-500" />
                  Primary Base Currency (Ledger & Reports)
                </label>
                <span className="text-[8px] bg-amber-50 text-amber-800 font-bold px-1.5 py-0.2 rounded border border-amber-200">
                  FRCS Tax Base
                </span>
              </div>
              <select
                value={bizCurrency}
                onChange={(e) => {
                  const newBase = e.target.value;
                  setBizCurrency(newBase);
                  if (!bizWorkingCurrencies.includes(newBase)) {
                    setBizWorkingCurrencies([newBase, ...bizWorkingCurrencies]);
                  }
                }}
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2.5 text-xs font-bold text-zinc-800 focus:ring-1 focus:ring-sky-500 cursor-pointer"
              >
                {SUPPORTED_CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} ({c.symbol}) &mdash; {c.name}
                  </option>
                ))}
              </select>
              <p className="text-[9px] text-zinc-400 leading-tight">
                All venture revenue summaries, tax calculations, and FRCS VAT reports consolidate into this base currency.
              </p>
            </div>

            {/* Active Working Currencies */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-wide">
                  Active Working Currencies ({bizWorkingCurrencies.length})
                </label>
                <span className="text-[9px] text-zinc-400">Available in Billing & Expenses</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {bizWorkingCurrencies.map(code => {
                  const config = getCurrencyConfig(code);
                  const isBase = code === bizCurrency;
                  const hasCustomRate = !!bizCustomExchangeRates[code];
                  const effectiveRate = bizCustomExchangeRates[code] ?? config.approxFjdMultiplier;

                  return (
                    <div
                      key={code}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                        isBase
                          ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                          : hasCustomRate
                          ? 'bg-sky-50/70 border-sky-200 text-sky-900'
                          : 'bg-white border-zinc-200 text-zinc-800 shadow-xs'
                      }`}
                    >
                      <span className="text-sm">{config.flag}</span>
                      <div className="text-left leading-tight">
                        <div className="flex items-center gap-1">
                          <span className="font-bold">{code}</span>
                          {isBase && (
                            <span className="text-[7.5px] font-black uppercase tracking-wider bg-amber-200/80 text-amber-800 px-1 rounded">
                              Base
                            </span>
                          )}
                          {hasCustomRate && (
                            <span className="text-[7.5px] font-black uppercase tracking-wider bg-sky-200/80 text-sky-800 px-1 rounded">
                              Custom FX
                            </span>
                          )}
                        </div>
                        {!isBase && (
                          <span className="text-[8.5px] font-mono text-zinc-400 block">
                            1 {code} ≈ ${effectiveRate?.toFixed(3)} {bizCurrency}
                          </span>
                        )}
                      </div>
                      {!isBase && (
                        <button
                          type="button"
                          onClick={() => handleRemoveWorkingCurrency(code)}
                          className="ml-1 text-zinc-400 hover:text-rose-600 transition-colors p-0.5 rounded cursor-pointer"
                          title={`Remove ${code} from working currencies`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quick Add Presets */}
              <div className="pt-1">
                <span className="text-[8.5px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                  Quick Add Regional / Global Currencies:
                </span>
                <div className="flex flex-wrap gap-1">
                  {['AUD', 'NZD', 'USD', 'EUR', 'GBP', 'CAD', 'SGD', 'PGK', 'WST', 'SBD', 'VUV', 'TOP', 'JPY', 'CNY'].map(code => {
                    const isAdded = bizWorkingCurrencies.includes(code);
                    const cfg = getCurrencyConfig(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleAddWorkingCurrency(code)}
                        disabled={isAdded}
                        className={`px-2 py-0.5 rounded-lg text-[9.5px] font-bold flex items-center gap-1 transition-all ${
                          isAdded
                            ? 'bg-zinc-100 text-zinc-400 border border-zinc-200/60 cursor-not-allowed'
                            : 'bg-white hover:bg-sky-50 text-zinc-700 hover:text-sky-800 border border-zinc-200 shadow-2xs hover:border-sky-200 cursor-pointer'
                        }`}
                      >
                        <span>{cfg.flag}</span>
                        <span>{code}</span>
                        {isAdded ? (
                          <Check className="w-2.5 h-2.5 text-zinc-400" />
                        ) : (
                          <Plus className="w-2.5 h-2.5 text-sky-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom/Other Currency from All 30+ List */}
              <div className="flex gap-2 pt-1">
                <select
                  value={selectedCurrencyToAdd}
                  onChange={(e) => setSelectedCurrencyToAdd(e.target.value)}
                  className="flex-1 bg-white border border-zinc-200 rounded-lg py-1 px-2 text-xs text-zinc-800"
                >
                  <option value="">Select other world currency to add...</option>
                  {SUPPORTED_CURRENCIES.filter(c => !bizWorkingCurrencies.includes(c.code)).map(c => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} ({c.symbol}) &mdash; {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => selectedCurrencyToAdd && handleAddWorkingCurrency(selectedCurrencyToAdd)}
                  disabled={!selectedCurrencyToAdd}
                  className="bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white font-bold px-3 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {/* Custom Exchange Rate Overrides & FX Calculator Setup */}
            <div className="bg-sky-50/40 rounded-xl p-3 border border-sky-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-sky-600" />
                  <span className="text-[10px] font-bold text-sky-950 uppercase tracking-wide">
                    Custom Exchange Rate Overrides
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRateOverrideEditor(!showRateOverrideEditor)}
                  className="text-[9.5px] font-bold text-sky-700 hover:text-sky-900 cursor-pointer"
                >
                  {showRateOverrideEditor ? 'Hide Overrides' : 'Customize Rates'}
                </button>
              </div>

              {showRateOverrideEditor && (
                <div className="space-y-2.5 pt-1">
                  <p className="text-[9px] text-zinc-500 leading-normal">
                    Lock in contracted or agreed currency exchange rates with international clients (e.g. 1 AUD = 1.485 FJD) rather than market float benchmarks.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-zinc-400 uppercase block">Currency</label>
                      <select
                        value={editingRateCode}
                        onChange={(e) => handleSelectRateOverrideCode(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-lg py-1 px-2 text-xs font-bold text-zinc-800 mt-0.5 cursor-pointer"
                      >
                        {bizWorkingCurrencies.filter(c => c !== bizCurrency).map(c => (
                          <option key={c} value={c}>
                            {getCurrencyConfig(c).flag} {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] font-bold text-zinc-400 uppercase block">
                          Rate (1 {editingRateCode} = X {bizCurrency})
                        </label>
                      </div>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={customRateInput}
                        onChange={(e) => setCustomRateInput(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-lg py-1 px-2 text-xs font-mono font-bold text-zinc-800 mt-0.5"
                      />
                    </div>

                    <div className="flex items-end gap-1.5">
                      <button
                        type="button"
                        onClick={handleSaveCustomRateOverride}
                        className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-1 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3 h-3" /> Save Rate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetCustomRate(editingRateCode)}
                        title="Reset to benchmark"
                        className="bg-white hover:bg-zinc-100 text-zinc-600 border border-zinc-200 font-semibold py-1 px-2 rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Active Overrides Summary */}
                  {Object.keys(bizCustomExchangeRates).length > 0 && (
                    <div className="bg-white p-2 rounded-lg border border-sky-100 text-[9.5px] space-y-1">
                      <span className="font-bold text-sky-900 block">Active Contracted Overrides:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(bizCustomExchangeRates).map(([code, rate]) => (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 rounded-md font-mono"
                          >
                            <strong>1 {code}</strong> = {Number(rate).toFixed(4)} {bizCurrency}
                            <button
                              type="button"
                              onClick={() => handleResetCustomRate(code)}
                              className="text-sky-400 hover:text-rose-600 ml-1 cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-zinc-900 hover:bg-zinc-850 text-white font-semibold py-2 rounded-lg text-xs transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> Save Venture Specifications
          </button>
        </form>
      </div>

      {/* South Pacific Regional SaaS Expansion strategy */}
      <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-3 text-xs text-zinc-600">
        <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-100">
          <Globe className="w-4 h-4 text-zinc-500" />
          <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">South Pacific SaaS Expansion Target</span>
        </div>

        <p className="text-[10px] text-zinc-400 leading-normal">
          This SaaS billing engine and mobile payment sync are currently tailored exclusively for <strong>Fiji (FJD)</strong>. Explore compliance requirements and future rollout roadmaps for neighboring South Pacific countries.
        </p>

        <div className="grid grid-cols-5 gap-1.5 text-center">
          {[
            { code: 'FJ', name: 'Fiji', badge: 'Active', color: 'bg-emerald-50 text-emerald-800 border-emerald-100' },
            { code: 'WS', name: 'Samoa', badge: 'Planned', color: 'bg-zinc-50 text-zinc-500 border-zinc-150' },
            { code: 'TO', name: 'Tonga', badge: 'Planned', color: 'bg-zinc-50 text-zinc-500 border-zinc-150' },
            { code: 'VU', name: 'Vanuatu', badge: 'Planned', color: 'bg-zinc-50 text-zinc-500 border-zinc-150' },
            { code: 'SB', name: 'Solomon', badge: 'Planned', color: 'bg-zinc-50 text-zinc-500 border-zinc-150' }
          ].map(region => (
            <button
              key={region.code}
              type="button"
              onClick={() => {
                setSelectedRegion(region.code as any);
                triggerStatus(`Strategy updated for ${region.name} sandbox compliance studies!`, 'success');
              }}
              className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                selectedRegion === region.code
                  ? 'bg-zinc-900 border-zinc-900 text-white shadow-sm font-extrabold'
                  : 'bg-zinc-50 text-zinc-500 border-zinc-100 hover:bg-zinc-100'
              }`}
            >
              <span className="block text-xs font-bold">{region.code}</span>
              <span className="text-[7.5px] font-medium block truncate mt-0.5">{region.name}</span>
            </button>
          ))}
        </div>

        {selectedRegion === 'FJ' && (
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-2.5 text-[9.5px] text-emerald-850 space-y-1">
            <span className="font-extrabold text-[8px] uppercase tracking-wider block">Fiji Sandboxing Status:</span>
            <p className="leading-tight text-emerald-800">
              🟢 Fully compliant with Fiji Revenue (FRCS) {data.userProfile.defaultVatRate ?? 12.5}% VAT Tax invoice guidelines. Integrates natively with <strong>M-Paisa Merchant ID</strong> and <strong>Digicel MyCash QR</strong> settlements.
            </p>
          </div>
        )}

        {selectedRegion !== 'FJ' && (
          <div className="bg-sky-50/50 border border-sky-100 rounded-lg p-2.5 text-[9.5px] text-sky-850 space-y-1">
            <span className="font-extrabold text-[8px] uppercase tracking-wider block">Rollout Feasibility & Tax Analysis:</span>
            <p className="leading-tight text-sky-800">
              {selectedRegion === 'WS' && 'Samoa (WST) target VAT is 15%. Direct M-Tala / MyCash settlement sandbox required for local service providers.'}
              {selectedRegion === 'TO' && 'Tonga (TOP) target Consumption Tax is 15%. Tonga Development Bank digital ledger interface study study underway.'}
              {selectedRegion === 'VU' && 'Vanuatu (VUV) target VAT is 15%. Telecom Vanuatu M-Vatu API documentation audit pending.'}
              {selectedRegion === 'SB' && 'Solomon Islands (SBD) target Goods & Services Tax (GST) is 10%. E-Wallet integration pending regulatory sandbox approval.'}
            </p>
          </div>
        )}
      </div>

      {/* Document Prefix & Numbering Section */}
      <form onSubmit={handleSaveNumberingSettings} className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-4 text-xs text-zinc-600">
        <div className="flex justify-between items-center">
          <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Prefix & Numbering Settings</span>
          <span className="text-[8px] bg-zinc-100 text-zinc-700 font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase font-mono max-w-[120px] truncate">
            💼 {activeBusiness?.name}
          </span>
        </div>

        <div>
          <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Numbering Mode</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => setDocNumberMode('auto')}
              className={`py-1.5 px-3 text-xs rounded-lg font-semibold border transition-all cursor-pointer ${
                docNumberMode === 'auto'
                  ? 'bg-zinc-950 text-white border-zinc-950 shadow-sm'
                  : 'bg-zinc-50 text-zinc-600 border-zinc-100 hover:bg-zinc-100'
              }`}
            >
              Auto Prefix & Number
            </button>
            <button
              type="button"
              onClick={() => setDocNumberMode('manual')}
              className={`py-1.5 px-3 text-xs rounded-lg font-semibold border transition-all cursor-pointer ${
                docNumberMode === 'manual'
                  ? 'bg-zinc-950 text-white border-zinc-950 shadow-sm'
                  : 'bg-zinc-50 text-zinc-600 border-zinc-100 hover:bg-zinc-100'
              }`}
            >
              Set Manually
            </button>
          </div>
          <p className="text-[9px] text-zinc-400 mt-1">
            {docNumberMode === 'auto' 
              ? 'Invoices, Receipts, and Quotes will be automatically prefixed and numbered.' 
              : 'You will manually type the document number/serial on creation.'}
          </p>
        </div>

        {docNumberMode === 'auto' && (
          <div className="space-y-3 pt-1 border-t border-dashed border-zinc-100">
            {/* Invoice Configuration */}
            <div>
              <span className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Invoices</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[8px] font-medium text-zinc-400 uppercase">Prefix</label>
                  <input
                    type="text"
                    required
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                    placeholder="INV"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-1 px-2.5 text-xs font-mono font-bold text-zinc-850 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-medium text-zinc-400 uppercase">Starting Number</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={invoiceStartNumber}
                    onChange={(e) => setInvoiceStartNumber(Number(e.target.value))}
                    placeholder="1000"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-1 px-2.5 text-xs font-mono font-bold text-zinc-850 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
                  />
                </div>
              </div>
            </div>

            {/* Receipt Configuration */}
            <div>
              <span className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Receipts</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[8px] font-medium text-zinc-400 uppercase">Prefix</label>
                  <input
                    type="text"
                    required
                    value={receiptPrefix}
                    onChange={(e) => setReceiptPrefix(e.target.value.toUpperCase())}
                    placeholder="REC"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-1 px-2.5 text-xs font-mono font-bold text-zinc-850 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-medium text-zinc-400 uppercase">Starting Number</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={receiptStartNumber}
                    onChange={(e) => setReceiptStartNumber(Number(e.target.value))}
                    placeholder="1000"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-1 px-2.5 text-xs font-mono font-bold text-zinc-850 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
                  />
                </div>
              </div>
            </div>

            {/* Quote Configuration */}
            <div>
              <span className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Quotes</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[8px] font-medium text-zinc-400 uppercase">Prefix</label>
                  <input
                    type="text"
                    required
                    value={quotePrefix}
                    onChange={(e) => setQuotePrefix(e.target.value.toUpperCase())}
                    placeholder="QT"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-1 px-2.5 text-xs font-mono font-bold text-zinc-850 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-medium text-zinc-400 uppercase">Starting Number</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={quoteStartNumber}
                    onChange={(e) => setQuoteStartNumber(Number(e.target.value))}
                    placeholder="1000"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-1 px-2.5 text-xs font-mono font-bold text-zinc-850 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-zinc-950 hover:bg-zinc-850 text-white font-medium py-2 rounded-lg text-xs transition-all shadow-xs cursor-pointer"
        >
          Save Prefix & Numbering Rules
        </button>
      </form>

      {/* Business Custom Surcharges & Fees Manager */}
      <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-4 text-xs text-zinc-600">
        <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
          <div className="flex items-center gap-1.5">
            <Percent className="w-4 h-4 text-zinc-500" />
            <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
              Business Custom Fees & Surcharges
            </span>
          </div>
          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded-full border border-zinc-100">
            {activeBusiness?.name}
          </span>
        </div>

        <p className="text-[10px] text-zinc-400 leading-normal">
          Define custom handling fees, agency service charges, payment processing fees, or emergency callout surcharges for this business venture.
        </p>

        {/* Existing Custom Fees for Active Venture */}
        <div className="space-y-2">
          {((data.businessFees || []).filter(f => !f.businessId || f.businessId === data.activeBusinessId)).length === 0 ? (
            <div className="p-3 bg-zinc-50 rounded-xl text-center text-[10px] text-zinc-400 italic">
              No custom fees configured for this venture yet. Add one below.
            </div>
          ) : (
            (data.businessFees || [])
              .filter(f => !f.businessId || f.businessId === data.activeBusinessId)
              .map((fee) => (
                <div
                  key={fee.id}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                    fee.isActive
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-800'
                      : 'bg-zinc-50/50 border-zinc-100 text-zinc-400 opacity-60'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-zinc-900 truncate">{fee.name}</span>
                      {fee.isDefault && (
                        <span className="text-[8px] font-bold uppercase bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    {fee.description && (
                      <p className="text-[9.5px] text-zinc-400 mt-0.5 truncate">{fee.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-xs bg-white px-2 py-1 rounded-md border border-zinc-200 text-zinc-800">
                      {fee.rateType === 'flat' ? `FJD $${fee.rate.toFixed(2)}` : `${fee.rate}%`}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        const updated = (data.businessFees || []).map(f => f.id === fee.id ? { ...f, isActive: !f.isActive } : f);
                        onUpdateData({ ...data, businessFees: updated });
                      }}
                      className="p-1 text-zinc-400 hover:text-zinc-700 rounded transition-colors"
                      title={fee.isActive ? 'Disable Fee' : 'Enable Fee'}
                    >
                      {fee.isActive ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-zinc-300" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const updated = (data.businessFees || []).filter(f => f.id !== fee.id);
                        onUpdateData({ ...data, businessFees: updated });
                        triggerStatus('Custom fee deleted from venture.', 'success');
                      }}
                      className="p-1 text-zinc-400 hover:text-rose-600 rounded transition-colors"
                      title="Delete Fee"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>

        {/* Add New Custom Fee Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newFeeName.trim()) {
              triggerStatus('Fee title cannot be empty.', 'error');
              return;
            }
            const newFee: FeeConfig = {
              id: `bfee-${Date.now()}`,
              businessId: data.activeBusinessId,
              name: newFeeName.trim(),
              rate: Number(newFeeRate),
              rateType: newFeeRateType,
              category: newFeeCategory,
              isDefault: newFeeIsDefault,
              isActive: true,
              scope: 'business',
              description: newFeeDescription.trim() || undefined
            };

            const updatedFees = [...(data.businessFees || []), newFee];
            onUpdateData({ ...data, businessFees: updatedFees });
            setNewFeeName('');
            setNewFeeRate(5.0);
            setNewFeeDescription('');
            setNewFeeIsDefault(false);
            triggerStatus(`Added fee "${newFee.name}" to ${activeBusiness?.name}!`, 'success');
          }}
          className="bg-zinc-50/70 border border-zinc-100 rounded-xl p-3.5 space-y-3"
        >
          <span className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
            Add New Venture Fee or Surcharge
          </span>

          <div className="space-y-2">
            <div>
              <label className="block text-[9px] font-medium text-zinc-400 uppercase">Fee Name / Surcharge Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Handling & Service Charge, Emergency Callout Fee"
                value={newFeeName}
                onChange={(e) => setNewFeeName(e.target.value)}
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2.5 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-medium text-zinc-400 uppercase">Charge Type</label>
                <select
                  value={newFeeRateType}
                  onChange={(e) => setNewFeeRateType(e.target.value as 'percentage' | 'flat')}
                  className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat Amount (FJD $)</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-medium text-zinc-400 uppercase">
                  {newFeeRateType === 'percentage' ? 'Rate (%)' : 'Amount (FJD $)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  required
                  value={newFeeRate}
                  onChange={(e) => setNewFeeRate(Number(e.target.value))}
                  className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-medium text-zinc-400 uppercase">Category</label>
                <select
                  value={newFeeCategory}
                  onChange={(e) => setNewFeeCategory(e.target.value as any)}
                  className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
                >
                  <option value="service">Service Fee</option>
                  <option value="handling">Handling Fee</option>
                  <option value="processing">Processing Fee</option>
                  <option value="delivery">Delivery / Rush</option>
                  <option value="setup">Setup / Onboarding</option>
                  <option value="custom">Custom Surcharge</option>
                </select>
              </div>

              <div className="flex items-center pt-4">
                <label className="flex items-center gap-1.5 text-[10px] text-zinc-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newFeeIsDefault}
                    onChange={(e) => setNewFeeIsDefault(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <span>Apply by default on new bills</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-medium text-zinc-400 uppercase">Description (Optional note)</label>
              <input
                type="text"
                placeholder="e.g. Pass-through cost for payment gateways or rush dispatch"
                value={newFeeDescription}
                onChange={(e) => setNewFeeDescription(e.target.value)}
                className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2.5 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900 transition-colors mt-0.5"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Venture Fee</span>
          </button>
        </form>

        {/* Platform Statutory Taxes (Read-only Overview for Businesses) */}
        <div className="pt-2 border-t border-zinc-100">
          <span className="block text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
            Statutory Fiji Taxes & Levies (Platform Governed)
          </span>
          <div className="space-y-1.5">
            {(data.platformTaxes || []).map((tax) => (
              <div key={tax.id} className="p-2.5 bg-zinc-50/70 rounded-lg border border-zinc-100 flex items-center justify-between text-[11px]">
                <div>
                  <span className="font-semibold text-zinc-800 block">{tax.name}</span>
                  <span className="text-[9px] text-zinc-400 block">{tax.description}</span>
                </div>
                <span className="font-mono font-bold text-[10px] text-zinc-700 bg-white px-2 py-0.5 rounded border border-zinc-200 shrink-0">
                  {tax.rateType === 'flat' ? `$${tax.rate}` : `${tax.rate}%`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Google Cloud Firestore Synchronization Card */}
      <div className="bg-white rounded-xl p-5 border border-sky-100 shadow-xs space-y-3.5 text-xs text-zinc-600">
        <div className="flex items-center justify-between pb-2 border-b border-sky-50">
          <div className="flex items-center gap-1.5 text-sky-700">
            <Cloud className="w-4 h-4 text-sky-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-800">Cloud Database Synchronization</span>
          </div>
          <span className="bg-emerald-50 text-emerald-700 text-[8px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Connected
          </span>
        </div>

        <p className="text-[10px] text-zinc-500 leading-normal">
          Your workspace and business data are synchronized automatically with the project's cloud database across both mobile and PC apps.
        </p>

        <div className="bg-sky-50/60 p-3 rounded-xl border border-sky-100 space-y-2 text-[10px] font-mono">
          <div className="flex justify-between items-center text-slate-700">
            <span className="text-slate-500">Database Instance:</span>
            <span className="font-bold text-sky-900 truncate max-w-[200px]" title={firebaseConfig.projectId}>
              {firebaseConfig.projectId}
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-700">
            <span className="text-slate-500">Database:</span>
            <span className="font-bold text-sky-800 truncate max-w-[200px]" title={firebaseConfig.firestoreDatabaseId || '(default)'}>
              {firebaseConfig.firestoreDatabaseId ? 'Frilensa Dedicated DB' : 'Default DB'}
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-700">
            <span className="text-slate-500">Sync Account:</span>
            <span className="font-bold text-slate-800">
              {data.userProfile?.email || ''}
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-700">
            <span className="text-slate-500">Active Business:</span>
            <span className="font-bold text-slate-800 truncate max-w-[180px]">
              {data.businesses?.find(b => b.id === data.activeBusinessId)?.name || 'Street Level Digital Engagement Pte Ltd'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            if (!onManualCloudSync) return;
            triggerStatus('Synchronizing with the cloud database...', 'success');
            await onManualCloudSync();
            triggerStatus('Sync finished. Any problem is shown in the banner at the top of the page.', 'success');
          }}
          className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 rounded-lg text-[10.5px] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Force Cloud Sync Now
        </button>
      </div>

      {/* Database & App Management backups */}
      <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-4 text-xs text-zinc-600">
        <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
          <Code className="w-3.5 h-3.5 text-zinc-400" /> Database & Backups
        </span>

        <p className="text-[10px] text-zinc-400 leading-normal">
          Your client profiles, multiple businesses, catalog and billing items are protected with multi-layered local backups and intelligent cloud synchronization.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleDownloadBackupFile}
            className="bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium py-2 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all"
            title="Download workspace JSON file to your device"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" /> Download JSON File
          </button>
          
          <label className="bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium py-2 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-zinc-400" /> Upload JSON File
            <input 
              type="file" 
              accept=".json" 
              className="hidden" 
              onChange={handleFileUpload} 
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleExportData}
            className="bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium py-2 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all"
          >
            <Share2 className="w-3.5 h-3.5 text-zinc-400" /> Copy to Clipboard
          </button>
          <button
            type="button"
            onClick={handleRestoreAutoBackup}
            className="bg-sky-50 hover:bg-sky-100 text-sky-700 font-medium py-2 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" /> Restore Auto-Backup
          </button>
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowBackupArea(!showBackupArea)}
            className="text-[10px] text-zinc-500 hover:text-zinc-800 underline underline-offset-2 flex items-center gap-1"
          >
            {showBackupArea ? 'Hide Manual JSON Editor' : 'Paste Manual JSON Code'}
          </button>
        </div>

        {showBackupArea && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-2 pt-2 border-t border-zinc-100"
          >
            <label className="block text-[9px] font-medium text-zinc-400 uppercase tracking-wider">Paste CRM Backup Code (JSON)</label>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='Paste JSON database payload here...'
              rows={4}
              className="w-full bg-white border border-zinc-200 rounded-lg py-2 px-3 text-[10px] font-mono text-zinc-800"
            />
            <button
              type="button"
              onClick={handleImportData}
              className="w-full bg-zinc-900 hover:bg-zinc-850 text-white font-medium py-2 rounded-lg text-[10px] transition-all cursor-pointer"
            >
              Confirm Restore Database
            </button>
          </motion.div>
        )}
      </div>

      {/* Compliance Information card */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 flex items-start gap-3 text-xs text-zinc-800">
        <Sparkles className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-medium font-sans">Fiji Tax Advisory Note</h4>
          <p className="text-[10px] leading-relaxed text-zinc-500">
            Fiji's Standard Value Added Tax (VAT) rate is {data.userProfile.defaultVatRate ?? 12.5}%. Make sure your business and client Tax Identification Numbers (TIN) are filled correctly before issuing Tax Invoices to meet Fiji Revenue & Customs Authority (FRCA) invoicing requirements.
          </p>
        </div>
      </div>

      {/* Active Subscription Plan & Quotas Banner */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-600" />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Workspace Subscription</span>
              <span className="text-xs font-bold text-zinc-900 uppercase">
                {data.platformSettings?.plans[data.platformSettings?.activePlan || 'free']?.name || 'Free Starter'} Plan
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPaywall(true)}
            className="text-[10px] bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold px-2.5 py-1 rounded-lg border border-sky-200 transition-all"
          >
            Manage / Upgrade
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-100 text-center">
          <div className="bg-zinc-50 p-2 rounded-lg">
            <span className="text-[8.5px] text-zinc-500 uppercase block font-semibold">Ventures</span>
            <span className="text-xs font-mono font-bold text-zinc-800">
              {data.businesses.length} / {data.platformSettings?.plans[data.platformSettings?.activePlan || 'free']?.limits.maxBusinesses || 1}
            </span>
          </div>
          <div className="bg-zinc-50 p-2 rounded-lg">
            <span className="text-[8.5px] text-zinc-500 uppercase block font-semibold">Clients</span>
            <span className="text-xs font-mono font-bold text-zinc-800">
              {data.clients.length} / {data.platformSettings?.plans[data.platformSettings?.activePlan || 'free']?.limits.maxClients === -1 ? '∞' : (data.platformSettings?.plans[data.platformSettings?.activePlan || 'free']?.limits.maxClients || 3)}
            </span>
          </div>
          <div className="bg-zinc-50 p-2 rounded-lg">
            <span className="text-[8.5px] text-zinc-500 uppercase block font-semibold">Invoices / Mo</span>
            <span className="text-xs font-mono font-bold text-zinc-800">
              {data.documents.filter(d => d.type === 'invoice').length} / {data.platformSettings?.plans[data.platformSettings?.activePlan || 'free']?.limits.maxInvoicesPerMonth === -1 ? '∞' : (data.platformSettings?.plans[data.platformSettings?.activePlan || 'free']?.limits.maxInvoicesPerMonth || 5)}
            </span>
          </div>
        </div>
      </div>

      {/* SaaS Platform Admin Portal (platform admins only) */}
      {onOpenAdminPanel && (
      <div className="bg-slate-900 text-slate-100 rounded-xl p-5 border border-slate-800 shadow-md space-y-3">
        <div className="flex items-center gap-1.5 text-sky-400">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-wider">SaaS Platform Management</span>
        </div>
        <p className="text-[9.5px] text-slate-400 leading-relaxed">
          Access the super-administrator control center to monitor multi-tenant billing, approve bank/M-Paisa subscriptions, update global tax variables, and sandbox tenant databases.
        </p>
        <button
          type="button"
          onClick={onOpenAdminPanel}
          className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold py-2 rounded-lg text-[10.5px] transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-97"
        >
          <span>Open SaaS Admin Panel</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      )}

      {/* Native PWA & Mobile App Experience */}
      <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-3.5 text-xs text-zinc-600">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
          <div className="flex items-center gap-1.5 text-sky-600">
            <Smartphone className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-700">Native Mobile App (PWA)</span>
          </div>
          <span className="bg-sky-50 text-sky-700 text-[8px] font-extrabold px-2 py-0.5 rounded-full border border-sky-100 uppercase tracking-wider">
            Standalone Ready
          </span>
        </div>

        <p className="text-[10px] text-zinc-400 leading-normal">
          Frilensa (frilensa.com) is built with Progressive Web App (PWA) capabilities. Install it on your iPhone, Android or iPad for full-screen display, offline receipt caching, and native touch responsiveness without needing the App Store.
        </p>

        <div className="space-y-2 bg-zinc-50 p-3 rounded-xl border border-zinc-150">
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="text-zinc-500 font-medium">Display Mode:</span>
            <span className="font-bold text-zinc-800 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Standalone Native
            </span>
          </div>
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="text-zinc-500 font-medium">Offline Storage:</span>
            <span className="font-bold text-zinc-800 flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-sky-500" /> Service Worker Active
            </span>
          </div>
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="text-zinc-500 font-medium">Safe-Area Insets:</span>
            <span className="font-bold text-zinc-800">Dynamic Notch & Home Bar</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem('pwa_install_prompt_dismissed');
            triggerStatus('Install prompt ready! Tap "Install" or use browser Share menu to Add to Home Screen.', 'success');
            // Dispatch a reload or prompt
            window.location.reload();
          }}
          className="w-full bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold py-2 rounded-lg text-[10.5px] transition-all flex items-center justify-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Re-trigger Install Prompt
        </button>
      </div>

      {/* App Version & Release Notes (rendered from CHANGELOG.md) */}
      <ReleaseNotes />

      {/* Transactional Email Service & Delivery Provider */}
      <div className="bg-white rounded-xl p-5 border border-zinc-100 shadow-xs space-y-4 text-xs text-zinc-600">
        <div className="flex items-center justify-between">
          <div>
            <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
              Messaging &amp; Delivery Pipelines
            </span>
            <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-1.5 mt-0.5">
              <Mail className="w-4 h-4 text-sky-600" />
              Transactional Email Delivery (Invoices, Receipts, Quotes)
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        </div>

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Frilensa delivers branded client communications using a multi-channel architecture. Invoices and official receipts include attached high-resolution PDF documents, itemized pricing, and direct links to the interactive client payment portal.
        </p>

        {/* Provider statuses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* SendGrid Provider */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-zinc-800">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                <span>Twilio SendGrid Direct API</span>
              </div>
              {emailConfig?.sendgridConfigured ? (
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  Live Active
                </span>
              ) : (
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title="Add SENDGRID_API_KEY to .env for live relay">
                  Key Optional
                </span>
              )}
            </div>
            <p className="text-[10px] text-zinc-500">
              {emailConfig?.sendgridConfigured
                ? `Active sender: ${emailConfig.sendgridFromEmail || 'billing@frilensa.com'}`
                : 'Direct REST API relay for high-volume delivery. Provide SENDGRID_API_KEY in Settings / environment for instant live outbound delivery.'}
            </p>
          </div>

          {/* Firebase Trigger Email Extension */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-zinc-800">
                <Cloud className="w-3.5 h-3.5 text-amber-600" />
                <span>Firebase Trigger Email</span>
              </div>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Ready &bull; mail collection
              </span>
            </div>
            <p className="text-[10px] text-zinc-500">
              Queues documents directly in Firestore <code className="bg-zinc-200/60 px-1 py-0.5 rounded text-[9px]">mail</code> collection for the official Firebase Trigger Email extension (SMTP/SendGrid/Postmark).
            </p>
          </div>
        </div>

        {/* Live Test Sender */}
        <div className="pt-2 border-t border-zinc-100 space-y-2">
          <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
            Test Email Dispatch Pipeline
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 text-zinc-400">
                <Mail className="w-3.5 h-3.5" />
              </span>
              <input
                type="email"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                placeholder="Enter recipient email..."
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-2 pl-8.5 pr-3 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={handleSendTestEmail}
              disabled={isTestingEmail}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isTestingEmail
                  ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-xs'
              }`}
            >
              {isTestingEmail ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Test Email</span>
                </>
              )}
            </button>
          </div>

          {testEmailResult && (
            <div className={`p-2.5 rounded-lg text-[11px] flex items-center gap-2 ${
              testEmailResult.success
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {testEmailResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{testEmailResult.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* Logout button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onSignOut}
          className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all"
        >
          <LogOut className="w-4 h-4 text-zinc-500" /> Log Out of CRM Profile
        </button>
      </div>

      {/* Credits */}
      <p className="text-center text-[9px] text-zinc-400 font-medium">
        Vinaka vakalevu • Frilensa Version 2.8.0
      </p>

      {/* Brand Designer & Auto-Color Studio Modal */}
      {showBrandDesignerModal && (
        <BrandDesignerModal
          business={data.businesses.find(b => b.id === selectedBizId) || data.businesses[0]}
          onSave={(updatedBiz) => {
            const updatedBusinesses = data.businesses.map(b => b.id === updatedBiz.id ? updatedBiz : b);
            onUpdateData({
              ...data,
              businesses: updatedBusinesses
            });
            // Update local state
            if (updatedBiz.id === selectedBizId) {
              setBizColor(updatedBiz.colorTheme || '#0284c7');
              setBizLogoType(updatedBiz.logoType || 'symbol');
              setBizLogoSymbol(updatedBiz.logoSymbol || 'Sparkles');
              setBizLogoText(updatedBiz.logoText || '');
              setBizLogoUrl(updatedBiz.logoUrl || '');
              setBizBrandSlogan(updatedBiz.brandSlogan || '');
            }
            setShowBrandDesignerModal(false);
            triggerStatus(`Brand styling and logo color scheme updated for ${updatedBiz.name}!`, 'success');
          }}
          onClose={() => setShowBrandDesignerModal(false)}
        />
      )}

      {showPaywall && (
        <SubscriptionPaywallModal
          currentPlan={data.platformSettings?.activePlan || 'free'}
          onClose={() => setShowPaywall(false)}
          onUpgradePlan={(newPlan) => {
            onUpdateData({ ...data, platformSettings: { ...(data.platformSettings || {}), activePlan: newPlan } as any });
          }}
        />
      )}
    </div>
  );
}
