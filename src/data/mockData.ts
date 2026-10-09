import { CRMData, PlatformSettings, Business, DirectoryBooking } from '../types';

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  defaultVatRate: 12.5,
  defaultCurrency: 'FJD',
  allowMPaisaSub: true,
  allowMyCashSub: true,
  allowBspFeeds: true,
  enforceFRCSTIN: true,
  activePlan: 'free',
  defaultInactivityTimeoutMinutes: 15,
  // Registration and Access Control
  registrationMode: 'open',
  invites: [
    {
      id: 'inv-1',
      code: 'BULA-PRO-8821',
      email: 'consultant@fijicreatives.com',
      invitedBy: 'Super Admin',
      role: 'freelancer',
      plan: 'pro',
      createdAt: '2026-03-01',
      expiresAt: '2026-12-31',
      used: false,
      notes: 'VIP Early Partner Access with Pro Plan upgrade'
    },
    {
      id: 'inv-2',
      code: 'SUVA-VIP-2026',
      invitedBy: 'Super Admin',
      role: 'freelancer',
      plan: 'premium',
      createdAt: '2026-03-10',
      expiresAt: '2026-12-31',
      used: false,
      notes: 'Agency tier invite for Suva Tech Studio'
    }
  ],
  // OTP Verification Toggles
  enableEmailOtp: true,
  enablePhoneOtp: true,
  otpBypassNote: 'OTP can be toggled off to give platform admin enough time to configure SMTP and SMS gateway credentials.',
  // Platform Whitelabel & Global Branding
  platformName: 'Frilensa',
  platformTagline: 'Fiji & Pacific CRM, Invoicing & Tax Compliance Suite • frilensa.com',
  platformSupportEmail: 'support@frilensa.com',
  platformSupportPhone: '+679 330 1234',
  platformLogoType: 'symbol',
  platformLogoSymbol: '🌴',
  platformLogoUrl: '/pwa-icon.svg',
  platformPrimaryColor: '#0284c7',
  platformAccentColor: '#0d9488',
  platformFooterNote: 'FRCS Statutory Compliant • frilensa.com Cloud Invoicing & Escrow Platform',
  // Escrow Wallet Platform Configuration
  escrowEnabled: true,
  escrowFeeType: 'both',
  escrowCommissionPercent: 3.5, // 3.5% commission
  escrowFlatFee: 5.00, // FJD $5.00 flat fee per contract
  escrowMinAmount: 20.00, // FJD $20.00 min deposit
  escrowAutoReleaseDays: 7, // 7 days auto-release
  escrowPayoutFee: 1.00, // FJD $1.00 M-Paisa/Bank withdrawal fee
  escrowDisputePolicy: "Escrow funds remain 100% safeguarded until the client signs off on completed deliverables. App platform mediates disputes with FRCS-compliant audit receipts.",
  // Fiji Public Service Directory & Booking Marketplace
  directoryEnabled: true,
  enforcePaidForDirectory: true, // Only paying Pro & Premium subscribers are publicly visible
  directoryCategories: [
    'Software & Web Development',
    'Creative & Graphic Design',
    'Digital Marketing & Social Media',
    'Tourism & Hospitality Consulting',
    'Financial, Tax & Legal Services',
    'Photography & Video Production',
    'Event Management & MC',
    'Trades, Plumbing & Technical Contracting',
    'General Freelance Consulting'
  ],
  plans: {
    free: {
      id: 'free',
      name: 'Free Starter',
      description: 'Essential invoicing & tax tools for solo Fijian freelancers and gig creators',
      price: 0,
      badgeColor: '#64748b',
      limits: {
        maxInvoicesPerMonth: 5,
        maxClients: 3,
        maxServices: 5,
        maxBusinesses: 1,
        maxProjects: 2,
        maxAiScansPerMonth: 5
      },
      features: {
        allowAiReceiptOcr: true,
        allowClientPortal: true,
        allowRecurringInvoices: false,
        allowMultiCurrency: false,
        allowCustomBranding: false,
        allowBankReconciliation: true,
        allowCustomTaxRules: false,
        allowDirectSupportChat: true,
        allowExportPdf: true
      }
    },
    pro: {
      id: 'pro',
      name: 'Pro Consultant',
      description: 'Advanced automations, recurring retainers & high quotas for growing studios',
      price: 25,
      badgeColor: '#0284c7',
      limits: {
        maxInvoicesPerMonth: 50,
        maxClients: 30,
        maxServices: 30,
        maxBusinesses: 3,
        maxProjects: 20,
        maxAiScansPerMonth: 50
      },
      features: {
        allowAiReceiptOcr: true,
        allowClientPortal: true,
        allowRecurringInvoices: true,
        allowMultiCurrency: true,
        allowCustomBranding: true,
        allowBankReconciliation: true,
        allowCustomTaxRules: true,
        allowDirectSupportChat: true,
        allowExportPdf: true
      }
    },
    premium: {
      id: 'premium',
      name: 'Premium Agency',
      description: 'Unlimited capacity, multi-venture support & high-volume AI for agencies',
      price: 50,
      badgeColor: '#10b981',
      limits: {
        maxInvoicesPerMonth: -1,
        maxClients: -1,
        maxServices: -1,
        maxBusinesses: 10,
        maxProjects: -1,
        maxAiScansPerMonth: 200
      },
      features: {
        allowAiReceiptOcr: true,
        allowClientPortal: true,
        allowRecurringInvoices: true,
        allowMultiCurrency: true,
        allowCustomBranding: true,
        allowBankReconciliation: true,
        allowCustomTaxRules: true,
        allowDirectSupportChat: true,
        allowExportPdf: true
      }
    }
  }
};

export const STREET_LEVEL_BUSINESS: Business = {
  id: "biz-street-level-digital",
  name: "Street Level Digital Engagement Pte Ltd",
  tin: "99-88234-0-1",
  address: "Suva, Viti Levu, Fiji",
  email: "jnakasamai@gmail.com",
  phone: "+679 991 2345",
  bankDetails: "Westpac Bank Fiji\nAccount: 9801234567\nBranch: Suva Main Branch\nBSB: 039-001\nM-Paisa: 7771234",
  colorTheme: "#0284c7",
  type: "studio",
  brandSlogan: "Digital Engagement, Enterprise Web Systems & Pacific Strategy",
  logoType: "symbol",
  logoSymbol: "Waves",
  isPrimary: true,
  category: "Software & Web Development",
  mPaisaId: "7771234",
  myCashId: "9001234",
  isPublicDirectoryListed: true,
  isFrcsVerified: true,
  directoryBio: "Premier Fijian digital transformation and technology engagement firm delivering high-impact web systems, mobile architectures, and FRCS-compliant software solutions across the Pacific.",
  directorySpecialties: ["Digital Engagement", "Enterprise Web Apps", "M-Paisa Solutions", "Strategic Tech Consulting"],
  rating: 5.0,
  reviewCount: 42,
  city: "Suva, Viti Levu",
  startingRate: 95.00,
  rateUnit: "Hour",
  featuredBadge: "Verified Admin Business",
  ownerPlan: "premium",
  ownerEmail: "jnakasamai@gmail.com",
  availableForBooking: true,
  currency: "FJD",
  workingCurrencies: ["FJD", "AUD", "NZD", "USD", "EUR"]
};

/**
 * Clean production initial state for new users/tenants.
 * Starts with no demo clutter and prompts the onboarding flow.
 */
export const INITIAL_CRM_DATA: CRMData = {
  userProfile: {
    name: "",
    email: "",
    tin: "",
    defaultCurrency: "FJD",
    defaultVatRate: 12.5,
    inactivityTimeoutMinutes: 15,
    onboardingCompleted: false
  },
  businesses: [],
  clients: [],
  services: [],
  documents: [],
  activeBusinessId: "",
  onboardingCompleted: false,
  projects: [],
  transactions: [],
  expenses: [],
  recurringInvoices: [],
  platformTaxes: [
    {
      id: "ptax-vat",
      name: "Fiji Value Added Tax (VAT)",
      rate: 12.5,
      rateType: "percentage",
      scope: "platform",
      isDefault: true,
      isActive: true,
      category: "vat",
      description: "Standard statutory Fiji Value Added Tax as regulated by FRCS."
    },
    {
      id: "ptax-ecal",
      name: "Environment & Climate Adaptation Levy (ECAL)",
      rate: 5.0,
      rateType: "percentage",
      scope: "platform",
      isDefault: false,
      isActive: true,
      category: "ecal",
      description: "Fiji statutory Environmental and Climate Adaptation Levy."
    },
    {
      id: "ptax-stt",
      name: "Service Turnover Tax (STT)",
      rate: 6.0,
      rateType: "percentage",
      scope: "platform",
      isDefault: false,
      isActive: true,
      category: "stt",
      description: "Statutory turnover tax applicable to prescribed service sectors."
    }
  ],
  platformFees: [
    {
      id: "pfee-1",
      name: "M-Paisa & Digital Mobile Wallet Surcharge",
      rate: 1.5,
      rateType: "percentage",
      scope: "platform",
      isDefault: false,
      isActive: true,
      category: "processing",
      description: "Merchant processing gateway pass-through surcharge for digital transactions."
    },
    {
      id: "pfee-2",
      name: "Platform Administrative Handling Fee",
      rate: 10.00,
      rateType: "flat",
      scope: "platform",
      isDefault: false,
      isActive: true,
      category: "handling",
      description: "Standard compliance verification and digital ledger archive fee."
    }
  ],
  businessTaxes: [],
  businessFees: [],
  supportMessages: [],
  platformSettings: DEFAULT_PLATFORM_SETTINGS,
  directoryBusinesses: [],
  directoryBookings: [],
  activityLogs: []
};
