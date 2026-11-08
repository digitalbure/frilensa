// Platform modules that super admins can switch on or off for everyone, with each module's settings
// (Admin → Modules). Stored in the platform config (platform/config.modules) and enforced on the server;
// the app also hides switched-off modules. Shared by the app and the server.

export interface ModuleSettings {
  marketplace: { enabled: boolean; firstListingReview: boolean; maxListingsPerUser: number; maxPhotos: number };
  bookingPage: { enabled: boolean; dailyCapPerBusiness: number; ackEmails: boolean };
  rateCards: { enabled: boolean };
  clientPortal: { enabled: boolean };
  payNow: { enabled: boolean; paypal: boolean };
  assistant: { enabled: boolean; messagesPerMonth: number };
  aiTools: { enabled: boolean };
  api: { enabled: boolean; mcp: boolean; maxKeysPerUser: number };
  webhooks: { enabled: boolean; maxPerUser: number };
  documentEmails: { enabled: boolean };
  automation: { enabled: boolean; retainers: boolean; reminders: boolean };
  projects: { enabled: boolean };
  bookkeeping: { enabled: boolean };
}
export type ModuleId = keyof ModuleSettings;

export const DEFAULT_MODULES: ModuleSettings = {
  marketplace: { enabled: true, firstListingReview: true, maxListingsPerUser: 50, maxPhotos: 6 },
  bookingPage: { enabled: true, dailyCapPerBusiness: 50, ackEmails: true },
  rateCards: { enabled: true },
  clientPortal: { enabled: true },
  payNow: { enabled: true, paypal: true },
  assistant: { enabled: true, messagesPerMonth: 0 },
  aiTools: { enabled: true },
  api: { enabled: true, mcp: true, maxKeysPerUser: 10 },
  webhooks: { enabled: true, maxPerUser: 10 },
  documentEmails: { enabled: true },
  automation: { enabled: true, retainers: true, reminders: true },
  projects: { enabled: true },
  bookkeeping: { enabled: true }
};

type Field = { key: string; label: string; help?: string } & ({ type: 'bool' } | { type: 'number'; min: number; max: number; zeroMeans?: string });

/** What each module is, what switching it off does, and its settings: drives Admin → Modules. */
export const MODULE_INFO: Record<ModuleId, { name: string; description: string; off: string; fields: Field[] }> = {
  marketplace: {
    name: 'Marketplace', description: 'Gear to rent or buy and services, listed by users or by Frilensa as their agent.',
    off: 'The Market tab and frilensa.com/marketplace are hidden, and listing and requests stop. Listings are kept.',
    fields: [
      { key: 'firstListingReview', label: "Review a user's first listing", type: 'bool', help: 'Off: every listing goes live straight away.' },
      { key: 'maxListingsPerUser', label: 'Listings per user', type: 'number', min: 1, max: 1000 },
      { key: 'maxPhotos', label: 'Photos per listing', type: 'number', min: 1, max: 20 }
    ]
  },
  bookingPage: {
    name: 'Booking page and website widget', description: "Each business's public booking page and the widget for their website.",
    off: 'Booking pages and widgets show as unavailable. Booking requests already received are kept.',
    fields: [
      { key: 'dailyCapPerBusiness', label: 'Booking requests a day per business', type: 'number', min: 1, max: 10000, help: 'Stops floods of spam.' },
      { key: 'ackEmails', label: 'Allow acknowledgement emails to customers', type: 'bool' }
    ]
  },
  rateCards: { name: 'Rate cards', description: 'Shareable rate card links and the quote requests they send.', off: 'Rate card links stop working and businesses can’t make new ones.', fields: [] },
  clientPortal: { name: 'Client portal', description: 'Clients sign in to see their documents, pay and send messages.', off: 'Clients can’t sign in to portals, and no new portal links can be made.', fields: [] },
  payNow: {
    name: 'Pay now', description: 'Pay buttons on online invoices: bank, M-PAiSA, MyCash, and card or PayPal.',
    off: 'Online invoices show no pay options.',
    fields: [{ key: 'paypal', label: 'Card and PayPal payments', type: 'bool', help: 'Off: only bank, M-PAiSA and MyCash details are shown.' }]
  },
  assistant: {
    name: 'AI assistant', description: 'The assistant that answers questions and drafts records.',
    off: 'The Assistant tab is hidden.',
    fields: [{ key: 'messagesPerMonth', label: 'Messages a month per user', type: 'number', min: 0, max: 100000, zeroMeans: 'No limit' }]
  },
  aiTools: { name: 'AI tools', description: 'AI receipt scanning, bank statement sorting, scope drafting and email transcripts.', off: 'These AI tools say they’re unavailable.', fields: [] },
  api: {
    name: 'Public API and MCP', description: 'API keys for other apps, and the MCP server for AI assistants such as Claude.',
    off: 'API keys and connected assistants stop working. Keys are kept.',
    fields: [
      { key: 'mcp', label: 'MCP server for AI assistants', type: 'bool' },
      { key: 'maxKeysPerUser', label: 'API keys per user', type: 'number', min: 1, max: 100 }
    ]
  },
  webhooks: {
    name: 'Webhooks', description: 'Booking updates sent to other apps.', off: 'No webhooks are sent and none can be added. They’re kept.',
    fields: [{ key: 'maxPerUser', label: 'Webhooks per user', type: 'number', min: 1, max: 100 }]
  },
  documentEmails: { name: 'Emailing documents', description: 'Sending quotes, invoices and receipts to clients by email from Frilensa.', off: 'The Email buttons say emailing is unavailable; people can still download and share documents.', fields: [] },
  automation: {
    name: 'Daily automation', description: 'Retainer invoices created on schedule, and overdue reminders.',
    off: 'The daily job creates and sends nothing for users (plan reminders and webhook retries still run).',
    fields: [
      { key: 'retainers', label: 'Create retainer invoices', type: 'bool' },
      { key: 'reminders', label: 'Send overdue reminders', type: 'bool' }
    ]
  },
  projects: { name: 'Projects', description: 'Projects, tasks, scope of work and time tracking.', off: 'The Projects tab is hidden. Projects are kept.', fields: [] },
  bookkeeping: { name: 'Finance and bookkeeping', description: 'Expenses, bank transactions and the VAT return.', off: 'The Finance tab is hidden. Records are kept.', fields: [] }
};

/** Tidies module settings; anything missing takes the default. */
export function cleanModules(raw: any): ModuleSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out: any = {};
  for (const id of Object.keys(DEFAULT_MODULES) as ModuleId[]) {
    const def: any = DEFAULT_MODULES[id];
    const given = r[id] && typeof r[id] === 'object' ? r[id] : {};
    const m: any = { enabled: typeof given.enabled === 'boolean' ? given.enabled : def.enabled };
    for (const f of MODULE_INFO[id].fields) {
      const v = given[f.key];
      if (f.type === 'bool') m[f.key] = typeof v === 'boolean' ? v : def[f.key];
      else { const n = Math.round(Number(v)); m[f.key] = Number.isFinite(n) && v !== '' && v !== null && v !== undefined ? Math.min(f.max, Math.max(f.min, n)) : def[f.key]; }
    }
    out[id] = m;
  }
  return out;
}
