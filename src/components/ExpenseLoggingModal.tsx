import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, Upload, Sparkles, X, Plus, Check, DollarSign, Calendar, 
  Tag, CreditCard, Building, FileText, AlertCircle, RefreshCw, Eye, Trash2, FlipHorizontal,
  Globe, ArrowRightLeft, Coins, Calculator
} from 'lucide-react';
import { CRMData, Transaction, ExpenseRecord } from '../types';
import { SUPPORTED_CURRENCIES, getCurrencyConfig } from '../lib/currencies';
import DateInput from './DateInput';
import ExchangeRateCalculatorModal from './ExchangeRateCalculatorModal';

interface ExpenseLoggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CRMData;
  onSaveExpense: (expense: ExpenseRecord) => void;
  initialExpense?: ExpenseRecord | null;
  initialMode?: 'manual' | 'camera_ocr';
}

export default function ExpenseLoggingModal({
  isOpen,
  onClose,
  data,
  onSaveExpense,
  initialExpense,
  initialMode = 'manual'
}: ExpenseLoggingModalProps) {
  // Active business & currency configuration
  const activeBusiness = data.businesses.find(b => b.id === (initialExpense?.businessId || data.activeBusinessId)) || data.businesses[0];
  const baseCurrency = activeBusiness?.currency || data.userProfile.defaultCurrency || 'FJD';
  const workingCurrencies = activeBusiness?.workingCurrencies || ['FJD', 'AUD', 'USD', 'NZD', 'EUR'];
  const customExchangeRates = activeBusiness?.customExchangeRates || {};

  // Input mode: 'manual' or 'camera_ocr'
  const [activeMode, setActiveMode] = useState<'manual' | 'camera_ocr'>(initialMode);

  // Form fields
  const [date, setDate] = useState<string>(
    initialExpense?.date || new Date().toISOString().split('T')[0]
  );
  const [vendor, setVendor] = useState<string>(initialExpense?.vendor || '');
  const [description, setDescription] = useState<string>(initialExpense?.description || '');
  const [amount, setAmount] = useState<string>(
    initialExpense?.amount ? Math.abs(initialExpense.amount).toString() : ''
  );

  // Foreign Currency Conversion Calculator states
  const [isForeignCurrency, setIsForeignCurrency] = useState<boolean>(
    !!initialExpense?.originalCurrency && initialExpense.originalCurrency !== baseCurrency
  );
  const [expenseCurrency, setExpenseCurrency] = useState<string>(
    initialExpense?.originalCurrency || (workingCurrencies.find(c => c !== baseCurrency) || 'USD')
  );
  const [foreignAmount, setForeignAmount] = useState<string>(
    initialExpense?.originalAmount ? initialExpense.originalAmount.toString() : ''
  );
  const defaultFxRate = initialExpense?.exchangeRate 
    ?? customExchangeRates[initialExpense?.originalCurrency || (workingCurrencies.find(c => c !== baseCurrency) || 'USD')]
    ?? getCurrencyConfig(initialExpense?.originalCurrency || (workingCurrencies.find(c => c !== baseCurrency) || 'USD')).approxFjdMultiplier 
    ?? 1.0;
  const [fxExchangeRate, setFxExchangeRate] = useState<string>(defaultFxRate.toString());
  const [showFxCalculatorModal, setShowFxCalculatorModal] = useState<boolean>(false);

  const [category, setCategory] = useState<string>(
    initialExpense?.category || 'Office Supplies'
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(
    initialExpense?.paymentMethod || 'Vodafone M-PAiSA'
  );
  const [isVatClaimable, setIsVatClaimable] = useState<boolean>(
    initialExpense?.isVatClaimable !== false
  );
  const [isTaxDeductible, setIsTaxDeductible] = useState<boolean>(
    initialExpense?.isTaxDeductible !== false
  );
  const [receiptImage, setReceiptImage] = useState<string | null>(
    initialExpense?.receiptImage || null
  );
  const [receiptFileName, setReceiptFileName] = useState<string | null>(
    initialExpense?.receiptFileName || null
  );
  const [notes, setNotes] = useState<string>(initialExpense?.notes || '');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialExpense?.projectId || ''
  );

  // Live Camera & File upload states
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // OCR Processing
  const [isProcessingOcr, setIsProcessingOcr] = useState<boolean>(false);
  const [ocrSuccessMessage, setOcrSuccessMessage] = useState<string | null>(null);
  const [ocrErrorMessage, setOcrErrorMessage] = useState<string | null>(null);

  // AI Expense Categorization Suggestions
  const [isSuggestingCategory, setIsSuggestingCategory] = useState<boolean>(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    category: string;
    confidence: number;
    reason: string;
    isVatClaimable: boolean;
    isTaxDeductible: boolean;
    recommendedVatRate?: number;
    suggestedTags?: string[];
    alternativeCategories?: string[];
    isFallback?: boolean;
  } | null>(null);

  // Fiji Standard Categories
  const expenseCategories = [
    { name: 'Office Supplies', icon: '🏢', label: 'Office supplies & stationery' },
    { name: 'Internet & Utilities', icon: '🌐', label: 'Internet & mobile data' },
    { name: 'Software SaaS', icon: '💻', label: 'Software & cloud hosting' },
    { name: 'Travel & Transport', icon: '✈️', label: 'Travel, fuel, taxis & flights' },
    { name: 'Meals & Entertainment', icon: '☕', label: 'Meals & client hospitality' },
    { name: 'Electricity & Utilities', icon: '⚡', label: 'Electricity & water' },
    { name: 'Hardware & Equipment', icon: '🛠️', label: 'Hardware, computers & tools' },
    { name: 'Tax & Licensing', icon: '⚖️', label: 'Taxes, licences & legal' },
    { name: 'Subcontractors', icon: '👥', label: 'Subcontractors & freelancers' },
    { name: 'Marketing & Ads', icon: '📣', label: 'Marketing, ads & domains' },
    { name: 'Other Expense', icon: '📦', label: 'Other expenses' }
  ];

  // Common Fiji Vendors presets for rapid tap-to-fill
  const commonFijiVendors = [
    { name: 'Vodafone Fiji', cat: 'Internet & Utilities', pay: 'Vodafone M-PAiSA' },
    { name: 'Digicel Fiji', cat: 'Internet & Utilities', pay: 'Digicel MyCash' },
    { name: 'Telecom Fiji (TFL)', cat: 'Internet & Utilities', pay: 'BSP Fiji' },
    { name: 'EFL Suva (Energy Fiji)', cat: 'Electricity & Utilities', pay: 'Vodafone M-PAiSA' },
    { name: 'MH Supermarket', cat: 'Office Supplies', pay: 'Westpac Fiji' },
    { name: 'Post Fiji', cat: 'Office Supplies', pay: 'Cash' },
    { name: 'Courts Fiji', cat: 'Hardware & Equipment', pay: 'ANZ Fiji' },
    { name: 'TotalEnergies Fiji', cat: 'Travel & Transport', pay: 'Credit Card' },
    { name: 'AWS Cloud Services', cat: 'Software SaaS', pay: 'Credit Card' },
    { name: 'GitHub SaaS', cat: 'Software SaaS', pay: 'Credit Card' },
    { name: 'Fiji Airways', cat: 'Travel & Transport', pay: 'Westpac Fiji' }
  ];

  // Calculated Fiji VAT portion
  const currentVatRate = data.userProfile.defaultVatRate ?? 12.5;
  const numAmount = parseFloat(amount) || 0;
  const calculatedVat = isVatClaimable 
    ? Number((numAmount - (numAmount / (1 + currentVatRate / 100))).toFixed(2)) 
    : 0;

  // Initialize or reset form when modal opens or initialExpense changes
  useEffect(() => {
    if (isOpen) {
      if (initialExpense) {
        setDate(initialExpense.date);
        setVendor(initialExpense.vendor);
        setDescription(initialExpense.description);
        setAmount(Math.abs(initialExpense.amount).toString());
        setCategory(initialExpense.category);
        setPaymentMethod(initialExpense.paymentMethod || 'Vodafone M-PAiSA');
        setIsVatClaimable(initialExpense.isVatClaimable !== false);
        setIsTaxDeductible(initialExpense.isTaxDeductible !== false);
        setReceiptImage(initialExpense.receiptImage || null);
        setReceiptFileName(initialExpense.receiptFileName || null);
        setNotes(initialExpense.notes || '');
        setSelectedProjectId(initialExpense.projectId || '');
        setActiveMode('manual');
      } else {
        setDate(new Date().toISOString().split('T')[0]);
        setVendor('');
        setDescription('');
        setAmount('');
        setCategory('Office Supplies');
        setPaymentMethod('Vodafone M-PAiSA');
        setIsVatClaimable(true);
        setIsTaxDeductible(true);
        setReceiptImage(null);
        setReceiptFileName(null);
        setNotes('');
        setSelectedProjectId('');
        setActiveMode(initialMode);
      }
      setOcrSuccessMessage(null);
    }
  }, [isOpen, initialExpense, initialMode]);

  // Clean up camera stream on unmount or close
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('This browser can't use the camera. Upload a photo or PDF instead.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err.message || 'Couldn't open the camera. Check that this site is allowed to use it.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Compress image file to avoid huge payloads and speed up processing
  const compressImageFile = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawResult = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1280;
          let width = img.width;
          let height = img.height;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawResult);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => resolve(rawResult);
        img.src = rawResult;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const processIncomingFile = async (file: File) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    let dataUrl = '';

    if (isPdf) {
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    } else {
      dataUrl = await compressImageFile(file);
    }

    if (!dataUrl) return;

    setReceiptImage(dataUrl);
    setReceiptFileName(file.name);
    processReceiptOcr(dataUrl, file.name);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

    stopCamera();
    setReceiptImage(dataUrl);
    setReceiptFileName(`camera-receipt-${Date.now()}.jpg`);

    // Auto trigger AI OCR extraction
    processReceiptOcr(dataUrl, 'camera-capture.jpg');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processIncomingFile(file);
    e.target.value = '';
  };

  // Run Gemini OCR extraction with multi-model resiliency
  const processReceiptOcr = async (fileData: string, fileName: string) => {
    setIsProcessingOcr(true);
    setOcrSuccessMessage(null);
    setOcrErrorMessage(null);

    try {
      const res = await fetch('/api/bookkeeping/receipt-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData,
          fileName,
          vatRate: currentVatRate
        })
      });

      const dataRes = await res.json();
      if (!res.ok && !dataRes.extracted) {
        throw new Error(dataRes.error || `OCR failed with status ${res.status}`);
      }

      const ext = dataRes.extracted;
      if (ext) {
        // AI extraction mapping: vendor, amount, date
        if (ext.vendor && ext.vendor !== 'Scanned Merchant Invoice') {
          setVendor(ext.vendor);
        } else if (ext.description) {
          setVendor(ext.description);
        }

        if (ext.description) {
          setDescription(ext.description);
        } else if (ext.vendor) {
          setDescription(`${ext.vendor} expense`);
        }

        if (ext.amount !== undefined && ext.amount !== null && !isNaN(Number(ext.amount))) {
          const absAmt = Math.abs(Number(ext.amount));
          setAmount(absAmt % 1 === 0 ? absAmt.toString() : absAmt.toFixed(2));
        }

        if (ext.date) {
          setDate(ext.date);
        }

        if (ext.category) {
          setCategory(ext.category);
        }

        if (ext.bankName) {
          setPaymentMethod(ext.bankName);
        }

        const vendorDisplay = ext.vendor || ext.description || 'Receipt';
        const amountDisplay = ext.amount ? `FJD $${Math.abs(Number(ext.amount)).toFixed(2)}` : '';
        const dateDisplay = ext.date || '';

        setOcrSuccessMessage(
          `Read: ${vendorDisplay} ${amountDisplay ? `• ${amountDisplay}` : ''} ${dateDisplay ? `• ${dateDisplay}` : ''} (${ext.confidence || 90}% confidence)`
        );
      } else {
        throw new Error(dataRes.error || 'No details found in this file');
      }
    } catch (e: any) {
      console.warn('OCR parsing error:', e);
      setOcrErrorMessage(
        `Couldn't read this file (${e.message || 'service busy'}). It's still attached, so enter the vendor and amount below.`
      );
    } finally {
      setIsProcessingOcr(false);
    }
  };

  const handleSelectPresetVendor = (v: typeof commonFijiVendors[0]) => {
    setVendor(v.name);
    if (!description) setDescription(`${v.name} expense`);
    setCategory(v.cat);
    setPaymentMethod(v.pay);
  };

  const handleSuggestCategory = async (overrideDesc?: string) => {
    const descToUse = (overrideDesc !== undefined ? overrideDesc : description).trim() || vendor.trim();
    if (!descToUse) return;

    setIsSuggestingCategory(true);
    try {
      const selectedProject = data.projects.find(p => p.id === selectedProjectId);
      const res = await fetch('/api/bookkeeping/suggest-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: descToUse,
          vendor: vendor.trim(),
          projectName: selectedProject?.name || '',
          projectType: selectedProject?.industrySector || (selectedProject as any)?.serviceCategory || '',
          serviceType: (selectedProject as any)?.serviceCategory || '',
          amount: parseFloat(amount) || 0,
          businessType: data.userProfile.businessType || 'studio',
          vatRate: currentVatRate
        })
      });

      if (res.ok) {
        const result = await res.json();
        setAiSuggestion(result);
      }
    } catch (err) {
      console.warn('Failed to fetch AI category suggestion:', err);
    } finally {
      setIsSuggestingCategory(false);
    }
  };

  const applyAiCategorySuggestion = (chosenCategory?: string) => {
    if (!aiSuggestion && !chosenCategory) return;
    const catToApply = chosenCategory || aiSuggestion?.category;
    if (catToApply) {
      setCategory(catToApply);
      if (aiSuggestion) {
        setIsVatClaimable(aiSuggestion.isVatClaimable);
        setIsTaxDeductible(aiSuggestion.isTaxDeductible);
      }
    }
  };

  // Auto-trigger suggestion when description or project changes with a brief debounce
  useEffect(() => {
    const text = description.trim() || vendor.trim();
    if (text.length >= 3 && isOpen) {
      const timer = setTimeout(() => {
        handleSuggestCategory();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [description, vendor, selectedProjectId]);

  // Recompute converted ledger amount when foreign amount or FX rate changes
  useEffect(() => {
    if (isForeignCurrency) {
      const fa = parseFloat(foreignAmount);
      const rate = parseFloat(fxExchangeRate);
      if (!isNaN(fa) && fa > 0 && !isNaN(rate) && rate > 0) {
        setAmount((fa * rate).toFixed(2));
      }
    }
  }, [foreignAmount, fxExchangeRate, isForeignCurrency]);

  const handleSelectExpenseCurrency = (code: string) => {
    setExpenseCurrency(code);
    const rate = customExchangeRates[code] ?? getCurrencyConfig(code).approxFjdMultiplier ?? 1.0;
    setFxExchangeRate(rate.toString());
    const fa = parseFloat(foreignAmount);
    if (!isNaN(fa) && fa > 0) {
      setAmount((fa * rate).toFixed(2));
    }
  };

  const handleApplyExpenseWithFx = (params: {
    foreignCurrency: string;
    foreignAmount: number;
    exchangeRate: number;
    homeAmount: number;
    notes: string;
  }) => {
    setIsForeignCurrency(true);
    setExpenseCurrency(params.foreignCurrency);
    setForeignAmount(params.foreignAmount.toString());
    setFxExchangeRate(params.exchangeRate.toString());
    setAmount(params.homeAmount.toFixed(2));
    if (!notes) {
      setNotes(params.notes);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor.trim() || !amount || parseFloat(amount) <= 0) {
      alert('Enter a vendor and an amount above zero.');
      return;
    }

    const fa = parseFloat(foreignAmount);
    const fxRate = parseFloat(fxExchangeRate);

    const expenseRecord: ExpenseRecord = {
      id: initialExpense?.id || `exp-${Date.now()}`,
      date,
      vendor: vendor.trim(),
      description: description.trim() || `${vendor.trim()} business expense`,
      amount: Math.abs(parseFloat(amount)),
      category,
      paymentMethod,
      vatAmount: calculatedVat,
      isVatClaimable,
      isTaxDeductible,
      receiptImage: receiptImage || undefined,
      receiptFileName: receiptFileName || undefined,
      notes: notes.trim() || undefined,
      businessId: data.activeBusinessId,
      projectId: selectedProjectId || undefined,
      createdAt: initialExpense?.createdAt || new Date().toISOString(),
      // Multi-currency tracking
      currency: baseCurrency,
      originalCurrency: isForeignCurrency ? expenseCurrency : undefined,
      originalAmount: isForeignCurrency && !isNaN(fa) && fa > 0 ? fa : undefined,
      exchangeRate: isForeignCurrency && !isNaN(fxRate) && fxRate > 0 ? fxRate : undefined
    };

    onSaveExpense(expenseRecord);
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-lg max-h-[85vh] sm:max-h-[88vh] rounded-3xl border border-slate-200 shadow-2xl overflow-hidden my-auto text-slate-800 flex flex-col"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                {initialExpense ? 'Edit expense' : 'Add expense'}
              </h3>
              <p className="text-[10px] text-slate-400">
                Input VAT and tax deductions
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }} 
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="p-3 bg-slate-100/70 border-b border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveMode('manual');
              stopCamera();
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeMode === 'manual'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Enter details</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode('camera_ocr');
              if (!receiptImage && !isCameraActive) {
                startCamera();
              }
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeMode === 'camera_ocr'
                ? 'bg-white text-rose-600 shadow-xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Scan receipt</span>
          </button>
        </div>

        {/* Camera / OCR Scanner View */}
        {activeMode === 'camera_ocr' && (
          <div className="p-4 bg-slate-950 text-white space-y-3">
            {isCameraActive ? (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-4/3 flex items-center justify-center border border-slate-800 shadow-inner">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                  />
                  {/* Camera Grid Overlay */}
                  <div className="absolute inset-0 border border-white/20 pointer-events-none grid grid-cols-3 grid-rows-3">
                    <div className="border border-white/10" />
                    <div className="border border-white/10" />
                    <div className="border border-white/10" />
                    <div className="border border-white/10" />
                    <div className="border border-white/10" />
                    <div className="border border-white/10" />
                    <div className="border border-white/10" />
                    <div className="border border-white/10" />
                    <div className="border border-white/10" />
                  </div>
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    CAMERA
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    Flip camera
                  </button>

                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    Take photo
                  </button>

                  <button
                    type="button"
                    onClick={stopCamera}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : receiptImage ? (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 p-3">
                  {receiptFileName?.toLowerCase().endsWith('.pdf') || receiptImage.startsWith('data:application/pdf') ? (
                    <div className="flex items-center gap-3 py-2 px-1">
                      <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-bold text-white truncate">{receiptFileName || 'Receipt.pdf'}</p>
                        <p className="text-[10px] text-slate-400">PDF attached</p>
                      </div>
                      <a
                        href={receiptImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-400 hover:text-sky-300 bg-sky-950/60 border border-sky-800/80 px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-medium shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </a>
                    </div>
                  ) : (
                    <div className="max-h-48 flex items-center justify-center">
                      <img 
                        src={receiptImage} 
                        alt="Receipt" 
                        className="max-h-44 rounded-xl object-contain"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setReceiptImage(null);
                      setReceiptFileName(null);
                      setOcrSuccessMessage(null);
                      setOcrErrorMessage(null);
                    }}
                    className="absolute top-3 right-3 bg-rose-600 hover:bg-rose-500 text-white p-1.5 rounded-lg shadow-md cursor-pointer"
                    title="Remove receipt"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Replace file
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (receiptImage && receiptFileName) {
                        processReceiptOcr(receiptImage, receiptFileName);
                      }
                    }}
                    disabled={isProcessingOcr}
                    className="bg-sky-600/80 hover:bg-sky-500 text-white py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Read the receipt again"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isProcessingOcr ? 'animate-spin' : ''}`} />
                    Read again
                  </button>
                </div>
              </div>
            ) : (
              <div 
                className={`space-y-3 text-center py-4 px-3 rounded-2xl border-2 border-dashed transition-all ${
                  isDraggingFile 
                    ? 'border-sky-500 bg-sky-950/20' 
                    : 'border-slate-800 hover:border-slate-700'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) processIncomingFile(file);
                }}
              >
                {cameraError && (
                  <div className="bg-rose-950/80 border border-rose-800 text-rose-300 p-3 rounded-xl text-xs text-left">
                    <p className="font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Camera unavailable
                    </p>
                    <p className="text-[10px] mt-1">{cameraError}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      // On mobile browsers, native camera shutter provides highest resolution
                      if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
                        cameraInputRef.current?.click();
                      } else {
                        startCamera();
                      }
                    }}
                    className="bg-rose-600 hover:bg-rose-500 text-white p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <Camera className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-black">Take photo</span>
                    <span className="text-[9px] text-rose-100">Photograph a paper receipt</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-slate-800 hover:bg-slate-700 text-white p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-sky-400" />
                    </div>
                    <span className="text-xs font-black">Upload file</span>
                    <span className="text-[9px] text-slate-400">PDF, PNG, JPG or screenshot</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Or drop a file here</p>
              </div>
            )}

            {/* Hidden file input for documents, PDFs, screenshots, and photos */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*,application/pdf,.pdf" 
              onChange={handleFileUpload} 
              className="hidden" 
            />

            {/* Hidden native input with capture="environment" specifically for mobile camera */}
            <input 
              ref={cameraInputRef}
              type="file" 
              accept="image/*" 
              capture="environment"
              onChange={handleFileUpload} 
              className="hidden" 
            />

            {/* OCR Progress Notice */}
            {isProcessingOcr && (
              <div className="bg-sky-950/80 border border-sky-800 p-2.5 rounded-xl flex items-center gap-2 text-sky-300 text-xs">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                <span>Reading the receipt…</span>
              </div>
            )}

            {ocrSuccessMessage && !isProcessingOcr && (
              <div className="bg-emerald-950/80 border border-emerald-800 p-2.5 rounded-xl flex items-center gap-2 text-emerald-300 text-xs text-left">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{ocrSuccessMessage}</span>
              </div>
            )}

            {ocrErrorMessage && !isProcessingOcr && (
              <div className="bg-amber-950/80 border border-amber-800 p-2.5 rounded-xl flex items-center gap-2 text-amber-300 text-xs text-left">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{ocrErrorMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Expense Form */}
        <form id="expense-form" onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto text-left">
          
          {/* Quick Fiji Merchant Presets */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                Common vendors
              </label>
              <span className="text-[9px] text-slate-400">Tap to fill in</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {commonFijiVendors.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => handleSelectPresetVendor(v)}
                  className={`text-[9.5px] px-2.5 py-1 rounded-lg border font-semibold shrink-0 transition-all cursor-pointer ${
                    vendor === v.name 
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs' 
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>

          {/* Vendor & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-500 block">
                Vendor <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Vodafone Fiji, MH Supermarket, AWS"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
              />
            </div>

            <DateInput
              label="Date"
              required
              value={date}
              onChange={setDate}
              placeholder="Select date"
              inputClassName="bg-white"
              customPresets={[
                { label: 'Today', special: 'today' },
                { label: 'Yesterday', daysOffset: -1 },
                { label: '7 days ago', daysOffset: -7 },
              ]}
            />
          </div>

          {/* Currency Conversion Calculator & Amount Header */}
          <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">
                  Currency
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsForeignCurrency(!isForeignCurrency)}
                  className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                    isForeignCurrency
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                      : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  <span>{isForeignCurrency ? 'Foreign currency' : 'Paid in another currency?'}</span>
                </button>

                {isForeignCurrency && (
                  <button
                    type="button"
                    onClick={() => setShowFxCalculatorModal(true)}
                    className="text-[9px] font-bold text-slate-600 hover:text-sky-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 cursor-pointer"
                    title="Open exchange rate calculator"
                  >
                    <Calculator className="w-2.5 h-2.5" /> Calculator
                  </button>
                )}
              </div>
            </div>

            {/* Foreign Currency Conversion Sub-Panel */}
            {isForeignCurrency && (
              <div className="bg-sky-50/70 rounded-xl p-2.5 border border-sky-200 space-y-2 text-xs">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="font-bold text-sky-900 uppercase tracking-wide flex items-center gap-1">
                    <ArrowRightLeft className="w-3 h-3 text-sky-600" />
                    Currency conversion
                  </span>
                  <span className="text-sky-700 font-mono">
                    Converts to {baseCurrency}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Foreign Currency Picker */}
                  <div>
                    <label className="text-[8.5px] font-black uppercase text-slate-500 block mb-0.5">
                      Paid in
                    </label>
                    <select
                      value={expenseCurrency}
                      onChange={(e) => handleSelectExpenseCurrency(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      {workingCurrencies.length > 0 && (
                        <optgroup label="Your currencies">
                          {workingCurrencies.filter(c => c !== baseCurrency).map(code => {
                            const cfg = getCurrencyConfig(code);
                            const custom = customExchangeRates[code];
                            return (
                              <option key={`biz-${code}`} value={code}>
                                {cfg.flag} {code} {custom ? `(your rate: ${custom})` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      <optgroup label="All currencies">
                        {SUPPORTED_CURRENCIES.filter(c => c.code !== baseCurrency).map(c => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.code} &mdash; {c.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Foreign Amount Paid */}
                  <div>
                    <label className="text-[8.5px] font-black uppercase text-slate-500 block mb-0.5">
                      Amount paid ({getCurrencyConfig(expenseCurrency).symbol || '$'})
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-xs font-mono font-bold text-slate-400">
                        {getCurrencyConfig(expenseCurrency).symbol || '$'}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="e.g. 150.00"
                        value={foreignAmount}
                        onChange={(e) => setForeignAmount(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg pl-6 pr-2 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* Exchange Rate */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[8.5px] font-black uppercase text-slate-500 block">
                        Rate (1 {expenseCurrency} = X {baseCurrency})
                      </label>
                    </div>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={fxExchangeRate}
                      onChange={(e) => setFxExchangeRate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Quick Switcher Chips from Venture Currencies */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[8.5px] font-bold text-slate-400 uppercase mr-0.5">Currencies:</span>
                  {(workingCurrencies.filter(c => c !== baseCurrency).length > 0
                    ? workingCurrencies.filter(c => c !== baseCurrency)
                    : ['USD', 'AUD', 'NZD', 'EUR', 'GBP']
                  ).map(code => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleSelectExpenseCurrency(code)}
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold transition-all cursor-pointer ${
                        expenseCurrency === code
                          ? 'bg-sky-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:bg-sky-100 border border-slate-200'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>

                {/* Conversion Summary Callout */}
                {foreignAmount && parseFloat(foreignAmount) > 0 && (
                  <div className="bg-white/90 p-2 rounded-lg border border-sky-200/80 flex items-center justify-between text-[10px]">
                    <span className="text-slate-600">
                      Converted: <strong className="font-mono text-slate-900">{getCurrencyConfig(expenseCurrency).symbol}{parseFloat(foreignAmount).toFixed(2)} {expenseCurrency}</strong> × <span className="font-mono">{parseFloat(fxExchangeRate || '1').toFixed(4)}</span>
                    </span>
                    <span className="font-mono font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      = {baseCurrency} ${amount || '0.00'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Amount and Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-500 block">
                Amount ({baseCurrency}) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-mono font-bold text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (isForeignCurrency) {
                      const amt = parseFloat(e.target.value);
                      const rate = parseFloat(fxExchangeRate);
                      if (!isNaN(amt) && !isNaN(rate) && rate > 0) {
                        setForeignAmount((amt / rate).toFixed(2));
                      }
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-black text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>
              {isForeignCurrency && (
                <span className="text-[8.5px] text-slate-400 block">
                  Converted from {expenseCurrency}.
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-black uppercase text-slate-500 block">
                  Category <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleSuggestCategory()}
                  disabled={isSuggestingCategory || (!description.trim() && !vendor.trim())}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2 py-0.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className={`w-3 h-3 ${isSuggestingCategory ? 'animate-spin' : ''}`} />
                  {isSuggestingCategory ? 'Thinking…' : 'Suggest'}
                </button>
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-900 cursor-pointer"
              >
                {expenseCategories.map(cat => (
                  <option key={cat.name} value={cat.name}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-slate-500 block">
              Description
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. Camera hire for reef shoot, or Figma seat"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-900"
              />
              {isSuggestingCategory && (
                <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[10px] font-bold text-amber-600 animate-pulse">
                  <Sparkles className="w-3 h-3 animate-spin" />
                  <span>Thinking…</span>
                </div>
              )}
            </div>
          </div>

          {/* AI Category Suggestion Recommendation Banner */}
          {aiSuggestion && (
            <div className="p-3 bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-slate-50 border border-amber-200/80 rounded-xl space-y-2 animate-fade-in">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-300 text-amber-700 flex items-center justify-center text-xs">
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-slate-900">
                        Suggested: <span className="text-amber-700">{aiSuggestion.category}</span>
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        {aiSuggestion.confidence}% match
                      </span>
                      {aiSuggestion.isFallback && (
                        <span className="text-[9px] font-semibold text-slate-500">
                          (rule-based)
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                      {aiSuggestion.reason}
                    </p>
                  </div>
                </div>

                {category !== aiSuggestion.category ? (
                  <button
                    type="button"
                    onClick={() => applyAiCategorySuggestion()}
                    className="shrink-0 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg shadow-xs transition-colors"
                  >
                    Use this
                  </button>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                    <Check className="w-3 h-3" /> Selected
                  </span>
                )}
              </div>

              {/* Tags and Alternatives */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-amber-200/40 text-[10px]">
                {aiSuggestion.suggestedTags && aiSuggestion.suggestedTags.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Tags:</span>
                    {aiSuggestion.suggestedTags.map(tag => (
                      <span key={tag} className="bg-white/80 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 text-[9px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {aiSuggestion.alternativeCategories && aiSuggestion.alternativeCategories.length > 0 && (
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Or:</span>
                    {aiSuggestion.alternativeCategories.map(alt => (
                      <button
                        key={alt}
                        type="button"
                        onClick={() => applyAiCategorySuggestion(alt)}
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded border transition-colors ${
                          category === alt 
                            ? 'bg-slate-900 text-white border-slate-900' 
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Method & Project Allocation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-500 block">
                Payment method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
              >
                <option value="Vodafone M-PAiSA">Vodafone M-PAiSA</option>
                <option value="Digicel MyCash">Digicel MyCash</option>
                <option value="Cash">Cash</option>
                <option value="BSP Fiji">BSP Fiji</option>
                <option value="ANZ Fiji">ANZ Fiji</option>
                <option value="Westpac Fiji">Westpac Fiji</option>
                <option value="HFC Bank">HFC Bank</option>
                <option value="Credit Card">Credit or debit card</option>
                <option value="Bank Transfer">Bank transfer</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-500 block">
                Project (optional)
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
              >
                <option value="">No project</option>
                {(data.projects || []).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fiji Tax Compliance & VAT Input Claims Box */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] font-black uppercase text-slate-700 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-sky-600" />
                VAT and income tax
              </span>
              <span className="text-[9px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                {currentVatRate}% VAT
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  checked={isVatClaimable}
                  onChange={(e) => setIsVatClaimable(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-800 text-[11px] block">Claim input VAT</span>
                  <span className="text-[9px] text-slate-500 block">
                    VAT to claim: <strong className="font-mono text-emerald-600">${calculatedVat.toFixed(2)}</strong>
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  checked={isTaxDeductible}
                  onChange={(e) => setIsTaxDeductible(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-800 text-[11px] block">Tax deductible</span>
                  <span className="text-[9px] text-slate-500 block">
                    Reduces your taxable income
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Receipt Attachment Thumbnail (if attached) */}
          {receiptImage && activeMode === 'manual' && (
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 overflow-hidden">
                <img 
                  src={receiptImage} 
                  alt="Receipt thumbnail" 
                  className="w-10 h-10 object-cover rounded-lg border border-slate-300 shrink-0" 
                />
                <div className="truncate">
                  <span className="text-xs font-bold text-slate-800 block truncate">
                    {receiptFileName || 'Receipt'}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-bold block">
                    ✓ Receipt attached
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReceiptImage(null);
                  setReceiptFileName(null);
                }}
                className="text-rose-600 hover:text-rose-700 text-xs font-bold px-2 py-1 cursor-pointer"
              >
                Remove
              </button>
            </div>
          )}

          {/* Additional Notes */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-slate-500 block">
              Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Receipt #MP-98402, client meeting with Kalesi"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-900 resize-none"
            />
          </div>
        </form>

        {/* Fixed Action Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 shrink-0 flex gap-2 z-10">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="flex-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="expense-form"
            className="flex-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white py-2.5 rounded-xl text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{initialExpense ? 'Save changes' : 'Save expense'}</span>
          </button>
        </div>
      </motion.div>

      {/* Foreign Exchange Rate Calculator Modal */}
      <ExchangeRateCalculatorModal
        isOpen={showFxCalculatorModal}
        onClose={() => setShowFxCalculatorModal(false)}
        homeCurrency={baseCurrency}
        defaultTargetCurrency={expenseCurrency !== baseCurrency ? expenseCurrency : (workingCurrencies.find(c => c !== baseCurrency) || 'USD')}
        defaultAmount={parseFloat(foreignAmount) > 0 ? parseFloat(foreignAmount) : 100}
        workingCurrencies={workingCurrencies}
        customExchangeRates={customExchangeRates}
        data={data}
        mode="expense"
        onApplyExpenseWithFx={handleApplyExpenseWithFx}
      />
    </div>
  );
}
