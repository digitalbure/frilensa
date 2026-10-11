# Frilensa API and MCP server

Each Frilensa user can connect their own tools to their own workspace:

- **MCP server** for AI assistants such as Claude: `https://frilensa.com/mcp`
- **REST API** for scripts and automation tools: `https://frilensa.com/api/v1`

Both use a personal API key from **Settings → API keys and AI assistants**, sent as a header:

```
Authorization: Bearer frk_…
```

## What a key can do

| Access | Can | Can't |
| --- | --- | --- |
| **Read only** | Read the account, businesses, clients, quotes, invoices, receipts, credit notes, expenses, projects and summaries | Change anything |
| **Read and create drafts** | Everything above, plus add clients, create **draft** quotes and invoices, and add expenses | Send anything to clients, mark anything paid, edit or delete existing records |

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
| `list_expenses` | read | Expenses; filter by `from`/`to`, `category`, `businessId` |
| `list_projects` | read | Projects with status, budget and open tasks |
| `get_summary` | read | Cash-basis summary for a period: received, expenses, profit, outstanding, overdue, VAT collected vs claimable |
| `create_client` | drafts | Add a client |
| `create_draft_document` | drafts | Draft quote or invoice for an existing client |
| `add_expense` | drafts | Record an expense |

Connectors added from the claude.ai website need sign-in with OAuth, which isn't available yet;
use a client that supports headers (Claude Code, the Claude API's MCP connector, or a local
bridge such as `mcp-remote` for Claude Desktop).

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
| `POST /api/v1/documents` | drafts | `{ type: "invoice" \| "quote", clientId, items: [{ name, description?, quantity, rate }], businessId?, issueDate?, dueInDays?, currency?, vatRate?, projectId?, notes? }` |
| `GET /api/v1/expenses?from=&to=&category=&businessId=&limit=` | read | |
| `POST /api/v1/expenses` | drafts | `{ date, vendor, amount, description?, category?, paymentMethod?, vatClaimable?, vatAmount?, currency?, businessId?, projectId?, notes? }` |
| `GET /api/v1/projects` | read | |
| `GET /api/v1/summary?from=&to=&businessId=` | read | Defaults to this year to date |

Dates are `YYYY-MM-DD`. Unknown fields are rejected, so a typo can't be silently ignored.

Example:

```
curl -H "Authorization: Bearer frk_…" "https://frilensa.com/api/v1/documents?overdue=true"
```

## For developers

- Keys: `server/apiKeys.ts` (collection `api_keys`, server-only; document id is the SHA-256 of the key).
- Operations: `server/apiService.ts`, shared by `server/apiV1.ts` (REST) and `server/mcp.ts` (MCP).
- Workspace reads and transactional writes: `server/workspace.ts`.
- Tests: `tests/server.e2e.test.mjs` (keys, REST, MCP, scopes, isolation between users, revocation).
