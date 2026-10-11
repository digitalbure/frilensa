# Changelog

All notable changes to Frilensa are recorded here. This file is the single source of release notes: the **Settings → App Version & Release Notes** panel renders it, so write entries for users as well as developers.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/):

| Bump | When | Examples |
| --- | --- | --- |
| **Major** (`X.0.0`) | Changes that need action from users or the operator, or that break existing data, links or integrations | New security model, a data migration, a required env var, removing a feature |
| **Minor** (`x.Y.0`) | New features or noticeable improvements that are backwards compatible | A new screen, a new report, a new payment method |
| **Patch** (`x.y.Z`) | Bug fixes, copy and styling fixes, dependency updates, no new behaviour | Fixing a calculation, a broken button, a typo |

**How to release**
1. Add changes under `## [Unreleased]` as you work, grouped as Added / Changed / Fixed / Removed / Security.
2. When deploying, rename `[Unreleased]` to the new version and today's date, and add a fresh empty `[Unreleased]` above it.
3. Set the same version in `package.json` (`npm version <major|minor|patch> --no-git-tag-version`).
4. Commit as `Release vX.Y.Z`, tag it `vX.Y.Z`, and deploy. `GET /api/health` reports the live version.

## [Unreleased]

## [3.4.2] - 2026-10-11

### Fixed
- **Dashboard figures are real.** The industry cards (SaaS, retainers, creators, coaching, trades, tourism, digital products) now show figures worked out from your own invoices, retainers, subscriptions, projects and clients. Invented numbers are gone: a fixed 2.4% churn, 82% capacity, minimum counts (at least 3 retainers, 24 guests…), sample averages and made-up revenue splits. Where there's no data yet, the card shows "—".
- "Zero-rated exports" no longer appears just because no VAT was charged; it now says "No VAT on paid invoices".
- Projects that haven't started (or are leads or in review) are no longer labelled "On hold" on the dashboard.
- **The AI advisor in Bookkeeping now really asks the AI**, using your profit and VAT figures. It used to show a fixed template whatever you asked. If the AI isn't set up on the server, the answer is labelled as a general answer.
- Badges show the real state: "Email verified" only when your sign-in email is verified, plan badge only on a paid plan, "Online"/"Offline" from your actual connection, and email "Active"/"Not set up" from the server's email settings. The email screen says when email can't be sent.

### Removed
- The phone "verification" step in business onboarding. No text message was ever sent; any visitor could pass it with a fixed code. Your phone number is still saved from the details step.

## [3.4.1] - 2026-10-11

### Changed
- Plain, accurate wording across the whole app, emails and PDFs: shorter labels and buttons in sentence case, no decorative emoji, fewer exclamation marks, and no "Gemini" or other technical names on screen.
- PDFs and emails no longer call documents "FRCS tax compliant" or show a "verification hash"; the reference code is labelled "Ref". Nothing in Frilensa is certified by FRCS, and the app no longer says so.
- Removed claims the app can't back up: "TIN verification", "100% free forever", "bank-grade", invented response times, offline receipt caching, and Premium features that don't exist (custom subdomain, bank feeds, 24/7 support, white-label, escrow wallet).
- Documents for a business with no address no longer show a made-up "Suva, Fiji Islands" address.
- New businesses no longer get a ready-made slogan and bio saved on their invoices.

### Fixed
- **Cancelling an invoice works again.** The Cancel button opens a dialog to pick a reason and optionally issue a credit note; credit notes are numbered in sequence (CN-2026-1000, 1001, …) instead of at random.
- Billing confirmations (link copied, status changed, payment recorded, invoice cancelled) are shown again.

## [3.4.0] - 2026-10-10

### Added
- **Automatic retainer billing.** Retainers set to "auto-generate" now get their invoice every morning on the due date (8:00 am Fiji time), even when nobody has Frilensa open. A retainer can never be invoiced twice for the same period, whether the invoice comes from the morning run, the app or "Run now".
- **Overdue reminders.** Optionally email clients about unpaid invoices 3, 10 and 21 days after the due date: friendly, then firm, then final, each with a link to view the invoice and payment details. An invoice gets at most one reminder per stage, invoices the client has reported paying are skipped, and invoices more than 120 days late are left for you to follow up personally. The invoice screen shows which reminders were sent.
- **Settings → Automatic billing & reminders**: switch on emailing retainer invoices to clients, overdue reminders, and a copy of each reminder to you (all off until you turn them on); see what the last run did, and run it now. Emails need SendGrid configured on the server.

### Changed
- Retainer invoices use your VAT setting (no VAT when tax is turned off, 12.5% by default) instead of falling back to 15%, and each gets its own online link. The retainers screen's monthly totals use the same rate.

### Operator notes
- `scripts/deploy.sh` now sets a `JOBS_SECRET` on the service (kept across deploys) and creates or updates a Cloud Scheduler job, `frilensa-daily`, that calls `POST /api/jobs/daily` at 8:00 am Fiji time. If Cloud Scheduler isn't available in the service's region, rerun with `SCHEDULER_REGION=<location>`.

## [3.3.1] - 2026-10-10

### Fixed
- Opening an invoice or quote from a project, or from the dashboard's recent invoices and quotes, no longer shows a blank page. Documents with missing amounts or fields (for example a scope of work exported with an empty cost) are repaired when your workspace loads: missing line totals, subtotals and totals are rebuilt from what the document has.
- If a screen does hit an error, it now shows a message with "Try again" and "Go to dashboard" instead of a blank page.
- Exporting a project's scope of work treats an empty section cost as 0 instead of saving a broken document.
- "New invoice" for a project now picks up the project and its client.

## [3.3.0] - 2026-10-10

### Added
- **Automatic receipts.** Confirming a client's payment in the "Needs your attention" inbox now issues a receipt (next number in your receipt series, linked to the invoice) and emails the client the receipt instead of the invoice. Confirming twice never creates a second receipt.
- **AI Copilot on phones.** New "AI" tab in the bottom bar; the chat screen now fits the visible screen on phones, so the message box isn't hidden behind the bar or browser toolbars.
- Automatic checks on GitHub for every push and pull request: typecheck, build, unit tests, Firestore rule tests and server end-to-end tests.

### Fixed
- "Convert to receipt" in Billing no longer copies the invoice's private online link (the receipt and invoice could open each other), its email history or a hard-coded "Bank Transfer" payment method.

## [3.2.5] - 2026-10-10

### Changed
- Deploy script refuses to deploy unless the folder matches GitHub exactly: no uncommitted or untracked changes, not behind `origin/main`, no unpushed commits (override with `ALLOW_LOCAL_CHANGES=1`). It prints the commit being deployed and adds it to the image tag.

### Fixed
- A build-settings file left behind by an interrupted deploy can no longer be picked up by a later build.

## [3.2.4] - 2026-10-10

### Fixed
- Deploy script also removes the automatic base-image runtime that AI Studio enables, which Cloud Run rejects once the service runs a prebuilt image.
- `IMAGE=…` reuses an image built by an earlier run instead of building again.

## [3.2.3] - 2026-10-10

### Fixed
- Deploy script works with services created by AI Studio: it builds the image with Cloud Build and updates the service from its existing configuration (keeping env vars, secrets, scaling and domains), instead of `gcloud run deploy --source`, which AI Studio's source annotations made fail. Prints the current revision for one-command rollback.

## [3.2.2] - 2026-10-10

### Fixed
- Deploy script finds the project hosting the Cloud Run service on its own (given `SERVICE=…`) and rejects a `RUN_PROJECT` that isn't a single project ID.

## [3.2.1] - 2026-10-10

### Fixed
- Deploy script switches on Cloud Build and Artifact Registry in the Cloud Run project before building, so a first deploy from Cloud Shell doesn't stop on an "enable API?" prompt.

## [3.2.0] - 2026-10-09

### Added
- **Payments inbox.** A "Needs your attention" panel at the top of the dashboard lists payments clients have reported. **Confirm** opens the usual Record Payment form (pre-filled with the client's method) and marks the invoice paid; **Reject** lets the client know it couldn't be matched so they can report it again. Optionally emails the client either way.
- The same panel shows quotes clients accepted, unread client messages and pending directory booking requests, with a count badge on the Dashboard tab (desktop and phone).
- **Email notifications** to you when a client reports a payment, accepts a quote or sends a portal message, and when someone books you through the directory. People who book you are emailed when you accept, decline or complete the booking. Turn it off in Settings → Email notifications. Needs SendGrid configured; limited to 20 emails per hour per recipient.

### Changed
- Client-reported payments now have a status (pending, confirmed, rejected). The client portal and online document page show a rejected report and let the client report the payment again.

## [3.1.1] - 2026-10-09

### Fixed
- Deploy script: supports a Cloud Run service in a different project from the Firebase database (`RUN_PROJECT=…`), grants the service access to Firestore (needed by the new server), and stops cleanly when no service is found.

## [3.1.0] - 2026-10-09

### Added
- **Shared business directory.** Listings and booking requests now go through the server, so other Frilensa users see your listing and your bookings reach the business you booked. Providers accept, decline or complete requests; requesters can cancel. An "Update listing" button republishes your business details.
- **"View online" links that work.** Every document gets a private link (`/?doc=…`) used in emails, the share button and the QR code on PDFs. Clients see the document, can download the PDF, accept a quote or report a payment, with no sign-in.
- Links from older invoices (`?viewDoc=…`, `/docs/…`) show an explanation and a client portal sign-in instead of the login page.
- End-to-end server tests against the Firebase emulators (`npm run test:e2e`), and a deploy script for Cloud Shell (`scripts/deploy.sh`).

### Changed
- Converting a booking to an invoice creates a **draft** using your invoice numbering series, ready to review before sending.
- Document copies used by the portal and links are cleaned up more conservatively: only copies of documents you deleted, or older copies already rewritten, are removed.

### Removed
- Made-up directory businesses with "FRCS Verified" badges, sample bookings, invented ratings and review counts, and the "FRCS Verified" filter.
- The "escrow" payment option on bookings (there is no escrow service behind it).
- "FRCS VERIFIED" badge on documents, now shown as "Issued"; Frilensa doesn't verify documents with FRCS.

### Fixed
- Booking-to-invoice no longer uses a random invoice number, a placeholder TIN or a placeholder phone number.
- On phones, the online document page no longer wraps amounts or runs quantities into item names.

## [3.0.0] - 2026-10-09

Security and reliability overhaul after a full audit (see `AUDIT.md`). **Major** because deploying it requires operator action and changes how sign-in, the client portal and data access work.

### Before deploying
- Deploy the app first, then the new Firestore rules: the new app works under the old rules, but the old app breaks under the new ones. `scripts/deploy.sh` does both, in order, after backing up Firestore.
- Set `PORTAL_SESSION_SECRET` on the server (the deploy script does this if missing). Set `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` to send email, and `VITE_ADMIN_EMAILS` for admin access.

### Security
- Firestore rules now limit each workspace to its owner. Client PINs, portal tokens and mail queues are server-only.
- The app no longer loads any workspace before sign-in, and sign-in state comes from Firebase Auth instead of browser storage.
- The client portal runs through the server: clients see only their own sent documents. Links use strong random tokens stored hashed, PINs are hashed, and revoking access ends open sessions.
- AI and email endpoints require a signed-in user and are rate limited. Email content is HTML-escaped.
- Removed the "Instant Verify (Demo)" email-verification bypass.
- The admin panel is restricted to the emails listed in `VITE_ADMIN_EMAILS`.

### Added
- "I'm a Client" sign-in tab (email + PIN) on the login screen.
- Clients can report a payment ("I've Paid This Invoice") for the consultant to confirm.
- Sync status banner with Retry when changes can't be saved to the cloud.
- Release notes in Settings are now generated from this changelog, and `/api/health` reports the running version.

### Changed
- Plan changes are free ("early access") until online billing is connected.
- Email sending reports real failures, including when SendGrid isn't configured, instead of pretending to send.
- Gemini models are configurable (`GEMINI_TEXT_MODELS`, `GEMINI_VISION_MODELS`), and the server port comes from `PORT`.
- Workspaces created by older versions under an email key are imported once on first sign-in.

### Fixed
- New users no longer inherit the owner's name and email as their profile.
- Signing out clears the workspace from the device, and another account on the same device no longer sees or merges it.
- Deleted invoices no longer come back after a reload, and the last client or document can be deleted.
- An empty device can no longer overwrite the cloud copy before it has loaded.
- Clients can't mark invoices as paid or see drafts. Quote acceptance is no longer overwritten by the consultant's next save.
- The receipt reader no longer invents a $50 amount when it can't find one.
- Activity logs are now synced to the cloud.
- Document copies are namespaced per owner, so two users can't collide on the same ID.
- Pinch-zoom and text selection work again.

### Removed
- Fake card checkout and placeholder bank and M-PAiSA account numbers from the subscription screen.
- Hard-coded personal emails and placeholder TIN and phone numbers.

## [2.8.1] - 2026-09-07
### Added
- Edit the active venture's profile (TIN, registration number, address, bank details, M-PAiSA/MyCash IDs, brand colour) from the workspace switcher and dashboard.

## [2.8.0] - 2026-09-07
### Changed
- Rebranded the platform to Frilensa (frilensa.com) across the PWA, navigation, PDFs and the AI advisor.

## [2.7.1] - 2026-09-07
### Added
- Notes / FRCS audit remarks on reconciled transactions.
### Removed
- Simulated bank feed and remaining demo datasets.

## [2.7.0] - 2026-09-07
### Added
- BSP Fiji statement import (CSV and pasted text).
### Removed
- Synthetic transaction generators and demo reset actions.

## [2.6.0] - 2026-09-02
### Added
- Multiple working currencies per venture with custom exchange rates.
- Currency selector and FX calculators in the invoice builder and expense logging.

## [2.5.1] - 2026-08-30
### Added
- Six-month revenue vs expenses chart on the dashboard.
- Invoice currency override, inheriting the project currency.
### Fixed
- Cross-browser date parsing; workspace switcher dismissal; theme inconsistencies.

## [2.5.0] - 2026-08-30
### Added
- Drag-and-drop project Kanban board.
- Project profitability charts (estimated vs actual cost, hours vs revenue).
- Printable Fiji VAT PDF invoices.

## [2.4.0] - 2026-08-29
### Added
- AI expense categorisation with Fiji VAT and deductibility reasoning, batch ledger audit and suggestions while typing.

## [2.3.0] - 2026-08-30
### Added
- Industry workflows (Film/AV, Web, Professional, Automotive, Construction, Creative) with presets, scope-of-work templates and onboarding seeding.
- Services and rates catalogue, company registration number, social links and shareable client portal links.

## [2.2.0] - 2026-08-28
### Added
- Client and project currencies with automatic inheritance on documents and retainers.
- FX and bank-fee deductions when logging foreign payments.

## [2.1.0] - 2026-08-28
### Added
- Landing page, first-time onboarding, returning-user dashboard pulse, offline handling.

## [2.0.0] - 2026-08-27
### Added
- Fiji service directory with bookings, paid listing visibility, and booking-to-invoice conversion.

## [1.3.0] - 2026-08-25
### Added
- Expense logging with receipt capture and OCR, profit & loss, AI financial advisor.

## [1.2.0] - 2026-08-25
### Added
- Document editing, cancellation with credit notes, VAT-exempt toggle, QR codes on documents.

## [1.1.0] - 2026-08-20
### Added
- Multi-venture branding, auto-incrementing document numbering, M-PAiSA/MyCash/bank payment details.

## [1.0.0] - 2026-08-01
### Added
- Initial release of Frilensa invoicing and business suite.

_Entries before 3.0.0 are carried over from the in-app release notes and weren't re-verified against the code; for example, the rates catalogue screen from 2.3.0 isn't reachable in 3.0.0 (see `docs/FEATURES.md`)._
