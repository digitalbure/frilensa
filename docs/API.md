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
| **Read only** | Read the account, businesses, clients, quotes, invoices, receipts, credit notes, expenses, projects, tasks, summaries, booking forms and booking requests | Change anything |
| **Read and create drafts** | Everything above, plus add clients, create **draft** quotes and invoices, add expenses, add tasks to projects, and create **booking requests** | Send anything to clients, mark anything paid, edit or delete existing records |

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
| `get_booking_form` | read | A business's bookable services, booking questions, terms and messages |
| `list_booking_requests` | read | Booking requests from every channel with their stage; filter by `since`, `app`, `channel`, `businessId` |
| `get_booking_request` | read | One booking request with its quote, invoices and stage |
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

## Bookings

Frilensa can be the booking engine behind a business's own website or app. The app shows the
business's booking form, sends what the customer chose, and checks how far each booking has got.
The business reviews every request in its Frilensa inbox, where it becomes a quote, then an invoice
the customer can pay online. The examples use Soqo Stream, a live-streaming platform whose
customers book streaming crews, but any app works the same way.

**Setting up (the business):** in Frilensa, put the services on the rate card, choose what's bookable
and the booking questions in **Finance → Services → Bookings**, then create a **Read and create
drafts** key named after the app (for example "Soqo Stream") and give the developer the key and the
**Business id** shown there. Keep the key in a secret store, never in code.

| Method and path | Access | Notes |
| --- | --- | --- |
| `GET /api/v1/booking-form?businessId=` | read | Everything needed to render the form. `businessId` is optional when the account has one business. Works whether or not the public rate card link is on |
| `POST /api/v1/booking-requests` | drafts | Send a booking request (below). `201` when created, `200` with the existing request when the same `source.app` + `source.reference` was sent before |
| `GET /api/v1/booking-requests/{id}` | read | The request and its progress |
| `GET /api/v1/booking-requests?since=&app=&channel=&businessId=&limit=` | read | Most recently changed first. `since` (ISO 8601) compares against the worked-out `updatedAt`, so poll with the time of your last check |

**Booking form** (`GET /api/v1/booking-form`):

```json
{
  "businessId": "biz-…",
  "business": { "name": "Vibrant Fiji", "brandSlogan": "", "colorTheme": "#0f766e", "logoType": "image", "logoUrl": "https://…", "email": "…", "phone": "…", "address": "…" },
  "currency": "FJD", "vatRate": 12.5,
  "terms": { "text": "50% deposit to book.", "paymentTermsDays": 14, "quoteValidDays": 30 },
  "intro": "…", "afterMessage": "We'll reply within one working day.",
  "services": [{ "id": "srv-…", "name": "Production day", "description": "…", "rate": 1200, "unit": "Day", "category": "Live streaming", "billingInterval": "one-time", "minQuantity": 1, "maxQuantity": null, "vat": true }],
  "questions": [
    { "id": "q_date", "type": "date", "label": "Event or job date", "help": "", "required": true, "options": [], "appliesToServiceIds": [] },
    { "id": "q_…", "type": "single_choice", "label": "How will people watch?", "help": "", "required": false, "options": ["Free", "Ticketed"], "appliesToServiceIds": [] }
  ]
}
```

Question types: `short_text`, `long_text`, `number`, `date` (YYYY-MM-DD), `time` (HH:MM, 24-hour),
`single_choice`, `multi_choice` (send an array), `yes_no` (send `true`/`false`). A question with
`appliesToServiceIds` is only asked (and only required) when one of those services is chosen. The
built-in questions have fixed ids: `q_date`, `q_time`, `q_location`.

**Booking request** (`POST /api/v1/booking-requests`):

```json
{
  "businessId": "biz-…",
  "name": "Mere Tuilau",
  "email": "mere@example.com",
  "phone": "+679 999 9999",
  "company": "Suva Methodist Church",
  "message": "Anything else the customer wrote (max 3000)",
  "items": [{ "serviceId": "srv-…", "quantity": 2 }],
  "answers": [{ "questionId": "q_date", "value": "2027-03-28" }],
  "details": [{ "label": "Viewing", "value": "Free" }],
  "eventDate": "2027-03-28",
  "startTime": "10:00",
  "location": "Centenary Church, Suva",
  "source": { "app": "Soqo Stream", "reference": "SQB-7Q2K4M", "url": "https://soqo.stream/admin/collections/bookings/12" }
}
```

- **Prices always come from Frilensa.** Any `rate` sent on an item is ignored. Unknown or non-bookable
  services are dropped, and quantities are kept within each service's minimum and maximum.
- **Answers are checked** against the business's questions (required, type, choices, service
  conditions). A failure is `400` naming the question. Answers are stored with the business's labels.
- `details`: extra facts the app collects itself, shown as-is (up to 30; label up to 60 characters,
  value up to 500).
- `eventDate`, `startTime`, `location` fill the built-in questions when they're on, and are kept anyway.
- `source.url` must be https. It appears in the inbox as "Open in Soqo Stream".
- Unknown fields are rejected. Limits: the key's 120 a minute, plus 500 booking requests a day per key.
- It doesn't email the customer, create documents or record payments. The business is emailed
  ("New booking request … via Soqo Stream").

Response: `201 { "id", "ref": "QR-1A2B3C", "status": "new", "estimate": 1380, "currency": "FJD" }`.
`estimate` is before VAT.

**Progress** (`GET /api/v1/booking-requests/{id}`):

```json
{
  "bookingRequest": {
    "id": "…", "ref": "QR-1A2B3C", "channel": "api", "status": "new | quoted | dismissed",
    "stage": "new | quoted | quote_accepted | invoiced | part_paid | paid | dismissed | cancelled",
    "source": { "app": "Soqo Stream", "reference": "SQB-7Q2K4M", "url": "https://…" },
    "name": "…", "email": "…", "items": [], "estimate": 1380, "currency": "FJD",
    "details": [{ "label": "Event or job date", "value": "2027-03-28" }],
    "eventDate": "2027-03-28", "startTime": "10:00", "location": "…",
    "createdAt": "…", "updatedAt": "…",
    "quote": { "id": "…", "number": "QT-2027-0012", "status": "draft | sent | accepted | cancelled", "total": 1380, "currency": "FJD", "onlineUrl": "https://frilensa.com/?doc=…" },
    "invoices": [{ "id": "…", "number": "INV-2027-0031", "status": "sent | partial | paid | cancelled", "total": 1380, "currency": "FJD", "amountPaid": 690, "balance": 690, "dueDate": "2027-03-14", "onlineUrl": "…" }]
  }
}
```

`stage` is worked out by Frilensa when you read it, from the quote and the invoices made from it, so
every app gets the same answer: dismissed → `dismissed`; quote cancelled → `cancelled`; every
(non-draft) invoice paid → `paid`; some paid → `part_paid`; an invoice sent → `invoiced`; quote
accepted → `quote_accepted`; a quote exists → `quoted`; otherwise `new`. `onlineUrl` is only given
for documents that have been sent; it's the page where the customer accepts the quote or pays the
invoice (Pay now). `updatedAt` is the latest change to the request, its quote or its invoices.

`channel` is where the request came from: `rate_card`, `directory`, `api`, `booking_page`, `widget`.

## For developers

- Keys: `server/apiKeys.ts` (collection `api_keys`, server-only; document id is the SHA-256 of the key).
- OAuth: `server/oauth.ts` (collections `oauth_clients`, `oauth_codes`, `oauth_grants`, `oauth_tokens`, server-only) and the consent page `src/components/OAuthConsent.tsx`.
- Bookings: `server/bookings.ts` (requests in the server-only `quote_requests` collection) and `src/lib/bookings.ts` (questions, checking, stages).
- Operations: `server/apiService.ts`, shared by `server/apiV1.ts` (REST) and `server/mcp.ts` (MCP).
- Workspace reads and transactional writes: `server/workspace.ts`.
- Tests: `tests/server.e2e.test.mjs` (keys, REST, MCP, scopes, isolation between users, revocation).
