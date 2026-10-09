# Audit — October 2026

What was wrong with the build as uploaded, and what was done about it.

## Critical (fixed)

| Problem | Fix |
| --- | --- |
| Firestore rules were `allow read, write: if true` on every collection: anyone could read or wipe every user's business data, client PINs and access tokens. | Owner-only rules keyed by Firebase uid; credentials and mail queues are server-only. Covered by 28 emulator tests (`npm run test:rules`). |
| On page load, before sign-in, the app downloaded and live-subscribed to the owner's workspace (`jnakasamai@gmail.com`) for every visitor. | Data loads only for the signed-in, email-verified Firebase user. |
| "Signed in" was a localStorage key, and client portal sessions were plain JSON in localStorage, so both could be forged by hand. | Sign-in state comes from Firebase Auth; portal sessions are short-lived server-signed tokens. |
| The client portal loaded the consultant's whole workspace (all clients and finances) into the client's browser. Portal PINs were compared in the browser. | The portal goes through the server, which returns only that client's non-draft documents, projects and messages. PINs are hashed (scrypt). |
| Every new user's profile defaulted to the owner's name and email. | Removed. |
| Signing out left the previous user's data on the device, and it was merged into the next account that signed in. | The device cache is per user, and memory is reset on sign-out or account switch. |
| "Instant Verify (Demo)" skipped email verification; registration errors pretended a verification email had been sent. | Removed; real errors are shown. |
| AI and email endpoints had no authentication, so anyone could spend the Gemini key or send email through SendGrid. | Firebase ID token required on every endpoint, plus rate limits. |
| Email templates injected user-supplied text as raw HTML. | Escaped. |

## High (fixed)

- Clients could mark their own invoices "paid". They now *report* a payment; the consultant confirms it.
- Clients were shown draft documents.
- While loading, the portal showed a made-up business with real-looking bank and M-PAiSA details.
- Portal links were guessable (`Math.random`), and "Revoke" left them working. Tokens now come from `crypto.randomBytes`, are stored hashed, and revoking deletes them server-side and ends open sessions.
- The subscription checkout always "succeeded" without any payment, pre-filled a fake card, and showed bank account numbers that appear invented. Removed. Plan changes are free while billing isn't connected.
- The admin panel was open to every user. It is now restricted to `VITE_ADMIN_EMAILS`.
- Email "sent" was reported even when nothing was delivered (no SendGrid key, or SendGrid failed). Real errors are now returned.
- The receipt reader invented a $50 amount when it couldn't find one.
- Deleted invoices came back after reloading (flat copies were never removed), and the last client or document could never be deleted (the save "guard" restored it).
- An empty device could overwrite the cloud copy before it loaded. Saves now wait for a successful cloud load.
- Activity logs were never synced.
- Flat document IDs could collide between users and permanently break saving. They are now namespaced by owner.

## Also cleaned up

Configurable port and Gemini models (the hard-coded `gemini-3.8-flash` doesn't appear to exist), a stale lockfile and a second package manager's lockfile, pinch-zoom re-enabled, text selection re-enabled, out-of-date "15% VAT" text, and hard-coded personal emails.

## Not done (needs a decision or more work)

- Real subscription billing (payment processor).
- The admin panel's tenant list is sample data; a real multi-tenant admin needs a server-side admin API.
- The directory and bookings are per workspace, not shared marketplace data.
- The whole workspace is one Firestore document (1 MB limit). Splitting it into collections is the next scaling step.
- Consultants see a client's reported payment only in the invoice notes; a dedicated "confirm payment" button would help.
