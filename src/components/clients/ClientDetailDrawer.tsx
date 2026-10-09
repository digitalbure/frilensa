import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, User, Mail, Phone, MapPin, ShieldCheck, Coins, Share2, 
  Link2, CheckCircle2, Copy, Check, RefreshCw, MessageSquare, 
  Send, ExternalLink, Plus, Edit3, Briefcase, FileText, AlertTriangle,
  Clock, CreditCard, Sparkles, Building2
} from 'lucide-react';
import { CRMData, Client, ClientSubscription, SupportMessage } from '../../types';
import { getCurrencyConfig } from '../../lib/currencies';
import { 
  loadSupportMessagesForClient, 
  sendSupportMessage 
} from '../../lib/db';
import { getPortalAccessStatus, setPortalPin } from '../../lib/api';

function generatePin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

interface ClientDetailDrawerProps {
  client: Client | null;
  data: CRMData;
  onClose: () => void;
  onUpdateData: (newData: CRMData) => void;
  onNavigateToTab: (tab: 'dashboard' | 'billing' | 'clients' | 'services' | 'settings', selectedDocId?: string) => void;
  onOpenEdit: (client: Client) => void;
  onOpenShareModal: (client: Client) => void;
  onGenerateAccessLink: (client: Client, e?: React.MouseEvent) => Promise<void>;
  onRevokeAccessLink: (client: Client, e?: React.MouseEvent) => Promise<void>;
  onCopyAccessLink: (client: Client, e?: React.MouseEvent) => Promise<void>;
  copiedClientId: string | null;
  generatingLinkId: string | null;
}

export default function ClientDetailDrawer({
  client,
  data,
  onClose,
  onUpdateData,
  onNavigateToTab,
  onOpenEdit,
  onOpenShareModal,
  onGenerateAccessLink,
  onRevokeAccessLink,
  onCopyAccessLink,
  copiedClientId,
  generatingLinkId
}: ClientDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'portal' | 'invoices' | 'messages'>('overview');
  
  // PIN states
  const [clientPin, setClientPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinStatus, setPinStatus] = useState('');
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  // Messages states
  const [clientMessages, setClientMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [consultantReply, setConsultantReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    if (client && client.email) {
      setPinStatus('');
      setClientPin('');
      fetchClientMessages(client.email);

      setHasPin(null);
      getPortalAccessStatus(client.email)
        .then(status => setHasPin(status.hasPin))
        .catch(() => setHasPin(null));
    }
  }, [client]);

  if (!client) return null;

  const fetchClientMessages = async (email: string) => {
    setLoadingMessages(true);
    try {
      const msgs = await loadSupportMessagesForClient(email);
      setClientMessages(msgs);
    } catch (e) {
      console.warn('Error loading client support messages:', e);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleGeneratePin = () => {
    setClientPin(generatePin());
  };

  const handleSavePin = async () => {
    if (!client || !client.email || !clientPin) return;
    setSavingPin(true);
    setPinStatus('');
    try {
      await setPortalPin(client, clientPin.trim());
      setHasPin(true);
      setPinStatus(`PIN saved. Share it with ${client.name} privately — it can't be viewed again.`);
      setClientPin('');
    } catch (e: any) {
      setPinStatus(e?.message || 'Error saving PIN. Please try again.');
    } finally {
      setSavingPin(false);
    }
  };

  const handleSendConsultantReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !consultantReply.trim()) return;

    setSendingReply(true);
    try {
      const activeBiz = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];

      const newMsg: SupportMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        clientId: client.id,
        clientName: client.name,
        clientEmail: client.email.trim().toLowerCase(),
        consultantId: '',
        businessId: activeBiz?.id,
        sender: 'consultant',
        subject: `Response from ${activeBiz?.name || 'Consultant'}`,
        message: consultantReply.trim(),
        category: 'general',
        status: 'read',
        createdAt: new Date().toISOString()
      };

      await sendSupportMessage(newMsg);
      setClientMessages(prev => [...prev, newMsg]);
      setConsultantReply('');
    } catch (err) {
      console.error('Error sending reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  // Client financial calculations
  const clientDocs = data.documents.filter(doc => doc.clientId === client.id);
  const invoices = clientDocs.filter(d => d.type === 'invoice');
  const currencyCode = client.currency || data.userProfile.defaultCurrency || 'FJD';
  const currencyConf = getCurrencyConfig(currencyCode);
  
  const totalBilled = invoices.reduce((acc, d) => acc + d.total, 0);
  const paidAmount = invoices.filter(d => d.status === 'paid').reduce((acc, d) => acc + d.total, 0);
  const outstanding = Math.max(0, totalBilled - paidAmount);

  const directAccessUrl = client.accessToken
    ? `${window.location.origin}${window.location.pathname}?token=${encodeURIComponent(client.accessToken)}`
    : '';

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex justify-end">
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="bg-white w-full sm:max-w-xl md:max-w-2xl h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden"
      >
        {/* Drawer Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0 mt-0.5">
                {client.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Client Dossier
                  </span>
                  <span className="bg-slate-100 text-[10px] text-slate-700 font-mono font-bold px-2 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
                    <span>{currencyConf.flag}</span>
                    <span>{currencyCode}</span>
                  </span>
                  {client.accessToken && (
                    <span className="bg-emerald-50 text-[10px] text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Portal Active
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900 truncate mt-1">
                  {client.name}
                </h3>
                {(client.contactPerson || client.contactName) && (
                  <p className="text-xs text-slate-600 font-medium flex items-center gap-1 mt-0.5">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Representative: {client.contactPerson || client.contactName}</span>
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1.5 mt-5 border-b border-slate-100 pb-0 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 cursor-pointer ${
                activeTab === 'overview'
                  ? 'border-slate-900 text-slate-900 bg-slate-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Overview & Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('portal')}
              className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'portal'
                  ? 'border-slate-900 text-slate-900 bg-slate-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
              Portal Access
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('invoices')}
              className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'invoices'
                  ? 'border-slate-900 text-slate-900 bg-slate-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Invoices & Quotes ({clientDocs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('messages')}
              className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'messages'
                  ? 'border-slate-900 text-slate-900 bg-slate-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
              Inquiries {clientMessages.length > 0 && `(${clientMessages.length})`}
            </button>
          </div>
        </div>

        {/* Drawer Body Scroll Area */}
        <div className="p-5 sm:p-6 flex-1 overflow-y-auto space-y-5">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Financial Snapshot */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Invoiced</span>
                  <span className="text-sm font-bold text-slate-900 font-mono block mt-1">
                    {currencyCode} ${totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding</span>
                  <span className={`text-sm font-bold font-mono block mt-1 ${outstanding > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {currencyCode} ${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Documents</span>
                  <span className="text-sm font-bold text-slate-900 font-mono block mt-1">
                    {clientDocs.length} records
                  </span>
                </div>
              </div>

              {/* Core Information Card */}
              <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-3.5 text-xs text-slate-700">
                <div className="flex items-start gap-3">
                  <Building2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Company / Entity</span>
                    <span className="text-slate-900 font-semibold">{client.name}</span>
                  </div>
                </div>

                {client.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Email Address</span>
                      <a href={`mailto:${client.email}`} className="text-slate-900 font-medium hover:underline">
                        {client.email}
                      </a>
                    </div>
                  </div>
                )}

                {client.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Phone Number</span>
                      <a href={`tel:${client.phone}`} className="text-slate-900 font-medium">
                        {client.phone}
                      </a>
                    </div>
                  </div>
                )}

                {client.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Billing Address</span>
                      <span className="text-slate-800">{client.address}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Fiji Tax Identification (TIN)</span>
                    <span className="font-mono text-slate-900 font-bold">
                      {client.tin || 'Not registered / exempt'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Coins className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Invoicing Currency</span>
                    <span className="text-slate-900 font-bold flex items-center gap-1.5 mt-0.5 font-mono">
                      <span>{currencyConf.flag}</span>
                      <span>{currencyCode}</span>
                      <span className="text-slate-500 text-xs font-normal">({currencyConf.name})</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* SaaS Subscriptions */}
              <div className="space-y-2 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 text-xs text-slate-700">
                <h4 className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" /> Active SaaS Subscriptions
                </h4>
                {(!client.subscriptions || client.subscriptions.length === 0) ? (
                  <p className="text-xs text-emerald-700/80 italic">
                    No active SaaS plan subscriptions for this client.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {client.subscriptions.map((sub) => {
                      const plan = data.services.find(s => s.id === sub.serviceId);
                      return (
                        <div key={sub.id} className="bg-white p-2.5 rounded-xl border border-emerald-100 flex justify-between items-center shadow-xs">
                          <div>
                            <span className="text-xs font-bold text-slate-900 block">{plan?.name || 'SaaS Subscription'}</span>
                            <span className="text-[10px] text-slate-400">Interval: {sub.billingInterval}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-mono font-bold text-emerald-700 block">
                              {currencyCode} ${sub.price.toLocaleString()}/{sub.billingInterval === 'annual' ? 'yr' : 'mo'}
                            </span>
                            <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                              {sub.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PORTAL ACCESS & LINKS */}
          {activeTab === 'portal' && (
            <div className="space-y-4">
              {/* Direct Access Token Link */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                      <Link2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Direct 1-Click Access Link</h4>
                      <p className="text-[11px] text-slate-500">Allows client to enter their portal with zero friction</p>
                    </div>
                  </div>
                  {client.accessToken && (
                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                      Token Active
                    </span>
                  )}
                </div>

                {client.accessToken ? (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 pl-3">
                      <input
                        type="text"
                        readOnly
                        value={directAccessUrl}
                        className="text-xs font-mono text-slate-800 bg-transparent flex-1 focus:outline-none select-all truncate"
                      />
                      <button
                        type="button"
                        onClick={(e) => onCopyAccessLink(client, e)}
                        className={`shrink-0 font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-xs ${
                          copiedClientId === client.id
                            ? 'bg-emerald-600 text-white'
                            : 'bg-sky-600 hover:bg-sky-700 text-white'
                        }`}
                      >
                        {copiedClientId === client.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenShareModal(client)}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5 text-sky-400" />
                        <span>Share Sheet & QR</span>
                      </button>

                      <a
                        href={directAccessUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Test Link in Tab</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={(e) => onGenerateAccessLink(client, e)}
                      disabled={generatingLinkId === client.id}
                      className="w-full bg-sky-600 hover:bg-sky-700 active:scale-98 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                    >
                      {generatingLinkId === client.id ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Generating Secure Token...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Generate Access Link</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Manual Passcode PIN Fallback */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Portal PIN (sign in with email + PIN)
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {hasPin === null ? '' : hasPin ? 'PIN is set' : 'No PIN set'}
                  </span>
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={clientPin}
                    onChange={(e) => setClientPin(e.target.value)}
                    inputMode="numeric"
                    placeholder="New 6–10 digit PIN"
                    className="flex-1 bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleGeneratePin}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2 px-3 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Auto PIN
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePin}
                    disabled={savingPin}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-3.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {savingPin ? 'Saving...' : 'Save PIN'}
                  </button>
                </div>
                {pinStatus && (
                  <span className="text-xs text-emerald-600 block font-semibold">{pinStatus}</span>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: INVOICES & HISTORICAL DOCUMENTS */}
          {activeTab === 'invoices' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900">Document History</h4>
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToTab('billing', `NEW_INVOICE_FOR_${client.id}`);
                  }}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Fast Invoice
                </button>
              </div>

              {clientDocs.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-medium">No quotes or invoices recorded for this client yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {clientDocs.map((doc) => {
                    const typeLabel = doc.type === 'quote' ? 'Quote' : doc.type === 'invoice' ? 'Invoice' : 'Receipt';
                    return (
                      <div 
                        key={doc.id}
                        onClick={() => {
                          onClose();
                          onNavigateToTab('billing', doc.id);
                        }}
                        className="bg-white p-3.5 rounded-2xl border border-slate-200 flex justify-between items-center cursor-pointer hover:border-slate-400 hover:shadow-sm transition-all"
                      >
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{typeLabel} #{doc.documentNumber}</span>
                          <span className="text-[11px] text-slate-400 mt-0.5 block flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {doc.issueDate}
                          </span>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <span className="text-xs font-bold text-slate-900 font-mono block">
                              {currencyCode} ${doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider mt-0.5 ${
                              doc.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              doc.status === 'sent' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {doc.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CLIENT INQUIRIES & CHAT */}
          {activeTab === 'messages' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-indigo-600" /> Client Portal Inquiries
                </h4>
                <button
                  onClick={() => client.email && fetchClientMessages(client.email)}
                  title="Refresh messages"
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMessages ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingMessages ? (
                <div className="text-center py-6">
                  <span className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin inline-block" />
                </div>
              ) : clientMessages.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80">
                  <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-medium">No messages or support inquiries yet.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {clientMessages.map((msg) => {
                    const isClient = msg.sender === 'client';
                    return (
                      <div 
                        key={msg.id}
                        className={`p-3 rounded-2xl text-xs space-y-1 ${
                          isClient 
                            ? 'bg-slate-100 border border-slate-200 text-slate-800 mr-8' 
                            : 'bg-indigo-600 text-white ml-8 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] opacity-80">
                          <span className="font-bold uppercase tracking-wider">
                            {isClient ? `${client.name} (Client)` : 'You (Consultant)'}
                          </span>
                          <span>{new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {msg.subject && msg.subject !== 'Chat Response' && (
                          <p className={`font-bold text-xs ${isClient ? 'text-slate-900' : 'text-white'}`}>
                            {msg.subject}
                          </p>
                        )}
                        <p className="leading-relaxed whitespace-pre-wrap text-xs">{msg.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Reply Form */}
              <form onSubmit={handleSendConsultantReply} className="pt-2 flex gap-2">
                <input
                  type="text"
                  value={consultantReply}
                  onChange={(e) => setConsultantReply(e.target.value)}
                  placeholder={`Reply to ${client.name}...`}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white transition-colors"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !consultantReply.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  {sendingReply ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Drawer Action Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center gap-2.5">
          <button
            onClick={() => onOpenEdit(client)}
            className="flex-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit Profile
          </button>
          <button
            onClick={() => onOpenShareModal(client)}
            className="flex-1 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-sky-600" /> Share Portal
          </button>
          <button
            onClick={() => {
              onClose();
              onNavigateToTab('billing', `NEW_INVOICE_FOR_${client.id}`);
            }}
            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> New Invoice
          </button>
        </div>
      </motion.div>
    </div>
  );
}
