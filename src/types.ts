/**
 * Fiji Freelancer CRM - Type Definitions
 */

export interface UserProfile {
  name: string;
  email: string;
  tin: string; // Tax Identification Number (Crucial for Fiji invoicing)
  defaultCurrency: string; // E.g., "FJD"
  defaultVatRate: number; // E.g., 12.5 (Fiji VAT standard with decimal support)
  enableTax?: boolean; // Toggle to turn off tax component completely for non-VAT businesses
  phone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  avatarUrl?: string;
  city?: string;
  industry?: string;
  businessType?: string;
  bankDetails?: string;
  onboardingCompleted?: boolean;
  accountType?: 'free' | 'business';
  inactivityTimeoutMinutes?: number; // Minutes of inactivity before auto-logout (e.g. 5, 15, 30, 60, or 0 for disabled)
  emailNotifications?: boolean; // Email me when clients act (payments, quotes, messages, bookings). Default on.
  automation?: AutomationSettings; // Daily server job: retainer emails and overdue reminders (both off by default)
}

export interface AutomationSettings {
  emailRetainerInvoices?: boolean; // Email retainer invoices to the client when the daily job creates them
  overdueReminders?: boolean; // Email clients about overdue invoices at 3, 10 and 21 days
  ccMeOnReminders?: boolean; // Copy me on reminder emails
}

export type PlanTier = 'free' | 'pro' | 'premium';

export interface PlanLimits {
  maxInvoicesPerMonth: number; // -1 for unlimited
  maxClients: number; // -1 for unlimited
  maxServices: number; // -1 for unlimited
  maxBusinesses: number; // e.g. 1 for Free, 3 for Pro, 10 for Premium
  maxProjects: number; // -1 for unlimited
  maxAiScansPerMonth: number; // e.g. 5 for Free, 50 for Pro, 200 for Premium
}

export interface PlanFeatures {
  allowAiReceiptOcr: boolean;
  allowClientPortal: boolean;
  allowRecurringInvoices: boolean;
  allowMultiCurrency: boolean;
  allowCustomBranding: boolean;
  allowBankReconciliation: boolean;
  allowCustomTaxRules: boolean;
  allowDirectSupportChat: boolean;
  allowExportPdf: boolean;
}

export interface PlanFeatureConfig {
  id: PlanTier;
  name: string;
  description: string;
  price: number; // Monthly in FJD
  badgeColor: string;
  limits: PlanLimits;
  features: PlanFeatures;
}

export type RegistrationMode = 'open' | 'invite_only' | 'disabled';

export interface UserInvite {
  id: string;
  code: string; // e.g. "BULA-VIP-8821"
  email?: string;
  invitedBy?: string;
  role: 'freelancer' | 'admin' | 'client';
  plan: PlanTier;
  createdAt: string;
  expiresAt?: string;
  used: boolean;
  usedAt?: string;
  usedByEmail?: string;
  notes?: string;
}

export interface PlatformSettings {
  defaultVatRate: number;
  defaultCurrency: string;
  allowMPaisaSub: boolean;
  allowMyCashSub: boolean;
  allowBspFeeds: boolean;
  enforceFRCSTIN: boolean;
  activePlan: PlanTier;
  defaultInactivityTimeoutMinutes?: number; // Platform-wide default inactivity timeout in minutes
  plans: Record<PlanTier, PlanFeatureConfig>;
  // Account Registration & Access Controls
  registrationMode?: RegistrationMode; // 'open' | 'invite_only' | 'disabled'
  invites?: UserInvite[];
  // OTP Multi-Factor Verification Toggles
  enableEmailOtp?: boolean; // Toggles email verification codes
  enablePhoneOtp?: boolean; // Toggles SMS phone verification OTP
  otpBypassNote?: string;
  // Platform Whitelabel & Global Branding Configuration
  platformName?: string;
  platformTagline?: string;
  platformSupportEmail?: string;
  platformSupportPhone?: string;
  platformLogoType?: 'symbol' | 'text' | 'image';
  platformLogoSymbol?: string;
  platformLogoUrl?: string;
  platformPrimaryColor?: string;
  platformAccentColor?: string;
  platformFooterNote?: string;
  // Escrow Wallet Platform Configuration
  escrowEnabled?: boolean;
  escrowFeeType?: 'percentage' | 'flat' | 'both';
  escrowCommissionPercent?: number; // e.g. 3.5%
  escrowFlatFee?: number; // e.g. FJD 5.00
  escrowMinAmount?: number; // e.g. FJD 20.00
  escrowAutoReleaseDays?: number; // e.g. 7 days
  escrowPayoutFee?: number; // e.g. FJD 1.00 for M-Paisa/Bank withdrawal
  escrowDisputePolicy?: string;
  // Fiji Public Service Directory & Booking Marketplace
  directoryEnabled?: boolean; // Global toggle to enable/disable directory
  enforcePaidForDirectory?: boolean; // When true, only Pro & Premium subscribers are publicly listed
  directoryCategories?: string[];
}

export interface EscrowContract {
  id: string;
  contractNumber: string; // e.g. ESC-1002
  title: string;
  description?: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  businessId: string;
  consultantId: string;
  documentId?: string; // Associated Quote or Invoice ID
  projectId?: string;
  totalAmount: number; // Gross amount deposited by client (FJD)
  commissionRate: number; // e.g. 3.5%
  commissionAmount: number; // Calculated commission amount
  flatFeeAmount: number; // Calculated flat platform fee
  totalPlatformFee: number; // Total deduction (commission + flat fee)
  netFreelancerAmount: number; // Net payout to freelancer/business
  status: 'pending_deposit' | 'held_in_escrow' | 'milestone_submitted' | 'released' | 'refunded' | 'disputed';
  paymentMethod?: 'mpaisa' | 'mycash' | 'bank_transfer' | 'card';
  depositReference?: string; // M-Paisa receipt number or bank transfer reference
  milestoneProof?: string; // Deliverable links, work description, deliverables proof
  milestoneSubmittedAt?: string;
  disputeReason?: string;
  disputedAt?: string;
  disputeResolution?: string;
  createdAt: string;
  fundedAt?: string;
  releasedAt?: string;
  refundedAt?: string;
  clientFeedback?: string;
  rating?: number;
}

export interface WalletTransaction {
  id: string;
  type: 'escrow_deposit' | 'escrow_hold' | 'escrow_release' | 'escrow_refund' | 'platform_commission' | 'withdrawal_payout';
  amount: number;
  fee?: number;
  netAmount: number;
  currency: string;
  status: 'completed' | 'pending' | 'processing' | 'cancelled';
  date: string;
  title: string;
  description: string;
  referenceId?: string;
  payoutChannel?: 'mpaisa' | 'mycash' | 'bsp' | 'westpac' | 'anz' | 'hfc';
  payoutRecipient?: string;
}

export interface WalletAccount {
  id: string;
  ownerType: 'freelancer' | 'client';
  ownerId: string;
  availableBalance: number; // Settled funds ready to withdraw / spend (FJD)
  escrowHoldBalance: number; // Funds safely locked in escrow (FJD)
  lifetimeEarned: number;
  lifetimeWithdrawn: number;
  lifetimeFeesPaid: number;
  transactions: WalletTransaction[];
}

export interface TaxConfig {
  id: string;
  name: string; // e.g. "Fiji VAT", "ECAL (Environment & Climate Adaptation Levy)", "Service Turnover Tax (STT)", "Green / Environmental Levy"
  rate: number; // e.g. 12.5, 5.0, 6.0, 10.0
  rateType: 'percentage' | 'flat'; // percentage (%) or flat amount ($)
  scope: 'platform' | 'business'; // created by platform admin or specific business venture
  businessId?: string; // if business-specific
  isDefault?: boolean; // automatically checked/applied on new docs
  isActive: boolean; // active toggle
  description?: string;
  category?: 'vat' | 'ecal' | 'stt' | 'levy' | 'custom';
}

export interface FeeConfig {
  id: string;
  name: string; // e.g. "Handling Fee", "Agency Service Fee", "Payment Gateway Processing Fee", "SaaS Maintenance Surcharge", "Rush Delivery Surcharge"
  rate: number; // e.g. 2.5, 5.0, 25.0, 50.0
  rateType: 'percentage' | 'flat'; // percentage (%) or flat amount ($)
  scope: 'platform' | 'business';
  businessId?: string; // which business venture this fee belongs to
  isDefault?: boolean; // applied by default to invoices
  isActive: boolean;
  description?: string;
  category?: 'service' | 'handling' | 'processing' | 'delivery' | 'setup' | 'custom';
}

export interface AppliedChargeItem {
  id: string;
  name: string;
  type: 'tax' | 'fee' | 'levy';
  rate: number;
  rateType: 'percentage' | 'flat';
  amount: number;
}

export type SocialPlatform = 'viber' | 'whatsapp' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'youtube' | 'x' | 'website' | 'other';

export interface BusinessSocial {
  id: string;
  platform: SocialPlatform | string;
  handle: string; // e.g. "+679 991 2345", "@streetlevel", "https://linkedin.com/in/...", etc.
  label?: string; // Optional display label
}

export type VentureType = 
  | 'studio'
  | 'saas'
  | 'digital_products'
  | 'retainer_msp'
  | 'creator_media'
  | 'coaching'
  | 'trade_services'
  | 'hospitality_tourism';

export interface Business {
  id: string;
  name: string;
  tin: string;
  registrationNumber?: string; // Company / Business Registration Number (e.g. ROC / BN / Reg No)
  address: string;
  email: string;
  phone: string;
  socials?: BusinessSocial[]; // Social handles & channels (Viber, WhatsApp, Facebook, Instagram, LinkedIn, TikTok, etc.)
  bankDetails?: string; // e.g., "Westpac Fiji, Acc: 12345678, Branch: Suva"
  colorTheme?: string; // Visual accent color for the business branding
  logoType?: 'text' | 'symbol' | 'image'; // Custom branding logo types
  logoText?: string;
  logoSymbol?: string;
  logoUrl?: string;
  brandSlogan?: string;
  tagline?: string;
  headerStyle?: 'minimal' | 'modern' | 'bold';
  type?: VentureType; // Venture type: Agency/Studio, SaaS, Digital Products, Retainer MSP, Media, Coaching, Trades, Hospitality
  saasAppCategory?: string; // Sub-category / industry focus
  ventureCategory?: string; // Specialized venture classification
  docNumberMode?: 'auto' | 'manual';
  invoicePrefix?: string;
  invoiceStartNumber?: number;
  receiptPrefix?: string;
  receiptStartNumber?: number;
  quotePrefix?: string;
  quoteStartNumber?: number;
  isPrimary?: boolean;
  category?: string;
  // Defaults for new documents
  paymentTermsDays?: number; // Invoice due date, days after issue (default 14)
  quoteValidDays?: number; // Quotes are valid for this many days (default 30)
  invoiceTerms?: string; // Default terms and notes on new invoices
  quoteTerms?: string; // Default terms and notes on new quotes
  // Shareable rate card (/?rates=<token>); the token is registered on the server
  rateCardToken?: string;
  rateCardIntro?: string;
  // Pay now options on invoices (manual methods default to on when their details are filled in)
  payNow?: {
    bank?: boolean;
    mpaisa?: boolean;
    mycash?: boolean;
    paypal?: boolean; // PayPal and card, through the business's own PayPal account (keys kept on the server)
    paypalCard?: boolean; // Offer the card button as well (default on)
    paypalCurrency?: string; // Charged in this currency when the invoice's isn't one PayPal supports (e.g. FJD)
    surchargePercent?: number; // Added for PayPal and card payments; 0 = the business absorbs PayPal's fee
  };
  updatedAt?: string;
  customFields?: { label: string; value: string; isPreset?: boolean }[];
  mPaisaId?: string;
  myCashId?: string;
  // Public Service Directory & Booking Profile
  isPublicDirectoryListed?: boolean; // Toggle by paying users to make public / private
  isFrcsVerified?: boolean; // Fiji FRCS Tax verified badge
  directoryBio?: string; // Summary of services & consultant background
  directorySpecialties?: string[]; // e.g. ["Mobile Apps", "UI/UX Design", "Fiji VAT Accounting"]
  rating?: number; // e.g. 4.9
  reviewCount?: number; // e.g. 24
  city?: string; // e.g. "Suva, Viti Levu"
  startingRate?: number; // e.g. 85.00
  rateUnit?: string; // "Hour" | "Day" | "Project" | "Month"
  featuredBadge?: string; // "Top Rated" | "FRCS Verified" | "Featured Agency" | "Popular"
  ownerPlan?: PlanTier; // 'free' | 'pro' | 'premium'
  ownerEmail?: string;
  availableForBooking?: boolean;
  // Multi-Currency & International Settings
  currency?: string; // Base currency for venture accounting (default: 'FJD')
  workingCurrencies?: string[]; // Multiple working currencies defined for international projects (e.g. ['FJD', 'AUD', 'NZD', 'USD', 'EUR'])
  customExchangeRates?: Record<string, number>; // Custom exchange rate overrides against base currency (e.g. { 'AUD': 1.485, 'USD': 2.254 })
}

export interface DirectoryBooking {
  id: string;
  providerUid?: string; // Listing owner who receives the booking
  requesterUid?: string; // Signed-in user who requested it
  bookingRef: string; // e.g. "BK-8821"
  businessId: string;
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  serviceId?: string;
  serviceName: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  bookingDate: string; // YYYY-MM-DD
  preferredTime?: string; // e.g. "10:00 AM" or "02:00 PM"
  projectScope: string;
  budgetEstimate?: number;
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled';
  createdAt: string; // ISO string
  meetingType?: 'in_person' | 'zoom_video' | 'phone_call';
  paymentMethod?: 'mpaisa' | 'mycash' | 'bank_transfer';
  notes?: string;
  location?: string;
}

/** A business published to the shared directory (see server/directory.ts). */
export interface DirectoryListing {
  uid: string;
  businessId: string;
  name: string;
  brandSlogan?: string;
  category?: string;
  city?: string;
  directoryBio?: string;
  directorySpecialties?: string[];
  startingRate?: number | null;
  rateUnit?: string;
  currency?: string;
  email?: string;
  phone?: string;
  colorTheme?: string;
  logoType?: 'text' | 'symbol' | 'image';
  logoSymbol?: string;
  logoText?: string;
  logoUrl?: string;
  listed: boolean;
  updatedAt: string;
}

export interface ClientSubscription {
  id: string;
  serviceId: string; // References the SaaS Plan/ProductService
  startDate: string; // YYYY-MM-DD
  status: 'active' | 'paused' | 'cancelled';
  billingInterval: 'monthly' | 'annual';
  price: number;
}

export interface Client {
  id: string;
  name: string; // Company / Business Name or Client Name
  contactPerson?: string; // Specific Name of Contact / Representative
  contactName?: string; // Direct alias for contact name
  email: string;
  phone: string;
  address: string;
  tin?: string; // Fiji Client TIN if applicable
  currency?: string; // Preferred billing currency (e.g. AUD, USD, NZD, FJD)
  subscriptions?: ClientSubscription[]; // Active SaaS/retention subscriptions
  accessToken?: string; // Unique access token for direct client portal access link
  tokenCreatedAt?: string; // ISO timestamp when token was generated
}

export interface ProductService {
  id: string;
  name: string;
  description: string;
  rate: number;
  unit: string; // "Hour", "Day", "Flat Fee", "Project", "Shoot Day", "Sprint", "Labor Hour", "m²", "Item", "Month", etc.
  type?: 'saas' | 'service'; // Identify as SaaS Subscription plan or Studio consulting service
  billingInterval?: 'monthly' | 'annual' | 'one-time';
  businessId?: string; // Links this service/SaaS plan to a specific business venture
  category?: string; // e.g. "Cinematography", "Mechanical Labor", "Legal Advisory", "Web Dev", "Parts", etc.
  itemType?: 'service' | 'product' | 'labor' | 'parts' | 'equipment_rental' | 'consultation' | 'retainer' | 'disbursement';
  industryId?: string; // e.g. "film_audio_av", "web_digital", "legal_medical_pro", "automotive_mechanics", "construction_trades", "creative_events"
  
  // Enhanced Rates Management & Costing
  costPrice?: number; // Internal unit cost (for profit margin calculations)
  sku?: string; // SKU code / Part # (e.g. "SRV-001", "PT-882")
  stockQuantity?: number; // Stock count for physical items/materials
  isTaxable?: boolean; // Whether VAT/tax applies (defaults to true)
  
  // Rate Tier Variants
  rushRate?: number; // Urgent/Rush job rate
  weekendRate?: number; // Weekend/After-hours rate
  retainerRate?: number; // Preferred VIP/Retainer rate
  minQuantity?: number; // Minimum billable quantity/hours
  
  // Status & Tags
  isActive?: boolean;
  notes?: string;
  tags?: string[];
  showOnRateCard?: boolean; // Listed on the business's shareable rate card (default: yes, when active)
}

export interface ActivityLog {
  id: string;
  type: 
    | 'invoice_sent' 
    | 'payment_received' 
    | 'invoice_created' 
    | 'invoice_paid' 
    | 'invoice_cancelled'
    | 'quote_sent' 
    | 'quote_accepted' 
    | 'quote_created'
    | 'client_created' 
    | 'client_updated' 
    | 'service_created' 
    | 'service_updated' 
    | 'service_deleted'
    | 'rate_updated'
    | 'expense_logged' 
    | 'security_login' 
    | 'escrow_contract'
    | 'general';
  title: string;
  description: string;
  timestamp: string; // ISO string
  entityType?: 'invoice' | 'quote' | 'receipt' | 'client' | 'service' | 'payment' | 'expense' | 'security' | 'escrow';
  entityId?: string;
  amount?: number;
  currency?: string;
  userEmail?: string;
  clientName?: string;
  badgeColor?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

export interface DocumentItem {
  id: string;
  itemId?: string; // Ref to ProductService
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  total: number;
  unit?: string; // e.g. "Hour", "Day", "Shoot Day", "Part", "Sprint", "m²", "Brief"
  category?: string; // e.g. "Labor", "Parts", "Equipment", "Legal Counsel"
  itemType?: 'service' | 'product' | 'labor' | 'parts' | 'equipment_rental' | 'consultation' | 'retainer' | 'disbursement';
  partNumber?: string; // Useful for auto mechanics / hardware parts
  // Reimbursable expense billed to the client (see lib/invoiceTotals.ts)
  kind?: 'reimbursement';
  expenseId?: string;       // the expense this line recovers
  costAmount?: number;      // what the expense cost; total minus this is markup
  taxable?: boolean;        // reimbursement lines only: charge VAT on this line (default no)
  receiptFileId?: string;   // receipt shown to the client (server-stored file)
  receiptFileName?: string;
}

export interface PaymentAttachment {
  id: string;
  name: string;
  type: string; // "image/png", "image/jpeg", "application/pdf", etc.
  size?: number; // size in bytes
  dataUrl: string; // base64 data url or document link
  uploadedAt: string; // ISO timestamp
  uploadedBy?: string; // e.g. "Consultant" | "Client Portal" | email
  caption?: string; // e.g. "ANZ TT Bank Slip", "M-Paisa SMS Screenshot", "Deposit Remittance"
}

export interface CRMDocument {
  id: string;
  type: 'quote' | 'invoice' | 'receipt' | 'credit_note';
  documentNumber: string; // e.g., INV-0012, QT-0004, CN-0001
  businessId: string;
  clientId: string;
  currency?: string; // e.g. "AUD", "USD", "NZD", "FJD", etc. (Defaults to userProfile.defaultCurrency or client currency)
  issueDate: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD (Applicable for invoice/quote)
  items: DocumentItem[];
  subtotal: number;
  vatRate: number; // e.g., 12.5 for 12.5% VAT (decimal support)
  vatAmount: number;
  isTaxExempt?: boolean; // Toggle to turn off tax component completely
  appliedTaxes?: AppliedChargeItem[]; // itemized taxes (VAT, ECAL, STT, Levies)
  taxBreakdown?: Array<{ name: string; amount: number; rate?: number }>; // Compatibility tax breakdown
  appliedFees?: AppliedChargeItem[]; // itemized fees (Handling, Service Fee, Processing)
  taxTotal?: number; // total tax sum
  feeTotal?: number; // total fee sum
  total: number;
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'cancelled' | 'accepted';
  partiallyPaidAmount?: number; // Amount partially received so far
  partialLoggedAmount?: number; // How much of partiallyPaidAmount is already in the ledger (document currency)
  notes?: string;
  paymentMethod?: string; // e.g., "M-Paisa", "Bank Transfer", "Cash"
  projectId?: string; // Reference to associated Project
  // Industry-Flexible Custom Job Fields & Reference Tags
  industrySector?: string; // e.g. "film_audio_av", "web_digital", "legal_medical_pro", "automotive_mechanics", "construction_trades"
  jobRefLabel?: string; // e.g. "Vehicle Rego / VIN", "Case Matter Ref", "Job Site Address", "Shoot Location", "Staging URL"
  jobRefValue?: string; // e.g. "FJ-8821 / Toyota Hilux", "MAT-2026/088 - High Court", "Lot 14 Votualevu Site", "Pacific Harbour Studio"
  secondaryRefLabel?: string; // e.g. "Odometer (km)", "Production Dates", "Building Permit #", "Jurisdiction", "Tech Stack"
  secondaryRefValue?: string;
  customJobFields?: { label: string; value: string }[];
  // Multi-Currency Payment & Foreign Exchange Conversion Logging
  paidAmountForeign?: number; // Amount paid in invoice currency (e.g. 1000 AUD)
  paidAmountHome?: number; // Gross amount in home currency before deductions (e.g. 1485 FJD)
  exchangeRate?: number; // Foreign exchange conversion rate (e.g. 1.485 FJD per AUD)
  bankFeesDeduction?: number; // Bank wire, transfer, or intermediary fees deducted (e.g. 15 FJD)
  netReceivedHome?: number; // Net amount banked in home currency (e.g. 1470 FJD)
  paymentExchangeNotes?: string; // Reference details (e.g. "ANZ Overseas Telegraphic Transfer, fee FJD $15")
  paymentDate?: string; // Date payment was logged (YYYY-MM-DD)
  paymentAttachments?: PaymentAttachment[]; // Receipts, wire slips, M-Paisa screenshots attached to payment
  // Cancellation & Credit Note Audit Trail
  cancelledAt?: string; // ISO timestamp
  cancellationReason?: string; // Reason for invoice cancellation
  cancelledBy?: string; // User who cancelled the invoice
  creditNoteNumber?: string; // Optional linked Credit Note (e.g. CN-2026-1001)
  originalInvoiceId?: string; // For credit notes and receipts: the invoice they relate to
  sourceQuoteId?: string; // On an invoice converted from a quote: that quote
  receiptId?: string; // On a paid invoice: the receipt issued for it
  remindersSent?: { level: 1 | 2 | 3; sentAt: string; to: string }[]; // Overdue reminders already emailed
  updatedAt?: string; // Last edit timestamp
  // Random token for the public "view online" link (/?doc=<token>); see lib/documentLinks.ts
  shareToken?: string;
  // Payment the client reported from the portal; awaits the consultant's confirmation
  clientPaymentReport?: {
    method: string;
    reference: string;
    reportedAt: string;
    status?: 'pending' | 'confirmed' | 'rejected'; // missing = pending (reports made before 3.2.0)
    resolvedAt?: string;
    rejectionReason?: string;
  };
  acceptedAt?: string; // When the client accepted a quote
  acceptanceSeenAt?: string; // When the consultant dismissed the "quote accepted" inbox item
  // Transactional Email Dispatch Audit
  lastSentAt?: string; // Last timestamp email was sent
  sentToEmail?: string; // Last recipient email address
  sentCount?: number; // Total times emailed to client
  emailHistory?: Array<{
    sentAt: string;
    recipientEmail: string;
    provider: 'sendgrid' | 'firebase_extension' | 'smtp' | 'simulated';
    subject: string;
    status: 'sent' | 'queued' | 'delivered' | 'failed';
    messageId?: string;
  }>;
}

export interface TaskReference {
  id: string;
  title: string;
  type: 'note' | 'link';
  content: string; // The URL or the note content
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  dueDate?: string;
  assignee?: string;
  trackedHours?: number; // accumulated hours
  timerStartedAt?: string; // ISO string when timer was started, if currently running
  hourlyRate?: number; // Optional custom hourly rate for the task
  priority?: 'low' | 'medium' | 'high';
  references?: TaskReference[];
}

export interface ScopeSection {
  id: string;
  title: string;
  description: string;
  cost: number;
  deliverables: string[]; // itemized bullets
}

export interface Project {
  id: string;
  name: string;
  description: string;
  clientId?: string;
  businessId: string;
  currency?: string; // e.g. "AUD", "USD", "NZD", "FJD" (Inherited from Client or customized)
  startDate: string;
  endDate: string;
  cost: number;
  rateType: 'flat' | 'hourly' | 'monthly';
  status: 'lead' | 'in_progress' | 'pending_review' | 'completed' | 'not_started' | 'on_hold';
  tasks: Task[];
  scopeSections?: ScopeSection[];
  industrySector?: string; // e.g. "film_audio_av", "web_digital", "legal_medical_pro", "automotive_mechanics", "construction_trades", "creative_events"
  customJobFields?: { label: string; value: string }[];
}

export interface RecurringInvoice {
  id: string;
  clientId: string;
  businessId: string;
  projectName?: string;
  projectId?: string;
  currency?: string; // e.g. "AUD", "USD", "NZD", "FJD"
  amount: number;
  billingDay: number; // e.g. 1 to 28
  status: 'active' | 'paused';
  autoGenerate: boolean;
  lastGeneratedDate?: string;
  startDate: string;
  endDate?: string;
  interval?: 'monthly' | 'quarterly' | 'bi-weekly' | 'annual';
  paymentTermsDays?: number; // e.g. 7, 14, 30 days
  autoSendMode?: 'draft' | 'sent';
  notes?: string;
  items: DocumentItem[];
  appliedTaxes?: AppliedChargeItem[];
  appliedFees?: AppliedChargeItem[];
  generatedDocIds?: string[];
}

export interface CRMData {
  userProfile: UserProfile;
  businesses: Business[];
  clients: Client[];
  services: ProductService[];
  documents: CRMDocument[];
  activeBusinessId: string;
  onboardingCompleted?: boolean;
  projects?: Project[];
  transactions?: Transaction[];
  expenses?: ExpenseRecord[];
  rateRules?: RateRule[];
  recurringInvoices?: RecurringInvoice[];
  platformTaxes?: TaxConfig[]; // Global platform admin managed statutory taxes
  platformFees?: FeeConfig[]; // Global platform admin standard fees
  businessTaxes?: TaxConfig[]; // Business venture specific custom taxes/levies
  businessFees?: FeeConfig[]; // Business venture specific fees (agent service fee, SaaS handling fee, etc.)
  supportMessages?: SupportMessage[]; // Direct client-consultant support chat & inquiry messages
  platformSettings?: PlatformSettings; // SaaS platform features, plans, quotas and toggles
  escrowContracts?: EscrowContract[]; // Escrow protection contracts between clients and businesses
  wallet?: WalletAccount; // Freelancer / business multi-channel escrow wallet
  clientWallets?: Record<string, WalletAccount>; // Client portal escrow wallets
  directoryBookings?: DirectoryBooking[]; // Received and placed directory client bookings
  directoryBusinesses?: Business[]; // Platform registered and verified businesses
  activityLogs?: ActivityLog[]; // Secure audit activity logs for invoices, payments, clients & rates
  aiConversations?: AiConversationSession[]; // Past conversation records and transcripts
  aiMemories?: AiMemoryItem[]; // Persistent long-term business knowledge & memories
}

export interface AiAttachment {
  name: string;
  type: string; // e.g. "image/png", "application/pdf", "text/csv"
  size?: number;
  dataUrl?: string; // base64 data url for preview & transmission
  extractedSummary?: string;
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  isFallback?: boolean;
  attachments?: AiAttachment[];
  memoryExtracted?: string[];
  proposals?: AiProposal[]; // Things the assistant suggested creating, waiting for the user to confirm
}

export interface AiProposal {
  id: string;
  kind: 'task' | 'client' | 'draft_document' | 'expense';
  title: string;
  details: string[];
  input: unknown;
  status?: 'pending' | 'saving' | 'done' | 'dismissed' | 'failed';
  note?: string; // Result or error shown under the card
}

export interface AiConversationSession {
  id: string;
  title: string;
  businessId: string;
  createdAt: string;
  updatedAt: string;
  messages: AiChatMessage[];
  status: 'active' | 'completed' | 'archived';
  completedAt?: string;
  summary?: string;
  emailedTo?: string;
  emailedAt?: string;
  tags?: string[];
}

export interface AiMemoryItem {
  id: string;
  businessId: string;
  fact: string; // e.g. "Prefers Vodafone M-PAiSA for small deposits under $500"
  category: 'financial' | 'tax' | 'client' | 'preference' | 'workflow' | 'general';
  confidence: number;
  sourceSessionId?: string;
  createdAt: string;
}

export type AppTab = 'dashboard' | 'directory' | 'billing' | 'clients' | 'services' | 'settings' | 'projects' | 'assistant';

export interface SupportMessage {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  consultantId: string;
  businessId?: string;
  sender: 'client' | 'consultant';
  subject?: string;
  message: string;
  category: 'general' | 'invoice_inquiry' | 'quote_question' | 'payment_proof' | 'urgent_support';
  documentRefId?: string; // e.g. "INV-0012" or "QT-0004"
  status: 'unread' | 'read' | 'in_progress' | 'resolved';
  createdAt: string; // ISO string
  replyToId?: string;
}

export interface ExpenseRecord {
  id: string;
  date: string; // YYYY-MM-DD
  vendor: string; // e.g. "MH Supermarket", "Vodafone Fiji", "EFL Suva", "AWS Cloud"
  description: string;
  amount: number; // Positive number (represents expense cost in FJD/currency)
  category: string; // e.g. "Office Supplies", "Internet & Utilities", "Travel & Transport", "Software & SaaS", "Meals & Entertainment", "Tax & Licensing", "Hardware & Equipment", "Subcontractors", "Marketing", "Other Expense"
  paymentMethod: string; // "M-Paisa" | "MyCash" | "Cash" | "BSP Fiji" | "ANZ Fiji" | "Westpac Fiji" | "Credit Card" | "Bank Transfer"
  vatAmount?: number; // Claimable Fiji VAT input portion
  isTaxDeductible?: boolean; // Section 21 / allowable business expense
  isVatClaimable?: boolean; // FRCS VAT input credit claimable
  receiptImage?: string; // base64 data URI or camera capture snapshot
  receiptFileName?: string;
  notes?: string;
  businessId?: string;
  projectId?: string;
  clientId?: string;
  currency?: string; // Recorded home currency (default FJD)
  originalCurrency?: string; // Foreign currency paid (e.g. USD, AUD, EUR, NZD)
  originalAmount?: number; // Amount paid in foreign currency
  exchangeRate?: number; // Conversion rate applied (1 Foreign = X Home)
  createdAt?: string;
  billToClientId?: string;   // reimbursable: bill this expense to a client
  billedDocumentId?: string; // the invoice it was billed on
  receiptFile?: StoredFile;  // receipt kept in file storage (replaces receiptImage when uploaded)
}

/** A file kept in server file storage (see server/files.ts). */
export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // Positive = Income, Negative = Expense (in Home currency, e.g. FJD)
  category: string; // e.g. "Consulting Revenue", "Office Supplies", "Internet & Utilities", "Marketing"
  status: 'pending' | 'reconciled';
  confidence?: number; // percentage
  bankName: string; // e.g. "ANZ Fiji", "BSP Fiji", "Westpac Fiji", "M-Paisa", "Cash"
  currency?: string; // Foreign currency if applicable (e.g. AUD, USD)
  originalAmount?: number; // Amount in foreign currency (e.g. 1000 AUD)
  exchangeRate?: number; // Rate used (e.g. 1.485)
  bankFee?: number; // Bank wire or intermediary deduction in home currency
  netReceived?: number; // Net amount after deductions in home currency
  documentId?: string; // Linked invoice/quote/receipt ID
  referenceNumber?: string; // Bank telegraphic transfer / receipt reference
  vatAmount?: number; // Fiji standard VAT portion (e.g. 12.5%, 15% or 9%)
  balance?: number; // Account balance from bank statement (e.g. BSP running balance)
  vendor?: string;
  paymentMethod?: string;
  receiptImage?: string;
  receiptFileName?: string;
  paymentAttachments?: PaymentAttachment[]; // Associated payment receipts/proofs
  isTaxDeductible?: boolean;
  isVatClaimable?: boolean;
  notes?: string;
  businessId?: string;
  projectId?: string;
  clientId?: string;
}

export interface RateRule {
  id: string;
  name: string;
  type: 'surcharge' | 'discount' | 'multiplier';
  value: number; // e.g. 1.5 for 1.5x, -10 for 10% discount, 50 for flat $50 surcharge
  unit: 'percent' | 'flat' | 'multiplier';
  appliesTo: 'all' | 'weekend' | 'rush' | 'after-hours';
  description: string;
  isActive: boolean;
}
