import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Filter, ShieldCheck, Star, MapPin, Phone, Mail, Sparkles,
  Calendar, Clock, CheckCircle2, DollarSign, ArrowRight, ExternalLink,
  Building2, User, Globe, Tag, X, Check, AlertCircle, MessageSquare,
  Lock, Eye, EyeOff, Layers, Briefcase, ChevronRight, FileText,
  Smartphone, Wallet, ArrowUpRight, HelpCircle, RefreshCw
} from 'lucide-react';
import { CRMData, Business, DirectoryBooking, DirectoryListing, PlanTier } from '../types';
import { auth } from '../lib/firebase';
import { suggestDocumentNumber } from '../lib/documentNumbers';
import {
  fetchDirectoryListings, fetchDirectoryBookings, publishDirectoryListing, unpublishDirectoryListing,
  requestDirectoryBooking, updateDirectoryBookingStatus
} from '../lib/api';
import DateInput from './DateInput';
import SubscriptionPaywallModal from './SubscriptionPaywallModal';

interface DirectoryViewProps {
  data: CRMData;
  onUpdateData: (newData: CRMData) => void;
  onOpenAdminPanel?: () => void;
  onNavigateToTab?: (tab: 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects', selectedDocId?: string) => void;
}

export default function DirectoryView({ data, onUpdateData, onOpenAdminPanel, onNavigateToTab }: DirectoryViewProps) {
  const [showPaywall, setShowPaywall] = useState(false);
  // Navigation tabs within directory view
  const [activeTab, setActiveTab] = useState<'directory' | 'received_bookings' | 'my_bookings'>('directory');
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedCity, setSelectedCity] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'rating' | 'rate_low' | 'rate_high' | 'name'>('name');

  // Modals state
  const [selectedBusinessForProfile, setSelectedBusinessForProfile] = useState<Business | null>(null);
  const [selectedBusinessForBooking, setSelectedBusinessForBooking] = useState<Business | null>(null);
  const [bookingPreselectedService, setBookingPreselectedService] = useState<string>('');

  // Booking Form State
  const [bookingClientName, setBookingClientName] = useState(data.userProfile.name || '');
  const [bookingClientEmail, setBookingClientEmail] = useState(data.userProfile.email || '');
  const [bookingClientPhone, setBookingClientPhone] = useState(data.userProfile.phone || '');
  const [bookingDate, setBookingDate] = useState(() => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    return soon.toISOString().split('T')[0];
  });
  const [bookingTime, setBookingTime] = useState('10:00 AM');
  const [bookingMeetingType, setBookingMeetingType] = useState<'zoom_video' | 'in_person' | 'phone_call'>('zoom_video');
  const [bookingServiceName, setBookingServiceName] = useState('');
  const [bookingScope, setBookingScope] = useState('');
  const [bookingBudget, setBookingBudget] = useState<number | ''>('');
  const [bookingPaymentMethod, setBookingPaymentMethod] = useState<'mpaisa' | 'mycash' | 'bank_transfer'>('mpaisa');
  const [bookingLocation, setBookingLocation] = useState('');
  
  // Status message state
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Shared directory data from the server
  const myUid = auth.currentUser?.uid || '';
  const [listings, setListings] = useState<DirectoryListing[]>([]);
  const [sentBookings, setSentBookings] = useState<DirectoryBooking[]>([]);
  const [receivedBookingsList, setReceivedBookingsList] = useState<DirectoryBooking[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [savingListing, setSavingListing] = useState(false);

  const refreshDirectory = useCallback(async () => {
    try {
      const [l, b] = await Promise.all([fetchDirectoryListings(), fetchDirectoryBookings()]);
      setListings(l);
      setSentBookings(b.sent);
      setReceivedBookingsList(b.received);
      setDirectoryError(null);
    } catch (err: any) {
      setDirectoryError(err?.message || 'Could not load the directory.');
    } finally {
      setLoadingDirectory(false);
    }
  }, []);

  useEffect(() => { refreshDirectory(); }, [refreshDirectory]);

  // Active user plan
  const activePlan: PlanTier = data.platformSettings?.activePlan || 'free';
  const isPayingUser = activePlan === 'pro' || activePlan === 'premium';

  // Active user's primary business and its published listing (if any)
  const userPrimaryBiz = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const myListing = listings.find(l => l.uid === myUid);
  const isUserBizPublic = Boolean(myListing);

  // Categories list
  const categories = useMemo(() => [
    'All',
    ...(data.platformSettings?.directoryCategories || [
      'Software & Web Development',
      'Creative & Graphic Design',
      'Digital Marketing & Social Media',
      'Tourism & Hospitality Consulting',
      'Financial, Tax & Legal Services',
      'Photography & Video Production',
      'Event Management & MC',
      'Trades, Plumbing & Technical Contracting',
      'General Freelance Consulting'
    ])
  ], [data.platformSettings?.directoryCategories]);

  // Cities list for Fiji
  const cities = ['All', 'Suva', 'Nadi', 'Lautoka', 'Pacific Harbour', 'Savusavu', 'Denarau Island', 'Labasa', 'Coral Coast'];

  // Listings shown as Business cards. `id` is the listing owner's uid (used for bookings).
  const allBusinesses = useMemo<Business[]>(() => listings.map(l => ({
    id: l.uid,
    name: l.name,
    brandSlogan: l.brandSlogan,
    category: l.category,
    city: l.city,
    address: l.city || '',
    directoryBio: l.directoryBio,
    directorySpecialties: l.directorySpecialties,
    startingRate: l.startingRate ?? undefined,
    rateUnit: l.rateUnit,
    currency: l.currency,
    email: l.email || '',
    phone: l.phone || '',
    colorTheme: l.colorTheme || '#0284c7',
    logoType: l.logoType,
    logoSymbol: l.logoSymbol,
    logoText: l.logoText,
    logoUrl: l.logoUrl,
    tin: '',
    bankDetails: '',
    type: 'studio',
    isPublicDirectoryListed: true
  } as Business)), [listings]);

  // Filtered businesses according to search, category and city
  const visibleBusinesses = useMemo(() => {
    return allBusinesses.filter(biz => {
      if (selectedCategory !== 'All' && biz.category !== selectedCategory) {
        return false;
      }

      if (selectedCity !== 'All') {
        const matchesCity = biz.city?.toLowerCase().includes(selectedCity.toLowerCase());
        if (!matchesCity) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const haystack = [biz.name, biz.brandSlogan, biz.directoryBio, biz.category, ...(biz.directorySpecialties || [])]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'rate_low') {
        return (a.startingRate ?? Infinity) - (b.startingRate ?? Infinity);
      }
      if (sortBy === 'rate_high') {
        return (b.startingRate ?? -1) - (a.startingRate ?? -1);
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [allBusinesses, selectedCategory, selectedCity, searchQuery, sortBy]);

  const receivedBookings = receivedBookingsList;
  const outboundBookings = sentBookings;

  // Publish, update or hide the user's business in the shared directory
  const listingPayload = (biz: Business): Partial<DirectoryListing> => ({
    businessId: biz.id,
    name: biz.name,
    brandSlogan: biz.brandSlogan,
    category: biz.category,
    city: biz.city || biz.address?.split(',').slice(-2).join(',').trim() || '',
    directoryBio: biz.directoryBio,
    directorySpecialties: biz.directorySpecialties,
    startingRate: biz.startingRate ?? null,
    rateUnit: biz.rateUnit,
    currency: biz.currency,
    email: biz.email,
    phone: biz.phone,
    colorTheme: biz.colorTheme,
    logoType: biz.logoType,
    logoSymbol: biz.logoSymbol,
    logoText: biz.logoText,
    logoUrl: biz.logoUrl
  });

  const handleToggleUserPublicStatus = async () => {
    if (!isPayingUser) {
      showToast('A directory listing needs a Pro or Premium plan (free during early access).', 'error');
      return;
    }
    if (!userPrimaryBiz) return;
    setSavingListing(true);
    try {
      if (isUserBizPublic) {
        await unpublishDirectoryListing();
        showToast(`"${userPrimaryBiz.name}" is hidden from the directory.`, 'success');
      } else {
        await publishDirectoryListing(listingPayload(userPrimaryBiz));
        showToast(`"${userPrimaryBiz.name}" is now listed in the directory.`, 'success');
      }
      await refreshDirectory();
    } catch (err: any) {
      showToast(err?.message || 'Could not update your listing.', 'error');
    } finally {
      setSavingListing(false);
    }
  };

  const handleRefreshMyListing = async () => {
    if (!userPrimaryBiz) return;
    setSavingListing(true);
    try {
      await publishDirectoryListing(listingPayload(userPrimaryBiz));
      await refreshDirectory();
      showToast('Your listing now matches your business profile.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update your listing.', 'error');
    } finally {
      setSavingListing(false);
    }
  };

  // Open booking modal for a business
  const handleOpenBookingModal = (biz: Business, serviceName: string = '') => {
    if (biz.id === myUid) {
      showToast("That's your own listing.", 'info');
      return;
    }
    setSelectedBusinessForBooking(biz);
    setBookingServiceName(serviceName || biz.directorySpecialties?.[0] || '');
    setBookingBudget(biz.startingRate ?? '');
    setBookingScope('');
  };

  // Submit a booking request to the listing owner
  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusinessForBooking) return;
    if (!bookingClientName || !bookingClientEmail) {
      showToast('Please provide your contact name and email.', 'error');
      return;
    }

    try {
      const booking = await requestDirectoryBooking({
        providerUid: selectedBusinessForBooking.id,
        serviceName: bookingServiceName,
        clientName: bookingClientName,
        clientEmail: bookingClientEmail,
        clientPhone: bookingClientPhone,
        bookingDate,
        preferredTime: bookingTime,
        projectScope: bookingScope,
        budgetEstimate: bookingBudget === '' ? undefined : Number(bookingBudget),
        meetingType: bookingMeetingType,
        paymentMethod: bookingPaymentMethod,
        location: bookingLocation
      });
      setSentBookings(prev => [booking, ...prev]);
      setSelectedBusinessForBooking(null);
      showToast(`Booking request ${booking.bookingRef} sent to ${selectedBusinessForBooking.name}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not send the booking request.', 'error');
    }
  };

  // Update booking status (provider: accept/decline/complete, requester: cancel)
  const handleUpdateBookingStatus = async (bookingId: string, newStatus: DirectoryBooking['status']) => {
    try {
      await updateDirectoryBookingStatus(bookingId, newStatus);
      const apply = (list: DirectoryBooking[]) => list.map(b => b.id === bookingId ? { ...b, status: newStatus } : b);
      setReceivedBookingsList(apply);
      setSentBookings(apply);
      showToast(`Booking ${newStatus}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not update the booking.', 'error');
    }
  };

  // Convert an accepted booking into a draft invoice for review
  const handleConvertBookingToInvoice = (booking: DirectoryBooking) => {
    if (!onNavigateToTab) return;

    let client = data.clients.find(c => c.email && c.email.toLowerCase() === booking.clientEmail.toLowerCase());
    const updatedClients = [...data.clients];

    if (!client) {
      client = {
        id: `cli-${Date.now()}`,
        name: booking.clientName,
        email: booking.clientEmail,
        phone: booking.clientPhone,
        address: booking.location || '',
        tin: ''
      };
      updatedClients.push(client);
    }

    const subtotal = booking.budgetEstimate || 0;
    const vatRate = data.userProfile.defaultVatRate ?? 12.5;
    const vatAmount = Number(((subtotal * vatRate) / 100).toFixed(2));
    const total = subtotal + vatAmount;

    const newDocId = `doc-${Date.now()}`;
    const documentNumber = suggestDocumentNumber(data, 'invoice', data.activeBusinessId) || `INV-${booking.bookingRef}`;
    const newInvoice = {
      id: newDocId,
      type: 'invoice' as const,
      documentNumber,
      businessId: data.activeBusinessId,
      clientId: client.id,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: booking.bookingDate || new Date().toISOString().split('T')[0],
      items: [
        {
          id: `item-${Date.now()}`,
          name: booking.serviceName,
          description: booking.projectScope,
          quantity: 1,
          rate: subtotal,
          total: subtotal
        }
      ],
      subtotal,
      vatRate,
      vatAmount,
      total,
      // Draft so the amounts can be checked before it goes to the client.
      status: 'draft' as const,
      notes: `From directory booking ${booking.bookingRef}.`,
      updatedAt: new Date().toISOString()
    };

    onUpdateData({
      ...data,
      clients: updatedClients,
      documents: [newInvoice as any, ...data.documents]
    });

    showToast(`Draft invoice ${documentNumber} created. Review it before sending.`, 'success');
    onNavigateToTab('billing', newDocId);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto pb-28 font-sans">
      
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-5 right-5 z-50 p-4 rounded-xl shadow-lg border flex items-center gap-3 text-xs font-semibold max-w-md ${
              toastMessage.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' :
              toastMessage.type === 'info' ? 'bg-sky-50 text-sky-800 border-sky-200' :
              'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            {toastMessage.type === 'error' ? <AlertCircle className="w-4 h-4 text-red-600 shrink-0" /> :
             toastMessage.type === 'info' ? <Sparkles className="w-4 h-4 text-sky-600 shrink-0" /> :
             <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950 text-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-sky-500/20 text-sky-300 text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border border-sky-400/30 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" /> Frilensa Directory
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-400/30">
              Direct Booking Requests
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
            Fiji Business & Service Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Find Fijian freelancers, studios and service businesses that use Frilensa, and send them a booking request. They reply from their own Frilensa workspace.
          </p>

          {/* Navigation View Switcher */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              onClick={() => setActiveTab('directory')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'directory'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Explore Providers ({visibleBusinesses.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('received_bookings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 relative ${
                activeTab === 'received_bookings'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Received Bookings</span>
              {receivedBookings.filter(b => b.status === 'pending').length > 0 && (
                <span className="bg-amber-400 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">
                  {receivedBookings.filter(b => b.status === 'pending').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('my_bookings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'my_bookings'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>My Outbound Bookings ({outboundBookings.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* User's Business Directory Visibility Status Card */}
      <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`p-3 rounded-xl ${isUserBizPublic ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
              {isUserBizPublic ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900">
                  {userPrimaryBiz?.name || 'Your Workspace Business'}
                </h3>
                <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                  isPayingUser 
                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                    : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                }`}>
                  {activePlan.toUpperCase()} PLAN
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-normal">
                {isPayingUser
                  ? isUserBizPublic
                    ? 'Your business is listed. Other Frilensa users can find it and send you booking requests. Use "Update listing" after changing your business profile.'
                    : 'Your business is not listed in the directory.'
                  : 'Directory listings are part of the Pro and Premium plans (free to switch to during early access).'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isPayingUser ? (
              <>
              {isUserBizPublic && (
                <button
                  type="button"
                  onClick={handleRefreshMyListing}
                  disabled={savingListing}
                  className="px-3 py-2 rounded-xl text-xs font-bold border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
                >
                  Update listing
                </button>
              )}
              <button
                type="button"
                onClick={handleToggleUserPublicStatus}
                disabled={savingListing}
                className={`disabled:opacity-50 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                  isUserBizPublic
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-900 text-white'
                }`}
              >
                {isUserBizPublic ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Public in Directory (Click to Hide)</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Make My Profile Public</span>
                  </>
                )}
              </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowPaywall(true)}
                className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Upgrade to Pro to Get Listed</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TAB 1: EXPLORE PROVIDERS & DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="space-y-6">
          
          {/* Search, Category, City & Sort Bar */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200 shadow-xs space-y-4">
            
            {/* Search row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by business name, skill (e.g., React, Photography, Tax), TIN, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-50 hover:bg-zinc-100/70 focus:bg-white border border-zinc-200 rounded-xl pl-9.5 pr-4 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* City selector */}
              <div className="w-full sm:w-48">
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs text-zinc-800 font-medium focus:outline-none focus:border-sky-600"
                >
                  <option value="All">📍 All Fiji Locations</option>
                  {cities.filter(c => c !== 'All').map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              {/* Sort selector */}
              <div className="w-full sm:w-44">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs text-zinc-800 font-medium focus:outline-none focus:border-sky-600"
                >
                  <option value="name">A–Z</option>
                  <option value="rate_low">💲 Rate: Low to High</option>
                  <option value="rate_high">💲 Rate: High to Low</option>
                  <option value="name">🔤 Name (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Service Category</span>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Result count */}
            <div className="flex items-center justify-end pt-2 border-t border-zinc-100 text-xs">
              <span className="text-zinc-400 text-[11px]">
                Showing <strong>{visibleBusinesses.length}</strong> listed business{visibleBusinesses.length === 1 ? '' : 'es'}
              </span>
            </div>
          </div>

          {/* Business Cards Grid */}
          {visibleBusinesses.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-zinc-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-zinc-800">
                {loadingDirectory ? 'Loading the directory…' : directoryError ? 'Directory unavailable' : allBusinesses.length === 0 ? 'No businesses listed yet' : 'No matches'}
              </h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                {directoryError
                  ? directoryError
                  : allBusinesses.length === 0
                    ? 'The directory is new. List your business above to be one of the first that clients can find and book.'
                    : 'No listed businesses matched your filters. Try clearing your search or changing the category or location.'}
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setSelectedCity('All');
                  refreshDirectory();
                }}
                className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold hover:bg-zinc-800 transition-all inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleBusinesses.map((biz) => {
                const isUserOwnBiz = biz.id === myUid;
                return (
                  <motion.div
                    key={biz.id}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden group hover:shadow-md ${
                      isUserOwnBiz ? 'border-sky-300 ring-2 ring-sky-500/20' : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    {/* Top Color Accent Header */}
                    <div 
                      className="h-2.5 w-full"
                      style={{ backgroundColor: biz.colorTheme || '#0284c7' }}
                    />

                    <div className="p-5 space-y-4 flex-1">
                      {/* Brand & Badge row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-xs"
                            style={{ backgroundColor: biz.colorTheme || '#0284c7' }}
                          >
                            {biz.logoType === 'text' ? (
                              <span className="text-[10px] font-mono tracking-tight">{biz.logoText?.slice(0, 4) || 'BIZ'}</span>
                            ) : (
                              <span>{biz.name.charAt(0)}</span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-bold text-sm text-zinc-900 line-clamp-1 group-hover:text-sky-600 transition-colors">
                                {biz.name}
                              </h3>
                            </div>
                            <span className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span className="line-clamp-1">{biz.city || biz.address || 'Suva, Fiji'}</span>
                            </span>
                          </div>
                        </div>


                      </div>

                      {/* Brand Slogan */}
                      {biz.brandSlogan && (
                        <p className="text-xs font-medium text-zinc-700 italic line-clamp-1">
                          "{biz.brandSlogan}"
                        </p>
                      )}

                      {/* Bio Summary */}
                      <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
                        {biz.directoryBio || ''}
                      </p>

                      {/* Specialty Tags */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(biz.directorySpecialties || []).slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="bg-zinc-100 text-zinc-700 text-[10px] font-medium px-2 py-0.5 rounded-md"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Rating & Rates Row */}
                      <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                        <span className="text-[10px] text-zinc-400">{biz.category || 'Services'}</span>

                        <div className="text-right">
                          <span className="text-[10px] text-zinc-400 block font-medium">Starting from</span>
                          <span className="text-xs font-bold text-zinc-900 font-mono">
                            {biz.startingRate != null
                              ? <>{biz.currency || 'FJD'} ${biz.startingRate.toFixed(2)}<span className="text-[10px] text-zinc-400 font-normal">/{biz.rateUnit || 'Hour'}</span></>
                              : 'Ask for a quote'}
                          </span>
                        </div>
                      </div>

                      {/* Payment badges */}
                      <div className="flex items-center gap-1.5 text-[9px] font-semibold text-zinc-400">
                        <span>Accepts:</span>
                        {biz.mPaisaId && (
                          <span className="bg-red-50 text-red-700 px-1.5 py-0.2 rounded border border-red-200">M-Paisa</span>
                        )}
                        {biz.myCashId && (
                          <span className="bg-sky-50 text-sky-700 px-1.5 py-0.2 rounded border border-sky-200">MyCash</span>
                        )}
                        <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.2 rounded">Bank Wire</span>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="p-4 bg-zinc-50/80 border-t border-zinc-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedBusinessForProfile(biz)}
                        className="flex-1 px-3 py-2 bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all text-center"
                      >
                        View Profile
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenBookingModal(biz)}
                        className="flex-1 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-xs"
                      >
                        <span>Book Service</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RECEIVED BOOKINGS (FOR FREELANCERS) */}
      {activeTab === 'received_bookings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-zinc-900">Received Client Inquiries & Bookings</h2>
              <p className="text-xs text-zinc-500">
                Manage incoming client bookings submitted through the Fiji Service Directory.
              </p>
            </div>
            <span className="bg-sky-50 text-sky-700 text-xs font-bold px-3 py-1 rounded-lg border border-sky-200">
              {receivedBookings.length} Total Bookings
            </span>
          </div>

          {receivedBookings.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 border border-zinc-200 text-center space-y-3">
              <Calendar className="w-10 h-10 text-zinc-300 mx-auto" />
              <h3 className="text-sm font-bold text-zinc-800">No Booking Inquiries Yet</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Make sure your business profile is set to Public so clients across Fiji can discover your services and book.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {receivedBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-xs space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                          {booking.bookingRef}
                        </span>
                        <h3 className="font-bold text-sm text-zinc-900">{booking.serviceName}</h3>
                      </div>
                      <span className="text-[10px] text-zinc-400 mt-0.5 block">
                        Received on {new Date(booking.createdAt).toLocaleDateString()} for appointment on <strong>{booking.bookingDate} at {booking.preferredTime}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${
                        booking.status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        booking.status === 'declined' || booking.status === 'cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                        booking.status === 'completed' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {booking.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Client details & Scope */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="bg-zinc-50 p-3 rounded-xl space-y-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase block">Client Contact</span>
                      <p className="font-bold text-zinc-900">{booking.clientName}</p>
                      <p className="text-zinc-600">{booking.clientEmail}</p>
                      <p className="text-zinc-600 font-mono">{booking.clientPhone}</p>
                    </div>

                    <div className="bg-zinc-50 p-3 rounded-xl space-y-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase block">Meeting & Payment</span>
                      <p className="font-semibold text-zinc-800 capitalize">
                        Format: {booking.meetingType?.replace('_', ' ') || 'Zoom Video'}
                      </p>
                      <p className="text-zinc-600">
                        Payment: <strong className="uppercase">{booking.paymentMethod || 'M-Paisa'}</strong>
                      </p>
                      <p className="font-mono font-bold text-emerald-600">
                        Budget: FJD ${(booking.budgetEstimate || 0).toFixed(2)}
                      </p>
                    </div>

                    <div className="bg-zinc-50 p-3 rounded-xl space-y-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase block">Project Scope</span>
                      <p className="text-zinc-700 text-[11px] leading-relaxed line-clamp-3">
                        {booking.projectScope}
                      </p>
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    {booking.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleUpdateBookingStatus(booking.id, 'declined')}
                          className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold rounded-lg transition-all"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateBookingStatus(booking.id, 'accepted')}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-xs"
                        >
                          Accept Booking
                        </button>
                      </>
                    )}

                    {booking.status === 'accepted' && (
                      <button
                        type="button"
                        onClick={() => handleConvertBookingToInvoice(booking)}
                        className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1 shadow-xs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Generate Fiji Tax Invoice</span>
                      </button>
                    )}

                    <a
                      href={`mailto:${booking.clientEmail}?subject=Frilensa Booking Confirmation - ${booking.bookingRef}`}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email Client</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MY OUTBOUND BOOKINGS */}
      {activeTab === 'my_bookings' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900">My Outbound Provider Bookings</h2>
            <p className="text-xs text-zinc-500">
              Services and appointments you booked with other verified Fiji service providers.
            </p>
          </div>

          {outboundBookings.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 border border-zinc-200 text-center space-y-3">
              <Clock className="w-10 h-10 text-zinc-300 mx-auto" />
              <h3 className="text-sm font-bold text-zinc-800">No Outbound Bookings</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Browse the directory to discover talented Fiji consultants, photographers, and developers.
              </p>
              <button
                onClick={() => setActiveTab('directory')}
                className="px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Browse Directory
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {outboundBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded mr-2">
                        {booking.bookingRef}
                      </span>
                      <span className="font-bold text-zinc-900 text-sm">{booking.businessName}</span>
                    </div>
                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                      booking.status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      booking.status === 'declined' || booking.status === 'cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {booking.status}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-600 space-y-1">
                    <p><strong>Service:</strong> {booking.serviceName}</p>
                    <p><strong>Scheduled Date:</strong> {booking.bookingDate} at {booking.preferredTime}</p>
                    <p><strong>Project Scope:</strong> {booking.projectScope}</p>
                  </div>
                  {(booking.status === 'pending' || booking.status === 'accepted') && (
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleUpdateBookingStatus(booking.id, 'cancelled')}
                        className="text-[11px] font-bold text-red-600 hover:text-red-800 cursor-pointer"
                      >
                        Cancel request
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: BUSINESS PROFILE MODAL */}
      <AnimatePresence>
        {selectedBusinessForProfile && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-200"
            >
              {/* Profile Top Banner */}
              <div 
                className="h-24 w-full relative p-6 flex items-end justify-between"
                style={{ backgroundColor: selectedBusinessForProfile.colorTheme || '#0284c7' }}
              >
                <button
                  onClick={() => setSelectedBusinessForProfile(null)}
                  className="absolute top-4 right-4 bg-black/30 hover:bg-black/50 text-white p-1.5 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 -mt-12">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-md border-4 border-white"
                      style={{ backgroundColor: selectedBusinessForProfile.colorTheme || '#0284c7' }}
                    >
                      {selectedBusinessForProfile.name.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-zinc-900">{selectedBusinessForProfile.name}</h2>
                      <p className="text-xs text-zinc-500">{selectedBusinessForProfile.city || selectedBusinessForProfile.address}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">

                  </div>
                </div>

                {/* Slogan & Bio */}
                {selectedBusinessForProfile.brandSlogan && (
                  <p className="text-sm font-medium text-zinc-800 italic">
                    "{selectedBusinessForProfile.brandSlogan}"
                  </p>
                )}

                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">About the Practice</span>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    {selectedBusinessForProfile.directoryBio}
                  </p>
                </div>

                {/* Specialties */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Core Capabilities & Skills</span>
                  <div className="flex flex-wrap gap-2">
                    {(selectedBusinessForProfile.directorySpecialties || []).map((spec, i) => (
                      <span key={i} className="bg-zinc-100 text-zinc-800 text-xs font-semibold px-3 py-1 rounded-lg">
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Contact & Payment Channels */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Contact</span>
                    {selectedBusinessForProfile.email && <p className="text-zinc-800 font-semibold break-all">{selectedBusinessForProfile.email}</p>}
                    {selectedBusinessForProfile.phone && <p className="text-zinc-500 text-[11px]">{selectedBusinessForProfile.phone}</p>}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Payment Methods</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedBusinessForProfile.mPaisaId && (
                        <span className="bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded text-[10px]">
                          M-Paisa #{selectedBusinessForProfile.mPaisaId}
                        </span>
                      )}
                      {selectedBusinessForProfile.myCashId && (
                        <span className="bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded text-[10px]">
                          MyCash #{selectedBusinessForProfile.myCashId}
                        </span>
                      )}
                      <span className="bg-zinc-200 text-zinc-800 font-bold px-2 py-0.5 rounded text-[10px]">
                        BSP / Westpac Wire
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact & Booking Button */}
                <div className="flex items-center gap-3 pt-4 border-t border-zinc-100">
                  <a
                    href={`tel:${selectedBusinessForProfile.phone}`}
                    className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call Direct
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const b = selectedBusinessForProfile;
                      setSelectedBusinessForProfile(null);
                      handleOpenBookingModal(b);
                    }}
                    className="flex-1 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>Request Booking / Proposal</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: BOOKING FORM MODAL */}
      <AnimatePresence>
        {selectedBusinessForBooking && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-200"
            >
              <div className="p-6 space-y-5">
                <div className="flex items-start justify-between pb-3 border-b border-zinc-100">
                  <div>
                    <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider block">Fiji Direct Booking</span>
                    <h3 className="text-base font-bold text-zinc-900">
                      Book Service with {selectedBusinessForBooking.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedBusinessForBooking(null)}
                    className="text-zinc-400 hover:text-zinc-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSubmitBooking} className="space-y-4 text-xs text-zinc-700">
                  
                  {/* Service selection */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Service or Scope Name *</label>
                    <input
                      type="text"
                      required
                      value={bookingServiceName}
                      onChange={(e) => setBookingServiceName(e.target.value)}
                      placeholder="e.g., UI/UX Design Sprint, FRCS Tax Audit, 4K Drone Shoot"
                      className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-xs mt-1 text-zinc-900 font-medium focus:outline-none focus:border-sky-600"
                    />
                  </div>

                  {/* Date & Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <DateInput
                      label="Preferred Date"
                      required
                      min={new Date().toISOString().split('T')[0]}
                      value={bookingDate}
                      onChange={setBookingDate}
                      placeholder="Select booking date"
                      inputClassName="bg-white"
                      customPresets={[
                        { label: 'Tomorrow', special: 'tomorrow' },
                        { label: '+3 Days', daysOffset: 3 },
                        { label: '+1 Week', daysOffset: 7 },
                        { label: '+2 Weeks', daysOffset: 14 },
                      ]}
                    />
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Preferred Time</label>
                      <select
                        value={bookingTime}
                        onChange={(e) => setBookingTime(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 font-medium focus:outline-none focus:border-sky-600"
                      >
                        <option value="09:00 AM">09:00 AM</option>
                        <option value="10:00 AM">10:00 AM</option>
                        <option value="11:30 AM">11:30 AM</option>
                        <option value="02:00 PM">02:00 PM</option>
                        <option value="04:00 PM">04:00 PM</option>
                      </select>
                    </div>
                  </div>

                  {/* Meeting Format */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Meeting Format</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setBookingMeetingType('zoom_video')}
                        className={`py-2 px-2 rounded-xl text-xs font-semibold text-center border transition-all ${
                          bookingMeetingType === 'zoom_video' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                        }`}
                      >
                        Zoom Video
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookingMeetingType('in_person')}
                        className={`py-2 px-2 rounded-xl text-xs font-semibold text-center border transition-all ${
                          bookingMeetingType === 'in_person' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                        }`}
                      >
                        In-Person
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookingMeetingType('phone_call')}
                        className={`py-2 px-2 rounded-xl text-xs font-semibold text-center border transition-all ${
                          bookingMeetingType === 'phone_call' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                        }`}
                      >
                        Phone / WhatsApp
                      </button>
                    </div>
                  </div>

                  {/* Client Info */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Your Full Name *</label>
                      <input
                        type="text"
                        required
                        value={bookingClientName}
                        onChange={(e) => setBookingClientName(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-xs mt-1 text-zinc-900 font-medium focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Your Email *</label>
                      <input
                        type="email"
                        required
                        value={bookingClientEmail}
                        onChange={(e) => setBookingClientEmail(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-xs mt-1 text-zinc-900 font-medium focus:outline-none focus:border-sky-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Mobile Phone (M-Paisa/SMS)</label>
                      <input
                        type="tel"
                        value={bookingClientPhone}
                        onChange={(e) => setBookingClientPhone(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono text-zinc-900 font-medium focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Budget Estimate (FJD $)</label>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={bookingBudget}
                        onChange={(e) => setBookingBudget(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-xs mt-1 font-mono text-zinc-900 font-medium focus:outline-none focus:border-sky-600"
                      />
                    </div>
                  </div>

                  {/* Payment channel preference */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Settlement Method</label>
                    <select
                      value={bookingPaymentMethod}
                      onChange={(e) => setBookingPaymentMethod(e.target.value as any)}
                      className="w-full bg-white border border-zinc-200 rounded-xl py-2 px-3 text-xs mt-1 text-zinc-900 font-medium focus:outline-none focus:border-sky-600"
                    >
                      <option value="mpaisa">M-Paisa Instant Mobile Wallet</option>
                      <option value="mycash">Digicel MyCash</option>
                      <option value="bank_transfer">BSP / Westpac Wire Transfer</option>
                    </select>
                  </div>

                  {/* Project Scope */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Project Details & Requirements</label>
                    <textarea
                      rows={3}
                      value={bookingScope}
                      onChange={(e) => setBookingScope(e.target.value)}
                      placeholder="Briefly describe your objectives, deliverables, timeline, or any questions..."
                      className="w-full bg-white border border-zinc-200 rounded-xl p-3 text-xs mt-1 text-zinc-900 font-medium focus:outline-none focus:border-sky-600"
                    />
                  </div>

                  <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedBusinessForBooking(null)}
                      className="px-4 py-2 text-zinc-600 hover:text-zinc-900 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                    >
                      Confirm Booking Request
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
