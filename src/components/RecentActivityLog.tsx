import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, ArrowUpRight, CheckCircle2, FileText, DollarSign, Users, 
  Tag, ShieldCheck, Clock, Search, Filter, Download, ExternalLink,
  ChevronRight, RefreshCw, Layers, ShieldAlert, Sparkles, Check, AlertCircle,
  Building2, Send, CreditCard, Lock
} from 'lucide-react';
import { CRMData, ActivityLog, CRMDocument, Client } from '../types';

interface RecentActivityLogProps {
  data: CRMData;
  onNavigateToTab: (tab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant', selectedDocId?: string) => void;
  maxDisplay?: number;
  showFullControls?: boolean;
}

export default function RecentActivityLog({ 
  data, 
  onNavigateToTab, 
  maxDisplay = 10,
  showFullControls = true
}: RecentActivityLogProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Synthesize and merge explicit activity logs with live document/client/transaction history
  const combinedLogs = useMemo<ActivityLog[]>(() => {
    const rawLogs: ActivityLog[] = [...(data.activityLogs || [])];
    const existingLogIds = new Set(rawLogs.map(l => l.id));

    // 1. Invoices and Quotes
    (data.documents || []).forEach(doc => {
      const client = data.clients.find(c => c.id === doc.clientId);
      const clientName = client?.name || 'Client';
      
      // Sent / Created Invoices
      if (doc.type === 'invoice') {
        const synthSentId = `synth-inv-sent-${doc.id}`;
        if (!existingLogIds.has(synthSentId) && !rawLogs.some(l => l.entityId === doc.id && l.type === 'invoice_sent')) {
          rawLogs.push({
            id: synthSentId,
            type: 'invoice_sent',
            title: `Invoice #${doc.documentNumber} created`,
            description: `Invoice for ${doc.currency || data.userProfile.defaultCurrency} $${doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} issued to ${clientName}.`,
            timestamp: doc.issueDate ? `${doc.issueDate}T10:00:00Z` : new Date().toISOString(),
            entityType: 'invoice',
            entityId: doc.id,
            amount: doc.total,
            currency: doc.currency || data.userProfile.defaultCurrency,
            clientName: clientName,
            badgeColor: 'sky'
          });
        }

        // Paid Invoices
        if (doc.status === 'paid') {
          const synthPaidId = `synth-inv-paid-${doc.id}`;
          if (!existingLogIds.has(synthPaidId) && !rawLogs.some(l => l.entityId === doc.id && l.type === 'payment_received')) {
            rawLogs.push({
              id: synthPaidId,
              type: 'payment_received',
              title: `Payment received for #${doc.documentNumber}`,
              description: `Payment of ${doc.currency || data.userProfile.defaultCurrency} $${doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} recorded from ${clientName} (${doc.paymentMethod || 'Direct Transfer'}).`,
              timestamp: doc.paymentDate ? `${doc.paymentDate}T14:30:00Z` : doc.issueDate ? `${doc.issueDate}T14:30:00Z` : new Date().toISOString(),
              entityType: 'payment',
              entityId: doc.id,
              amount: doc.total,
              currency: doc.currency || data.userProfile.defaultCurrency,
              clientName: clientName,
              badgeColor: 'emerald'
            });
          }
        }
      }

      // Quotes
      if (doc.type === 'quote') {
        const synthQuoteId = `synth-quote-${doc.id}`;
        if (!existingLogIds.has(synthQuoteId) && !rawLogs.some(l => l.entityId === doc.id && l.type.startsWith('quote_'))) {
          rawLogs.push({
            id: synthQuoteId,
            type: doc.status === 'accepted' ? 'quote_accepted' : 'quote_sent',
            title: doc.status === 'accepted' ? `Quote #${doc.documentNumber} accepted` : `Quote #${doc.documentNumber} created`,
            description: `Quote for ${doc.currency || data.userProfile.defaultCurrency} $${doc.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} for ${clientName}.`,
            timestamp: doc.issueDate ? `${doc.issueDate}T09:00:00Z` : new Date().toISOString(),
            entityType: 'quote',
            entityId: doc.id,
            amount: doc.total,
            currency: doc.currency || data.userProfile.defaultCurrency,
            clientName: clientName,
            badgeColor: doc.status === 'accepted' ? 'purple' : 'amber'
          });
        }
      }
    });

    // 2. Client Profile updates
    (data.clients || []).slice(0, 5).forEach((client, idx) => {
      const synthClientId = `synth-client-${client.id}`;
      if (!existingLogIds.has(synthClientId) && !rawLogs.some(l => l.entityId === client.id && l.type.startsWith('client_'))) {
        rawLogs.push({
          id: synthClientId,
          type: 'client_updated',
          title: `Client: ${client.name}`,
          description: `Contact details and TIN (${client.tin || 'none'}) on file for ${client.name}.`,
          timestamp: client.tokenCreatedAt || new Date(Date.now() - (idx + 1) * 86400000 * 2).toISOString(),
          entityType: 'client',
          entityId: client.id,
          clientName: client.name,
          badgeColor: 'indigo'
        });
      }
    });

    // Sort descending by timestamp
    return rawLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [data.activityLogs, data.documents, data.clients, data.userProfile.defaultCurrency]);

  // Filter logs by type and search query
  const filteredLogs = useMemo(() => {
    return combinedLogs.filter(log => {
      // Type matching
      if (filterType === 'invoices' && !['invoice_sent', 'invoice_created', 'invoice_paid', 'quote_sent', 'quote_accepted'].includes(log.type)) {
        return false;
      }
      if (filterType === 'payments' && !['payment_received', 'invoice_paid'].includes(log.type)) {
        return false;
      }
      if (filterType === 'clients' && !['client_created', 'client_updated'].includes(log.type)) {
        return false;
      }
      if (filterType === 'rates' && !['rate_updated', 'service_created', 'service_updated'].includes(log.type)) {
        return false;
      }
      if (filterType === 'security' && !['security_login', 'escrow_contract'].includes(log.type)) {
        return false;
      }

      // Search matching
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = log.title.toLowerCase().includes(q);
        const matchesDesc = log.description.toLowerCase().includes(q);
        const matchesClient = log.clientName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesClient) return false;
      }

      return true;
    });
  }, [combinedLogs, filterType, searchQuery]);

  const displayedLogs = filteredLogs.slice(0, maxDisplay);

  const formatTimeAgo = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const getEventIcon = (type: ActivityLog['type']) => {
    switch (type) {
      case 'invoice_sent':
      case 'invoice_created':
        return <Send className="w-4 h-4 text-sky-600" />;
      case 'payment_received':
      case 'invoice_paid':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'quote_sent':
      case 'quote_accepted':
      case 'quote_created':
        return <FileText className="w-4 h-4 text-amber-600" />;
      case 'client_created':
      case 'client_updated':
        return <Users className="w-4 h-4 text-indigo-600" />;
      case 'rate_updated':
      case 'service_created':
      case 'service_updated':
        return <Tag className="w-4 h-4 text-amber-600" />;
      case 'security_login':
        return <ShieldCheck className="w-4 h-4 text-teal-600" />;
      case 'escrow_contract':
        return <Lock className="w-4 h-4 text-purple-600" />;
      default:
        return <Activity className="w-4 h-4 text-slate-600" />;
    }
  };

  const getBadgeClass = (type: ActivityLog['type']) => {
    switch (type) {
      case 'invoice_sent':
        return 'bg-sky-50 text-sky-700 border-sky-200/80';
      case 'payment_received':
      case 'invoice_paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
      case 'quote_sent':
      case 'quote_accepted':
        return 'bg-amber-50 text-amber-700 border-amber-200/80';
      case 'client_updated':
      case 'client_created':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
      case 'rate_updated':
      case 'service_created':
        return 'bg-orange-50 text-orange-700 border-orange-200/80';
      case 'security_login':
        return 'bg-teal-50 text-teal-700 border-teal-200/80';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200/80';
    }
  };

  const handleItemClick = (log: ActivityLog) => {
    if (log.entityType === 'invoice' || log.entityType === 'quote' || log.entityType === 'payment') {
      onNavigateToTab('billing', log.entityId);
    } else if (log.entityType === 'client') {
      onNavigateToTab('clients');
    } else if (log.entityType === 'service') {
      onNavigateToTab('services');
    }
  };

  const handleExportCsv = () => {
    const csvHeader = 'Timestamp,Event Type,Title,Description,Client,Amount,Currency,Entity ID\n';
    const csvRows = combinedLogs.map(l => {
      const safeTitle = `"${l.title.replace(/"/g, '""')}"`;
      const safeDesc = `"${l.description.replace(/"/g, '""')}"`;
      const safeClient = `"${(l.clientName || '').replace(/"/g, '""')}"`;
      return `${l.timestamp},${l.type},${safeTitle},${safeDesc},${safeClient},${l.amount || ''},${l.currency || ''},${l.entityId || ''}`;
    }).join('\n');

    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `fiji_crm_activity_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shadow-xs">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                <span>Recent activity</span>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[8.5px] font-extrabold px-2 py-0.2 rounded-full uppercase flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5" /> Activity log
                </span>
              </h3>
              <p className="text-[10.5px] text-slate-400">
                Invoices, payments, client changes and rate updates.
              </p>
            </div>
          </div>
        </div>

        {showFullControls && (
          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10.5px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download activity as CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter Tabs & Search */}
      {showFullControls && (
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 pt-0.5">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All', count: combinedLogs.length },
              { id: 'invoices', label: 'Invoices and quotes', count: combinedLogs.filter(l => ['invoice_sent', 'invoice_created', 'invoice_paid', 'quote_sent', 'quote_accepted'].includes(l.type)).length },
              { id: 'payments', label: 'Payments', count: combinedLogs.filter(l => ['payment_received', 'invoice_paid'].includes(l.type)).length },
              { id: 'clients', label: 'Clients', count: combinedLogs.filter(l => ['client_created', 'client_updated'].includes(l.type)).length },
              { id: 'rates', label: 'Rates', count: combinedLogs.filter(l => ['rate_updated', 'service_created', 'service_updated'].includes(l.type)).length },
              { id: 'security', label: 'Security', count: combinedLogs.filter(l => ['security_login', 'escrow_contract'].includes(l.type)).length }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-2.5 py-1 rounded-xl text-[10.5px] font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 border ${
                  filterType === tab.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[9px] px-1 rounded-md font-mono ${filterType === tab.id ? 'bg-slate-800 text-slate-300' : 'bg-slate-200/60 text-slate-500'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative shrink-0 md:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search activity…"
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Activity Timeline List */}
      {displayedLogs.length === 0 ? (
        <div className="p-8 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 space-y-2">
          <Clock className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs font-bold text-slate-600">No activity yet</p>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
            {searchQuery ? `Nothing matches "${searchQuery}".` : 'Invoices, payments and client changes will show up here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayedLogs.map((log) => {
            const hasClickAction = !!(log.entityId || log.entityType);
            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => hasClickAction && handleItemClick(log)}
                className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 group ${
                  hasClickAction ? 'cursor-pointer hover:border-sky-300 hover:bg-sky-50/30' : 'bg-white'
                } ${getBadgeClass(log.type)}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  {/* Event Icon Circle */}
                  <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-slate-100 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    {getEventIcon(log.type)}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-slate-900 tracking-tight group-hover:text-sky-700 transition-colors">
                        {log.title}
                      </h4>
                      {log.amount !== undefined && (
                        <span className="text-[10px] font-extrabold font-mono bg-white/80 px-1.5 py-0.2 rounded-md border border-slate-200/80 text-slate-800">
                          {log.currency || data.userProfile.defaultCurrency} ${log.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                      {log.description}
                    </p>
                    <div className="flex items-center gap-2 text-[9.5px] text-slate-400 pt-0.5 font-mono">
                      <span>{formatTimeAgo(log.timestamp)}</span>
                      <span>•</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {log.clientName && (
                        <>
                          <span>•</span>
                          <span className="text-slate-500 font-sans font-semibold truncate max-w-[120px]">{log.clientName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {hasClickAction && (
                  <div className="shrink-0 flex items-center text-slate-400 group-hover:text-sky-600 transition-colors pt-1">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Footer count indicator */}
      {filteredLogs.length > maxDisplay && (
        <div className="text-center pt-1 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 font-medium">
            Showing the latest {displayedLogs.length} of {filteredLogs.length}
          </p>
        </div>
      )}
    </div>
  );
}
