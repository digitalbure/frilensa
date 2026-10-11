# Frilensa: features and improvement plan

Status as of v3.7.0 (October 2026). Each feature is marked by whether it actually works in the live app:

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
- ✅ "View online" links, share links and PDF QR codes open a public page for that one document (`/?doc=…`): view, download the PDF, accept a quote or report a payment. *(3.1.0)*
- ✅ Retainers and recurring invoices: auto-generate retainers are invoiced every morning on their due date; optionally emailed to the client. *(3.4.0)*
- ✅ Overdue reminders (3, 10 and 21 days after the due date), switched on in Settings. *(3.4.0)*

### Clients (CRM)
- ✅ Client directory (table/grid), TIN, currency, contacts, subscriptions, outstanding-balance filter.
- ✅ Client detail drawer: documents, financial summary, message thread with the client.
- ✅ Portal access: create, copy or revoke a private link, set a PIN.

### Client portal
- ✅ Client sees their sent quotes, invoices and receipts, plus projects and messages.
- ✅ Accept quotes, report a payment, message the consultant.
- ✅ Payments inbox on the dashboard: confirm (records the payment) or reject client-reported payments; accepted quotes, unread messages and booking requests listed alongside. Email notifications when clients act. *(3.2.0)*

### Projects
- ✅ Kanban board and grid, with statuses, tasks, deliverables, time tracking and "bill hours" to an invoice.
- ✅ Industry workflow templates and an AI scope-of-work generator.
- ✅ Profitability charts (estimated vs actual cost, hours vs revenue).

### Finance (bookkeeping)
- ✅ P&L with category breakdown and VAT input/output summary.
- ✅ VAT return for any period (invoice or payments basis) with warnings, CSV and print; CSV exports for accountants. *(3.7.0)*
- ✅ Expense logging: manual, or camera/receipt OCR (Gemini, with a basic fallback parser). Receipts are kept in Cloud Storage (`FILES_BUCKET`, `server/files.ts`).
- ✅ Pay now on invoices (`server/payNow.ts`, `src/components/PayNowPanel.tsx`): bank transfer, M-PAiSA and MyCash (manual; client reports, consultant confirms) plus card and PayPal through each business's own PayPal REST app (keys in Settings, secret AES-GCM encrypted with `PAYMENT_SECRETS_KEY` in the server-only `paypal_accounts` collection). The server creates and captures orders, checks the amount and invoice, then marks the invoice paid, logs the ledger entry and issues the receipt; captures are recorded in `paypal_captures` so retries aren't double-counted. FJD and other non-PayPal currencies are charged in the business's chosen AUD/NZD/USD at its exchange rate; optional surcharge up to 10%.
- ✅ Assistant (Assistant tab, `server/assistant.ts`): Claude (`ANTHROPIC_API_KEY`, set from the Secret Manager secret `anthropic-api-key` by the deploy script). It answers from the help articles (`src/help/articles.ts`, also shown in Settings → Help) and looks up the user's data with the same reads as the public API. It proposes tasks, clients, draft quotes and invoices, and expenses, which are saved only when the user presses Confirm. It can't send, email, record payments or delete. Rate limit: 60 questions per user per hour.
- ✅ Services and rates catalogue (Bookkeeping → Services): items per business with rate tiers, cost prices and margins, starter packs, price adjustments and a rate sheet.
- ✅ Shareable rate card (`/?rates=<token>`, `server/rateCards.ts`): a business's services, rates and quote terms, printable, with a booking request form.
- ✅ Bookings (`server/bookings.ts`, `src/lib/bookings.ts`): one inbox for booking requests from the rate card, the directory and apps (`/api/v1/booking-form`, `/api/v1/booking-requests`, MCP `get_booking_form`, `list_booking_requests`, `get_booking_request`). Requests live in server-only `quote_requests` with a `channel`; prices and answers are checked on the server against the business's bookable services and booking questions (Finance → Services → Bookings). Progress (`stage`) is worked out when read from the quote (`documentId`) and invoices (`sourceQuoteId`).
- ✅ Default terms per business: invoice payment terms, quote validity and terms text, filled in on new quotes and invoices (app, API and retainers).
- ✅ Reimbursable expenses: bill an expense to a client and add it to their invoice at cost or with markup, without VAT by default. Clients open the receipts from the invoice or portal.
- ✅ Bank statement import (BSP/ANZ/Westpac/M-PAiSA text and CSV), with AI categorisation and VAT split.
- ✅ Transaction reconciler with AI-suggested matches, duplicate audit and clean-up, ledger history with undo.
- ✅ Simple service list and dynamic rate rules (rush, weekend, VIP modifiers).

### AI Copilot
- ✅ Chat advisor with your business context, document and image attachments, a long-term memory bank, and saved conversations.
- ⚠️ Email transcript works only with SendGrid configured.
- ✅ Reachable on phones from the "AI" tab. *(3.3.0)*

### Directory and bookings
- ✅ Shared directory: list your business, browse other Frilensa businesses, and send booking requests that reach the provider. Providers accept, decline or complete; requesters can cancel. Accepted bookings convert to a draft invoice. *(3.1.0)*
- ⚠️ No reviews or verification yet (the made-up ratings and "FRCS Verified" badges were removed in 3.1.0). Booking emails need SendGrid configured.
- ⚠️ The admin panel's directory tab still shows each admin's old local list, not the shared directory.

### Escrow and wallet
- ⛔ A milestone escrow and wallet module exists in code (`WalletEscrowView`) but isn't linked anywhere, and there's no real money movement behind it.

### Settings
- ✅ Venture profiles, brand designer (colours from logo), social links, document numbering, taxes and fees, working currencies and FX overrides, custom fields.
- ✅ Backup export/import (JSON) and restore from the device copy; manual cloud sync.
- ✅ Release notes generated from `CHANGELOG.md`.
- ⚠️ Subscription plans: free "early access" switch; no billing.
- ⚠️ Admin panel (for `VITE_ADMIN_EMAILS` only): edits your own workspace's platform settings, and its tenant list is sample data.

### Platform
- ✅ Public REST API and MCP server for AI assistants, with personal API keys (read, or read and create drafts). *(3.5.0, see `docs/API.md`)*
- ✅ Works as a custom connector in Claude (web, desktop, phone) with OAuth sign-in; connected apps listed and removable in Settings. *(3.6.0)*
- ✅ Installable PWA (manifest, icons, install prompt).
- ⚠️ The service worker caches nothing, so there's no real offline mode beyond Firestore's own cache.

---

## Recommended improvements

Ordered by impact on a live site. Effort: S ≈ a day, M ≈ a few days, L ≈ a week or more.

### P0: fix before promoting the site

| # | Improvement | Why | Effort |
| --- | --- | --- | --- |
| 1 | **Deploy v3.0.0 and its Firestore rules** | The live database is open to anyone until the new rules are deployed. | S |
| 2 | ~~Remove the fabricated directory listings and seeded bookings~~ | Done in 3.1.0. | — |
| 3 | ~~Make "View online" links and QR codes work~~ | Done in 3.1.0. Links on invoices sent before 3.1.0 still can't open directly; resend important ones. | — |
| 4 | **Decide on the hidden features**: link up or delete the Escrow screens (the escrow payment option was dropped in 3.1.0) | Unreachable code, and the changelog advertises features users can't reach. | S–M |
| 5 | ~~Add AI Copilot to mobile navigation~~ | Done in 3.3.0. | — |

### P1: core value for Fiji freelancers

| # | Improvement | Why | Effort |
| --- | --- | --- | --- |
| 6 | ~~Payments inbox~~ | Done in 3.2.0; automatic receipts in 3.3.0. | — |
| 7 | ~~Email notifications~~ | Done in 3.2.0. Still to do: WhatsApp/SMS, and push notifications for the installed app. | — |
| 8 | ~~Scheduled jobs on the server~~ | Done in 3.4.0: daily retainer invoices and overdue reminders. | — |
| 9 | **Online payment collection**: card payments (e.g. Stripe or Windcave), then M-PAiSA / MyCash merchant APIs where available; webhooks mark invoices paid | "Pay now" on an invoice is the biggest conversion lever. | L |
| 10 | **Real subscription billing** using the same payment provider, enforced server-side | Plans are currently free and changeable by any user. | M |
| 11 | ~~FRCS VAT return report~~ | Done in 3.7.0. | — |
| 12 | **Accountant access**: read-only invite for an accountant (CSV exports done in 3.7.0) | Small businesses hand books to an accountant. | S–M |
| 13 | **Email deliverability**: authenticate frilensa.com in SendGrid (SPF/DKIM/DMARC), and use a per-business reply-to | Invoices from an unauthenticated domain land in spam. | S |

### P2: scale, quality and operations

| # | Improvement | Why | Effort |
| --- | --- | --- | --- |
| 14 | **Split the workspace into Firestore collections** (clients, documents, expenses, etc.) | One document per user has a 1 MB cap. Active users will hit it, and receipts are already dropped to fit. | L |
| 15 | **Code-split the front end** (lazy-load each tab, PDF and chart libraries) | The main bundle is 3.3 MB (850 KB gzipped), which is slow on mobile data. | S–M |
| 16 | ~~Continuous integration~~ | Done in 3.3.0 (`.github/workflows/ci.yml`). | — |
| 17 | **Automated tests** for VAT, fee and FX calculations, the statement parser and the portal API | Money maths with no tests is the riskiest code in the app. | M |
| 18 | **Error monitoring and uptime checks** (e.g. Sentry; ping `/api/health`, which now reports the live version) | You currently find out about failures from users. | S |
| 19 | **Break up the very large screens** (Billing 4,000 lines; Bookkeeping, Projects and Settings ~3,000 each) | Hard to change safely; every edit risks side effects. | L |
| 20 | **Accessibility and readability**: raise the minimum text size (much of the UI is 9–10px), check contrast, add labels | Easier on phones and for older users; a common reason people abandon an app. | M |
| 21 | **Real offline support**: cache the app shell in the service worker and queue writes | The PWA currently needs a connection to start. | M |
| 22 | **Server-side invite codes and registration modes** | Today they're enforced only in the browser. | S |
| 23 | **Fijian and Hindi copy** for client-facing pages (portal, invoice emails) | Broadens reach with clients. | M |
| 24 | **Replace the "FRCS-FJ-…" verification hash** on PDFs and emails with a plain document reference | It looks like an FRCS-issued code, but nothing verifies it. | S |
