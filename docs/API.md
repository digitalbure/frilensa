# Frilensa API and MCP server

Each Frilensa user can connect their own tools to their own workspace:

- **MCP server** for AI assistants such as Claude: `https://frilensa.com/mcp`
- **REST API** for scripts and automation tools: `https://frilensa.com/api/v1`

Claude on the web, desktop and phone connects with OAuth sign-in (see below). Everything else uses a
personal API key from **Settings → API keys and AI assistants**, sent as a header:

```
Authorization: Bearer frk_…
```

## What a key can do

| Access | Can | Can't |
| --- | --- | --- |
| **Read only** | Read the account, businesses, clients, quotes, invoices, receipts, credit notes, expenses, projects and summaries | Change anything |
| **Read and create drafts** | Everything above, plus add clients, create **draft** quotes and invoices, add expenses, and add tasks to projects | Send anything to clients, mark anything paid, edit or delete existing records |

Drafts aren't visible to clients until the user sends them from Frilensa. Everything a key creates
appears in the activity log as "via API key "<name>"".

Keys are stored as a hash and shown once. A user can have up to 10 keys and can revoke any of them
in Settings; a revoked key stops working at once. Limit: 120 requests a minute per key.

Responses never include client portal tokens, PINs, payment attachments or raw share tokens. A sent
document includes its `onlineUrl` (the "view online" link the client already has).

## MCP

Streamable HTTP, stateless. Point any MCP client that can send an `Authorization` header at
`https://frilensa.com/mcp`. For Claude Code:

```
claude mcp add --transport http frilensa https://frilensa.com/mcp --header "Authorization: Bearer frk_…"
```

Tools:

| Tool | Access | What it does |
| --- | --- | --- |
| `get_account` | read | Name, home currency, VAT rate, businesses |
| `list_clients` | read | Clients, optional `search` |
| `get_client` | read | One client, their documents and amount owed |
| `list_documents` | read | Quotes, invoices, receipts, credit notes; filter by `type`, `status`, `clientId`, `businessId`, `from`/`to` (issue date), `overdue` |
| `get_document` | read | One document by id or number (e.g. `INV-2026-1004`) |
| `list_expenses` | read | Expenses; filter by `from`/`to`, `category`, `businessId`, or `unbilledForClientId` for reimbursable expenses not yet on an invoice |
| `list_projects` | read | Projects with status, budget and open tasks |
| `list_tasks` | read | Tasks across projects; filter by `projectId`, `status` (`open` = not done), `dueBefore` |
| `get_summary` | read | Cash-basis summary for a period: received, expenses, profit, outstanding, overdue, VAT collected vs claimable |
| `get_vat_return` | read | VAT return figures for a period (standard periods or `from`/`to`, invoice or payments basis), with warnings; `includeLines` for the documents and expenses behind them |
| `create_client` | drafts | Add a client |
| `create_draft_document` | drafts | Draft quote or invoice for an existing client; on invoices, `expenseIds` adds reimbursable expenses as lines |
| `create_task` | drafts | Add a to-do task to a project |
| `add_expense` | drafts | Record an expense; `billToClientId` marks it reimbursable by that client |

### Claude on the web, desktop and phone (OAuth)

In Claude, open **Settings → Connectors → Add custom connector** and enter `https://frilensa.com/mcp`.
Claude opens Frilensa to sign in; the user chooses **Read and create drafts** or **Read only** and
presses Allow. No key is needed. The connection appears under **Connected apps** in Settings, where
it can be disconnected.

This follows the MCP authorization spec:

| Endpoint | Purpose |
| --- | --- |
| `GET /.well-known/oauth-protected-resource` | Protected resource metadata (RFC 9728); `/mcp` returns 401 with `WWW-Authenticate: Bearer resource_metadata="…"` pointing here |
| `GET /.well-known/oauth-authorization-server` | Authorization server metadata (RFC 8414) |
| `POST /oauth/register` | Dynamic client registration (RFC 7591). Public clients; redirect URIs must be https, or http on localhost |
| `GET /oauth/authorize` | Consent page in the web app (sign-in with the user's Frilensa account) |
| `POST /oauth/token` | `authorization_code` (PKCE S256 required) and `refresh_token` grants |
| `POST /oauth/revoke` | Token revocation (RFC 7009); revoking either token ends the connection |

Scopes: `read`, `draft` (the user can narrow, never widen, what the app asked for). Access tokens
last 1 hour; refresh tokens 30 days and rotate on every use. Using a refresh token twice ends the
connection, in case it was stolen. Codes last 10 minutes and work once. All codes and tokens are
stored only as hashes. OAuth access tokens work on `/mcp` and `/api/v1` with the same limits as keys.

## REST API

All responses are JSON. Errors are `{ "error": "message" }` with status 400 (bad input), 401 (missing or
revoked key), 403 (read-only key), 404 (not found), 409 (conflict) or 429 (rate limit).

| Method and path | Access | Notes |
| --- | --- | --- |
| `GET /api/v1/me` | read | Account and businesses |
| `GET /api/v1/clients?search=&limit=` | read | |
| `GET /api/v1/clients/{id}` | read | Client with documents and `outstanding` |
| `POST /api/v1/clients` | drafts | `{ name, email?, phone?, address?, tin?, currency?, contactPerson? }` |
| `GET /api/v1/documents?type=&status=&clientId=&businessId=&from=&to=&overdue=true&limit=` | read | Newest first; `total` is the count before `limit` |
| `GET /api/v1/documents/{id or number}` | read | |
| `POST /api/v1/documents` | drafts | `{ type: "invoice" \| "quote", clientId, items: [{ name, description?, quantity, rate }], businessId?, issueDate?, dueInDays?, currency?, vatRate?, projectId?, notes?, expenseIds?, markupPercent?, chargeVatOnExpenses? }` |
| `GET /api/v1/expenses?from=&to=&category=&businessId=&unbilledForClientId=&limit=` | read | Each expense has `billToClientId`, `billedOn` (invoice number, if billed) and `hasReceipt` |
| `POST /api/v1/expenses` | drafts | `{ date, vendor, amount, description?, category?, paymentMethod?, vatClaimable?, vatAmount?, currency?, businessId?, projectId?, notes?, billToClientId? }` |
| `GET /api/v1/projects` | read | |
| `GET /api/v1/tasks?projectId=&status=open&dueBefore=&limit=` | read | Soonest due first |
| `POST /api/v1/tasks` | drafts | `{ projectId, title, description?, dueDate?, priority?: "low" \| "medium" \| "high", status?: "todo" \| "in_progress" }` |
| `GET /api/v1/summary?from=&to=&businessId=` | read | Defaults to this year to date |
| `GET /api/v1/vat-return?period=last_quarter&basis=invoice&businessId=&includeLines=true` | read | Or `from=&to=` for custom dates. Same figures as Bookkeeping → VAT return |

Reimbursable expenses: `expenseIds` on `POST /api/v1/documents` (invoices only) adds each expense as a
line at cost, plus `markupPercent` if given. The expenses must be billable to that client and not yet
billed (404 if unknown, 409 if already on an invoice). Reimbursed lines carry no VAT unless
`chargeVatOnExpenses` is true. Document items show `reimbursable`, `vatCharged` and `hasReceipt`.
Receipt files themselves aren't available through the API; clients see them from the issued invoice.

Draft quotes and invoices take the business's default terms (Bookkeeping → Services → Terms) for
`notes` and the due date unless `notes` or `dueInDays` are given.

Dates are `YYYY-MM-DD`. Unknown fields are rejected, so a typo can't be silently ignored.

Example:

```
curl -H "Authorization: Bearer frk_…" "https://frilensa.com/api/v1/documents?overdue=true"
```

## For developers

- Keys: `server/apiKeys.ts` (collection `api_keys`, server-only; document id is the SHA-256 of the key).
- OAuth: `server/oauth.ts` (collections `oauth_clients`, `oauth_codes`, `oauth_grants`, `oauth_tokens`, server-only) and the consent page `src/components/OAuthConsent.tsx`.
- Operations: `server/apiService.ts`, shared by `server/apiV1.ts` (REST) and `server/mcp.ts` (MCP).
- Workspace reads and transactional writes: `server/workspace.ts`.
- Tests: `tests/server.e2e.test.mjs` (keys, REST, MCP, scopes, isolation between users, revocation).
