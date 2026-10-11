import { ProductService, Project, Task, ScopeSection } from '../types';

export interface IndustryJobFieldDef {
  key: string;
  label: string;
  placeholder: string;
  example: string;
  type: 'text' | 'date' | 'select';
  options?: string[];
}

export interface IndustryPreset {
  id: string;
  name: string;
  badge: string;
  tagline: string;
  iconName: string;
  colorTheme: string;
  description: string;
  defaultUnits: string[];
  itemCategories: string[];
  suggestedJobFields: IndustryJobFieldDef[];
  sampleServices: Omit<ProductService, 'id' | 'businessId'>[];
  sampleProject: {
    name: string;
    description: string;
    rateType: 'flat' | 'hourly' | 'monthly';
    defaultCost: number;
    tasks: Omit<Task, 'id' | 'projectId'>[];
    scopeSections: Omit<ScopeSection, 'id'>[];
  };
}

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    id: 'film_audio_av',
    name: 'Film, Video, Audio & AV Production',
    badge: 'Media & Production',
    tagline: 'Filmmakers, Sound Recordists, Drone Pilots, Editors & Event AV',
    iconName: 'Clapperboard',
    colorTheme: '#e11d48',
    description: 'For production crews, cinematographers, sound recordists, 4K drone operators, video editors, and live event AV specialists.',
    defaultUnits: [
      'Shoot Day',
      'Half Day',
      'Hour',
      'Cut / Episode',
      'Minute',
      'Track',
      'Equipment Day',
      'Project',
      'Flat Fee'
    ],
    itemCategories: [
      'Cinematography & Camera',
      'Aerial & Drone Filming',
      'Sound Recording & Audio',
      'Video Editing & Post-Production',
      'Color Grading & Mastering',
      'Lighting & Grip Equipment',
      'Live Event AV & Streaming',
      'Voiceover & Talent'
    ],
    suggestedJobFields: [
      { key: 'shootLocation', label: 'Shoot Location / Studio', placeholder: 'e.g. Pacific Harbour / Studio A', example: 'Pacific Harbour / Studio A', type: 'text' },
      { key: 'productionDates', label: 'Production / Shoot Dates', placeholder: 'e.g. 15-18 March 2026', example: '15-18 March 2026', type: 'text' },
      { key: 'aspectRatioSpecs', label: 'Delivery Specs & Resolution', placeholder: 'e.g. 4K UHD 24fps / 16:9 & 9:16 Reels', example: '4K UHD 24fps / 16:9 & 9:16 Reels', type: 'text' },
      { key: 'callTime', label: 'Call Time & Crew Ref', placeholder: 'e.g. 06:30 AM Crew Call / Unit 2', example: '06:30 AM Crew Call / Unit 2', type: 'text' }
    ],
    sampleServices: [
      {
        name: 'Director of Photography (DP) & Cine Camera Package',
        description: 'Lead cinematography including cinema camera kit, prime lenses, wireless monitoring and operator labor.',
        rate: 750,
        unit: 'Shoot Day',
        type: 'service',
        category: 'Cinematography & Camera',
        itemType: 'service'
      },
      {
        name: '4K Aerial Drone Cinematography & CASA/CAAF Pilot',
        description: 'Licensed commercial drone operator with dual-controller 4K drone rig, ND filters and backup batteries.',
        rate: 450,
        unit: 'Half Day',
        type: 'service',
        category: 'Aerial & Drone Filming',
        itemType: 'service'
      },
      {
        name: 'Location Sound Recordist & Multi-Track Audio Kit',
        description: 'Production audio recording with 32-bit float field recorder, boom mic, and 2x wireless lavalier systems.',
        rate: 480,
        unit: 'Shoot Day',
        type: 'service',
        category: 'Sound Recording & Audio',
        itemType: 'service'
      },
      {
        name: 'Video Post-Production, Rough Cut & Color Grading',
        description: 'Non-linear editing, narrative pacing, DaVinci Resolve color grade, and sound mix balancing.',
        rate: 85,
        unit: 'Hour',
        type: 'service',
        category: 'Video Editing & Post-Production',
        itemType: 'service'
      },
      {
        name: 'Live Event AV, Stage Audio & Multi-Mic Rig',
        description: 'Complete digital sound mixer, wireless mics, PA speakers, and technician for conferences or concerts.',
        rate: 850,
        unit: 'Equipment Day',
        type: 'service',
        category: 'Live Event AV & Streaming',
        itemType: 'equipment_rental'
      }
    ],
    sampleProject: {
      name: 'Resort Commercial Video Campaign & Social Reels',
      description: 'Full commercial shoot, drone b-roll, interview audio, and multi-format social video master deliverables.',
      rateType: 'flat',
      defaultCost: 3800,
      tasks: [
        { title: 'Location Scout & Storyboard Approval', description: 'Confirm sunrise lighting, shot list, and client brand guidelines.', priority: 'high', trackedHours: 0, status: 'done' },
        { title: 'Principal Photography (Day 1 - Aerials & Lifestyle)', description: 'Drone flights, beach b-roll, and guest experience footage in 4K 60p.', priority: 'high', trackedHours: 0, status: 'in_progress' },
        { title: 'Principal Photography (Day 2 - Dining & Interviews)', description: 'Multi-cam setup, interview lighting, and 32-bit audio capture.', priority: 'high', trackedHours: 0, status: 'todo' },
        { title: 'Rough Cut Assembly & Client First Pass', description: 'Cut to music track, submit frame.io review link.', priority: 'medium', trackedHours: 0, status: 'todo' },
        { title: 'Color Grading & 5.1 Sound Mastering', description: 'LUT balancing, noise reduction, and final 4K ProRes + MP4 exports.', priority: 'high', trackedHours: 0, status: 'todo' }
      ],
      scopeSections: [
        {
          title: 'Phase 1: Pre-Production & Location Logistics',
          description: 'Scripting, flight permits, talent coordination, and tech prep.',
          cost: 800,
          deliverables: ['Approved Shot List & Script', 'Drone Airspace Permit', 'Production Call Sheet']
        },
        {
          title: 'Phase 2: On-Location 4K Filming & Audio Capture',
          description: '2 Full Days of dual-camera production and drone cinematography.',
          cost: 1800,
          deliverables: ['120GB RAW Footage Capture', 'Clean 24-bit/48kHz Audio Tracks', 'Daily Backup Verification']
        },
        {
          title: 'Phase 3: Post-Production, Color & Master Deliveries',
          description: 'Editing, color grading, licensed audio score, and master formats.',
          cost: 1200,
          deliverables: ['1x 90-second Cinematic Hero Brand Video', '3x 15-second Vertical Social Reels (9:16)', 'Full 4K ProRes Master Archive']
        }
      ]
    }
  },
  {
    id: 'web_digital',
    name: 'Web, Software & Digital Technology',
    badge: 'Tech & Digital',
    tagline: 'Full-Stack Developers, UI/UX Designers, Mobile Engineers & SaaS',
    iconName: 'Code',
    colorTheme: '#0284c7',
    description: 'For full-stack developers, mobile app creators, UI/UX designers, systems integrators, and SaaS ventures.',
    defaultUnits: [
      'Hour',
      'Day',
      'Sprint',
      'Milestone',
      'Project',
      'Month',
      'Screen',
      'Story Point',
      'Year'
    ],
    itemCategories: [
      'Web Application Development',
      'Mobile App Engineering',
      'UI/UX Design & Prototyping',
      'API & Payment Gateway Integration',
      'DevOps, Cloud & Hosting',
      'Database Architecture',
      'QA, Security & Audit',
      'SLA Maintenance Retainer'
    ],
    suggestedJobFields: [
      { key: 'stagingUrl', label: 'Staging / Repo URL', placeholder: 'e.g. https://staging.clientapp.com', example: 'https://staging.clientapp.com', type: 'text' },
      { key: 'techStack', label: 'Tech Stack & Frameworks', placeholder: 'e.g. React, TypeScript, Node.js, PostgreSQL', example: 'React, TypeScript, Node.js, PostgreSQL', type: 'text' },
      { key: 'productionDomain', label: 'Live Domain / App Store ID', placeholder: 'e.g. app.clientdomain.fj', example: 'app.clientdomain.fj', type: 'text' },
      { key: 'figmaUrl', label: 'Figma Workspace URL', placeholder: 'e.g. https://figma.com/file/...', example: 'https://figma.com/file/...', type: 'text' }
    ],
    sampleServices: [
      {
        name: 'Full-Stack Web Application Development (React / Node)',
        description: 'Custom responsive web development, including state management and component architecture.',
        rate: 95,
        unit: 'Hour',
        type: 'service',
        category: 'Web Application Development',
        itemType: 'service'
      },
      {
        name: 'UI/UX Design System & Interactive Figma Prototype',
        description: 'Complete user flow mapping, wireframing, high-fidelity design system, and click-through prototypes.',
        rate: 85,
        unit: 'Hour',
        type: 'service',
        category: 'UI/UX Design & Prototyping',
        itemType: 'service'
      },
      {
        name: 'M-Paisa / MyCash & Bank Payment Gateway Integration',
        description: 'Secure webhook integration for Fiji local payment methods with automated receipting and ledger sync.',
        rate: 650,
        unit: 'Milestone',
        type: 'service',
        category: 'API & Payment Gateway Integration',
        itemType: 'service'
      },
      {
        name: 'Cloud Infrastructure Setup & DevOps CI/CD Pipeline',
        description: 'Docker containerization, SSL certificates, automated deploy pipelines, and Cloud Run / VPS deployment.',
        rate: 550,
        unit: 'Project',
        type: 'service',
        category: 'DevOps, Cloud & Hosting',
        itemType: 'service'
      },
      {
        name: 'Monthly Software Maintenance & Security Retainer',
        description: 'Ongoing server monitoring, dependency patching, bug fixes, and 99.9% uptime SLA.',
        rate: 350,
        unit: 'Month',
        type: 'saas',
        billingInterval: 'monthly',
        category: 'SLA Maintenance Retainer',
        itemType: 'retainer'
      }
    ],
    sampleProject: {
      name: 'Custom E-Commerce & M-Paisa Checkout Portal',
      description: 'Responsive customer web storefront, inventory backend, and automated M-Paisa payment settlement system.',
      rateType: 'flat',
      defaultCost: 4500,
      tasks: [
        { title: 'Technical Architecture & DB Schema Setup', description: 'Model products, carts, orders, and payment webhooks.', priority: 'high', trackedHours: 0, status: 'done' },
        { title: 'Figma UI/UX Design Approval', description: 'Design mobile-optimized checkout and product catalogue.', priority: 'medium', trackedHours: 0, status: 'in_progress' },
        { title: 'Frontend Storefront & Shopping Cart', description: 'Build responsive catalogue with search and filtering.', priority: 'high', trackedHours: 0, status: 'todo' },
        { title: 'M-Paisa QR & Callback Webhook Integration', description: 'Test sandbox transactions and automated receipt dispatch.', priority: 'high', trackedHours: 0, status: 'todo' },
        { title: 'Cloud Deploy & UAT Sign-off', description: 'Deploy to Cloud Run with custom SSL domain and client training.', priority: 'medium', trackedHours: 0, status: 'todo' }
      ],
      scopeSections: [
        {
          title: 'Sprint 1: UI/UX & Information Architecture',
          description: 'User personas, interactive wireframes, and design system.',
          cost: 1200,
          deliverables: ['Figma Design Files', 'Design Token System', 'User Flow Documentation']
        },
        {
          title: 'Sprint 2: Core Storefront & Admin Portal',
          description: 'Client frontend, product catalog, and backend order dashboard.',
          cost: 2000,
          deliverables: ['Responsive Web App', 'Admin Product Management', 'Order History & Status Tracking']
        },
        {
          title: 'Sprint 3: Payment Engine, QA & Production Launch',
          description: 'Fiji payment gateway integration, security audit, and deployment.',
          cost: 1300,
          deliverables: ['M-Paisa Live Integration', 'Automated PDF Tax Invoices', 'Live Production Deployment']
        }
      ]
    }
  },
  {
    id: 'legal_medical_pro',
    name: 'Legal, Medical & Professional Advisory',
    badge: 'Professional Advisory',
    tagline: 'Lawyers, Doctors, Accountants, Architects & Management Consultants',
    iconName: 'Scale',
    colorTheme: '#4f46e5',
    description: 'For lawyers, doctors, medical specialists, certified accountants, architects, and executive consultants.',
    defaultUnits: [
      'Billable Hour',
      'Brief / Matter',
      'Case / Session',
      'Consultation',
      'Retainer',
      'Report / Filing',
      'm² (Floor Area)',
      'Flat Fee'
    ],
    itemCategories: [
      'Legal Advisory & Counsel',
      'Court Representation & Litigation',
      'Contract Drafting & Review',
      'Medical Specialist Assessment',
      'Telehealth & Clinical Session',
      'FRCS Tax Audit & Filing',
      'Architectural Blueprint & Planning',
      'Executive Strategy Retainer'
    ],
    suggestedJobFields: [
      { key: 'matterRef', label: 'Client Matter / Case File Ref #', placeholder: 'e.g. MAT-2026/088 - High Court Suva', example: 'MAT-2026/088 - High Court Suva', type: 'text' },
      { key: 'jurisdiction', label: 'Court / Clinic / Regulatory Body', placeholder: 'e.g. High Court of Fiji / FRCS Suva', example: 'High Court of Fiji / FRCS Suva', type: 'text' },
      { key: 'statutoryFilingDate', label: 'Statutory Lodgement / Filing Date', placeholder: 'e.g. 28 April 2026', example: '28 April 2026', type: 'text' },
      { key: 'patientOrClientRef', label: 'Patient / Reference ID', placeholder: 'e.g. MED-REC-44912', example: 'MED-REC-44912', type: 'text' }
    ],
    sampleServices: [
      {
        name: 'Senior Legal Advisory & Statutory Review',
        description: 'Legal review, corporate law advice, statutory compliance and written legal opinions.',
        rate: 180,
        unit: 'Billable Hour',
        type: 'service',
        category: 'Legal Advisory & Counsel',
        itemType: 'service'
      },
      {
        name: 'Commercial Contract Drafting & Terms Review',
        description: 'Drafting of commercial agreements, partnership deeds, employment contracts, and NDA covenants.',
        rate: 650,
        unit: 'Brief / Matter',
        type: 'service',
        category: 'Contract Drafting & Review',
        itemType: 'service'
      },
      {
        name: 'Specialist Medical Assessment & Medico-Legal Report',
        description: 'Detailed clinical consultation, physical/specialist assessment, and formal certified medical report.',
        rate: 350,
        unit: 'Consultation',
        type: 'service',
        category: 'Medical Specialist Assessment',
        itemType: 'consultation'
      },
      {
        name: 'FRCS Statutory VAT Reconciliation & Annual Tax Lodgement',
        description: 'Full financial audit, VAT returns preparation, tax ledger reconciliation, and electronic FRCS lodgement.',
        rate: 750,
        unit: 'Report / Filing',
        type: 'service',
        category: 'FRCS Tax Audit & Filing',
        itemType: 'service'
      },
      {
        name: 'Executive Advisory & General Counsel Retainer',
        description: 'Dedicated monthly advisory hours, priority on-call consultation, and ongoing regulatory guidance.',
        rate: 1200,
        unit: 'Retainer',
        type: 'saas',
        billingInterval: 'monthly',
        category: 'Executive Strategy Retainer',
        itemType: 'retainer'
      }
    ],
    sampleProject: {
      name: 'Corporate Restructure & Compliance Advisory',
      description: 'Review corporate governance, shareholder agreements, tax obligations, and statutory filings.',
      rateType: 'flat',
      defaultCost: 3500,
      tasks: [
        { title: 'Client Intake & Document Discovery', description: 'Review current articles of association and shareholder registers.', priority: 'high', trackedHours: 0, status: 'done' },
        { title: 'Statutory Compliance & Tax Liability Audit', description: 'Audit FRCS filings and calculate transitional tax duties.', priority: 'high', trackedHours: 0, status: 'in_progress' },
        { title: 'Drafting New Shareholder & Governance Deed', description: 'Incorporate new dispute clauses, vesting terms, and dividend rules.', priority: 'medium', trackedHours: 0, status: 'todo' },
        { title: 'Board Presentation & Execution Session', description: 'Guide board members through execution and witness signing.', priority: 'medium', trackedHours: 0, status: 'todo' },
        { title: 'ROC & Regulatory Lodgement Sign-off', description: 'Submit updated filings to Registrar of Companies and archive deed.', priority: 'high', trackedHours: 0, status: 'todo' }
      ],
      scopeSections: [
        {
          title: 'Part 1: Due Diligence & Statutory Assessment',
          description: 'Review of legal liabilities and compliance status.',
          cost: 1000,
          deliverables: ['Legal Risk Matrix', 'Statutory Compliance Audit Report']
        },
        {
          title: 'Part 2: Drafting & Legal Instruments',
          description: 'Preparation of formal corporate deeds and board resolutions.',
          cost: 1700,
          deliverables: ['Draft Shareholder Agreement', 'Board & Shareholder Resolutions', 'Director Consent Forms']
        },
        {
          title: 'Part 3: Formal Execution & Regulatory Lodgement',
          description: 'Signing coordination and filing with Fiji Registrar of Companies.',
          cost: 800,
          deliverables: ['Executed Deed Copies', 'Official ROC Stamped Confirmation']
        }
      ]
    }
  },
  {
    id: 'automotive_mechanics',
    name: 'Automotive Services, Mechanics & Fleet',
    badge: 'Automotive & Fleet',
    tagline: 'Auto Mechanics, Diagnostic Specialists, Panel Beaters & Fleet Maintenance',
    iconName: 'Wrench',
    colorTheme: '#d97706',
    description: 'For auto mechanics, engine rebuilders, auto-electricians, panel beaters, tire shops, and fleet managers.',
    defaultUnits: [
      'Labor Hour',
      'Flat Service Fee',
      'Part / Item',
      'Call-Out Fee',
      'Inspection',
      'Kilometre',
      'Day'
    ],
    itemCategories: [
      'Mechanical Labor & Repairs',
      'Engine & Transmission',
      'Brakes, Rotors & Suspension',
      'Auto-Electrical & Battery',
      'Diagnostic Scans & Tuning',
      'Genuine & Aftermarket Parts',
      'Panel Beating & Spray Painting',
      'Roadworthy & LTA Certification',
      'Emergency Mobile Call-Out'
    ],
    suggestedJobFields: [
      { key: 'vehicleRego', label: 'Vehicle Rego / License Plate', placeholder: 'e.g. FJ-8821 or EX-449', example: 'FJ-8821', type: 'text' },
      { key: 'vehicleMakeModel', label: 'Vehicle Make, Model & Year', placeholder: 'e.g. Toyota Hilux 2.8L 4WD (2022)', example: 'Toyota Hilux 2.8L 4WD (2022)', type: 'text' },
      { key: 'odometerReading', label: 'Odometer Reading (km)', placeholder: 'e.g. 84,250 km', example: '84,250 km', type: 'text' },
      { key: 'vinNumber', label: 'VIN / Chassis Number', placeholder: 'e.g. JTF1123456789ABCD', example: 'JTF1123456789ABCD', type: 'text' }
    ],
    sampleServices: [
      {
        name: 'Major Vehicle Service & Comprehensive 60-Point Safety Check',
        description: 'Engine oil flush, synthetic lubricant replacement, oil/air/fuel filters, spark plugs, fluid top-up, and brake inspection.',
        rate: 220,
        unit: 'Flat Service Fee',
        type: 'service',
        category: 'Mechanical Labor & Repairs',
        itemType: 'service'
      },
      {
        name: 'Mechanical & Auto-Electrical Labor',
        description: 'Certified mechanic diagnostic and repair labor on engine, steering, suspension, and driveline components.',
        rate: 65,
        unit: 'Labor Hour',
        type: 'service',
        category: 'Mechanical Labor & Repairs',
        itemType: 'labor'
      },
      {
        name: 'Heavy Duty Front & Rear Ceramic Brake Pad Kit',
        description: 'Low-dust ceramic brake pads including shims, caliper clean, and hardware kit.',
        rate: 240,
        unit: 'Part / Item',
        type: 'service',
        category: 'Genuine & Aftermarket Parts',
        itemType: 'parts'
      },
      {
        name: 'Computerized OBD2 Diagnostic Scan & ECU Calibration',
        description: 'Full electronic system scan, error code clearance, sensor recalibration, and performance report.',
        rate: 85,
        unit: 'Inspection',
        type: 'service',
        category: 'Diagnostic Scans & Tuning',
        itemType: 'service'
      },
      {
        name: 'Emergency Mobile Mechanic Call-Out & Roadside Assistance',
        description: 'On-site mobile diagnostic van dispatch, battery jump-start, or roadside emergency triage.',
        rate: 95,
        unit: 'Call-Out Fee',
        type: 'service',
        category: 'Emergency Mobile Call-Out',
        itemType: 'service'
      }
    ],
    sampleProject: {
      name: 'Full Fleet Transmission Overhaul & Suspension Rebuild',
      description: 'Complete mechanical overhaul including gearbox rebuild, new heavy-duty shocks, and wheel alignment.',
      rateType: 'flat',
      defaultCost: 2600,
      tasks: [
        { title: 'Diagnostic Scan & Mechanical Teardown', description: 'Drop transmission, inspect clutch plate, flywheel, and synchros.', priority: 'high', trackedHours: 0, status: 'done' },
        { title: 'Parts Procurement & Quality Inspection', description: 'Source genuine seals, bearings, clutch kit, and suspension bushings.', priority: 'high', trackedHours: 0, status: 'in_progress' },
        { title: 'Transmission Reassembly & Fluid Fill', description: 'Reinstall gearbox with high-temp synthetic transmission fluid.', priority: 'high', trackedHours: 0, status: 'todo' },
        { title: 'Front & Rear Suspension Installation', description: 'Fit new shock absorbers, sway bar links, and tie rod ends.', priority: 'medium', trackedHours: 0, status: 'todo' },
        { title: 'Laser Wheel Alignment & 20km Road Test', description: 'Calibrate toe/camber, verify smooth shifting, and sign off inspection.', priority: 'high', trackedHours: 0, status: 'todo' }
      ],
      scopeSections: [
        {
          title: 'Labor: Mechanical Disassembly & Rebuild',
          description: 'Specialist technician labor for gearbox and driveline overhaul.',
          cost: 1200,
          deliverables: ['Complete Gearbox Overhaul', 'Suspension Assembly Replacement', 'Brake Fluid Bleed & Flush']
        },
        {
          title: 'Parts & Consumables (Itemized)',
          description: 'Heavy duty clutch kit, shock absorbers, synthetic lubricants, and seals.',
          cost: 1150,
          deliverables: ['1x Heavy Duty Clutch Kit', '4x Heavy Duty Shock Absorbers', 'Synthetic Driveline Lubricants']
        },
        {
          title: 'Certification & Quality Handover',
          description: 'Computer alignment, road test certificate, and warranty stamp.',
          cost: 250,
          deliverables: ['Laser Alignment Printout', 'Roadworthiness Sign-off Certificate', '6-Month / 10,000km Warranty Stamp']
        }
      ]
    }
  },
  {
    id: 'construction_trades',
    name: 'Construction, Trades, Electrical & Plumbing',
    badge: 'Trades & Contracting',
    tagline: 'Builders, Carpenters, Electricians, Plumbers, Roofers & Civil Contractors',
    iconName: 'Hammer',
    colorTheme: '#059669',
    description: 'For building contractors, carpenters, electricians, plumbers, tilers, painters, and site supervisors.',
    defaultUnits: [
      'Trade Hour',
      'Day',
      'm² (Square Metre)',
      'm (Linear Metre)',
      'm³ (Cubic Metre)',
      'Tonne',
      'Flat Fee',
      'Call-Out Fee',
      'Project'
    ],
    itemCategories: [
      'Structural Carpentry & Framing',
      'Electrical Contracting & Solar',
      'Plumbing, Drainage & Gas',
      'Concrete, Masonry & Foundation',
      'Tiling, Plastering & Waterproofing',
      'Roofing, Cladding & Guttering',
      'Earthmoving & Site Prep',
      'Project Site Management'
    ],
    suggestedJobFields: [
      { key: 'jobSiteAddress', label: 'Job Site Address / Lot #', placeholder: 'e.g. Lot 14 Votualevu Sub-division, Nadi', example: 'Lot 14 Votualevu Sub-division, Nadi', type: 'text' },
      { key: 'buildingPermitNo', label: 'Council Building Permit #', placeholder: 'e.g. SCC-BP-2026/410', example: 'SCC-BP-2026/410', type: 'text' },
      { key: 'architectEngineerRef', label: 'Architect / Structural Engineer Ref', placeholder: 'e.g. Viti Engineering Dwg # S-04', example: 'Viti Engineering Dwg # S-04', type: 'text' },
      { key: 'siteSafetyInduction', label: 'OHS Safety Plan / Induction ID', placeholder: 'e.g. OHS-PLAN-VITI-88', example: 'OHS-PLAN-VITI-88', type: 'text' }
    ],
    sampleServices: [
      {
        name: 'Licensed Commercial Electrical Contracting & Solar Setup',
        description: 'EFL-compliant switchboard wiring, sub-mains, conduit rough-in, solar inverters, and testing.',
        rate: 65,
        unit: 'Trade Hour',
        type: 'service',
        category: 'Electrical Contracting & Solar',
        itemType: 'labor'
      },
      {
        name: 'Plumbing Rough-in, Drainage & Hot Water Installation',
        description: 'Sanitary plumbing, stormwater drainage, high-pressure PVC lines, and solar water heater connections.',
        rate: 60,
        unit: 'Trade Hour',
        type: 'service',
        category: 'Plumbing, Drainage & Gas',
        itemType: 'labor'
      },
      {
        name: 'Porcelain Floor & Wall Tiling with Waterproof Membrane',
        description: 'Surface preparation, waterproof membrane application, laser leveling, adhesive tiling, and epoxy grouting.',
        rate: 38,
        unit: 'm² (Square Metre)',
        type: 'service',
        category: 'Tiling, Plastering & Waterproofing',
        itemType: 'service'
      },
      {
        name: 'Structural Timber Framing & Cyclone Tie-Down Labor',
        description: 'Hardwood framing, roof trusses, cyclone strapping, hurricane clips, and structural bracing.',
        rate: 55,
        unit: 'Trade Hour',
        type: 'service',
        category: 'Structural Carpentry & Framing',
        itemType: 'labor'
      },
      {
        name: 'Site Supervision & Construction Project Management',
        description: 'Dedicated site manager for contractor coordination, OHS compliance, and quality control.',
        rate: 450,
        unit: 'Day',
        type: 'service',
        category: 'Project Site Management',
        itemType: 'service'
      }
    ],
    sampleProject: {
      name: 'Commercial Office Fit-Out & Solar Electrical Installation',
      description: 'Complete internal partitions, custom cabinetry, EFL-certified electrical overhaul, and commercial solar system.',
      rateType: 'flat',
      defaultCost: 8500,
      tasks: [
        { title: 'Site Inspection & Bill of Quantities Sign-off', description: 'Verify architectural measurements and council permit clearance.', priority: 'high', trackedHours: 0, status: 'done' },
        { title: 'Demolition & Stud Wall Partition Framing', description: 'Erect galvanized steel stud frames and acoustic insulation batts.', priority: 'high', trackedHours: 0, status: 'in_progress' },
        { title: 'Electrical & Data Cabling Rough-in', description: 'Run Cat6 network lines, 3-phase power drops, and LED circuits.', priority: 'high', trackedHours: 0, status: 'todo' },
        { title: 'Drywall Sheeting, Plastering & Painting', description: 'Hang gyprock sheets, 3-coat plaster stop, and apply premium acrylic paint.', priority: 'medium', trackedHours: 0, status: 'todo' },
        { title: 'Solar Inverter Commissioning & EFL Sign-off', description: 'Connect 10kW commercial inverter, test islanding, and submit certificate.', priority: 'high', trackedHours: 0, status: 'todo' }
      ],
      scopeSections: [
        {
          title: 'Stage 1: Demolition & Structural Partitions',
          description: 'Site prep, steel stud partitions, and acoustic insulation.',
          cost: 2500,
          deliverables: ['Completed Partition Walls', 'Acoustic Soundproofing Installed']
        },
        {
          title: 'Stage 2: Electrical, Solar & Network Infrastructure',
          description: 'Commercial 3-phase wiring, solar panels, and server rack connections.',
          cost: 4200,
          deliverables: ['EFL Certified Wiring', '10kW Solar PV System Commissioned', 'High-Speed Network Data Drops']
        },
        {
          title: 'Stage 3: Finishes, Fixtures & Council Practical Completion',
          description: 'Painting, door hardware, cleanup, and council certificate.',
          cost: 1800,
          deliverables: ['Finished Interior Surfaces', 'Council Practical Completion Sign-off']
        }
      ]
    }
  },
  {
    id: 'creative_events',
    name: 'Creative Design, Photography & Events',
    badge: 'Creative & Events',
    tagline: 'Brand Designers, Photographers, Social Marketers & Event Planners',
    iconName: 'Sparkles',
    colorTheme: '#7c3aed',
    description: 'For graphic designers, commercial photographers, social media creators, event producers, and entertainment MCs.',
    defaultUnits: [
      'Hour',
      'Day',
      'Package',
      'Event',
      'Photo / Asset',
      'Month',
      'Flat Fee'
    ],
    itemCategories: [
      'Brand Identity & Logo Design',
      'Commercial & Resort Photography',
      'Social Media Campaign Creation',
      'Event Planning & Coordination',
      'Master of Ceremonies (MC) & Hosting',
      'Exhibition & Signage Design',
      'Print Collateral & Packaging'
    ],
    suggestedJobFields: [
      { key: 'eventDateVenue', label: 'Event Date & Venue', placeholder: 'e.g. 24 October 2026, Grand Pacific Hotel Suva', example: '24 October 2026, Grand Pacific Hotel Suva', type: 'text' },
      { key: 'deliverableFormat', label: 'Deliverable File Formats', placeholder: 'e.g. Vector AI, High-Res PNG, PDF Print Ready', example: 'Vector AI, High-Res PNG, PDF Print Ready', type: 'text' },
      { key: 'campaignTimeline', label: 'Campaign Flight / Launch Date', placeholder: 'e.g. Q3 Summer Campaign Launch', example: 'Q3 Summer Campaign Launch', type: 'text' }
    ],
    sampleServices: [
      {
        name: 'Complete Brand Identity Suite & Visual Guidelines',
        description: 'Primary logo, secondary marks, color palette, typography hierarchy, social badges, and brand stylebook.',
        rate: 850,
        unit: 'Package',
        type: 'service',
        category: 'Brand Identity & Logo Design',
        itemType: 'service'
      },
      {
        name: 'Commercial Product & Resort Lifestyle Photography',
        description: 'Professional lighting setup, food/lifestyle staging, on-site photography, and high-res retouching.',
        rate: 120,
        unit: 'Hour',
        type: 'service',
        category: 'Commercial & Resort Photography',
        itemType: 'service'
      },
      {
        name: 'Monthly Social Media Content & Reel Production Pack',
        description: '8 custom graphic carousels, 4 short-form video reels, copywriting, hashtags, and monthly analytics report.',
        rate: 650,
        unit: 'Month',
        type: 'saas',
        billingInterval: 'monthly',
        category: 'Social Media Campaign Creation',
        itemType: 'retainer'
      },
      {
        name: 'Live Event Master of Ceremonies (MC) & Coordination',
        description: 'Corporate gala or festival hosting, run-of-show management, audience engagement, and speaker introductions.',
        rate: 600,
        unit: 'Event',
        type: 'service',
        category: 'Master of Ceremonies (MC) & Hosting',
        itemType: 'service'
      }
    ],
    sampleProject: {
      name: 'Resort Brand Re-launch & Digital Media Suite',
      description: 'Brand refresh, menu designs, commercial photography library, and social launch rollout.',
      rateType: 'flat',
      defaultCost: 3200,
      tasks: [
        { title: 'Brand Discovery & Moodboard Direction', description: 'Establish Pacific aesthetic, color harmonies, and typography.', priority: 'high', trackedHours: 0, status: 'done' },
        { title: 'Logo Suite & Vector Assets Creation', description: 'Design primary logo, crest mark, and pattern assets.', priority: 'high', trackedHours: 0, status: 'in_progress' },
        { title: 'On-Location Photography Shoot (Food & Amenities)', description: 'Capture 50 high-res hero images with professional strobe lighting.', priority: 'medium', trackedHours: 0, status: 'todo' },
        { title: 'Menu & Signage Print Collateral Layout', description: 'Layout cocktail menus, room directories, and entrance signage.', priority: 'medium', trackedHours: 0, status: 'todo' },
        { title: 'Final Brand Guidelines & Asset Delivery', description: 'Export full vector kit, color codes, and web assets.', priority: 'high', trackedHours: 0, status: 'todo' }
      ],
      scopeSections: [
        {
          title: 'Component 1: Visual Identity & Guidelines',
          description: 'Vector logo system, color palettes, and brand guidelines.',
          cost: 1100,
          deliverables: ['Vector Master Files (AI/EPS)', 'Brand Stylebook PDF', 'Social Media Profile Kits']
        },
        {
          title: 'Component 2: Commercial Photo Library',
          description: 'Full day photography shoot and high-res retouching.',
          cost: 1300,
          deliverables: ['50x High-Res Retouched Images', 'Full Commercial Usage License', 'Web-Optimized Image Exports']
        },
        {
          title: 'Component 3: Print Collateral & Digital Assets',
          description: 'Menus, flyers, banners, and digital email signatures.',
          cost: 800,
          deliverables: ['Press-Ready PDF Menu Layouts', 'Digital Email Signatures', 'Social Media Launch Templates']
        }
      ]
    }
  },
  {
    id: 'general_consulting',
    name: 'General Freelance & Business Consulting',
    badge: 'General Business',
    tagline: 'Strategic Advisors, Translators, Researchers & Solo Freelancers',
    iconName: 'Briefcase',
    colorTheme: '#334155',
    description: 'For solo freelancers, market researchers, translators, virtual assistants, and business advisors.',
    defaultUnits: [
      'Hour',
      'Day',
      'Project',
      'Month',
      'Session',
      'Word / Page',
      'Retainer',
      'Flat Fee'
    ],
    itemCategories: [
      'Strategic Business Consulting',
      'Market Research & Feasibility',
      'Translation, Copywriting & Proofreading',
      'Virtual Assistance & Operations',
      'Training & Workshop Facilitation',
      'Project Coordination'
    ],
    suggestedJobFields: [
      { key: 'engagementScope', label: 'Engagement Objective / Scope', placeholder: 'e.g. Market Entry & Feasibility Assessment', example: 'Market Entry & Feasibility Assessment', type: 'text' },
      { key: 'deliverableTarget', label: 'Deliverable Target Date', placeholder: 'e.g. End of Month Milestone', example: 'End of Month Milestone', type: 'text' }
    ],
    sampleServices: [
      {
        name: 'Business Strategy & Operational Efficiency Consulting',
        description: 'Workflow review, ways to improve profit, better systems and advice for management.',
        rate: 90,
        unit: 'Hour',
        type: 'service',
        category: 'Strategic Business Consulting',
        itemType: 'service'
      },
      {
        name: 'Pacific Market Research & Feasibility Analysis',
        description: 'Demographic research, competitor matrix, consumer sentiment analysis, and formal feasibility report.',
        rate: 850,
        unit: 'Project',
        type: 'service',
        category: 'Market Research & Feasibility',
        itemType: 'service'
      },
      {
        name: 'Professional Translation & Localization (English / iTaukei / Hindi)',
        description: 'Accurate commercial, legal, and public sector document translations with certified proofreading.',
        rate: 55,
        unit: 'Hour',
        type: 'service',
        category: 'Translation, Copywriting & Proofreading',
        itemType: 'service'
      },
      {
        name: 'Executive Virtual Assistance & Project Coordination',
        description: 'Dedicated administrative management, CRM data hygiene, appointment scheduling, and customer outreach.',
        rate: 35,
        unit: 'Hour',
        type: 'service',
        category: 'Virtual Assistance & Operations',
        itemType: 'service'
      }
    ],
    sampleProject: {
      name: 'Pacific Market Expansion Feasibility & Growth Plan',
      description: 'Market sizing, regulatory analysis, competitive benchmarking, and roadmap execution.',
      rateType: 'flat',
      defaultCost: 2800,
      tasks: [
        { title: 'Stakeholder Interviews & Objectives Alignment', description: 'Interview leadership team to define key expansion targets.', priority: 'high', trackedHours: 0, status: 'done' },
        { title: 'Market Sizing & Competitor Intelligence Gathering', description: 'Analyze pricing models, target demographics, and market barriers.', priority: 'high', trackedHours: 0, status: 'in_progress' },
        { title: 'Regulatory & Statutory Compliance Mapping', description: 'Map FRCS tax rules, business licensing, and trade requirements.', priority: 'medium', trackedHours: 0, status: 'todo' },
        { title: 'Financial Modeling & 3-Year Projections', description: 'Build revenue forecast, cost of goods, and break-even timelines.', priority: 'high', trackedHours: 0, status: 'todo' },
        { title: 'Executive Strategy Workshop & Report Handover', description: 'Deliver 30-page feasibility report and lead executive Q&A.', priority: 'high', trackedHours: 0, status: 'todo' }
      ],
      scopeSections: [
        {
          title: 'Phase 1: Research & Discovery Matrix',
          description: 'Market research, competitor benchmarking, and consumer sentiment.',
          cost: 900,
          deliverables: ['Competitor Benchmark Matrix', 'Consumer Demographics Report']
        },
        {
          title: 'Phase 2: Financial & Operational Modeling',
          description: 'Cost structures, pricing recommendations, and revenue projections.',
          cost: 1200,
          deliverables: ['Financial Projections Model (Excel/Sheets)', 'Operational Readiness Checklist']
        },
        {
          title: 'Phase 3: Final Strategy Report & Executive Presentation',
          description: 'Complete 30-page strategic report and 2-hour executive workshop.',
          cost: 700,
          deliverables: ['Formal Feasibility Report (PDF)', 'Executive Slide Deck Presentation']
        }
      ]
    }
  }
];

export function getIndustryPreset(id?: string): IndustryPreset {
  return INDUSTRY_PRESETS.find(p => p.id === id) || INDUSTRY_PRESETS[0];
}

export function getAllUnits(): string[] {
  const set = new Set<string>();
  INDUSTRY_PRESETS.forEach(p => {
    p.defaultUnits.forEach(u => set.add(u));
  });
  return Array.from(set);
}
