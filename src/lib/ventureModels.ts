import { 
  Briefcase, 
  Layers, 
  ShoppingBag, 
  Clock, 
  Camera, 
  GraduationCap, 
  Wrench, 
  Palmtree,
  LucideIcon
} from 'lucide-react';
import { VentureType } from '../types';

export interface VentureModelConfig {
  id: VentureType;
  title: string;
  shortLabel: string;
  tagline: string;
  description: string;
  iconName: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentColor: string;
  defaultCategories: string[];
  kpiMetrics: {
    key: string;
    label: string;
    description: string;
    format: 'currency' | 'number' | 'percentage' | 'ratio' | 'hours';
  }[];
  expenseFocus: string[];
  serviceItemTypes: {
    id: string;
    label: string;
    defaultRateType: 'hourly' | 'fixed' | 'milestone' | 'retainer' | 'unit';
    description: string;
  }[];
}

export const VENTURE_MODELS: Record<VentureType, VentureModelConfig> = {
  studio: {
    id: 'studio',
    title: 'Agency & Tech Studio',
    shortLabel: 'Agency / Studio',
    tagline: 'Client project delivery, custom development & creative design',
    description: 'Best for web & mobile developers, UI/UX designers, marketing agencies, and creative directors billing by project milestones or hourly rates.',
    iconName: 'Briefcase',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-700',
    badgeBorder: 'border-sky-200',
    accentColor: 'sky',
    defaultCategories: ['Web Development', 'UI/UX Design', 'Brand Identity', 'Mobile Apps', 'Custom Software', 'SEO & Marketing'],
    kpiMetrics: [
      { key: 'activeProjects', label: 'Active Projects', description: 'Projects currently in delivery pipeline', format: 'number' },
      { key: 'billedHours', label: 'Billable Hours', description: 'Total billable time logged this month', format: 'hours' },
      { key: 'pipelineValue', label: 'Pipeline Value', description: 'Value of open leads, quotes & pending milestones', format: 'currency' },
      { key: 'avgProjectSize', label: 'Avg Project Deal', description: 'Average closed project value', format: 'currency' }
    ],
    expenseFocus: ['Cloud Hosting', 'Software Licenses', 'Subcontractors', 'Design Assets', 'Hardware Deprec.'],
    serviceItemTypes: [
      { id: 'project', label: 'Project Milestone / Build', defaultRateType: 'milestone', description: 'Fixed price development or design milestone' },
      { id: 'hourly', label: 'Hourly Consulting', defaultRateType: 'hourly', description: 'Standard hourly design or engineering rate' },
      { id: 'retainer', label: 'Monthly Retainer', defaultRateType: 'retainer', description: 'Ongoing monthly development or maintenance' }
    ]
  },

  saas: {
    id: 'saas',
    title: 'SaaS & Subscription Product',
    shortLabel: 'SaaS App',
    tagline: 'Recurring software licenses, membership tiers & digital platforms',
    description: 'Best for fintech apps, cloud tools, membership communities, and micro-SaaS platforms billing recurring monthly or annual subscriptions.',
    iconName: 'Layers',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-700',
    badgeBorder: 'border-indigo-200',
    accentColor: 'indigo',
    defaultCategories: ['Fintech & Payments', 'Productivity & CRM', 'AI & Automation', 'E-Commerce Tools', 'Developer Tools', 'EdTech'],
    kpiMetrics: [
      { key: 'mrr', label: 'Monthly Recurring (MRR)', description: 'Normalized monthly subscription revenue', format: 'currency' },
      { key: 'arr', label: 'Annual Run Rate (ARR)', description: 'Annualized recurring subscription run rate', format: 'currency' },
      { key: 'activeSubs', label: 'Active Subscribers', description: 'Paid active accounts across all plan tiers', format: 'number' },
      { key: 'arpu', label: 'Avg Revenue Per User (ARPU)', description: 'Average monthly revenue per subscriber', format: 'currency' }
    ],
    expenseFocus: ['Server Infrastructure', 'API Model Inference', 'Payment Gateway Fees', 'Domain & Security', 'Customer Support Tools'],
    serviceItemTypes: [
      { id: 'saas_tier_starter', label: 'Starter Subscription Plan', defaultRateType: 'retainer', description: 'Entry tier monthly or annual subscription' },
      { id: 'saas_tier_pro', label: 'Pro / Growth Tier', defaultRateType: 'retainer', description: 'Professional tier recurring license' },
      { id: 'saas_tier_enterprise', label: 'Enterprise / Custom SLA', defaultRateType: 'fixed', description: 'Custom corporate deployment license' }
    ]
  },

  digital_products: {
    id: 'digital_products',
    title: 'Digital Products & Asset Store',
    shortLabel: 'Digital Products',
    tagline: 'Templates, presets, eBooks, UI kits & downloadable assets',
    description: 'Best for digital creators selling reusable templates, Notion systems, Figma UI kits, Lightroom presets, 3D models, fonts, and educational guides.',
    iconName: 'ShoppingBag',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
    accentColor: 'emerald',
    defaultCategories: ['Figma / UI Kits', 'Photo & Video Presets', '3D & Motion Assets', 'eBooks & Guides', 'Code Boilerplates', 'Notion Templates'],
    kpiMetrics: [
      { key: 'gmv', label: 'Gross Merch Value (GMV)', description: 'Total gross digital product sales', format: 'currency' },
      { key: 'unitsSold', label: 'Units Downloaded', description: 'Total digital licenses delivered to customers', format: 'number' },
      { key: 'aov', label: 'Average Order Value (AOV)', description: 'Average cart size per transaction', format: 'currency' },
      { key: 'conversionRate', label: 'Store Conversion', description: 'Visitor to purchase conversion rate', format: 'percentage' }
    ],
    expenseFocus: ['Digital Storefront & CDN', 'Marketing & Ad Spend', 'Asset Hosting & Bandwidth', 'Licensing Fees', 'Affiliate Payouts'],
    serviceItemTypes: [
      { id: 'single_license', label: 'Standard Digital License', defaultRateType: 'unit', description: 'Single user commercial license for asset' },
      { id: 'extended_license', label: 'Extended / Team License', defaultRateType: 'unit', description: 'Unlimited redistribution or agency license' },
      { id: 'bundle_pack', label: 'Asset Bundle Pack', defaultRateType: 'unit', description: 'Multi-item discounted bundle' }
    ]
  },

  retainer_msp: {
    id: 'retainer_msp',
    title: 'Retainer & Managed Services (MSP)',
    shortLabel: 'Managed Retainers',
    tagline: 'Recurring support retainers, SLA contracts & managed IT',
    description: 'Best for IT support providers, fractional CTOs, ongoing SEO/PPC managers, and legal or accounting firms billing dedicated monthly hour pools.',
    iconName: 'Clock',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200',
    accentColor: 'amber',
    defaultCategories: ['Managed IT Support', 'Fractional Executive / CTO', 'SEO & Content Retainer', 'Social Media Management', 'Compliance & Bookkeeping'],
    kpiMetrics: [
      { key: 'activeRetainers', label: 'Active Retainers', description: 'Monthly recurring client retainer contracts', format: 'number' },
      { key: 'allocatedHours', label: 'Monthly Hours Pool', description: 'Total committed service hours across retainers', format: 'hours' },
      { key: 'capacityUtilization', label: 'Capacity Utilization', description: 'Percentage of monthly retainer hours delivered', format: 'percentage' },
      { key: 'overageRevenue', label: 'Overage Billables', description: 'Revenue billed beyond baseline retainer hours', format: 'currency' }
    ],
    expenseFocus: ['Monitoring & RMM Tools', 'Backup & Security Cloud', 'Contractor Helpdesk', 'Telecom & Fiber', 'Emergency On-call'],
    serviceItemTypes: [
      { id: 'monthly_retainer_tier', label: 'Monthly Retainer Hours Pack', defaultRateType: 'retainer', description: 'Guaranteed pool of monthly support/work hours' },
      { id: 'overage_hour', label: 'Overage Rate (per hour)', defaultRateType: 'hourly', description: 'Hourly fee charged when baseline quota is exceeded' },
      { id: 'sla_addon', label: '24/7 SLA Priority Response', defaultRateType: 'fixed', description: 'Guaranteed incident response time add-on' }
    ]
  },

  creator_media: {
    id: 'creator_media',
    title: 'Media, Creator & Production',
    shortLabel: 'Media & Creator',
    tagline: 'Commercial photography, video production, drone & sponsorships',
    description: 'Best for videographers, commercial photographers, drone pilots, podcast hosts, and Pacific content creators managing shoot day-rates and brand deals.',
    iconName: 'Camera',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-200',
    accentColor: 'rose',
    defaultCategories: ['Commercial Video Production', 'Brand Sponsorships & UGC', 'Aerial & Drone Cinematography', 'Event & Wedding Photography', 'Audio / Podcast Production'],
    kpiMetrics: [
      { key: 'bookedShoots', label: 'Booked Production Days', description: 'Half-day & full-day shoots on calendar', format: 'number' },
      { key: 'avgDayRate', label: 'Average Day Rate', description: 'Average fee charged per production day', format: 'currency' },
      { key: 'licensingRevenue', label: 'Usage & Licensing', description: 'Revenue from broadcast, digital ads & buyout rights', format: 'currency' },
      { key: 'equipmentUtilization', label: 'Gear Kit ROI', description: 'Equipment rental & gear line item revenue', format: 'currency' }
    ],
    expenseFocus: ['Camera & Drone Gear', 'Travel & Fuel', 'Location Permits', 'Studio Rental', 'Hard Drives & Cloud Backup', 'Equipment Insurance'],
    serviceItemTypes: [
      { id: 'full_day_shoot', label: 'Full Day Production Shoot', defaultRateType: 'fixed', description: '8-10 hour on-location filming or photography' },
      { id: 'half_day_shoot', label: 'Half Day Shoot', defaultRateType: 'fixed', description: '4 hour half-day capture session' },
      { id: 'post_production', label: 'Post-Production & Color Grade', defaultRateType: 'hourly', description: 'Video editing, sound design and color timing' },
      { id: 'usage_licensing', label: 'Commercial Usage Rights / Buyout', defaultRateType: 'fixed', description: '12-month or perpetual regional media rights' }
    ]
  },

  coaching: {
    id: 'coaching',
    title: 'Coaching, Consulting & Training',
    shortLabel: 'Coaching & Training',
    tagline: '1-on-1 coaching, executive advisory, workshops & cohort programs',
    description: 'Best for business advisors, career coaches, wellness trainers, educators, and mentors offering 1-on-1 packages, corporate workshops, and mastermind cohorts.',
    iconName: 'GraduationCap',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200',
    accentColor: 'purple',
    defaultCategories: ['Executive & Business Advisory', 'Career & Leadership Coaching', 'Corporate Workshops & Training', 'Health & Wellness Mentorship', 'Group Masterminds'],
    kpiMetrics: [
      { key: 'activeClients', label: 'Active Coachees', description: 'Clients currently in active advisory packages', format: 'number' },
      { key: 'sessionsCompleted', label: 'Sessions Completed', description: '1-on-1 or group sessions delivered this month', format: 'number' },
      { key: 'avgPackageValue', label: 'Avg Package Value', description: 'Average revenue per coaching engagement bundle', format: 'currency' },
      { key: 'completionRate', label: 'Program Retention', description: 'Client renewal and completion rate', format: 'percentage' }
    ],
    expenseFocus: ['Booking & Scheduling Software', 'Video Conferencing Pro', 'Assessment & Diagnostic Tools', 'Workshop Venue Hire', 'Client Workbooks'],
    serviceItemTypes: [
      { id: 'single_session', label: '1-on-1 Advisory Session (60m)', defaultRateType: 'hourly', description: '60-minute targeted advisory video call' },
      { id: 'coaching_package', label: '3-Month Mentorship Bundle (6 Sessions)', defaultRateType: 'fixed', description: 'Full coaching package with async messaging' },
      { id: 'corporate_workshop', label: 'Full Day Corporate Workshop', defaultRateType: 'fixed', description: 'On-site team facilitation & training program' }
    ]
  },

  trade_services: {
    id: 'trade_services',
    title: 'Trades, Field & Technical Services',
    shortLabel: 'Trades & Field Services',
    tagline: 'Field repair, print & signage, hardware support & installation',
    description: 'Best for electrical/solar technicians, IT hardware technicians, signwriters, event production crews, and skilled trade professionals billing parts, call-outs, and labor.',
    iconName: 'Wrench',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-300',
    accentColor: 'amber',
    defaultCategories: ['Solar & Electrical', 'IT Hardware & Network Wiring', 'Signage & Large Format Print', 'Event Staging & Audio Gear', 'Equipment Maintenance'],
    kpiMetrics: [
      { key: 'workOrders', label: 'Completed Jobs', description: 'Total work orders fulfilled this month', format: 'number' },
      { key: 'avgJobValue', label: 'Avg Job Value', description: 'Average total invoice (labor + parts + callout)', format: 'currency' },
      { key: 'partsMarkup', label: 'Materials & Parts Revenue', description: 'Total billed for hardware, parts & consumables', format: 'currency' },
      { key: 'onTimeRate', label: 'First-Time Fix Rate', description: 'Jobs resolved on the initial call-out visit', format: 'percentage' }
    ],
    expenseFocus: ['Materials & Hardware Parts', 'Vehicle Fuel & Maintenance', 'Specialized Tools & PPE', 'Freight & Customs', 'Safety Certifications'],
    serviceItemTypes: [
      { id: 'callout_fee', label: 'Standard Call-Out / Diagnostic Fee', defaultRateType: 'fixed', description: 'Initial site visit and assessment fee' },
      { id: 'hourly_labor', label: 'On-Site Technical Labor (per hour)', defaultRateType: 'hourly', description: 'Standard hourly field labor rate' },
      { id: 'materials_parts', label: 'Materials & Hardware Supply', defaultRateType: 'unit', description: 'Parts, cabling, hardware or print substrates' }
    ]
  },

  hospitality_tourism: {
    id: 'hospitality_tourism',
    title: 'Tourism, Hospitality & Experiences',
    shortLabel: 'Tourism & Experiences',
    tagline: 'Island day-tours, charter boats, cultural experiences & eco-stays',
    description: 'Best for Pacific tour operators, diving & surf charters, cultural workshop hosts, and boutique eco-retreats handling deposits, seasonal rates, and passenger bookings.',
    iconName: 'Palmtree',
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-700',
    badgeBorder: 'border-teal-200',
    accentColor: 'teal',
    defaultCategories: ['Island Day Charters', 'Scuba & Surf Excursions', 'Cultural Food & Craft Workshops', 'Boutique Eco-Accommodation', 'Airport & Resort Transfers'],
    kpiMetrics: [
      { key: 'guestBookings', label: 'Total Guests / Bookings', description: 'Number of passengers or participants hosted', format: 'number' },
      { key: 'avgGuestYield', label: 'Average Spend / Guest', description: 'Average ticket price including excursions & addons', format: 'currency' },
      { key: 'occupancyRate', label: 'Charter / Boat Occupancy', description: 'Percentage of available seats or berths filled', format: 'percentage' },
      { key: 'depositVolume', label: 'Advance Deposits Held', description: 'Total booking deposits received for upcoming dates', format: 'currency' }
    ],
    expenseFocus: ['Boat & Vehicle Marine Fuel', 'Maritime Safety & Survey Fees', 'Guest Catering & Refreshments', 'National Park & Village Entry Fees', 'Tour Liability Insurance'],
    serviceItemTypes: [
      { id: 'day_tour_adult', label: 'Standard Day Tour (Per Adult)', defaultRateType: 'unit', description: 'Full day excursion ticket including lunch and gear' },
      { id: 'private_charter', label: 'Private Vessel / Guide Charter (Full Day)', defaultRateType: 'fixed', description: 'Exclusive private charter for up to 8 guests' },
      { id: 'experience_deposit', label: 'Advance Booking Deposit (50%)', defaultRateType: 'fixed', description: 'Non-refundable reservation lock-in deposit' }
    ]
  }
};

export const ALL_VENTURE_TYPES: VentureType[] = [
  'studio',
  'saas',
  'digital_products',
  'retainer_msp',
  'creator_media',
  'coaching',
  'trade_services',
  'hospitality_tourism'
];

export function getVentureConfig(type?: string): VentureModelConfig {
  const normalized = (type || 'studio') as VentureType;
  return VENTURE_MODELS[normalized] || VENTURE_MODELS.studio;
}
