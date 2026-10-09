# Frilensa — Fiji Freelancer CRM

CRM, quotes and invoicing, bookkeeping, project tracking and a client portal for freelancers and small businesses in Fiji and the Pacific. React 19 + Vite on the front end, an Express server for AI, email and the client portal, and Firebase Auth + Firestore for data.

See [`docs/FEATURES.md`](docs/FEATURES.md) for the full feature inventory and improvement plan, [`CHANGELOG.md`](CHANGELOG.md) for versions, and [`AUDIT.md`](AUDIT.md) for the October 2026 security audit.

## What it does

- **Clients and projects**: client directory, project workspaces, milestones and tasks.
- **Quotes, invoices, receipts, credit notes**: multi-currency, Fiji VAT (12.5% default), ECAL/STT and custom fees, PDF export.
- **Bookkeeping**: expenses, bank statement import (BSP/ANZ/Westpac/M-PAiSA text), receipt OCR, P&L and VAT summaries.
- **Client portal**: clients open a private link (or sign in with email + PIN) to see the quotes and invoices you have sent them, accept quotes, report payments and message you.
- **AI assistant** (Gemini): bookkeeping categorisation, receipt reading, scope-of-work drafts and a business advisor. It falls back to built-in rules when no API key is set.

## Getting started

Requires Node.js 20+.

```bash
npm install
cp .env.example .env    # fill in what you need, see below
npm run dev             # http://localhost:3000
```

Sign up with email and password (a verification email is sent) or with Google.

### Configuration

| Variable | Needed for |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Client portal and portal links when running locally (Firebase Admin). Automatic on Cloud Run. |
| `PORTAL_SESSION_SECRET` | Client portal sessions that survive restarts. Set this in production. |
| `GEMINI_API_KEY` | AI features (optional) |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | Emailing documents to clients (optional; without it, download the PDF and send it yourself) |
| `VITE_ADMIN_EMAILS` | Who can open the platform admin panel (build time) |

### Firebase setup

1. The Firebase web config lives in `firebase-applet-config.json`. It is public by design; access is controlled by the security rules.
2. **Deploy the Firestore rules** whenever `firestore.rules` changes:
   ```bash
   npx firebase-tools deploy --only firestore:rules --project frilensa-f530d
   ```
3. In Firebase Auth, enable Email/Password and Google, and add your app's domain to **Authorized domains**.
4. The server's service account needs the **Cloud Datastore User** role.

## Security model

- Each consultant's workspace is stored at `consultants/{uid}` and only that signed-in, email-verified user can read or write it.
- Copies of documents live in `documents/` (used by the portal), scoped to the owner by `consultantId`.
- Client portal credentials (`portal_access/`) are stored hashed and are only reachable by the server. Portal sessions are short-lived signed tokens, and revoking a client's access ends their sessions.
- All AI and email endpoints require a Firebase ID token and are rate limited.
- Workspaces written by older builds under an email key are imported once, read-only, into the uid-keyed workspace on first sign-in.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Express + Vite dev server |
| `npm run build` | Build the SPA and bundle the server to `dist/server.cjs` |
| `npm start` | Run the production build |
| `npm run lint` / `npm run typecheck` | TypeScript type check |
| `npm run test:rules` | Run the Firestore security rule tests in the emulator (needs Java) |

## Versioning

Semantic versioning: major = needs operator or user action, minor = new feature, patch = fix. Log every change under `[Unreleased]` in `CHANGELOG.md`; release steps are at the top of that file. The running version is shown in Settings and at `/api/health`.

## Known limitations

- **Billing is not connected.** Plan changes are free ("early access"); there is no payment processor.
- **The admin panel** only edits the admin's own workspace settings. Its tenant list is sample data, not other accounts.
- **Directory listings and bookings** are stored per workspace, not shared between users.
- The whole workspace is one Firestore document (1 MB limit). Large receipt images and PDFs are dropped from it automatically.
