import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, User, UserPlus, Search, Phone, Mail, MapPin, ShieldCheck, 
  Trash2, Edit3, X, FileText, ChevronRight, Check, Plus,
  MessageSquare, Send, MessageCircle, Clock, AlertTriangle, RefreshCw,
  Link, Link2, Copy, Sparkles, CheckCircle2, ExternalLink, CheckCheck,
  Globe, Coins, Share2, QrCode, Smartphone, Key, Lock, Briefcase, Download,
  LayoutGrid, Table as TableIcon, Filter, Building2, CreditCard, ArrowUpDown,
  SlidersHorizontal, ArrowRight, DollarSign, CheckCircle
} from 'lucide-react';
import { CRMData, Client, CRMDocument, ClientSubscription, SupportMessage } from '../types';
import { SUPPORTED_CURRENCIES, getCurrencyConfig } from '../lib/currencies';
import { createPortalLink, revokePortalAccess } from '../lib/api';
import ClientAddEditModal from './clients/ClientAddEditModal';
import ClientShareModal from './clients/ClientShareModal';
import ClientDetailDrawer from './clients/ClientDetailDrawer';

interface ClientsViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onNavigateToTab: (tab: 'dashboard' | 'billing' | 'clients' | 'services' | 'catalogue' | 'settings', selectedDocId?: string) => void;
}

export default function ClientsView({ data, onUpdateData, onNavigateToTab }: ClientsViewProps) {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [statusFilter, setStatusFilter] = useState<'all' | 'outstanding' | 'portal_active'>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');

  // Modal & Drawer states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [sharingClient, setSharingClient] = useState<Client | null>(null);

  // Access Link Generation & Clipboard States
  const [copiedClientId, setCopiedClientId] = useState<string | null>(null);
  const [generatingLinkId, setGeneratingLinkId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ title: string; subtitle?: string; link?: string } | null>(null);

  const defaultCurrency = data.userProfile?.defaultCurrency || 'FJD';

  const copyToClipboardFallback = (text: string): boolean => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.warn('Fallback clipboard copy failed:', err);
      return false;
    }
  };

  const handleGenerateAccessLink = async (client: Client, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (!client.email) {
      setToastMessage({
        title: 'Client email needed',
        subtitle: 'Add an email address for this client before creating a portal link.'
      });
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    setGeneratingLinkId(client.id);

    // The server issues a strong random token and stores only its hash.
    let uniqueToken: string;
    try {
      uniqueToken = await createPortalLink(client);
    } catch (err: any) {
      setGeneratingLinkId(null);
      setToastMessage({
        title: 'Could not create portal link',
        subtitle: err?.message || 'Check your connection and try again.'
      });
      setTimeout(() => setToastMessage(null), 4500);
      return;
    }
    const tokenCreatedAt = new Date().toISOString();

    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const directAccessUrl = `${origin}${pathname}?token=${encodeURIComponent(uniqueToken)}`;

    const updatedClient: Client = {
      ...client,
      accessToken: uniqueToken,
      tokenCreatedAt
    };

    const updatedClients = data.clients.map(c => c.id === client.id ? updatedClient : c);
    onUpdateData({
      ...data,
      clients: updatedClients
    });

    if (selectedClient?.id === client.id) {
      setSelectedClient(updatedClient);
    }
    if (sharingClient?.id === client.id) {
      setSharingClient(updatedClient);
    }

    // 3. Copy to clipboard
    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(directAccessUrl);
        copied = true;
      } catch (_) {
        copied = copyToClipboardFallback(directAccessUrl);
      }
    } else {
      copied = copyToClipboardFallback(directAccessUrl);
    }

    setGeneratingLinkId(null);
    setCopiedClientId(client.id);

    setToastMessage({
      title: copied ? `Portal link copied` : `Portal link created`,
      subtitle: `New portal link for ${client.name}.`,
      link: directAccessUrl
    });

    setTimeout(() => {
      setCopiedClientId(null);
      setToastMessage(null);
    }, 4500);
  };

  const handleRevokeAccessLink = async (client: Client, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    try {
      if (client.email) await revokePortalAccess(client.email);
    } catch (err: any) {
      setToastMessage({
        title: 'Could not revoke access',
        subtitle: err?.message || 'Check your connection and try again.'
      });
      setTimeout(() => setToastMessage(null), 4500);
      return;
    }

    const updatedClient: Client = {
      ...client,
      accessToken: undefined,
      tokenCreatedAt: undefined
    };

    const updatedClients = data.clients.map(c => c.id === client.id ? updatedClient : c);
    onUpdateData({
      ...data,
      clients: updatedClients
    });

    if (selectedClient?.id === client.id) {
      setSelectedClient(updatedClient);
    }
    if (sharingClient?.id === client.id) {
      setSharingClient(updatedClient);
    }

    setToastMessage({
      title: 'Portal link revoked',
      subtitle: `${client.name}'s portal link and PIN no longer work.`
    });

    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCopyExistingAccessLink = async (client: Client, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (!client.accessToken) {
      return handleGenerateAccessLink(client, e);
    }

    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const directAccessUrl = `${origin}${pathname}?token=${encodeURIComponent(client.accessToken)}`;

    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(directAccessUrl);
        copied = true;
      } catch (_) {
        copied = copyToClipboardFallback(directAccessUrl);
      }
    } else {
      copied = copyToClipboardFallback(directAccessUrl);
    }

    setCopiedClientId(client.id);
    setToastMessage({
      title: copied ? `Portal link copied` : `Portal link`,
      subtitle: `Send this to ${client.name} to open their portal.`,
      link: directAccessUrl
    });

    setTimeout(() => {
      setCopiedClientId(null);
      setToastMessage(null);
    }, 4000);
  };

  const handleOpenAdd = () => {
    setEditingClient(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (client: Client, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setEditingClient(client);
    setShowAddModal(true);
  };

  const handleDeleteClient = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (confirm('Remove this client? Their past invoices are kept.')) {
      const updatedClients = data.clients.filter(c => c.id !== id);
      onUpdateData({
        ...data,
        clients: updatedClients
      });
      if (selectedClient?.id === id) {
        setSelectedClient(null);
      }
    }
  };

  const handleSaveClient = (clientData: Omit<Client, 'id'>, id?: string) => {
    if (id) {
      // Edit existing
      const updatedClients = data.clients.map(c => 
        c.id === id ? { ...c, ...clientData } : c
      );
      onUpdateData({
        ...data,
        clients: updatedClients
      });
      if (selectedClient?.id === id) {
        setSelectedClient({ id, ...clientData });
      }
    } else {
      // Create new
      const newClient: Client = {
        id: `cli-${Date.now()}`,
        ...clientData
      };
      onUpdateData({
        ...data,
        clients: [...data.clients, newClient]
      });
    }
    setShowAddModal(false);
  };

  // Helper to calculate statistics for a specific client
  const getClientStats = (clientId: string, clientCurrency?: string) => {
    const clientDocs = data.documents.filter(doc => doc.clientId === clientId);
    const invoices = clientDocs.filter(d => d.type === 'invoice');
    const targetCurrency = clientCurrency || defaultCurrency;
    
    const totalBilled = invoices.reduce((acc, d) => acc + d.total, 0);
    const paidAmount = invoices.filter(d => d.status === 'paid').reduce((acc, d) => acc + d.total, 0);
    const outstanding = Math.max(0, totalBilled - paidAmount);
    
    return {
      totalDocs: clientDocs.length,
      totalBilled,
      outstanding,
      targetCurrency,
      documents: clientDocs
    };
  };

  // Aggregated workspace KPIs
  const totalClientsCount = data.clients.length;
  const activePortalsCount = data.clients.filter(c => !!c.accessToken).length;
  const allInvoices = data.documents.filter(d => d.type === 'invoice');
  const totalBilledSum = allInvoices.reduce((sum, d) => sum + d.total, 0);
  const totalPaidSum = allInvoices.filter(d => d.status === 'paid').reduce((sum, d) => sum + d.total, 0);
  const totalOutstandingSum = Math.max(0, totalBilledSum - totalPaidSum);

  // Filtered clients
  const filteredClients = data.clients.filter(client => {
    // Search query
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || (
      client.name.toLowerCase().includes(q) ||
      (client.contactPerson && client.contactPerson.toLowerCase().includes(q)) ||
      (client.contactName && client.contactName.toLowerCase().includes(q)) ||
      (client.email && client.email.toLowerCase().includes(q)) ||
      (client.tin && client.tin.toLowerCase().includes(q)) ||
      (client.phone && client.phone.toLowerCase().includes(q)) ||
      (client.currency && client.currency.toLowerCase().includes(q))
    );

    if (!matchesSearch) return false;

    // Status filter
    if (statusFilter === 'outstanding') {
      const stats = getClientStats(client.id, client.currency);
      if (stats.outstanding <= 0) return false;
    } else if (statusFilter === 'portal_active') {
      if (!client.accessToken) return false;
    }

    // Currency filter
    if (currencyFilter !== 'all') {
      const clientCurr = client.currency || defaultCurrency;
      if (clientCurr !== currencyFilter) return false;
    }

    return true;
  });

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Client Name',
      'Contact Person',
      'Email',
      'Phone',
      'Billing Address',
      'TIN',
      'Currency',
      'Total Documents',
      'Total Invoiced',
      'Outstanding Balance',
      'Portal Access Status',
      'Portal Token'
    ];

    const rows = data.clients.map(c => {
      const stats = getClientStats(c.id, c.currency);
      return [
        `"${c.name.replace(/"/g, '""')}"`,
        `"${(c.contactPerson || c.contactName || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.phone || '').replace(/"/g, '""')}"`,
        `"${(c.address || '').replace(/"/g, '""')}"`,
        `"${(c.tin || '').replace(/"/g, '""')}"`,
        `"${c.currency || defaultCurrency}"`,
        stats.totalDocs,
        stats.totalBilled.toFixed(2),
        stats.outstanding.toFixed(2),
        c.accessToken ? 'Active' : 'Inactive',
        `"${c.accessToken || ''}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `fiji_crm_clients_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getClientInitials = (clientName: string) => {
    if (!clientName) return 'CL';
    const words = clientName.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  };

  const getAvatarBadgeClass = (name: string) => {
    const palette = [
      'bg-indigo-50 text-indigo-700 border-indigo-200',
      'bg-sky-50 text-sky-700 border-sky-200',
      'bg-emerald-50 text-emerald-700 border-emerald-200',
      'bg-violet-50 text-violet-700 border-violet-200',
      'bg-amber-50 text-amber-800 border-amber-200',
      'bg-teal-50 text-teal-700 border-teal-200',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto pb-28 font-sans">
      
      {/* 1. Header with Title and Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10.5px] uppercase tracking-widest text-slate-400 font-bold block">
            Client directory
          </span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
            <Users className="w-6 h-6 text-slate-600" />
            <span>Clients</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Contacts, TINs, invoices and portal links for each client.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleExportCSV}
            title="Download clients as CSV"
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-2xs hover:border-slate-300 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-4 rounded-xl text-xs flex items-center gap-2 transition-all active:scale-98 shadow-sm cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add client</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Clients</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{totalClientsCount}</span>
            <span className="text-xs text-slate-500 font-medium">registered</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active portals</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Globe className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{activePortalsCount}</span>
            <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {totalClientsCount > 0 ? `${Math.round((activePortalsCount / totalClientsCount) * 100)}% of clients` : '0%'}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total invoiced</span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-lg font-bold text-slate-900 font-mono tracking-tight block">
              {defaultCurrency} ${totalBilledSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-400">{allInvoices.length} invoices</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Outstanding</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              totalOutstandingSum > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className={`text-lg font-bold font-mono tracking-tight block ${
              totalOutstandingSum > 0 ? 'text-amber-600' : 'text-slate-900'
            }`}>
              {defaultCurrency} ${totalOutstandingSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-400">
              {totalOutstandingSum > 0 ? 'Unpaid' : 'All paid'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Search, Filter Chips & View Mode Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-2.5 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, contact, email, phone or TIN"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-9 text-xs font-sans text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-slate-900 transition-all font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 p-0.5 rounded-md cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Controls: Currency Select + View Mode Toggle */}
          <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
            {/* Currency Filter Dropdown */}
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium py-2 px-3 rounded-xl focus:outline-none focus:border-slate-900 transition-all cursor-pointer"
            >
              <option value="all">All currencies</option>
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code}
                </option>
              ))}
            </select>

            {/* View Mode Toggle: Table vs Grid */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Table view"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Card view"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filter:</span>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            All clients ({data.clients.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('outstanding')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'outstanding'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/70'
            }`}
          >
            <span>Balance due</span>
            {totalOutstandingSum > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('portal_active')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'portal_active'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/70'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Portal active ({activePortalsCount})</span>
          </button>

          {filteredClients.length !== data.clients.length && (
            <span className="text-xs text-slate-400 ml-auto font-medium">
              Showing {filteredClients.length} of {data.clients.length} clients
            </span>
          )}
        </div>
      </div>

      {/* 4. Clients Directory Display (Empty state OR Table OR Cards) */}
      {filteredClients.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-xs">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No clients to show</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
            {searchQuery
              ? `No clients match "${searchQuery}". Try another search or clear the filters.`
              : 'Add your first client to start sending invoices and portal links.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {(searchQuery || statusFilter !== 'all' || currencyFilter !== 'all') ? (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setCurrencyFilter('all');
                }}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-xl transition-all cursor-pointer"
              >
                Clear filters
              </button>
            ) : (
              <button
                onClick={handleOpenAdd}
                className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-4 rounded-xl transition-all cursor-pointer shadow-xs"
              >
                Add client
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW - Sophisticated, executive layout for Web/Desktop */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 font-bold">Client</th>
                  <th className="py-3.5 px-4 font-bold">Contact</th>
                  <th className="py-3.5 px-4 font-bold">Currency and TIN</th>
                  <th className="py-3.5 px-4 font-bold">Invoiced / outstanding</th>
                  <th className="py-3.5 px-4 font-bold">Portal</th>
                  <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredClients.map((client) => {
                  const stats = getClientStats(client.id, client.currency);
                  const clientCurrConf = getCurrencyConfig(client.currency || defaultCurrency);
                  const representative = client.contactPerson || client.contactName;

                  return (
                    <tr 
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      {/* 1. Client Organization Name & Initials */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${getAvatarBadgeClass(client.name)} shadow-2xs`}>
                            {getClientInitials(client.name)}
                          </div>
                          <div className="min-w-0 max-w-xs sm:max-w-sm">
                            <h4 className="font-semibold text-slate-900 group-hover:text-slate-950 transition-colors truncate">
                              {client.name}
                            </h4>
                            {client.address && (
                              <p className="text-[11px] text-slate-400 truncate mt-0.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span>{client.address}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Contact Details */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {representative ? (
                            <span className="font-semibold text-slate-900 flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{representative}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">No contact</span>
                          )}
                          {client.email && (
                            <p className="text-[11px] text-slate-500 font-mono truncate">
                              {client.email}
                            </p>
                          )}
                          {client.phone && (
                            <p className="text-[11px] text-slate-400 font-mono truncate">
                              {client.phone}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 3. Currency & Tax TIN */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200 font-mono">
                            <span>{clientCurrConf.flag}</span>
                            <span>{client.currency || defaultCurrency}</span>
                          </span>
                          {client.tin ? (
                            <div className="flex items-center gap-1 text-[10.5px] font-mono text-slate-600 font-medium">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>TIN: {client.tin}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 block italic">No TIN recorded</span>
                          )}
                        </div>
                      </td>

                      {/* 4. Financials */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-bold text-slate-900 font-mono">
                              {stats.targetCurrency} ${stats.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              ({stats.totalDocs} {stats.totalDocs === 1 ? 'doc' : 'docs'})
                            </span>
                          </div>
                          {stats.outstanding > 0 ? (
                            <span className="inline-block bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200/80 font-mono">
                              Due: {stats.targetCurrency} ${stats.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="inline-block bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-emerald-200/80">
                              Settled
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Portal Access */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {client.accessToken ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setSharingClient(client)}
                                title="Share portal link or QR code"
                                className="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                              >
                                <Share2 className="w-3.5 h-3.5 text-sky-600" />
                                <span>Share portal</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleCopyExistingAccessLink(client, e)}
                                title="Copy portal link"
                                className={`p-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                                  copiedClientId === client.id
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                }`}
                              >
                                {copiedClientId === client.id ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleGenerateAccessLink(client, e)}
                              disabled={generatingLinkId === client.id}
                              title="Create a portal link"
                              className="bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <Link className="w-3.5 h-3.5 text-slate-400" />
                              <span>{generatingLinkId === client.id ? 'Creating…' : 'Portal link'}</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 6. Row Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedClient(client)}
                            title="View client"
                            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleOpenEdit(client, e)}
                            title="Edit client"
                            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteClient(client.id, e)}
                            title="Delete client"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID / CARDS VIEW - Properly structured multi-row cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => {
            const stats = getClientStats(client.id, client.currency);
            const clientCurrConf = getCurrencyConfig(client.currency || defaultCurrency);
            const representative = client.contactPerson || client.contactName;

            return (
              <motion.div
                key={client.id}
                layoutId={`client-card-${client.id}`}
                onClick={() => setSelectedClient(client)}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between group space-y-4"
              >
                {/* Card Top: Avatar, Name (Full Width), Badges & Row Actions */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${getAvatarBadgeClass(client.name)} shadow-2xs`}>
                        {getClientInitials(client.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-slate-950 transition-colors leading-snug">
                          {client.name}
                        </h3>
                        {representative && (
                          <p className="text-xs text-slate-600 font-medium truncate mt-0.5 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{representative}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleOpenEdit(client, e)}
                        className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Edit client"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClient(client.id, e)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete client"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Meta Tags: Currency & TIN */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3">
                    <span className="bg-slate-100 text-[10px] text-slate-800 font-bold px-2 py-0.5 rounded border border-slate-200/80 flex items-center gap-1 font-mono">
                      <span>{clientCurrConf.flag}</span>
                      <span>{client.currency || defaultCurrency}</span>
                    </span>
                    {client.tin && (
                      <span className="bg-emerald-50 text-[10px] text-emerald-800 font-medium px-2 py-0.5 rounded border border-emerald-200/80 font-mono flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>TIN: {client.tin}</span>
                      </span>
                    )}
                    {client.accessToken && (
                      <span className="bg-sky-50 text-[10px] text-sky-800 font-medium px-2 py-0.5 rounded border border-sky-200/80 flex items-center gap-1">
                        <Globe className="w-3 h-3 text-sky-600" />
                        <span>Portal active</span>
                      </span>
                    )}
                  </div>

                  {/* Contact Snippets */}
                  <div className="mt-3.5 space-y-1 text-xs text-slate-500">
                    {client.email && (
                      <p className="truncate flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px]">{client.email}</span>
                      </p>
                    )}
                    {client.phone && (
                      <p className="truncate flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px]">{client.phone}</span>
                      </p>
                    )}
                    {client.address && (
                      <p className="truncate flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{client.address}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Financials Summary Bar */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Invoiced ({stats.totalDocs})
                    </span>
                    <span className="text-xs font-bold text-slate-900 font-mono block mt-0.5">
                      {stats.targetCurrency} ${stats.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Outstanding
                    </span>
                    {stats.outstanding > 0 ? (
                      <span className="text-xs font-bold text-amber-600 font-mono block mt-0.5">
                        Due: ${stats.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-700 block mt-0.5">
                        All paid
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                  {/* Share Portal Button */}
                  <button
                    type="button"
                    onClick={() => setSharingClient(client)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>{client.accessToken ? 'Share portal' : 'Portal link'}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {client.accessToken && (
                      <button
                        type="button"
                        onClick={(e) => handleCopyExistingAccessLink(client, e)}
                        title="Copy portal link"
                        className={`p-1.5 rounded-xl border text-xs transition-all cursor-pointer ${
                          copiedClientId === client.id
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {copiedClientId === client.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedClient(client)}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                    >
                      <span>Details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 5. Client Dossier Slide-over Drawer (Desktop & Mobile) */}
      <AnimatePresence>
        {selectedClient && (
          <ClientDetailDrawer
            client={selectedClient}
            data={data}
            onClose={() => setSelectedClient(null)}
            onUpdateData={onUpdateData}
            onNavigateToTab={onNavigateToTab}
            onOpenEdit={(client) => handleOpenEdit(client)}
            onOpenShareModal={(client) => setSharingClient(client)}
            onGenerateAccessLink={handleGenerateAccessLink}
            onRevokeAccessLink={handleRevokeAccessLink}
            onCopyAccessLink={handleCopyExistingAccessLink}
            copiedClientId={copiedClientId}
            generatingLinkId={generatingLinkId}
          />
        )}
      </AnimatePresence>

      {/* 6. Add / Edit Client Modal */}
      <ClientAddEditModal
        isOpen={showAddModal}
        editingClient={editingClient}
        defaultCurrency={defaultCurrency}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveClient}
      />

      {/* 7. Public Client Portal & QR Sharing Modal */}
      <AnimatePresence>
        {sharingClient && (
          <ClientShareModal
            client={sharingClient}
            onClose={() => setSharingClient(null)}
            onGenerateAccessLink={handleGenerateAccessLink}
            onRevokeAccessLink={handleRevokeAccessLink}
            onCopyAccessLink={handleCopyExistingAccessLink}
            copiedClientId={copiedClientId}
            generatingLinkId={generatingLinkId}
          />
        )}
      </AnimatePresence>

      {/* 8. Floating Toast Notification Banner */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-xl border border-slate-700 flex items-start gap-3"
          >
            <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg shrink-0 mt-0.5">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h5 className="text-xs font-bold text-white tracking-tight">{toastMessage.title}</h5>
              {toastMessage.subtitle && (
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{toastMessage.subtitle}</p>
              )}
              {toastMessage.link && (
                <span className="text-[10px] font-mono text-sky-300 block truncate mt-1.5 bg-slate-800/90 px-2 py-1 rounded border border-slate-700 select-all">
                  {toastMessage.link}
                </span>
              )}
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
