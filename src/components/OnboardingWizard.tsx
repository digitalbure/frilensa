import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, User, ShieldCheck, Wallet, Percent, Sparkles, CheckCircle2, 
  ArrowRight, ArrowLeft, Plus, Trash2, Smartphone, Landmark, Check, 
  Waves, Briefcase, MapPin, DollarSign, Mail, Phone, FileText, Globe,
  KeyRound, Send, RefreshCw, Lock, AlertCircle, Award, CheckSquare
} from 'lucide-react';
import { CRMData, Business, ProductService, Client, UserProfile } from '../types';
import { INDUSTRY_PRESETS, getIndustryPreset } from '../lib/industryPresets';

interface OnboardingWizardProps {
  initialData: CRMData;
  onCompleteOnboarding: (updatedData: CRMData) => void;
  onSignOut?: () => void;
}

const FIJI_CITIES = [
  'Suva, Viti Levu',
  'Nadi, Viti Levu',
  'Lautoka, Viti Levu',
  'Nausori, Viti Levu',
  'Labasa, Vanua Levu',
  'Savusavu, Vanua Levu',
  'Sigatoka, Coral Coast',
  'Pacific Harbour, Deuba',
  'Ba Town, Western Division',
  'Taveuni Island',
  'Levuka, Ovalau'
];

const INDUSTRY_OPTIONS = [
  'Film, Video, Audio & AV Production',
  'Web, Software & Digital Technology',
  'Legal, Medical & Professional Advisory',
  'Automotive Services, Mechanics & Fleet',
  'Construction, Trades, Electrical & Plumbing',
  'Creative Design, Photography & Events',
  'General Freelance & Business Consulting'
];

const FIJI_BANKS = [
  'Westpac Bank Fiji',
  'BSP (Bank South Pacific) Fiji',
  'ANZ Bank Fiji',
  'BRED Bank (Fiji) Ltd',
  'HFC Bank Fiji',
  'Bank of Baroda Fiji'
];

const COLOR_THEMES = [
  { name: 'Sky Blue', hex: '#0284c7' },
  { name: 'Emerald Coral', hex: '#059669' },
  { name: 'Pacific Indigo', hex: '#4f46e5' },
  { name: 'Sunset Amber', hex: '#d97706' },
  { name: 'Tropical Teal', hex: '#0d9488' },
  { name: 'Royal Violet', hex: '#7c3aed' },
  { name: 'Graphite', hex: '#334155' }
];

export default function OnboardingWizard({ initialData, onCompleteOnboarding, onSignOut }: OnboardingWizardProps) {
  // Step 1: Account Type ('free' or 'business')
  const [accountType, setAccountType] = useState<'free' | 'business'>('free');
  const [step, setStep] = useState<number>(1);

  // Common Profile Fields
  const [fullName, setFullName] = useState(initialData.userProfile.name || '');
  const [email, setEmail] = useState(initialData.userProfile.email || '');
  const [phone, setPhone] = useState(initialData.userProfile.phone || '');
  const [city, setCity] = useState(FIJI_CITIES[0]);
  const [industry, setIndustry] = useState(INDUSTRY_OPTIONS[0]);
  const [defaultCurrency, setDefaultCurrency] = useState(initialData.userProfile.defaultCurrency || 'FJD');

  // Free User Specific Fields
  const [freelanceBio, setFreelanceBio] = useState('Independent consultant specializing in modern digital services');
  const [hourlyRate, setHourlyRate] = useState<number>(65);

  // Business Specific Fields
  const [businessName, setBusinessName] = useState('Seniloli Creative Studio');
  const [businessTin, setBusinessTin] = useState(initialData.userProfile.tin || '99-12345-0-0');
  const [vatRate, setVatRate] = useState<number>(12.5);
  const [isVatRegistered, setIsVatRegistered] = useState(true);
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [quotePrefix, setQuotePrefix] = useState('QT');
  const [brandColor, setBrandColor] = useState('#0284c7');
  const [brandSlogan, setBrandSlogan] = useState('Premium Professional Services in Fiji & Pacific');

  // Commercial / Payment Details
  const [mPaisaId, setMPaisaId] = useState(phone || '+679 991 2345');
  const [myCashId, setMyCashId] = useState('');
  const [selectedBank, setSelectedBank] = useState(FIJI_BANKS[0]);
  const [bankAccount, setBankAccount] = useState('');
  const [bankBranch, setBankBranch] = useState('Suva Main Branch');

  // Phone OTP Verification
  const [isPhoneVerified, setIsPhoneVerified] = useState<boolean>(true);
  const [otpDigits, setOtpDigits] = useState<string[]>(['8', '8', '4', '2', '1', '9']);
  const [generatedOtp, setGeneratedOtp] = useState<string>('884219');
  const [resendCooldown, setResendCooldown] = useState<number>(30);
  const [canResend, setCanResend] = useState<boolean>(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Services list
  const [servicesList, setServicesList] = useState<Array<{ name: string; rate: number; unit: string; description: string }>>([
    { name: 'Director of Photography (DP) Day Rate', rate: 750, unit: 'Shoot Day', description: 'Includes 4K Cinema Camera & Prime Lens Kit' },
    { name: 'Sound Recordist & Wireless Lavalier Audio', rate: 450, unit: 'Shoot Day', description: 'Multi-channel field audio recording with wireless lavs' },
    { name: '4K Commercial Edit & Color Grade', rate: 65, unit: 'Hour', description: 'Post-production assembly, audio sweetening & color grading' }
  ]);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceRate, setNewServiceRate] = useState<number>(85);
  const [newServiceUnit, setNewServiceUnit] = useState('Hour');

  const handleIndustryChange = (newIndustry: string) => {
    setIndustry(newIndustry);
    const matchedPreset = INDUSTRY_PRESETS.find(p => p.name === newIndustry) || INDUSTRY_PRESETS[0];
    if (matchedPreset && matchedPreset.sampleServices.length > 0) {
      setServicesList(matchedPreset.sampleServices.slice(0, 4).map(s => ({
        name: s.name,
        rate: s.rate,
        unit: s.unit,
        description: s.description
      })));
      if (matchedPreset.defaultUnits.length > 0) {
        setNewServiceUnit(matchedPreset.defaultUnits[0]);
      }
    }
  };

  // Optional First Client
  const [hasClient, setHasClient] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // UI Error
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Calculate total steps based on account type
  const totalSteps = accountType === 'free' ? 4 : 6;

  // OTP Timer countdown
  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setTimeout(() => {
        setResendCooldown(prev => prev - 1);
      }, 1000);
    } else {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSendOtp = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(code);
    setResendCooldown(30);
    setCanResend(false);
    setOtpNotice(`SMS verification code sent to ${phone || 'your phone'}`);
    setOtpError(null);
  };

  const handleOtpChange = (index: number, value: string) => {
    const cleanVal = value.replace(/\D/g, '');
    if (cleanVal.length > 1) {
      const pasted = cleanVal.slice(0, 6).split('');
      const newDigits = [...otpDigits];
      pasted.forEach((char, i) => {
        if (i < 6) newDigits[i] = char;
      });
      setOtpDigits(newDigits);
      const nextIdx = Math.min(pasted.length, 5);
      otpInputRefs.current[nextIdx]?.focus();
      return;
    }

    const newDigits = [...otpDigits];
    newDigits[index] = cleanVal;
    setOtpDigits(newDigits);
    setOtpError(null);

    if (cleanVal && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleVerifyOtp = () => {
    const entered = otpDigits.join('');
    if (entered.length < 6) {
      setOtpError('Please enter all 6 digits of the SMS code.');
      return;
    }

    if (entered === generatedOtp || entered === '884219' || entered === '123456') {
      setIsPhoneVerified(true);
      setOtpError(null);
      setOtpNotice('✓ Phone number verified successfully!');
      setTimeout(() => {
        setStep(prev => prev + 1);
      }, 500);
    } else {
      setOtpError('Invalid passcode. Use the test simulation code displayed or click Auto-fill.');
    }
  };

  const handleAutoFillOtp = () => {
    const digits = generatedOtp.split('');
    setOtpDigits(digits);
    setOtpError(null);
    setIsPhoneVerified(true);
    setOtpNotice('✓ Passcode auto-filled and verified!');
  };

  // Validation
  const validateCurrentStep = (): string | null => {
    if (step === 1) {
      if (!accountType) return 'Please select whether to continue as a Free User or Business.';
    }

    if (accountType === 'free') {
      if (step === 2) {
        if (!fullName.trim()) return 'Please enter your name.';
        if (!email.trim() || !email.includes('@')) return 'Please enter a valid email address.';
      }
    } else {
      // Business path
      if (step === 2) {
        if (!businessName.trim()) return 'Please enter your business or company name.';
        if (!businessTin.trim()) return 'Please enter your Fiji FRCS Tax Identification Number (TIN).';
        if (!fullName.trim()) return 'Please enter the principal owner / contact name.';
      }
      if (step === 3 && !isPhoneVerified) {
        return 'Please complete SMS verification or click Skip to proceed.';
      }
    }
    return null;
  };

  const handleNext = () => {
    setErrorMsg(null);
    const err = validateCurrentStep();
    if (err) {
      setErrorMsg(err);
      return;
    }
    setStep(prev => Math.min(prev + 1, totalSteps));
  };

  const handlePrev = () => {
    setErrorMsg(null);
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) return;
    setServicesList(prev => [
      ...prev,
      {
        name: newServiceName.trim(),
        rate: Number(newServiceRate) || 50,
        unit: newServiceUnit,
        description: 'Standard client service'
      }
    ]);
    setNewServiceName('');
    setNewServiceRate(85);
  };

  const handleRemoveService = (index: number) => {
    setServicesList(prev => prev.filter((_, i) => i !== index));
  };

  const handleFinalizeOnboarding = async () => {
    const businessId = `biz-${Date.now()}`;
    const activeBizName = accountType === 'business' ? businessName.trim() : fullName.trim();
    const activeTin = accountType === 'business' ? businessTin.trim() : (businessTin.trim() || '99-12345-0-0');

    // Primary Business record
    const primaryBusiness: Business = {
      id: businessId,
      name: activeBizName,
      tin: activeTin,
      address: `${city}, Fiji Islands`,
      email: email.trim(),
      phone: phone.trim() || '+679 991 2345',
      bankDetails: bankAccount ? `${selectedBank}\nAccount: ${bankAccount}\nBranch: ${bankBranch}` : undefined,
      colorTheme: brandColor,
      brandSlogan: accountType === 'business' ? (brandSlogan.trim() || undefined) : freelanceBio,
      logoType: 'text',
      logoText: activeBizName.substring(0, 3).toUpperCase(),
      headerStyle: 'modern',
      type: 'studio',
      docNumberMode: 'auto',
      invoicePrefix: invoicePrefix.trim() || 'INV',
      invoiceStartNumber: 1001,
      quotePrefix: quotePrefix.trim() || 'QT',
      quoteStartNumber: 1001,
      receiptPrefix: 'REC',
      receiptStartNumber: 1001,
      isPrimary: true,
      category: industry,
      mPaisaId: mPaisaId.trim() || undefined,
      myCashId: myCashId.trim() || undefined
    };

    // Services
    const initialServices: ProductService[] = servicesList.map((s, idx) => ({
      id: `srv-${Date.now()}-${idx}`,
      name: s.name,
      description: s.description,
      rate: s.rate,
      unit: s.unit,
      type: 'service',
      billingInterval: s.unit === 'Month' ? 'monthly' : 'one-time',
      businessId: businessId
    }));

    // First Client if created
    const initialClients: Client[] = [];
    if (hasClient && clientName.trim()) {
      initialClients.push({
        id: `cli-${Date.now()}`,
        name: clientName.trim(),
        email: clientEmail.trim() || 'billing@client.com.fj',
        phone: clientPhone.trim() || '+679 330 0000',
        address: `${city}, Fiji`,
      });
    }

    // User Profile
    const updatedUserProfile: UserProfile = {
      name: fullName.trim(),
      email: email.trim(),
      tin: activeTin,
      defaultCurrency: defaultCurrency,
      defaultVatRate: (accountType === 'business' && isVatRegistered) ? Number(vatRate) : 0,
      enableTax: accountType === 'business' ? isVatRegistered : false,
      phone: phone.trim(),
      phoneVerified: isPhoneVerified,
      city: city,
      industry: industry,
      accountType: accountType,
      onboardingCompleted: true
    };

    const updatedData: CRMData = {
      ...initialData,
      activeBusinessId: businessId,
      onboardingCompleted: true,
      userProfile: updatedUserProfile,
      businesses: [primaryBusiness],
      services: initialServices,
      clients: initialClients.length > 0 ? [...initialData.clients, ...initialClients] : initialData.clients,
    };

    onCompleteOnboarding(updatedData);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)'
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto"
      >
        {/* Top Header & Progress */}
        <div className="bg-slate-900 text-white px-6 py-5 shrink-0 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
                <Waves className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold tracking-tight">Frilensa Onboarding</h2>
                <p className="text-xs text-slate-400">
                  {accountType === 'free' ? 'Free Solo Freelancer Setup' : 'Registered Business & VAT Setup'}
                </p>
              </div>
            </div>

            {/* Step Counter Badge & Log Out Option */}
            <div className="flex items-center gap-2">
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="text-[11px] text-slate-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-slate-800 transition-colors font-medium cursor-pointer"
                  title="Switch to sign in / sign up landing page"
                >
                  Sign Out
                </button>
              )}
              <div className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700 text-xs font-bold text-slate-300">
                Step {step} of {totalSteps}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-sky-400 to-teal-400 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          
          {/* ========================================================================= */}
          {/* STEP 1: CHOOSE ACCOUNT TYPE (FREE USER vs BUSINESS)                      */}
          {/* ========================================================================= */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center max-w-md mx-auto">
                <h3 className="text-lg font-black text-slate-900">How will you be using Frilensa?</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Choose the profile that matches your work. You can always upgrade or modify your settings later.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                
                {/* OPTION A: FREE USER / SOLO FREELANCER */}
                <div 
                  onClick={() => setAccountType('free')}
                  className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                    accountType === 'free' 
                      ? 'border-sky-600 bg-sky-50/50 shadow-md shadow-sky-600/10' 
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  {accountType === 'free' && (
                    <span className="absolute top-4 right-4 bg-sky-600 text-white rounded-full p-1 shadow-xs">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                  
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center mb-3">
                      <User className="w-6 h-6" />
                    </div>
                    
                    <span className="text-[10px] font-extrabold uppercase tracking-wider bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full inline-block mb-1.5">
                      Solo & Freelancer
                    </span>
                    
                    <h4 className="text-base font-black text-slate-900">Continue as Free User</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      For independent contractors, solopreneurs, digital nomads, and casual consultants.
                    </p>

                    <div className="mt-4 space-y-2 text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Instant 1-minute setup (No TIN required)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Simple invoices, quotes & receipts</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Personal M-PAiSA / MyCash payouts</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Direct client link sharing</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100/80">
                    <span className="text-xs font-bold text-sky-700">100% Free Forever • Zero Friction</span>
                  </div>
                </div>

                {/* OPTION B: REGISTERED BUSINESS / STUDIO */}
                <div 
                  onClick={() => setAccountType('business')}
                  className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                    accountType === 'business' 
                      ? 'border-teal-600 bg-teal-50/50 shadow-md shadow-teal-600/10' 
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  {accountType === 'business' && (
                    <span className="absolute top-4 right-4 bg-teal-600 text-white rounded-full p-1 shadow-xs">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}

                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center mb-3">
                      <Building2 className="w-6 h-6" />
                    </div>

                    <span className="text-[10px] font-extrabold uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full inline-block mb-1.5">
                      Business & Studio
                    </span>

                    <h4 className="text-base font-black text-slate-900">Continue as Business</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      For registered companies, studios, agencies, partnerships & enterprises in Fiji.
                    </p>

                    <div className="mt-4 space-y-2 text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>FRCS TIN & Digital VAT (9%, 12.5%, 15%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Custom company branding & logos</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Fiji Commercial Banks & Merchant IDs</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Custom INV / QT invoice numbering</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100/80">
                    <span className="text-xs font-bold text-teal-700">Full Business & Tax Compliance</span>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* FREE USER PATH: STEP 2 (PROFILE)                                          */}
          {/* ========================================================================= */}
          {accountType === 'free' && step === 2 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">Your Freelancer Profile</h3>
                <p className="text-xs text-slate-500 mt-0.5">Let clients know who you are and where you operate.</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Your Full Name / Trading Name *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Sera Seniloli"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Contact Email *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mobile Phone (for M-PAiSA payouts)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <Phone className="w-4 h-4" />
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setMPaisaId(e.target.value);
                    }}
                    placeholder="+679 991 2345"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Location in Fiji</label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  >
                    {FIJI_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Industry / Specialty</label>
                  <select
                    value={industry}
                    onChange={(e) => handleIndustryChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  >
                    {INDUSTRY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* FREE USER PATH: STEP 3 (PAYOUTS & RATES)                                   */}
          {/* ========================================================================= */}
          {accountType === 'free' && step === 3 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">Payout Preferences & Rates</h3>
                <p className="text-xs text-slate-500 mt-0.5">How your clients can pay you directly.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Default Currency</label>
                  <select
                    value={defaultCurrency}
                    onChange={(e) => setDefaultCurrency(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  >
                    <option value="FJD">🇫🇯 FJD - Fiji Dollar</option>
                    <option value="AUD">🇦🇺 AUD - Australian Dollar</option>
                    <option value="NZD">🇳🇿 NZD - New Zealand Dollar</option>
                    <option value="USD">🇺🇸 USD - US Dollar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Standard Hourly Rate ({defaultCurrency})</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                    <input
                      type="number"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-7 pr-3 text-xs font-mono font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vodafone M-PAiSA Mobile Wallet</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <Smartphone className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={mPaisaId}
                    onChange={(e) => setMPaisaId(e.target.value)}
                    placeholder="e.g. +679 991 2345"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Optional Personal Bank Account</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-xs"
                  >
                    {FIJI_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <input
                    type="text"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="Account Number (Optional)"
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* FREE USER PATH: STEP 4 (SUMMARY & LAUNCH)                                 */}
          {/* ========================================================================= */}
          {accountType === 'free' && step === 4 && (
            <div className="space-y-4 text-center py-2">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                <Sparkles className="w-8 h-8" />
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                  Free Account Ready
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">Welcome to Frilensa, {fullName}!</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Your solo freelancer workspace is ready. You can generate professional invoices, share client portal links with security PINs, and track payments instantly.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2 text-xs max-w-md mx-auto">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Freelancer Name:</span>
                  <span className="font-bold text-slate-800">{fullName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Contact Email:</span>
                  <span className="font-mono font-bold text-slate-800">{email}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Currency & Rate:</span>
                  <span className="font-bold text-slate-800">{defaultCurrency} ${hourlyRate}/hr</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">M-PAiSA Mobile:</span>
                  <span className="font-mono font-bold text-slate-800">{mPaisaId || phone}</span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* BUSINESS PATH: STEP 2 (BUSINESS IDENTITY & TIN)                           */}
          {/* ========================================================================= */}
          {accountType === 'business' && step === 2 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">Business Identity & FRCS Registration</h3>
                <p className="text-xs text-slate-500 mt-0.5">Enter your formal company information and Tax Identification Number.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Company / Studio Name *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400">
                      <Building2 className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Seniloli Creative Studio"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">FRCS Tax Identification Number (TIN) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400">
                      <ShieldCheck className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      value={businessTin}
                      onChange={(e) => setBusinessTin(e.target.value)}
                      placeholder="e.g. 99-12345-0-0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs font-mono font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Principal Owner / Director Name *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Sera Seniloli"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Registered City / Division</label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  >
                    {FIJI_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Industry Classification</label>
                  <select
                    value={industry}
                    onChange={(e) => handleIndustryChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  >
                    {INDUSTRY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* BUSINESS PATH: STEP 3 (PHONE & SECURITY VERIFICATION)                     */}
          {/* ========================================================================= */}
          {accountType === 'business' && step === 3 && (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center mx-auto mb-2">
                <Smartphone className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-base font-extrabold text-slate-900">SMS Verification Code</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  A verification passcode was sent to <span className="font-mono font-bold text-slate-800">{phone}</span>
                </p>
              </div>

              {otpNotice && (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-medium max-w-sm mx-auto">
                  {otpNotice}
                </div>
              )}

              {otpError && (
                <div className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-medium max-w-sm mx-auto">
                  {otpError}
                </div>
              )}

              <div className="flex justify-center gap-2 my-4">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (otpInputRefs.current[idx] = el)}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    className="w-10 h-12 text-center text-lg font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none"
                  />
                ))}
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleAutoFillOtp}
                  className="text-xs text-teal-700 bg-teal-50 border border-teal-200 font-bold px-3 py-1.5 rounded-xl hover:bg-teal-100 cursor-pointer"
                >
                  ⚡ Auto-Fill Code ({generatedOtp})
                </button>
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  className="text-xs text-white bg-slate-900 font-bold px-4 py-1.5 rounded-xl hover:bg-slate-800 cursor-pointer"
                >
                  Confirm Passcode
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* BUSINESS PATH: STEP 4 (COMMERCIAL PAYMENTS & BANKING)                     */}
          {/* ========================================================================= */}
          {accountType === 'business' && step === 4 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">Commercial Bank & Merchant Payouts</h3>
                <p className="text-xs text-slate-500 mt-0.5">Connect your Fiji commercial banking details and mobile merchant IDs.</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Select Fiji Commercial Bank</label>
                <select
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none"
                >
                  {FIJI_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="e.g. 9801234567"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Branch Name</label>
                  <input
                    type="text"
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    placeholder="e.g. Suva Main Branch"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vodafone M-PAiSA Merchant / Mobile</label>
                  <input
                    type="text"
                    value={mPaisaId}
                    onChange={(e) => setMPaisaId(e.target.value)}
                    placeholder="e.g. 991 2345"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Digicel MyCash ID (Optional)</label>
                  <input
                    type="text"
                    value={myCashId}
                    onChange={(e) => setMyCashId(e.target.value)}
                    placeholder="e.g. 712 3456"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* BUSINESS PATH: STEP 5 (VAT & INVOICING BRANDING)                          */}
          {/* ========================================================================= */}
          {accountType === 'business' && step === 5 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">VAT Compliance & Invoice Styling</h3>
                <p className="text-xs text-slate-500 mt-0.5">Configure FRCS VAT rates and custom document prefixes.</p>
              </div>

              {/* VAT Registration toggle */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900">VAT Registered Business</h4>
                  <p className="text-[11px] text-slate-500">Apply standard Fiji Value Added Tax to invoices</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVatRegistered(!isVatRegistered)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    isVatRegistered ? 'bg-teal-600' : 'bg-slate-300'
                  }`}
                >
                  <span className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    isVatRegistered ? 'left-6' : 'left-1'
                  }`} />
                </button>
              </div>

              {isVatRegistered && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Standard VAT Rate (%)</label>
                  <div className="flex gap-2">
                    {[12.5, 9, 15].map(rate => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setVatRate(rate)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          vatRate === rate 
                            ? 'bg-slate-900 text-white border-slate-900' 
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {rate}% {rate === 12.5 ? '(Fiji Standard)' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Invoice Prefix</label>
                  <input
                    type="text"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Quote Prefix</label>
                  <input
                    type="text"
                    value={quotePrefix}
                    onChange={(e) => setQuotePrefix(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Brand Theme Color</label>
                <div className="flex gap-2">
                  {COLOR_THEMES.map(theme => (
                    <button
                      key={theme.hex}
                      type="button"
                      onClick={() => setBrandColor(theme.hex)}
                      className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center cursor-pointer"
                      style={{ 
                        backgroundColor: theme.hex,
                        borderColor: brandColor === theme.hex ? '#0f172a' : 'transparent'
                      }}
                    >
                      {brandColor === theme.hex && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* BUSINESS PATH: STEP 6 (SERVICES & FIRST CLIENT)                           */}
          {/* ========================================================================= */}
          {accountType === 'business' && step === 6 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">Services Catalog & Client Setup</h3>
                <p className="text-xs text-slate-500 mt-0.5">Add your starting offerings and optionally your first client.</p>
              </div>

              {/* Service list */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Core Offerings</label>
                {servicesList.map((srv, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{srv.name}</span>
                      <span className="text-slate-400 ml-2 font-mono">{defaultCurrency} ${srv.rate}/{srv.unit}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveService(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add service inline */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  placeholder="New service title"
                  className="flex-1 bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs"
                />
                <input
                  type="number"
                  value={newServiceRate}
                  onChange={(e) => setNewServiceRate(Number(e.target.value))}
                  className="w-20 bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddService}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer"
                >
                  Add
                </button>
              </div>

              {/* Optional first client */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Add First Client (Optional)</span>
                  <input
                    type="checkbox"
                    checked={hasClient}
                    onChange={(e) => setHasClient(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                </div>

                {hasClient && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Client Company or Contact Name"
                      className="bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs"
                    />
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="client@domain.com"
                      className="bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
          {step > 1 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-slate-200/60 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <button
              type="button"
              onClick={handleNext}
              className="bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white text-xs font-extrabold px-5 py-2.5 rounded-xl shadow-md shadow-slate-900/10 flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalizeOnboarding}
              className="bg-gradient-to-r from-teal-600 to-sky-600 hover:opacity-95 active:scale-[0.98] text-white text-xs font-extrabold px-6 py-2.5 rounded-xl shadow-lg shadow-teal-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Launch {accountType === 'business' ? 'Business' : 'Freelancer'} Workspace</span>
            </button>
          )}
        </div>

      </motion.div>
    </div>
  );
}
