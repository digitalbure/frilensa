# Frilensa

Live at **frilensa.com**. React 19 + Vite SPA, Express server (`server.ts`, `server/`), Firebase Auth + Firestore.

## Every change must be logged

- Add an entry under `## [Unreleased]` in `CHANGELOG.md` in the same commit as the change (Added / Changed / Fixed / Removed / Security). Write it for users: what changed for them, not file names.
- Pick the bump by the rules at the top of `CHANGELOG.md`: major = needs operator/user action or breaks data, links or integrations; minor = new backwards-compatible feature; patch = fixes only.
- On release, move `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, set the same version in `package.json` (`npm version <major|minor|patch> --no-git-tag-version`), commit as `Release vX.Y.Z` and tag `vX.Y.Z`.
- Settings → Release Notes renders `CHANGELOG.md`, and `/api/health` reports `package.json`'s version. Don't hard-code versions anywhere else.

## Checks before pushing

- `npm run lint` (TypeScript) and `npm run build`.
- If `firestore.rules` changes: `npm run test:rules` (needs Java), then remind the user to deploy the rules. The deploy is separate from the app deploy.

## Security invariants

- Browser code only touches `consultants/{uid}`, `documents` and `support_messages`, as allowed by `firestore.rules`. Anything involving client credentials, other tenants or email goes through the server.
- Client portal data comes only from `/api/portal/*`. Never load a consultant's workspace in the portal.
- New `/api` routes sit behind `requireUser` (or `requirePortal`) and a rate limit. The one exception is `/api/jobs/*` (Cloud Scheduler), which checks the `X-Job-Secret` header against `JOBS_SECRET` instead.
- The public API (`/api/v1/*`) and MCP server (`/mcp`) use `requireApiKey` (personal keys, `server/apiKeys.ts`, or OAuth access tokens from `server/oauth.ts`) and per-key rate limits. They go through `server/apiService.ts`, which only reads and creates drafts: no route reachable with an API key may email clients, record payments, or expose portal tokens, PINs or attachments. Document both in `docs/API.md`.
- Pay now (`server/payNow.ts`): only the server creates and captures PayPal orders, with the business's own keys (`paypal_accounts`, secret encrypted with `PAYMENT_SECRETS_KEY`, which must never change). An invoice is marked paid only after PayPal confirms a completed capture for that invoice (`custom_id`) and the amount owed; captures are recorded in `paypal_captures` so retries aren't counted twice. Manual methods (bank, M-PAiSA, MyCash) only report a payment for the consultant to confirm.
