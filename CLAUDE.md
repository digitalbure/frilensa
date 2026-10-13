# Frilensa

Live at **frilensa.com**. React 19 + Vite SPA, Express server (`server.ts`, `server/`), Firebase Auth + Firestore.

## Workspace storage

- A workspace is a head document `consultants/{uid}` plus one record per item for the growing lists (`SPLIT_LISTS` in `src/lib/workspaceRecords.ts`, mirrored in `firestore.rules`). Older workspaces kept those lists as arrays in the head; reads combine both forms.
- Server code reads and writes workspaces only through `server/workspace.ts` (`readWorkspace`, `updateWorkspace`, or `loadWorkspace` + `writeWorkspace` inside a transaction). Never read or write `consultants/{uid}` directly.

## Branding

- Frilensa's own branding (name, tagline, support contacts, logo, colours) lives in the server-only `platform` collection, managed in `server/branding.ts` (public `GET /api/public/branding`, admin `/api/admin/branding`, `/manifest.webmanifest`). The app reads it with `useBranding()` / `<BrandMark />`, never from a workspace. Logos are PNG, JPEG or WebP only, checked by their magic bytes; SVGs are converted in the browser.
- A business's own branding (for its documents) is separate and stays on the business in the workspace.

## Every change must be logged

- Add an entry under `## [Unreleased]` in `CHANGELOG.md` in the same commit as the change (Added / Changed / Fixed / Removed / Security). Write it for users: what changed for them, not file names.
- Pick the bump by the rules at the top of `CHANGELOG.md`: major = needs operator/user action or breaks data, links or integrations; minor = new backwards-compatible feature; patch = fixes only.
- On release, move `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, set the same version in `package.json` (`npm version <major|minor|patch> --no-git-tag-version`), commit as `Release vX.Y.Z` and tag `vX.Y.Z`.
- Settings → Release Notes renders `CHANGELOG.md`, and `/api/health` reports `package.json`'s version. Don't hard-code versions anywhere else.

## Checks before pushing

- `npm run lint` (TypeScript) and `npm run build`.
- If `firestore.rules` changes: `npm run test:rules` (needs Java), then remind the user to deploy the rules. The deploy is separate from the app deploy.

## Security invariants

- Browser code only touches `consultants/{uid}` (and its item records, `consultants/{uid}/{list}/{id}`), `documents` and `support_messages`, as allowed by `firestore.rules`. Anything involving client credentials, other tenants or email goes through the server.
- Client portal data comes only from `/api/portal/*`. Never load a consultant's workspace in the portal.
- New `/api` routes sit behind `requireUser` (or `requirePortal`) and a rate limit. The one exception is `/api/jobs/*` (Cloud Scheduler), which checks the `X-Job-Secret` header against `JOBS_SECRET` instead.
- The public API (`/api/v1/*`) and MCP server (`/mcp`) use `requireApiKey` (personal keys, `server/apiKeys.ts`, or OAuth access tokens from `server/oauth.ts`) and per-key rate limits. They go through `server/apiService.ts`, which only reads and creates drafts: no route reachable with an API key may email clients, record payments, or expose portal tokens, PINs or attachments. Document both in `docs/API.md`.
- Pay now (`server/payNow.ts`): only the server creates and captures PayPal orders, with the business's own keys (`paypal_accounts`, secret encrypted with `PAYMENT_SECRETS_KEY`, which must never change). An invoice is marked paid only after PayPal confirms a completed capture for that invoice (`custom_id`) and the amount owed; captures are recorded in `paypal_captures` so retries aren't counted twice. Manual methods (bank, M-PAiSA, MyCash) only report a payment for the consultant to confirm.
- Bookings (`server/bookings.ts`, `server/bookingPage.ts`): booking requests from every channel live in the server-only `quote_requests` collection, with prices and answers checked on the server against the business's bookable services and questions. The public booking page and widget (`/api/public/book/*`) keep IP limits, a honeypot, a signed form token with a minimum fill time, a daily cap per business, and Turnstile when `TURNSTILE_SECRET` is set. One deliberate, narrow exception to "no email to clients from public or key routes": when the business turns it on, the booking page and widget email an acknowledgement ("We've got your booking request", with the person's own answers) to the address that just submitted the form, never anything about documents or payments. Booking requests through the API never email the customer.
