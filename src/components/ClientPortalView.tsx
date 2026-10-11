import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, CheckCircle2, Clock, CreditCard, ArrowUpRight, Phone, Mail, 
  MapPin, Building2, Sparkles, X, LogOut, Download, Check, AlertCircle,
  TrendingUp, Wallet, ArrowRightLeft, ShieldCheck, Waves, Briefcase, ChevronRight,
  Globe, Heart, QrCode, Info, Sliders, MessageSquare, Send, LifeBuoy,
  HelpCircle, MessageCircle, Inbox, Tag, AlertTriangle, Paperclip, RefreshCw,
  LayoutDashboard
} from 'lucide-react';
import { Business, SupportMessage, Project } from '../types';
import {
  PortalSession,
  fetchPortalData,
  acceptPortalQuote,
  reportPortalPayment,
  sendPortalMessage
} from '../lib/api';
import ClientOverviewView from './ClientOverviewView';
import { openPortalFile } from '../lib/files';

interface ClientPortalViewProps {
  session: PortalSession;
  onSignOut: () => void;
}

// Shown only until the consultant's real business details load; never contains payment details.
const LOADING_BUSINESS: Business = {
  id: '',
  name: 'Client portal',
  tin: '',
  address: '',
  email: '',
  phone: '',
  bankDetails: '',
  colorTheme: '#0284c7',
  type: 'studio',
  logoType: 'symbol',
  logoSymbol: 'Sparkles'
} as Business;

export default function ClientPortalView({ session, onSignOut }: ClientPortalViewProps) {
  const [portalTab, setPortalTab] = useState<'overview' | 'documents' | 'support'>('overview');
  const [documents, setDocuments] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'unpaid' | 'paid' | 'quotes'>('all');
  const [paymentTx, setPaymentTx] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('M-Paisa');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showVendorInfo, setShowVendorInfo] = useState(false);

  // Support & Consultant Messaging States
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportTab, setSupportTab] = useState<'history' | 'new_request'>('history');
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [sendingSupport, setSendingSupport] = useState(false);
  const [msgCategory, setMsgCategory] = useState<'general' | 'invoice_inquiry' | 'quote_question' | 'payment_proof' | 'urgent_support'>('general');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgText, setMsgText] = useState('');
  const [msgDocRef, setMsgDocRef] = useState('');
  const [chatInputText, setChatInputText] = useState('');

  const [clientProfile, setClientProfile] = useState<any | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);

  const clientAuth = useMemo(() => ({
    email: session.email,
    clientName: clientProfile?.name || session.clientName,
    clientId: clientProfile?.id || '',
    consultantId: ''
  }), [session, clientProfile]);

  const refresh = useCallback(async () => {
    setLoadingSupport(true);
    try {
      const data = await fetchPortalData(session);
      const docs = [...data.documents].sort((a, b) =>
        new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime());
      setDocuments(docs);
      setProjects(data.projects || []);
      setServices(data.services || []);
      setClientProfile(data.client);
      setBusinesses(data.business ? [data.business as Business] : []);
      setSupportMessages(data.messages || []);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message || 'Couldn’t load your portal. Refresh the page to try again.');
      if (/expired|revoked/i.test(err?.message || '')) onSignOut();
    } finally {
      setLoading(false);
      setLoadingSupport(false);
    }
  }, [session, onSignOut]);

  useEffect(() => { refresh(); }, [refresh]);

  const fetchDocuments = refresh;
  const fetchSupportMessages = refresh;

  const primaryBusiness: Business = useMemo(() => businesses[0] || LOADING_BUSINESS, [businesses]);

  const brandColor = primaryBusiness.colorTheme || '#0284c7';

  // Helper to trigger status messages
  const triggerStatus = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  // Accept Quote Handler
  const handleAcceptQuote = async (docId: string) => {
    try {
      await acceptPortalQuote(session, docId);
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'accepted' } : d));
      if (selectedDoc && selectedDoc.id === docId) {
        setSelectedDoc({ ...selectedDoc, status: 'accepted' });
      }
      triggerStatus('Quote accepted. Your consultant can see it now.', 'success');
    } catch (error: any) {
      triggerStatus(error?.message || 'Couldn’t accept the quote. Try again.', 'error');
    }
  };

  // Report a payment; the consultant confirms it before the invoice is marked paid.
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc) return;
    if (!paymentTx.trim()) {
      triggerStatus('Enter the payment reference.', 'error');
      return;
    }

    try {
      await reportPortalPayment(session, selectedDoc.id, { method: paymentMethod, reference: paymentTx.trim() });
      const report = { method: paymentMethod, reference: paymentTx.trim(), reportedAt: new Date().toISOString(), status: 'pending' as const };
      setDocuments(prev => prev.map(d => d.id === selectedDoc.id ? { ...d, clientPaymentReport: report } : d));
      setSelectedDoc((prev: any) => ({ ...prev, clientPaymentReport: report }));
      setShowPaymentModal(false);
      setPaymentTx('');
      triggerStatus('Payment reported. Your consultant will confirm it once received.', 'success');
    } catch (error: any) {
      triggerStatus(error?.message || 'Couldn’t report the payment. Try again.', 'error');
    }
  };

  // Submit New Support / Inquiry Request
  const handleSendSupportMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!msgText.trim()) return;

    setSendingSupport(true);
    try {
      const generatedSubject = msgSubject.trim() || (
        msgCategory === 'invoice_inquiry' ? `Question about ${msgDocRef || 'an invoice'}` :
        msgCategory === 'quote_question' ? `Question about ${msgDocRef || 'a quote'}` :
        msgCategory === 'payment_proof' ? `Payment details ${msgDocRef ? `(${msgDocRef})` : ''}` :
        msgCategory === 'urgent_support' ? `Urgent request` :
        `General question`
      );

      const saved = await sendPortalMessage(session, {
        subject: generatedSubject,
        message: msgText.trim(),
        category: msgCategory,
        documentRefId: msgDocRef || undefined
      });

      setSupportMessages(prev => [...prev, saved]);
      setMsgText('');
      setMsgSubject('');
      setMsgDocRef('');
      setSupportTab('history');
      triggerStatus('Your message was sent to your consultant.', 'success');
    } catch (err: any) {
      triggerStatus(err?.message || 'Couldn’t send your message. Try again.', 'error');
    } finally {
      setSendingSupport(false);
    }
  };

  // Handlers for Overview & Document interactions
  const handleInquireAboutProject = (project: Project) => {
    setMsgSubject(`Question about ${project.name}`);
    setMsgCategory('general');
    setMsgDocRef(`Project: ${project.name} (${project.id})`);
    setSupportTab('new_request');
    setPortalTab('support');
  };

  const handleInquireAboutDoc = (docItem: any) => {
    setSelectedDoc(null);
    setMsgSubject(`Question about ${docItem.type.toUpperCase()} #${docItem.documentNumber}`);
    setMsgCategory(docItem.type === 'quote' ? 'quote_question' : 'invoice_inquiry');
    setMsgDocRef(`${docItem.type.toUpperCase()} #${docItem.documentNumber}`);
    setSupportTab('new_request');
    setPortalTab('support');
  };

  const handlePayInvoice = (docItem: any) => {
    setSelectedDoc(docItem);
    setShowPaymentModal(true);
  };

  // Quick In-Chat Reply Handler
  const handleSendQuickChatReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInputText.trim()) return;

    setSendingSupport(true);
    try {
      const saved = await sendPortalMessage(session, {
        subject: 'Chat Response',
        message: chatInputText.trim(),
        category: 'general'
      });
      setSupportMessages(prev => [...prev, saved]);
      setChatInputText('');
    } catch (err: any) {
      triggerStatus(err?.message || 'Couldn’t send your message. Try again.', 'error');
    } finally {
      setSendingSupport(false);
    }
  };

  // Count unread replies from consultant
  const unreadConsultantMessages = useMemo(() => {
    return supportMessages.filter(m => m.sender === 'consultant' && m.status === 'unread').length;
  }, [supportMessages]);

  // Financial Stats Calculations
  const stats = useMemo(() => {
    let outstanding = 0;
    let totalPaid = 0;
    let pendingQuotes = 0;

    documents.forEach(doc => {
      if (doc.type === 'invoice') {
        if (doc.status === 'paid') {
          totalPaid += doc.total;
        } else if (doc.status === 'sent' || doc.status === 'partial') {
          outstanding += doc.total - (doc.partiallyPaidAmount || 0);
        }
      } else if (doc.type === 'receipt') {
        totalPaid += doc.total;
      } else if (doc.type === 'quote' && doc.status === 'sent') {
        pendingQuotes += doc.total;
      }
    });

    return { outstanding, totalPaid, pendingQuotes };
  }, [documents]);

  const filteredDocuments = documents.filter(doc => {
    if (filterTab === 'all') return true;
    if (filterTab === 'unpaid') return doc.type === 'invoice' && (doc.status === 'sent' || doc.status === 'draft');
    if (filterTab === 'paid') return (doc.type === 'invoice' && doc.status === 'paid') || doc.type === 'receipt';
    if (filterTab === 'quotes') return doc.type === 'quote';
    return true;
  });

  // Reusable brand logo renderer supporting image, text monogram, or symbol icons
  const renderBrandLogo = (
    biz: {
      name?: string;
      colorTheme?: string;
      logoType?: 'text' | 'symbol' | 'image';
      logoUrl?: string;
      logoSymbol?: string;
      logoText?: string;
      brandSlogan?: string;
    },
    size: 'sm' | 'md' | 'lg' = 'md'
  ) => {
    const color = biz.colorTheme || '#0284c7';
    const name = biz.name || 'Business';
    const logoType = biz.logoType || (biz.logoUrl ? 'image' : 'symbol');

    if (logoType === 'image' && biz.logoUrl) {
      const imgClasses = size === 'sm' ? 'h-7 w-auto' : size === 'lg' ? 'h-12 w-auto' : 'h-9 w-auto';
      return (
        <img 
          src={biz.logoUrl} 
          alt={name} 
          className={`${imgClasses} max-w-[130px] object-contain rounded-md shadow-xs`}
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      );
    }

    if (logoType === 'text' && biz.logoText) {
      const textClasses = size === 'sm' 
        ? 'px-2 py-0.5 text-[9px]' 
        : size === 'lg' 
        ? 'px-3.5 py-2 text-sm' 
        : 'px-2.5 py-1 text-xs';
      return (
        <div 
          className={`${textClasses} rounded-lg font-mono font-black text-white tracking-widest shadow-xs flex items-center justify-center`}
          style={{ backgroundColor: color }}
        >
          {biz.logoText}
        </div>
      );
    }

    // Default symbol icon renderer
    const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';
    const boxSize = size === 'sm' ? 'w-7 h-7 rounded-lg' : size === 'lg' ? 'w-12 h-12 rounded-2xl' : 'w-9 h-9 rounded-xl';

    const renderIcon = () => {
      switch (biz.logoSymbol) {
        case 'Waves': return <Waves className={iconSize} />;
        case 'Briefcase': return <Briefcase className={iconSize} />;
        case 'Building2': return <Building2 className={iconSize} />;
        case 'ShieldCheck': return <ShieldCheck className={iconSize} />;
        case 'Globe': return <Globe className={iconSize} />;
        case 'Heart': return <Heart className={iconSize} />;
        case 'Sparkles':
        default:
          return <Sparkles className={iconSize} />;
      }
    };

    return (
      <div 
        className={`${boxSize} flex items-center justify-center text-white font-bold shadow-xs shrink-0`}
        style={{ backgroundColor: color }}
      >
        {renderIcon()}
      </div>
    );
  };

  // Render document logo header dynamically checking businesses state or cached doc properties
  const renderDocumentLogo = (d: any) => {
    const matchedBiz = businesses.find(b => b.id === d.businessId);
    const activeBiz = matchedBiz || {
      name: d.businessName || primaryBusiness.name,
      colorTheme: d.businessColorTheme || primaryBusiness.colorTheme,
      logoType: d.businessLogoType || primaryBusiness.logoType,
      logoSymbol: d.businessLogoSymbol || primaryBusiness.logoSymbol,
      logoUrl: d.businessLogoUrl || primaryBusiness.logoUrl,
      logoText: d.businessLogoText || primaryBusiness.logoText,
      brandSlogan: d.businessBrandSlogan || primaryBusiness.brandSlogan,
    };

    return (
      <div className="flex items-center gap-2.5">
        {renderBrandLogo(activeBiz, 'md')}
        <div>
          <h4 className="text-xs font-bold text-zinc-900 tracking-tight leading-tight">{activeBiz.name}</h4>
          {activeBiz.brandSlogan && (
            <span className="text-[8.5px] text-zinc-400 block font-normal leading-tight mt-0.5">
              {activeBiz.brandSlogan}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 flex justify-center items-start sm:p-4 font-sans select-none antialiased">
      <div className="w-full max-w-md min-h-screen sm:min-h-[850px] bg-slate-50 flex flex-col relative sm:rounded-[2.5rem] sm:shadow-2xl sm:border-[6px] border-slate-800 overflow-hidden">
        
        {/* Top Status Bar Decorator on Desktop */}
        <div 
          className="hidden sm:flex text-white/90 text-[9px] px-6 py-1.5 justify-between font-mono tracking-wider font-semibold items-center transition-colors shrink-0"
          style={{ backgroundColor: brandColor }}
        >
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Client portal
          </span>
          <span className="truncate max-w-[180px] font-sans text-[8.5px] opacity-90">
            {primaryBusiness.name}
          </span>
          <span>12:00 PM</span>
        </div>

        {/* Native iOS Safe Area Top Spacer */}
        <div 
          className="sm:hidden bg-white shrink-0 pointer-events-none" 
          style={{ height: 'env(safe-area-inset-top, 0px)' }} 
        />

        {/* Portal Header Block with Dynamic Primary Business Branding */}
        <div className="p-4 bg-white border-b border-zinc-100 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {renderBrandLogo(primaryBusiness, 'sm')}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold text-zinc-900 tracking-tight truncate">
                  {primaryBusiness.name}
                </h2>
                <span 
                  className="text-[7.5px] font-extrabold uppercase px-1 py-0.2 rounded text-white shrink-0"
                  style={{ backgroundColor: brandColor }}
                >
                  Portal
                </span>
              </div>
              <span className="text-[9px] text-zinc-400 block truncate">
                Client: <strong className="text-zinc-700 font-semibold">{clientAuth.clientName}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowVendorInfo(!showVendorInfo)}
              className={`p-1.5 rounded-lg border transition-all text-xs flex items-center gap-1 ${
                showVendorInfo 
                  ? 'bg-zinc-100 border-zinc-300 text-zinc-900' 
                  : 'bg-white border-zinc-200 text-zinc-500 hover:text-zinc-800'
              }`}
              title="Business and payment details"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={onSignOut}
              className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-all"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Collapsible Primary Business Profile & Settlement Info */}
        <AnimatePresence>
          {showVendorInfo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-white border-b border-zinc-150 p-4 space-y-2.5 overflow-hidden text-xs text-zinc-600 shadow-inner"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100">
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                  Business details
                </span>
                <span className="text-[9px] font-mono font-bold text-zinc-500">
                  TIN: {primaryBusiness.tin || 'N/A'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                {primaryBusiness.email && (
                  <div className="flex items-center gap-1.5 text-zinc-700">
                    <Mail className="w-3 h-3 text-zinc-400 shrink-0" />
                    <span className="truncate">{primaryBusiness.email}</span>
                  </div>
                )}
                {primaryBusiness.phone && (
                  <div className="flex items-center gap-1.5 text-zinc-700">
                    <Phone className="w-3 h-3 text-zinc-400 shrink-0" />
                    <span className="truncate">{primaryBusiness.phone}</span>
                  </div>
                )}
                {primaryBusiness.address && (
                  <div className="col-span-2 flex items-center gap-1.5 text-zinc-500">
                    <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                    <span className="truncate">{primaryBusiness.address}</span>
                  </div>
                )}
              </div>

              {/* Remittance Channels */}
              <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-150 space-y-1.5 text-[9.5px]">
                <span className="font-bold text-zinc-800 block uppercase tracking-wide">Pay to</span>
                <div className="flex flex-wrap gap-2">
                  {primaryBusiness.mPaisaId && (
                    <span className="bg-white px-2 py-1 rounded border border-zinc-200 text-zinc-800 font-mono font-semibold">
                      M-PAiSA: <strong>{primaryBusiness.mPaisaId}</strong>
                    </span>
                  )}
                  {primaryBusiness.myCashId && (
                    <span className="bg-white px-2 py-1 rounded border border-zinc-200 text-zinc-800 font-mono font-semibold">
                      MyCash: <strong>{primaryBusiness.myCashId}</strong>
                    </span>
                  )}
                </div>
                {primaryBusiness.bankDetails && (
                  <pre className="font-sans text-[9px] text-zinc-500 whitespace-pre-wrap mt-1 pt-1 border-t border-zinc-150">
                    {primaryBusiness.bankDetails}
                  </pre>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Alerts */}
        {statusMsg && (
          <div className="p-3 bg-white border-b border-zinc-100">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-2.5 rounded-lg text-xs flex items-center border ${
                statusMsg.type === 'success' ? 'bg-zinc-50 border-zinc-200 text-zinc-800' : 'bg-red-50 border-red-100 text-red-800'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mr-2" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mr-2" />
              )}
              <span className="text-[11px] leading-tight">{statusMsg.text}</span>
            </motion.div>
          </div>
        )}

        {/* Portal View Navigation Tabs */}
        <div className="bg-white border-b border-zinc-150 px-4 py-2 flex items-center justify-between gap-1 shadow-2xs">
          <div className="flex bg-zinc-100 p-1 rounded-xl w-full gap-1">
            <button
              onClick={() => setPortalTab('overview')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                portalTab === 'overview'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-sky-600" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setPortalTab('documents')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                portalTab === 'documents'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-zinc-500" />
              <span>Documents</span>
              {documents.length > 0 && (
                <span className="text-[9px] bg-zinc-200/80 px-1.5 py-0.2 rounded-full font-mono">
                  {documents.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setPortalTab('support')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                portalTab === 'support'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>Support</span>
              {supportMessages.length > 0 && (
                <span className="text-[9px] bg-sky-100 text-sky-700 px-1.5 py-0.2 rounded-full font-mono font-bold">
                  {supportMessages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Main Content Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
          {portalTab === 'overview' && (
            <ClientOverviewView
              clientAuth={clientAuth}
              clientProfile={clientProfile}
              primaryBusiness={primaryBusiness}
              businesses={businesses}
              documents={documents}
              projects={projects}
              services={services}
              brandColor={brandColor}
              renderBrandLogo={renderBrandLogo}
              onSelectDocument={(doc) => setSelectedDoc(doc)}
              onPayInvoice={handlePayInvoice}
              onInquireAboutProject={handleInquireAboutProject}
              onInquireAboutDoc={handleInquireAboutDoc}
              onNavigateToDocuments={() => setPortalTab('documents')}
              onNavigateToSupport={() => setPortalTab('support')}
            />
          )}

          {portalTab === 'documents' && (
            <div className="space-y-4">
              {/* Dynamically Branded Welcome Lounge Card */}
              <div 
                className="text-white p-4 rounded-2xl relative overflow-hidden shadow-md transition-all"
                style={{
                  background: `linear-gradient(135deg, ${brandColor} 0%, #0f172a 100%)`
                }}
              >
                <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-15 pointer-events-none">
                  <Waves className="w-36 h-36 text-white" />
                </div>

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white font-display">
                      Your documents
                    </h3>
                    <p className="text-[10px] text-white/80 mt-0.5">
                      Invoices, receipts and quotes from {primaryBusiness.name}.
                    </p>
                  </div>
                  <div className="shrink-0 bg-white/10 p-1.5 rounded-xl backdrop-blur-xs border border-white/20">
                    {renderBrandLogo(primaryBusiness, 'sm')}
                  </div>
                </div>
              </div>

              {/* Quick Financial Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-zinc-100 shadow-xs text-center">
                  <span className="text-[8.5px] text-zinc-400 font-bold block uppercase tracking-wider">
                    Balance owing
                  </span>
                  <span className={`text-base font-bold font-mono block mt-0.5 ${stats.outstanding > 0 ? 'text-amber-600' : 'text-zinc-900'}`}>
                    FJD {stats.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-zinc-100 shadow-xs text-center">
                  <span className="text-[8.5px] text-zinc-400 font-bold block uppercase tracking-wider">
                    Paid to date
                  </span>
                  <span className="text-base font-bold font-mono text-emerald-600 block mt-0.5">
                    FJD {stats.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Document Filters */}
              <div className="flex bg-white p-1 rounded-xl border border-zinc-200 shadow-xs">
                {(['all', 'unpaid', 'paid', 'quotes'] as const).map((tab) => {
                  const isActive = filterTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setFilterTab(tab)}
                      className={`flex-1 text-center py-1.5 rounded-lg text-[9.5px] font-bold uppercase tracking-wider transition-all ${
                        isActive 
                          ? 'text-white shadow-xs' 
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                      style={isActive ? { backgroundColor: brandColor } : {}}
                    >
                      {tab === 'unpaid' ? 'Pending' : tab}
                    </button>
                  );
                })}
              </div>

              {/* Documents List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-widest">
                    Documents
                  </h4>
                  <span className="text-[9px] font-mono text-zinc-400">
                    {filteredDocuments.length} record{filteredDocuments.length === 1 ? '' : 's'}
                  </span>
                </div>
                
                {loading ? (
                  <div className="text-center py-8">
                    <span className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin inline-block" />
                    <p className="text-[10px] text-zinc-400 mt-2">Loading documents…</p>
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-8 text-center">
                    <FileText className="w-6 h-6 text-zinc-300 mx-auto mb-1.5" />
                    <p className="text-xs text-zinc-400 italic">No documents here.</p>
                  </div>
                ) : (
                  filteredDocuments.map((doc) => {
                    let statusBadge = "bg-zinc-100 text-zinc-600";
                    if (doc.status === 'paid') statusBadge = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                    else if (doc.status === 'sent') statusBadge = "bg-amber-50 text-amber-700 border border-amber-100";
                    else if (doc.status === 'accepted') statusBadge = "bg-zinc-900 text-white";

                    const matchedBiz = businesses.find(b => b.id === doc.businessId) || primaryBusiness;

                    return (
                      <motion.div
                        key={doc.id}
                        layoutId={`doc-card-${doc.id}`}
                        onClick={() => setSelectedDoc(doc)}
                        className="bg-white p-3.5 rounded-xl border border-zinc-150 shadow-xs hover:border-zinc-300 transition-all cursor-pointer flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-1">
                          {renderBrandLogo(matchedBiz, 'sm')}
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-zinc-900 capitalize">
                                {doc.type} #{doc.documentNumber}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded text-[7.5px] font-extrabold uppercase ${statusBadge}`}>
                                {doc.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] text-zinc-400">
                              <span className="font-semibold text-zinc-700 truncate">{matchedBiz.name || doc.businessName}</span>
                              <span>•</span>
                              <span>{doc.issueDate}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex items-center gap-1.5">
                          <div className="font-mono text-xs font-bold text-zinc-950">
                            FJD {doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {portalTab === 'support' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-zinc-150 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-950">Messages</h4>
                      <p className="text-[10px] text-zinc-400">Ask about an invoice, a project or a payment.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSupportTab('new_request');
                      setShowSupportModal(true);
                    }}
                    className="text-[10px] font-bold text-white px-3 py-1.5 rounded-lg shadow-xs transition-all active:scale-[0.98]"
                    style={{ backgroundColor: brandColor }}
                  >
                    New message
                  </button>
                </div>

                {/* Support conversation list */}
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  {supportMessages.length === 0 ? (
                    <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-6 text-center text-xs text-zinc-400">
                      No messages yet. Tap New message to write to your consultant.
                    </div>
                  ) : (
                    supportMessages.map((msg) => (
                      <div 
                        key={msg.id}
                        className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                          msg.sender === 'client' 
                            ? 'bg-zinc-50 border-zinc-200/80' 
                            : 'bg-sky-50/50 border-sky-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                            msg.sender === 'client' ? 'bg-zinc-200 text-zinc-700' : 'bg-sky-200 text-sky-800'
                          }`}>
                            {msg.sender === 'client' ? 'Sent by you' : `Reply from ${primaryBusiness.name}`}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-400">
                            {new Date(msg.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h5 className="font-bold text-zinc-900 text-xs">{msg.subject}</h5>
                        <p className="text-zinc-600 text-[11px] leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Quick Chat Box */}
                <form onSubmit={handleSendQuickChatReply} className="pt-2 border-t border-zinc-100 flex gap-2">
                  <input
                    type="text"
                    value={chatInputText}
                    onChange={(e) => setChatInputText(e.target.value)}
                    placeholder="Write a message…"
                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900"
                  />
                  <button
                    type="submit"
                    disabled={sendingSupport || !chatInputText.trim()}
                    className="text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 flex items-center justify-center gap-1"
                    style={{ backgroundColor: brandColor }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Compliant Footer */}
        <div className="p-3 bg-white border-t border-zinc-100 text-center text-[8.5px] text-zinc-400">
          {primaryBusiness.name} · Client portal
        </div>

        {/* Document Detail & Action Modal Sheet */}
        <AnimatePresence>
          {selectedDoc && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-end justify-center">
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="bg-white rounded-t-3xl w-full max-w-md h-[85vh] shadow-2xl flex flex-col overflow-hidden border-t border-zinc-200"
              >
                {/* Modal Header */}
                <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
                  <div className="min-w-0">
                    <span className="text-[8.5px] font-bold text-zinc-400 uppercase tracking-widest block">
                      Document
                    </span>
                    <h3 className="text-xs font-bold text-zinc-900 truncate mt-0.5 capitalize">
                      {selectedDoc.type} #{selectedDoc.documentNumber}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedDoc(null)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-900 rounded-full bg-zinc-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Invoice Body Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-zinc-600 scrollbar-none">
                  
                  {/* Dynamic Brand Header */}
                  <div className="flex justify-between items-start gap-3 pb-3 border-b border-zinc-100">
                    {renderDocumentLogo(selectedDoc)}
                    <div className="text-right">
                      <span className="text-[8.5px] uppercase tracking-wider text-zinc-400 font-bold block">Document</span>
                      <span 
                        className="text-xs font-mono font-bold uppercase block px-1.5 py-0.5 rounded text-white mt-0.5"
                        style={{ backgroundColor: businesses.find(b => b.id === selectedDoc.businessId)?.colorTheme || brandColor }}
                      >
                        {selectedDoc.type}
                      </span>
                    </div>
                  </div>

                  {/* Vendor & Client Profiles */}
                  <div className="grid grid-cols-2 gap-3 text-[10.5px] leading-relaxed">
                    {(() => {
                      const docBiz = businesses.find(b => b.id === selectedDoc.businessId) || primaryBusiness;
                      return (
                        <div>
                          <span className="text-[8px] uppercase tracking-widest text-zinc-400 font-bold block">From</span>
                          <p className="font-bold text-zinc-900">{docBiz.name || selectedDoc.businessName}</p>
                          {(docBiz.tin || selectedDoc.businessTin) && (
                            <p className="font-mono text-[9.5px]">TIN: {docBiz.tin || selectedDoc.businessTin}</p>
                          )}
                          <p className="text-zinc-500">{docBiz.address || selectedDoc.businessAddress}</p>
                          <p className="text-zinc-500">{docBiz.email || selectedDoc.businessEmail}</p>
                        </div>
                      );
                    })()}
                    <div>
                      <span className="text-[8px] uppercase tracking-widest text-zinc-400 font-bold block">To</span>
                      <p className="font-bold text-zinc-900">{selectedDoc.clientName}</p>
                      <p className="text-zinc-500">{selectedDoc.clientEmail}</p>
                      <span className="text-[9.5px] text-zinc-400 block mt-1">Issued: {selectedDoc.issueDate}</span>
                      {selectedDoc.dueDate && (
                        <span className="block font-semibold text-amber-700 text-[9.5px]">Due: {selectedDoc.dueDate}</span>
                      )}
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50/50">
                    <div className="p-2 bg-zinc-100/80 border-b border-zinc-200 grid grid-cols-12 gap-1 text-[8px] text-zinc-500 uppercase font-bold">
                      <div className="col-span-6">Item</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-2 text-right">Rate</div>
                      <div className="col-span-2 text-right">Total</div>
                    </div>
                    <div className="divide-y divide-zinc-150">
                      {selectedDoc.items?.map((item: any, idx: number) => (
                        <div key={idx} className="p-2 grid grid-cols-12 gap-1 text-[10.5px] items-center">
                          <div className="col-span-6 min-w-0">
                            <span className="font-semibold text-zinc-900 block truncate">{item.name}</span>
                            {item.kind === 'reimbursement' && (
                              <span className="text-[9px] text-amber-800 font-semibold block">
                                Reimbursable expense{item.taxable ? '' : ', no VAT'}
                                {item.receiptFileId && <> · <button type="button" onClick={() => openPortalFile(session, selectedDoc.id, item.receiptFileId).catch((err: any) => alert(err.message))} className="underline text-sky-700 cursor-pointer">View receipt</button></>}
                              </span>
                            )}
                            {item.description && <span className="text-[8.5px] text-zinc-400 block truncate">{item.description}</span>}
                          </div>
                          <div className="col-span-2 text-center text-zinc-600 font-mono">{item.quantity}</div>
                          <div className="col-span-2 text-right text-zinc-600 font-mono">{item.rate.toFixed(2)}</div>
                          <div className="col-span-2 text-right text-zinc-950 font-mono font-bold">{item.total.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing Summary */}
                  <div className="space-y-1 text-right font-sans text-xs border-t border-zinc-100 pt-2.5">
                    <div className="flex justify-between max-w-[240px] ml-auto text-[11px]">
                      <span className="text-zinc-400">Subtotal:</span>
                      <span className="font-mono font-medium">FJD {selectedDoc.subtotal.toFixed(2)}</span>
                    </div>

                    {/* Itemized Taxes */}
                    {selectedDoc.appliedTaxes && selectedDoc.appliedTaxes.length > 0 ? (
                      selectedDoc.appliedTaxes.map((tax: any, tIdx: number) => (
                        <div key={tIdx} className="flex justify-between max-w-[240px] ml-auto text-[10.5px]">
                          <span className="text-zinc-400">{tax.name} ({tax.rate}%):</span>
                          <span className="font-mono text-zinc-600">FJD {tax.amount.toFixed(2)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex justify-between max-w-[240px] ml-auto text-[10.5px]">
                        <span className="text-zinc-400">Fiji VAT ({selectedDoc.vatRate}%):</span>
                        <span className="font-mono text-zinc-600">FJD {selectedDoc.vatAmount.toFixed(2)}</span>
                      </div>
                    )}

                    {/* Itemized Surcharges & Fees */}
                    {selectedDoc.appliedFees && selectedDoc.appliedFees.length > 0 && (
                      selectedDoc.appliedFees.map((fee: any, fIdx: number) => (
                        <div key={fIdx} className="flex justify-between max-w-[240px] ml-auto text-[10.5px]">
                          <span className="text-zinc-400">
                            {fee.name} {fee.type === 'percentage' ? `(${fee.rate}%)` : ''}:
                          </span>
                          <span className="font-mono text-zinc-600">FJD {fee.amount.toFixed(2)}</span>
                        </div>
                      ))
                    )}

                    <div className="flex justify-between max-w-[240px] ml-auto font-bold text-zinc-950 text-sm border-t border-zinc-200 pt-1.5">
                      <span>Total:</span>
                      <span className="font-mono text-emerald-700">FJD {selectedDoc.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Payment Terms or Instructions */}
                  {selectedDoc.type !== 'quote' && (
                    <div className="p-3 bg-zinc-50 border border-zinc-150 rounded-xl space-y-1.5 text-[10px] leading-relaxed">
                      <h4 className="font-bold text-zinc-800 uppercase tracking-wide flex items-center gap-1">
                        <Wallet className="w-3.5 h-3.5 text-zinc-500" /> How to pay
                      </h4>
                      {(() => {
                        const docBiz = businesses.find(b => b.id === selectedDoc.businessId) || primaryBusiness;
                        const details = docBiz.bankDetails || selectedDoc.businessBankDetails;
                        return details ? (
                          <pre className="font-sans whitespace-pre-wrap text-zinc-600 text-[9.5px]">{details}</pre>
                        ) : (
                          <p className="italic text-zinc-400">Pay by M-PAiSA or bank transfer.</p>
                        );
                      })()}
                    </div>
                  )}

                  {/* Document Notes */}
                  {selectedDoc.notes && (
                    <div className="space-y-1">
                      <span className="text-[8px] uppercase tracking-widest text-zinc-400 font-bold block">Notes</span>
                      <p className="bg-zinc-50 border border-zinc-150 rounded-xl p-2.5 text-[9.5px] whitespace-pre-line text-zinc-600">
                        {selectedDoc.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Active Action Bottom Bar */}
                <div className="p-3.5 border-t border-zinc-100 bg-zinc-50 space-y-2">
                  <div className="flex gap-2">
                    {selectedDoc.type === 'quote' && selectedDoc.status === 'sent' && (
                      <button
                        onClick={() => handleAcceptQuote(selectedDoc.id)}
                        className="flex-1 text-white font-bold py-2.5 rounded-xl text-xs text-center flex items-center justify-center gap-1.5 transition-all shadow-xs"
                        style={{ backgroundColor: brandColor }}
                      >
                        <CheckCircle2 className="w-4 h-4" /> Accept quote
                      </button>
                    )}
                    {selectedDoc.type === 'invoice' && selectedDoc.status !== 'paid' && selectedDoc.clientPaymentReport?.status === 'rejected' && (
                      <div className="w-full py-2 px-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-[11px] font-semibold">
                        Your reported payment (ref {selectedDoc.clientPaymentReport.reference}) couldn’t be matched.{selectedDoc.clientPaymentReport.rejectionReason ? ` ${selectedDoc.clientPaymentReport.rejectionReason}` : ''} Check the details and report it again.
                      </div>
                    )}
                    {selectedDoc.type === 'invoice' && selectedDoc.status !== 'paid' && selectedDoc.clientPaymentReport && selectedDoc.clientPaymentReport.status !== 'rejected' && (
                      <div className="flex-1 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-center text-xs font-bold flex items-center justify-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-600" /> Payment reported — awaiting confirmation
                      </div>
                    )}
                    {selectedDoc.type === 'invoice' && (selectedDoc.status === 'sent' || selectedDoc.status === 'partial') && (!selectedDoc.clientPaymentReport || selectedDoc.clientPaymentReport.status === 'rejected') && (
                      <button
                        onClick={() => setShowPaymentModal(true)}
                        className="flex-1 text-white font-bold py-2.5 rounded-xl text-xs text-center flex items-center justify-center gap-1.5 transition-all shadow-xs"
                        style={{ backgroundColor: brandColor }}
                      >
                        <ArrowUpRight className="w-4 h-4" /> I’ve paid this
                      </button>
                    )}
                    {selectedDoc.status === 'paid' && (
                      <div className="flex-1 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-center text-xs font-bold flex items-center justify-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-600" /> Paid
                      </div>
                    )}
                    {selectedDoc.status === 'accepted' && (
                      <div className="flex-1 py-2.5 bg-zinc-100 border border-zinc-200 text-zinc-800 rounded-xl text-center text-xs font-bold flex items-center justify-center gap-1.5">
                        <Check className="w-4 h-4 text-zinc-800" /> Quote accepted
                      </div>
                    )}
                  </div>
                  
                  {/* Quick Inquire button for this document */}
                  <button
                    onClick={() => handleInquireAboutDoc(selectedDoc)}
                    className="w-full bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-500" /> Ask about this {selectedDoc.type}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Floating 'Request Support' / 'Message Consultant' Button */}
        <motion.div 
          className="sticky bottom-4 right-4 z-40 flex justify-end px-4 pointer-events-none"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              setShowSupportModal(true);
              fetchSupportMessages();
            }}
            className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full text-white font-bold text-xs shadow-xl transition-all border border-white/20 backdrop-blur-xs cursor-pointer group"
            style={{ 
              backgroundColor: brandColor,
              boxShadow: `0 8px 20px -4px ${brandColor}66`
            }}
          >
            <div className="relative">
              <MessageSquare className="w-4 h-4" />
              {unreadConsultantMessages > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-300 border-2 border-slate-900 rounded-full animate-ping" />
              )}
            </div>
            <span className="font-display tracking-tight">Messages</span>
            {unreadConsultantMessages > 0 && (
              <span className="bg-white text-zinc-900 text-[9px] font-black px-1.5 py-0.2 rounded-full">
                {unreadConsultantMessages}
              </span>
            )}
          </motion.button>
        </motion.div>

        {/* Support & Consultant Messaging Modal / Drawer */}
        <AnimatePresence>
          {showSupportModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-end justify-center">
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                className="bg-white rounded-t-3xl w-full max-w-md h-[90vh] shadow-2xl flex flex-col overflow-hidden border-t border-zinc-200"
              >
                {/* Modal Header */}
                <div className="p-4 border-b border-zinc-150 flex items-center justify-between bg-zinc-50/90">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      {renderBrandLogo(primaryBusiness, 'sm')}
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-zinc-900 truncate">
                          {primaryBusiness.name} Support
                        </h3>
                        <span className="bg-emerald-50 text-emerald-700 text-[8px] font-bold px-1.5 py-0.2 rounded-full border border-emerald-200/60 uppercase tracking-wider">
                          Messages
                        </span>
                      </div>
                      <p className="text-[9px] text-zinc-400 truncate flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-zinc-400" /> Replies appear here
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={fetchSupportMessages}
                      disabled={loadingSupport}
                      title="Refresh"
                      className="p-1.5 text-zinc-400 hover:text-zinc-900 rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingSupport ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => setShowSupportModal(false)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-900 rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sub-Header Navigation Tabs */}
                <div className="flex bg-zinc-100/80 p-1 border-b border-zinc-200 text-xs">
                  <button
                    onClick={() => setSupportTab('history')}
                    className={`flex-1 py-1.5 text-center text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      supportTab === 'history'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Messages
                    {supportMessages.length > 0 && (
                      <span className="bg-zinc-200 text-zinc-700 text-[8.5px] px-1.5 py-0.2 rounded-full font-mono">
                        {supportMessages.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setSupportTab('new_request')}
                    className={`flex-1 py-1.5 text-center text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      supportTab === 'new_request'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    <Send className="w-3 h-3" /> New message
                  </button>
                </div>

                {/* Tab Content: History / Chat Thread */}
                {supportTab === 'history' && (
                  <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                    {/* Chat Messages Stream */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-none">
                      {loadingSupport ? (
                        <div className="text-center py-10 space-y-2">
                          <span className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin inline-block" />
                          <p className="text-[10px] text-zinc-400">Loading messages…</p>
                        </div>
                      ) : supportMessages.length === 0 ? (
                        <div className="bg-white border border-dashed border-zinc-200 rounded-2xl p-6 text-center space-y-2.5 my-6 shadow-2xs">
                          <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-400">
                            <Inbox className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-zinc-800">No messages yet</h4>
                            <p className="text-[10px] text-zinc-400 max-w-[220px] mx-auto mt-0.5">
                              Questions about an invoice, a quote or a payment? Send your consultant a message.
                            </p>
                          </div>
                          <button
                            onClick={() => setSupportTab('new_request')}
                            className="text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-xs inline-flex items-center gap-1.5"
                            style={{ backgroundColor: brandColor }}
                          >
                            <Send className="w-3.5 h-3.5" /> Write a message
                          </button>
                        </div>
                      ) : (
                        supportMessages.map((msg) => {
                          const isClient = msg.sender === 'client';
                          const timeFormatted = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const dateFormatted = new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });

                          return (
                            <div 
                              key={msg.id} 
                              className={`flex flex-col ${isClient ? 'items-end' : 'items-start'}`}
                            >
                              <div className="flex items-center gap-1.5 text-[8.5px] text-zinc-400 px-1 mb-1">
                                <span className="font-semibold text-zinc-600">
                                  {isClient ? 'You' : `${primaryBusiness.name} (Consultant)`}
                                </span>
                                <span>•</span>
                                <span>{dateFormatted} {timeFormatted}</span>
                              </div>

                              <div 
                                className={`max-w-[85%] rounded-2xl p-3 shadow-2xs space-y-1.5 ${
                                  isClient 
                                    ? 'text-white rounded-tr-xs' 
                                    : 'bg-white border border-zinc-200 text-zinc-900 rounded-tl-xs'
                                }`}
                                style={isClient ? { backgroundColor: brandColor } : {}}
                              >
                                {/* Category & Document Reference Tags */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {msg.category && msg.category !== 'general' && (
                                    <span className={`text-[7.5px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                      isClient ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-700'
                                    }`}>
                                      {msg.category.replace('_', ' ')}
                                    </span>
                                  )}
                                  {msg.documentRefId && (
                                    <span className={`text-[7.5px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                      isClient ? 'bg-black/20 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'
                                    }`}>
                                      {msg.documentRefId}
                                    </span>
                                  )}
                                </div>

                                {msg.subject && msg.subject !== 'Chat Response' && msg.subject !== 'Portal Chat Reply' && (
                                  <h5 className={`text-[11px] font-bold ${isClient ? 'text-white' : 'text-zinc-900'}`}>
                                    {msg.subject}
                                  </h5>
                                )}

                                <p className={`text-xs whitespace-pre-wrap leading-relaxed ${isClient ? 'text-white/95' : 'text-zinc-700'}`}>
                                  {msg.message}
                                </p>

                                <div className="flex justify-end items-center gap-1 text-[8px] opacity-75 pt-0.5">
                                  <span>{isClient ? 'Sent' : 'Reply'}</span>
                                  {isClient && <Check className="w-3 h-3" />}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Chat Quick Reply Input Bar */}
                    <div className="p-3 bg-white border-t border-zinc-200">
                      <form onSubmit={handleSendQuickChatReply} className="flex gap-2">
                        <input
                          type="text"
                          value={chatInputText}
                          onChange={(e) => setChatInputText(e.target.value)}
                          placeholder="Write a message…"
                          className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                        />
                        <button
                          type="submit"
                          disabled={sendingSupport || !chatInputText.trim()}
                          className="px-3.5 py-2 rounded-xl text-white font-bold text-xs shadow-xs disabled:opacity-40 flex items-center justify-center transition-all"
                          style={{ backgroundColor: brandColor }}
                        >
                          {sendingSupport ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {/* Tab Content: New Support Ticket / Inquiry Form */}
                {supportTab === 'new_request' && (
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-zinc-600 scrollbar-none bg-white">
                    <form onSubmit={handleSendSupportMessage} className="space-y-3.5">
                      {/* Category Selector */}
                      <div>
                        <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          Topic *
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 'general', label: 'General', icon: MessageSquare },
                            { id: 'invoice_inquiry', label: 'Invoice or tax', icon: FileText },
                            { id: 'payment_proof', label: 'Payment', icon: CreditCard },
                            { id: 'quote_question', label: 'Quote or scope', icon: Briefcase },
                            { id: 'urgent_support', label: 'Urgent', icon: AlertTriangle }
                          ].map((cat) => {
                            const isSelected = msgCategory === cat.id;
                            const IconComp = cat.icon;
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setMsgCategory(cat.id as any)}
                                className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                                  isSelected
                                    ? 'border-zinc-900 bg-zinc-900 text-white font-bold shadow-xs'
                                    : 'border-zinc-200 bg-zinc-50/60 hover:bg-zinc-100 text-zinc-700 font-medium'
                                }`}
                              >
                                <IconComp className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-zinc-400'}`} />
                                <span className="text-[10.5px] truncate">{cat.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Optional Document Attachment Selector */}
                      <div>
                        <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                          Related document (optional)
                        </label>
                        <select
                          value={msgDocRef}
                          onChange={(e) => setMsgDocRef(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-2.5 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900"
                        >
                          <option value="">None</option>
                          {documents.map((d) => (
                            <option key={d.id} value={`${d.type.toUpperCase()} #${d.documentNumber}`}>
                              {d.type.toUpperCase()} #{d.documentNumber} ({d.issueDate}) - FJD {d.total.toFixed(2)} [{d.status}]
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quick Template Prompts */}
                      <div className="space-y-1">
                        <label className="block text-[8.5px] font-bold text-zinc-400 uppercase tracking-wider">
                          Common requests
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            'Please confirm you received my M-PAiSA payment',
                            'Please send a tax invoice showing your TIN',
                            'When is the next milestone due?',
                            'Please send me a copy of the receipt'
                          ].map((promptText, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              onClick={() => {
                                setMsgText(promptText);
                                setMsgSubject(promptText);
                              }}
                              className="text-[9px] bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-2 py-1 rounded-lg border border-zinc-200 transition-colors"
                            >
                              + {promptText}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Subject */}
                      <div>
                        <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                          Subject
                        </label>
                        <input
                          type="text"
                          value={msgSubject}
                          onChange={(e) => setMsgSubject(e.target.value)}
                          placeholder="e.g. Receipt for my last payment"
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900"
                        />
                      </div>

                      {/* Message Body */}
                      <div>
                        <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                          Message *
                        </label>
                        <textarea
                          required
                          rows={4}
                          value={msgText}
                          onChange={(e) => setMsgText(e.target.value)}
                          placeholder="What do you need? Include any payment reference."
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900 resize-none leading-relaxed"
                        />
                      </div>

                      {/* Emergency Contact Quick Links */}
                      <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200/80 space-y-1 text-[10px]">
                        <span className="font-bold text-zinc-700 block uppercase tracking-wider text-[8.5px]">
                          Contact directly
                        </span>
                        <div className="flex gap-2">
                          {primaryBusiness.phone && (
                            <a 
                              href={`tel:${primaryBusiness.phone}`} 
                              className="flex-1 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-800 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 text-[10px]"
                            >
                              <Phone className="w-3 h-3 text-emerald-600" /> {primaryBusiness.phone}
                            </a>
                          )}
                          {primaryBusiness.email && (
                            <a 
                              href={`mailto:${primaryBusiness.email}?subject=Portal Support Request`} 
                              className="flex-1 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-800 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 text-[10px]"
                            >
                              <Mail className="w-3 h-3 text-sky-600" /> Email
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Submit Buttons */}
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setSupportTab('history')}
                          className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold py-2.5 rounded-xl text-xs"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={sendingSupport || !msgText.trim()}
                          className="flex-1 text-white font-bold py-2.5 rounded-xl text-xs shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                          style={{ backgroundColor: brandColor }}
                        >
                          {sendingSupport ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" /> Send
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal for logging payments */}
        {showPaymentModal && selectedDoc && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-55 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl p-4.5 w-full max-w-xs border border-zinc-100 shadow-2xl space-y-3.5"
            >
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-zinc-950 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-zinc-400" /> Report a payment
                </h4>
                <button 
                  onClick={() => setShowPaymentModal(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-900 rounded-full bg-zinc-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitPayment} className="space-y-3 text-xs text-zinc-600">
                <div>
                  <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Paid by *</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2.5 text-xs mt-1 text-zinc-800 focus:outline-none focus:border-zinc-950 font-semibold"
                  >
                    <option value="M-Paisa">M-PAiSA</option>
                    <option value="MyCash">MyCash</option>
                    <option value="Bank Transfer">Bank transfer</option>
                    <option value="Cash">Cash or cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Reference *</label>
                  <input
                    type="text"
                    required
                    value={paymentTx}
                    onChange={(e) => setPaymentTx(e.target.value)}
                    placeholder="e.g. MP-889104 or Westpac Ref 109"
                    className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-2.5 text-xs mt-1 text-zinc-800 focus:outline-none focus:border-zinc-950 font-mono"
                  />
                  <p className="text-[8.5px] text-zinc-400 mt-1">The receipt or reference number for your payment.</p>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold py-1.5 rounded-lg text-[11px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 text-white font-bold py-1.5 rounded-lg text-[11px] shadow-xs"
                    style={{ backgroundColor: brandColor }}
                  >
                    Report payment
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
