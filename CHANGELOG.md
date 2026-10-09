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
