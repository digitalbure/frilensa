import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Filter, ShieldCheck, Star, MapPin, Phone, Mail, Sparkles,
  Calendar, Clock, CheckCircle2, DollarSign, ArrowRight, ExternalLink,
  Building2, User, Globe, Tag, X, Check, AlertCircle, MessageSquare,
  Lock, Eye, EyeOff, Layers, Briefcase, ChevronRight, FileText,
  Smartphone, Wallet, ArrowUpRight, HelpCircle, RefreshCw
} from 'lucide-react';
import { CRMData, Business, DirectoryBooking, PlanTier } from '../types';
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
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'rating' | 'rate_low' | 'rate_high' | 'name'>('rating');

  // Modals state
  const [selectedBusinessForProfile, setSelectedBusinessForProfile] = useState<Business | null>(null);
  const [selectedBusinessForBooking, setSelectedBusinessForBooking] = useState<Business | null>(null);
  const [bookingPreselectedService, setBookingPreselectedService] = useState<string>('');

  // Booking Form State
  const [bookingClientName, setBookingClientName] = useState(data.userProfile.name || '');
  const [bookingClientEmail, setBookingClientEmail] = useState(data.userProfile.email || '');
  const [bookingClientPhone, setBookingClientPhone] = useState(data.userProfile.phone || '+679 991 2345');
  const [bookingDate, setBookingDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    return tomorrow.toISOString().split('T')[0];
  });
  const [bookingTime, setBookingTime] = useState('10:00 AM');
  const [bookingMeetingType, setBookingMeetingType] = useState<'zoom_video' | 'in_person' | 'phone_call'>('zoom_video');
  const [bookingServiceName, setBookingServiceName] = useState('');
  const [bookingScope, setBookingScope] = useState('');
  const [bookingBudget, setBookingBudget] = useState<number | ''>('');
  const [bookingPaymentMethod, setBookingPaymentMethod] = useState<'mpaisa' | 'mycash' | 'bank_transfer' | 'escrow'>('mpaisa');
  const [bookingLocation, setBookingLocation] = useState('Suva / Online');
  
  // Status message state
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Active user plan
  const activePlan: PlanTier = data.platformSettings?.activePlan || 'free';
  const isPayingUser = activePlan === 'pro' || activePlan === 'premium';
  const enforcePaidForDirectory = data.platformSettings?.enforcePaidForDirectory !== false;
  const isDirectoryGlobalEnabled = data.platformSettings?.directoryEnabled !== false;

  // Active user's primary business
  const userPrimaryBiz = data.businesses.find(b => b.id === data.activeBusinessId) || data.businesses[0];
  const isUserBizPublic = userPrimaryBiz ? (userPrimaryBiz.isPublicDirectoryListed !== false && isPayingUser) : false;

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

  // All directory businesses combining platform registry and user's business if public
  const allBusinesses = useMemo(() => {
    const list: Business[] = [];
    const seenIds = new Set<string>();

    // Add user's business if user is public (or if paying and opted in)
    if (userPrimaryBiz) {
      const userBizFormatted: Business = {
        ...userPrimaryBiz,
        isFrcsVerified: !!userPrimaryBiz.tin,
        ownerPlan: activePlan,
        ownerEmail: data.userProfile.email,
        city: userPrimaryBiz.address?.includes('Nadi') ? 'Nadi, Viti Levu' : 
              userPrimaryBiz.address?.includes('Lautoka') ? 'Lautoka' : 'Suva, Viti Levu',
        startingRate: userPrimaryBiz.startingRate || 85.00,
        rateUnit: userPrimaryBiz.rateUnit || 'Hour',
        directoryBio: userPrimaryBiz.directoryBio || `${userPrimaryBiz.name} provides expert consulting and services across Fiji and the Pacific.`,
        rating: userPrimaryBiz.rating || 5.0,
        reviewCount: userPrimaryBiz.reviewCount || 12,
        isPublicDirectoryListed: userPrimaryBiz.isPublicDirectoryListed !== false
      };
      list.push(userBizFormatted);
      seenIds.add(userPrimaryBiz.id);
    }

    // Add registered directory businesses from state or fallback
    const registered = data.directoryBusinesses || [];
    for (const b of registered) {
      if (!seenIds.has(b.id)) {
        list.push(b);
        seenIds.add(b.id);
      }
    }

    return list;
  }, [userPrimaryBiz, activePlan, data.userProfile.email, data.directoryBusinesses]);

  // Filtered businesses according to search, category, city, and paying requirement
  const visibleBusinesses = useMemo(() => {
    return allBusinesses.filter(biz => {
      // Rule: Non-paying users will NOT be displayed if enforcePaidForDirectory is true
      const bizPlan = biz.ownerPlan || 'free';
      const isPaid = bizPlan === 'pro' || bizPlan === 'premium';
      if (enforcePaidForDirectory && !isPaid) {
        return false;
      }

      // Rule: Business must be public
      if (biz.isPublicDirectoryListed === false) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'All' && biz.category !== selectedCategory) {
        return false;
      }

      // City filter
      if (selectedCity !== 'All') {
        const matchesCity = biz.city?.toLowerCase().includes(selectedCity.toLowerCase()) ||
                            biz.address?.toLowerCase().includes(selectedCity.toLowerCase());
        if (!matchesCity) return false;
      }

      // Verified filter
      if (verifiedOnly && !biz.isFrcsVerified) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = biz.name?.toLowerCase().includes(q);
        const matchesSlogan = biz.brandSlogan?.toLowerCase().includes(q);
        const matchesBio = biz.directoryBio?.toLowerCase().includes(q);
        const matchesSpecialties = biz.directorySpecialties?.some(s => s.toLowerCase().includes(q));
        const matchesTin = biz.tin?.toLowerCase().includes(q);
        const matchesCategory = biz.category?.toLowerCase().includes(q);

        if (!matchesName && !matchesSlogan && !matchesBio && !matchesSpecialties && !matchesTin && !matchesCategory) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'rating') {
        return (b.rating || 0) - (a.rating || 0);
      }
      if (sortBy === 'rate_low') {
        return (a.startingRate || 0) - (b.startingRate || 0);
      }
      if (sortBy === 'rate_high') {
        return (b.startingRate || 0) - (a.startingRate || 0);
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [allBusinesses, enforcePaidForDirectory, selectedCategory, selectedCity, verifiedOnly, searchQuery, sortBy]);

  // Directory Bookings list
  const directoryBookings = data.directoryBookings || [];
  
  // Received bookings for user's business
  const receivedBookings = useMemo(() => {
    const myBizIds = data.businesses.map(b => b.id);
    return directoryBookings.filter(b => myBizIds.includes(b.businessId) || b.businessEmail === data.userProfile.email || b.businessName === userPrimaryBiz?.name);
  }, [directoryBookings, data.businesses, data.userProfile.email, userPrimaryBiz]);

  // Outbound bookings made by user
  const outboundBookings = useMemo(() => {
    return directoryBookings.filter(b => b.clientEmail === data.userProfile.email || b.clientName === data.userProfile.name);
  }, [directoryBookings, data.userProfile.email, data.userProfile.name]);

  // Toggle user's business public/private status
  const handleToggleUserPublicStatus = () => {
    if (!isPayingUser) {
      showToast('Public Directory Listing requires an active Pro or Premium subscription.', 'error');
      return;
    }

    if (!userPrimaryBiz) return;

    const newPublicStatus = userPrimaryBiz.isPublicDirectoryListed === false ? true : false;
    
    const updatedBusinesses = data.businesses.map(b => {
      if (b.id === userPrimaryBiz.id) {
        return {
          ...b,
          isPublicDirectoryListed: newPublicStatus
        };
      }
      return b;
    });

    onUpdateData({
      ...data,
      businesses: updatedBusinesses
    });

    showToast(
      newPublicStatus 
        ? `"${userPrimaryBiz.name}" is now PUBLIC in the Fiji Business Directory!` 
        : `"${userPrimaryBiz.name}" is now PRIVATE and hidden from search.`,
      'success'
    );
  };

  // Open booking modal for a business
  const handleOpenBookingModal = (biz: Business, serviceName: string = '') => {
    setSelectedBusinessForBooking(biz);
    setBookingServiceName(serviceName || biz.directorySpecialties?.[0] || 'General Consultation & Strategy');
    setBookingBudget(biz.startingRate || 100);
    setBookingScope('');
  };

  // Submit a booking request
  const handleSubmitBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusinessForBooking) return;
    if (!bookingClientName || !bookingClientEmail) {
      showToast('Please provide your contact name and email.', 'error');
      return;
    }

    const newBooking: DirectoryBooking = {
      id: `bk-${Date.now()}`,
      bookingRef: `BK-${Math.floor(1000 + Math.random() * 9000)}`,
      businessId: selectedBusinessForBooking.id,
      businessName: selectedBusinessForBooking.name,
      businessEmail: selectedBusinessForBooking.email,
      businessPhone: selectedBusinessForBooking.phone,
      serviceName: bookingServiceName || 'General Service Booking',
      clientName: bookingClientName,
      clientEmail: bookingClientEmail,
      clientPhone: bookingClientPhone,
      bookingDate,
      preferredTime: bookingTime,
      projectScope: bookingScope || 'Service inquiry and consultation booking requested via Fiji Directory.',
      budgetEstimate: Number(bookingBudget) || selectedBusinessForBooking.startingRate || 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
      meetingType: bookingMeetingType,
      paymentMethod: bookingPaymentMethod,
      location: bookingLocation,
      notes: `Requested via Directory on ${new Date().toLocaleDateString()}`
    };

    const updatedBookings = [newBooking, ...(data.directoryBookings || [])];

    onUpdateData({
      ...data,
      directoryBookings: updatedBookings
    });

    setSelectedBusinessForBooking(null);
    showToast(`Booking request ${newBooking.bookingRef} sent to ${selectedBusinessForBooking.name}!`, 'success');
  };

  // Update booking status
  const handleUpdateBookingStatus = (bookingId: string, newStatus: 'accepted' | 'declined' | 'completed') => {
    const updatedBookings = (data.directoryBookings || []).map(b => {
      if (b.id === bookingId) {
        return { ...b, status: newStatus };
      }
      return b;
    });

    onUpdateData({
      ...data,
      directoryBookings: updatedBookings
    });

    showToast(`Booking status updated to ${newStatus.toUpperCase()}`, 'success');
  };

  // Convert booking to Invoice
  const handleConvertBookingToInvoice = (booking: DirectoryBooking) => {
    if (!onNavigateToTab) return;

    // Check if client exists or create one
    let client = data.clients.find(c => c.email.toLowerCase() === booking.clientEmail.toLowerCase());
    let updatedClients = [...data.clients];

    if (!client) {
      client = {
        id: `cli-${Date.now()}`,
        name: booking.clientName,
        email: booking.clientEmail,
        phone: booking.clientPhone,
        address: booking.location || 'Suva, Fiji',
        tin: '10-00000-0-0'
      };
      updatedClients.push(client);
    }

    // Create Invoice Document
    const subtotal = booking.budgetEstimate || 150;
    const vatRate = data.userProfile.defaultVatRate || 12.5;
    const vatAmount = (subtotal * vatRate) / 100;
    const total = subtotal + vatAmount;

    const newDocId = `doc-${Date.now()}`;
    const newInvoice = {
      id: newDocId,
      type: 'invoice' as const,
      documentNumber: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
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
      status: 'sent' as const,
      notes: `Generated from Directory Booking ${booking.bookingRef}. Payment method requested: ${booking.paymentMethod?.toUpperCase() || 'M-PAISA'}.`
    };

    onUpdateData({
      ...data,
      clients: updatedClients,
      documents: [newInvoice, ...data.documents]
    });

    showToast(`Invoice ${newInvoice.documentNumber} created from booking!`, 'success');
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
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" /> FRCS Verified Marketplace
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-400/30">
              M-Paisa & Direct Bookings Active
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
            Fiji Business & Service Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Discover registered, tax-verified Fijian freelancers, tech studios, chartered accountants, and creative agencies. Book services directly with transparent rates and instant mobile wallet settlement.
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
                    ? 'Your business profile is PUBLIC. Clients in Fiji can search your services and submit direct booking inquiries.'
                    : 'Your business profile is PRIVATE and hidden from the Fiji public directory.'
                  : 'Public Directory Listing is locked to Pro and Premium subscribers. Non-paying accounts are not displayed in the public search.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isPayingUser ? (
              <button
                type="button"
                onClick={handleToggleUserPublicStatus}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
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
                  <option value="rating">⭐ Highest Rated</option>
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

            {/* Quick Filters row */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-zinc-700 font-medium select-none">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                  className="rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                  <span>Show FRCS Verified businesses only</span>
                </span>
              </label>

              <span className="text-zinc-400 text-[11px]">
                Showing <strong>{visibleBusinesses.length}</strong> verified provider{visibleBusinesses.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* Business Cards Grid */}
          {visibleBusinesses.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-zinc-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-zinc-800">No Service Providers Found</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                No verified businesses matched your filters. Try clearing your search keyword or switching category/location filters.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setSelectedCity('All');
                  setVerifiedOnly(false);
                }}
                className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold hover:bg-zinc-800 transition-all inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleBusinesses.map((biz) => {
                const isUserOwnBiz = biz.id === userPrimaryBiz?.id;
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

                        {biz.isFrcsVerified && (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0" title={`FRCS TIN: ${biz.tin}`}>
                            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified
                          </span>
                        )}
                      </div>

                      {/* Brand Slogan */}
                      {biz.brandSlogan && (
                        <p className="text-xs font-medium text-zinc-700 italic line-clamp-1">
                          "{biz.brandSlogan}"
                        </p>
                      )}

                      {/* Bio Summary */}
                      <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
                        {biz.directoryBio || 'Experienced Fiji service provider providing verified consulting and execution.'}
                      </p>

                      {/* Specialty Tags */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(biz.directorySpecialties || [biz.category || 'Consulting']).slice(0, 3).map((tag, idx) => (
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
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-xs font-bold text-zinc-900">
                            {biz.rating ? biz.rating.toFixed(1) : '5.0'}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            ({biz.reviewCount || 10})
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-zinc-400 block font-medium">Starting from</span>
                          <span className="text-xs font-bold text-zinc-900 font-mono">
                            FJD ${biz.startingRate ? biz.startingRate.toFixed(2) : '85.00'}
                            <span className="text-[10px] text-zinc-400 font-normal">/{biz.rateUnit || 'Hour'}</span>
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
                        booking.status === 'declined' ? 'bg-red-50 text-red-700 border-red-200' :
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
                      booking.status === 'declined' ? 'bg-red-50 text-red-700 border-red-200' :
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
                    {selectedBusinessForProfile.isFrcsVerified && (
                      <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> FRCS Verified
                      </span>
                    )}
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

                {/* Verification & Payment Channels */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">FRCS Tax Compliance</span>
                    <p className="font-mono text-zinc-800 font-bold">TIN: {selectedBusinessForProfile.tin || 'Verified on File'}</p>
                    <p className="text-zinc-500 text-[11px]">Lawful VAT Tax Invoicing Enabled</p>
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
                      <option value="escrow">Frilensa Escrow Milestone Protection</option>
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
