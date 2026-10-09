# Frilensa: features and improvement plan

Status as of v3.0.0 (October 2026). Each feature is marked by whether it actually works in the live app:

- ✅ works
- ⚠️ works with a significant gap
- ⛔ built but not reachable, or misleading

## Feature inventory

### Sign-in and onboarding
- ✅ Email/password (with email verification) and Google sign-in.
- ✅ "I'm a Client" sign-in for the client portal (email + PIN).
- ✅ First-time onboarding wizard: account type, industry, VAT registration, currency; seeds a starter service catalogue for the chosen industry.
- ✅ Inactivity auto-logout (configurable, default 15 minutes).
- ⚠️ Invite-only registration and invite codes: enforced only in the browser, and the codes are in the app's source. Not a real access control.

### Dashboard ("Hub")
- ✅ Workspace switcher across multiple ventures (businesses), with venture profile editing.
- ✅ Cash summary (collected vs pending), multi-currency and inward TT remittance breakdown, six-month revenue vs expenses chart.
- ✅ Universal search across documents, clients and projects; quick actions; active projects widget; recent activity log with CSV export.

### Billing (quotes, invoices, receipts, credit notes)
- ✅ Document builder: line items, Fiji VAT (12.5% default, exempt toggle), ECAL/STT and custom taxes and fees, multi-currency with FX calculator, per-venture numbering prefixes.
- ✅ Statuses (draft, sent, partial, paid, overdue, cancelled) with a quick switcher; cancellation with automatic credit note.
- ✅ Partial payments and payment logging with FX and bank-fee deductions, plus payment attachments.
- ✅ PDF export and print, with branding, bank details and a QR code.
- ⚠️ Email to client via SendGrid: works once `SENDGRID_API_KEY` is set; otherwise it says it can't send.
- ⛔ "View online" links and invoice QR codes (`?viewDoc=…`, `frilensa.com/docs/…`) aren't handled by the app; they land on the login page.
- ⚠️ Retainers and recurring invoices: invoices are generated only when you press the run button in the app. Nothing runs on a schedule, and nothing is sent automatically.

### Clients (CRM)
- ✅ Client directory (table/grid), TIN, currency, contacts, subscriptions, outstanding-balance filter.
- ✅ Client detail drawer: documents, financial summary, message thread with the client.
- ✅ Portal access: create, copy or revoke a private link, set a PIN.

### Client portal
- ✅ Client sees their sent quotes, invoices and receipts, plus projects and messages.
- ✅ Accept quotes, report a payment, message the consultant.
- ⚠️ Consultants see a reported payment only as a note on the invoice. There's no "confirm payment" inbox, and no notification when a client acts.

### Projects
- ✅ Kanban board and grid, with statuses, tasks, deliverables, time tracking and "bill hours" to an invoice.
- ✅ Industry workflow templates and an AI scope-of-work generator.
- ✅ Profitability charts (estimated vs actual cost, hours vs revenue).

### Finance (bookkeeping)
- ✅ P&L with category breakdown and VAT input/output summary.
- ✅ Expense logging: manual, or camera/receipt OCR (Gemini, with a basic fallback parser).
- ✅ Bank statement import (BSP/ANZ/Westpac/M-PAiSA text and CSV), with AI categorisation and VAT split.
- ✅ Transaction reconciler with AI-suggested matches, duplicate audit and clean-up, ledger history with undo.
- ✅ Simple service list and dynamic rate rules (rush, weekend, VIP modifiers).
- ⛔ The full Services & Rates Catalogue screen (bulk rate adjust, printable rate sheets, SKUs, margins) exists in code (`ServicesView`) but isn't linked anywhere.

### AI Copilot
- ✅ Chat advisor with your business context, document and image attachments, a long-term memory bank, and saved conversations.
- ⚠️ Email transcript works only with SendGrid configured.
- ⚠️ Not in the mobile bottom navigation; only reachable on desktop.

### Directory and bookings
- ⛔ The directory every user sees is seeded with **made-up businesses badged "FRCS Verified"**, and sample bookings are seeded into each new account. Listings and bookings are stored per user, so a booking never reaches the business you booked.
- ⛔ The booking form offers "escrow" payment, but the escrow feature isn't reachable.

### Escrow and wallet
- ⛔ A milestone escrow and wallet module exists in code (`WalletEscrowView`) but isn't linked anywhere, and there's no real money movement behind it.

### Settings
- ✅ Venture profiles, brand designer (colours from logo), social links, document numbering, taxes and fees, working currencies and FX overrides, custom fields.
- ✅ Backup export/import (JSON) and restore from the device copy; manual cloud sync.
- ✅ Release notes generated from `CHANGELOG.md`.
- ⚠️ Subscription plans: free "early access" switch; no billing.
- ⚠️ Admin panel (for `VITE_ADMIN_EMAILS` only): edits your own workspace's platform settings, and its tenant list is sample data.

### Platform
- ✅ Installable PWA (manifest, icons, install prompt).
- ⚠️ The service worker caches nothing, so there's no real offline mode beyond Firestore's own cache.

---

## Recommended improvements

Ordered by impact on a live site. Effort: S ≈ a day, M ≈ a few days, L ≈ a week or more.

### P0: fix before promoting the site

| # | Improvement | Why | Effort |
| --- | --- | --- | --- |
| 1 | **Deploy v3.0.0 and its Firestore rules** | The live database is open to anyone until the new rules are deployed. | S |
| 2 | **Remove the fabricated directory listings and seeded bookings** (or hide the directory until it's real) | Real users see invented "FRCS Verified" businesses and can "book" them. That's a trust and legal risk. | S |
| 3 | **Make "View online" links and QR codes work**: send the client to their portal via a signed link | Every emailed invoice and printed QR code currently leads to a login page. | M |
| 4 | **Decide on the hidden features**: link up or delete the Rates Catalogue and Escrow screens, and drop the escrow payment option | 2,700 lines of unreachable code, and the changelog advertises features users can't reach. | S–M |
| 5 | **Add AI Copilot to mobile navigation** | Most Fiji users will be on phones. | S |

### P1: core value for Fiji freelancers

| # | Improvement | Why | Effort |
| --- | --- | --- | --- |
| 6 | **Payments inbox**: list client-reported payments with Confirm / Reject, auto-create the receipt, and notify the client | Closes the loop the portal starts. | M |
| 7 | **Notifications**: email (and optionally WhatsApp) the consultant when a client accepts a quote, reports a payment or sends a message | At the moment you'd only notice by opening the app. | M |
| 8 | **Scheduled jobs on the server**: generate retainer invoices on their due date, and send overdue reminders (gentle, then firm) | Getting paid on time is the main job of the product; today it depends on you remembering to press a button. | M |
| 9 | **Online payment collection**: card payments (e.g. Stripe or Windcave), then M-PAiSA / MyCash merchant APIs where available; webhooks mark invoices paid | "Pay now" on an invoice is the biggest conversion lever. | L |
| 10 | **Real subscription billing** using the same payment provider, enforced server-side | Plans are currently free and changeable by any user. | M |
| 11 | **FRCS VAT return report**: output and input VAT by period, exportable for filing | Completes the "tax compliance" promise. | M |
| 12 | **Accountant access and exports**: read-only invite, plus CSV / Xero-style exports of invoices, expenses and the ledger | Small businesses hand books to an accountant. | M |
| 13 | **Email deliverability**: authenticate frilensa.com in SendGrid (SPF/DKIM/DMARC), and use a per-business reply-to | Invoices from an unauthenticated domain land in spam. | S |

### P2: scale, quality and operations

| # | Improvement | Why | Effort |
| --- | --- | --- | --- |
| 14 | **Split the workspace into Firestore collections** (clients, documents, expenses, etc.) | One document per user has a 1 MB cap. Active users will hit it, and receipts are already dropped to fit. | L |
| 15 | **Code-split the front end** (lazy-load each tab, PDF and chart libraries) | The main bundle is 3.3 MB (850 KB gzipped), which is slow on mobile data. | S–M |
| 16 | **Continuous integration**: GitHub Actions running typecheck, build and the Firestore rules tests on every push | Catches regressions before they reach frilensa.com. | S |
| 17 | **Automated tests** for VAT, fee and FX calculations, the statement parser and the portal API | Money maths with no tests is the riskiest code in the app. | M |
| 18 | **Error monitoring and uptime checks** (e.g. Sentry; ping `/api/health`, which now reports the live version) | You currently find out about failures from users. | S |
| 19 | **Break up the very large screens** (Billing 4,000 lines; Bookkeeping, Projects and Settings ~3,000 each) | Hard to change safely; every edit risks side effects. | L |
| 20 | **Accessibility and readability**: raise the minimum text size (much of the UI is 9–10px), check contrast, add labels | Easier on phones and for older users; a common reason people abandon an app. | M |
| 21 | **Real offline support**: cache the app shell in the service worker and queue writes | The PWA currently needs a connection to start. | M |
| 22 | **Server-side invite codes and registration modes** | Today they're enforced only in the browser. | S |
| 23 | **Fijian and Hindi copy** for client-facing pages (portal, invoice emails) | Broadens reach with clients. | M |
