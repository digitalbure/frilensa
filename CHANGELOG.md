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

## [4.0.1] - 2026-10-13

### Fixed
- **Finance → Services** showed "This screen couldn't be shown" for a business with no services yet. It now opens, ready for you to add your first service.

## [4.0.0] - 2026-10-13

### Changed
- **Room to grow.** Your workspace used to be saved as one database record, and Firestore limits a record to 1 MB, so a busy business with years of invoices, expenses and bank lines would eventually be unable to save. Each client, document, project, expense, bank line, business and service is now saved as its own record, so there's no practical limit.
  - Nothing to do: your workspace moves over by itself the first time you save after this update. Until then it opens as before.
  - Saving is quicker on big workspaces: only what changed is sent.
  - Safer when you use more than one device: a device only deletes items it knew about, so a booking or invoice that arrived from elsewhere is never removed by another device that hadn't seen it yet.
- **For the operator:** this release changes `firestore.rules`. `scripts/deploy.sh` publishes them as its last step, as usual. Until they're published, the app keeps saving the old way.

### Fixed
- Business details added to online invoices (registered owner and registration number) no longer leak back into documents in the app.

## [3.16.2] - 2026-10-12

### Removed
- The **Escrow** tab in the admin panel. Its on/off switch, fees and contract list were placeholders: no money is ever held in escrow, and the switch changed nothing. The unused wallet and escrow screen behind it is gone too. Escrow may come back later through PayPal. Card, PayPal and manual payments through **Pay now** are unchanged.

## [3.16.1] - 2026-10-12

### Fixed
- **Cents in amounts.** Several amount boxes only accepted whole numbers, so 12.50 was refused or rounded to 12 or 13. They now take cents. This covers:
  - line item and retainer rates on quotes and invoices;
  - project budgets, scope section costs and billing rates;
  - your hourly rate and service rates during setup;
  - escrow amounts and withdrawals, transfer fees in the exchange rate calculator, and flat changes in **Adjust rates**.
- Totals on **Home**, **Billing**, **Projects** and in project profitability now show cents (for example FJD 1,250.50) instead of being rounded to whole dollars.

## [3.16.0] - 2026-10-12

### Added
- **Delete a business** in **Settings → Businesses** when you have more than one. Its documents, projects, services, retainers, expenses and bookkeeping entries go with it, and its directory listing is removed. Your clients are kept. If the business has records, you type its name to confirm.
- **Directory management for admins.** The admin panel's **Directory** tab now shows the live directory. Admins can edit a listing's details, hide or show it, give or remove the **Verified** badge, and delete listings and bookings.
- **Remove demo copies.** Old sample businesses and bookings saved in your workspace from earlier versions can be cleared from the admin panel in one click.

### Fixed
- **Invoice PDF header.** Logos keep their shape instead of being stretched, and no longer overlap the business address. The business name sits beside the logo.
- Light brand colours (such as pale gold) are darkened on PDFs so headings stay readable on white.
- Document numbers that already start with "#" no longer show "##" on PDFs, in Billing and on the online invoice.
- A Verified badge given by Frilensa is kept when the business updates its listing.

## [3.15.0] - 2026-10-11

### Added
- **Duplicate a project** to set up a similar job quickly. Use **Duplicate** in an open project, or the copy icon on a project card in Grid view.
  - The copy keeps the client, scope, tasks and settings.
  - It starts today, with its end date and task due dates moved by the same amount.
  - Its tasks start again as to-do, with no tracked time.
- **Trading names.** When a business is a registered business name rather than a separate company (for example SLEDIEN Pte Ltd trading as Vibrant), fill in **Registered owner** in the business's details. Quotes, invoices, receipts, PDFs, emails, the online invoice and the client portal then show "SLEDIEN Pte Ltd trading as Vibrant", and the registration number shows on the online invoice too.

### Fixed
- **Edit project** did nothing inside an open project. The form only appeared after going back to the list. It now opens straight away.

## [3.14.0] - 2026-10-11

### Added
- **Webhooks** in **Settings**: tell your website or app the moment a booking arrives or moves on (quoted, quote accepted, invoiced, part paid, paid). Each delivery is signed, and failed ones are retried for 24 hours. You can send a test and see recent deliveries.
- **Availability** for bookings:
  - Choose the days you work, how far ahead people must book, dates you're away, and the most bookings you take a day.
  - Your booking page and connected apps grey out days that aren't available, and bookings on full days are refused.
- **Deposits:** ask for a percentage or a fixed amount, for the business or per service.
  - Open an accepted quote and press **Create deposit invoice**, then send it so the customer can pay it with Pay now.
  - The final invoice subtracts the deposit.
  - Apps see the deposit invoice and its payment link.

### Changed
- A booking with only its deposit paid shows as part paid, not paid.

## [3.13.0] - 2026-10-11

### Added
- **Booking page.** Turn on a booking page for each business at frilensa.com/book/your-address, with your colours and logo. Customers choose services and quantities, answer your booking questions, see an estimate and send a booking request. It arrives in your inbox like any other booking. Choose the address in **Finance → Services → Bookings**.
- **Book now button for your website.** Copy a two-line snippet into any website and it shows a **Book now** button that opens your booking page over the site. No developer or keys needed. You can preselect a service and change the button's words and colour. Bookings made this way show which website they came from.
- **Optional acknowledgement email:** tick a box to email customers who book on your page or website a copy of their request, with your after-booking message, in your business's name.
- Your rate card shows a **Book now** button when your booking page is on.

### Security
- The booking page is protected against spam: a hidden field that only bots fill in, a check that the form wasn't sent instantly, limits per visitor, and a daily limit per business (50). Cloudflare Turnstile can be switched on for the server.

## [3.12.0] - 2026-10-11

### Added
- **One inbox for every booking.** Booking requests from your rate card, the Frilensa directory, and apps or websites connected to Frilensa now arrive in the same place on **Home**. Each shows where it came from (for example "Booked via Soqo Stream"), the customer's answers, and the event date, time and location. The soonest events are listed first, with **Open in** to go to the booking in the app it came from.
- **Create quote** now adds a **Booking details** block to the quote's notes, so the customer sees what they're being quoted for.
- **Bookings settings** for each business, in **Finance → Services**:
  - **Bookable services:** choose which services can be booked, with a minimum and maximum quantity for each.
  - **Booking questions:** switch on the event date, start time and location. Add your own questions (text, number, date, time, choices, yes or no), each optionally required or asked only for certain services.
  - **Intro and after-booking messages**, and the **Business id** to give to app developers.
- **Bookings for apps and websites:** with a **Read and create drafts** API key, an app can:
  - show your booking form, with your services, prices and questions;
  - send you booking requests, with prices always taken from Frilensa and answers checked against your questions;
  - check how far each booking has got: quoted, quote accepted, invoiced, part paid or paid.
  Claude can read your booking requests too.

### Changed
- "Quote requests" are now called **booking requests**.
- **Read and create drafts** keys can now also create booking requests. They still can't send anything to your clients or record payments.
- New directory bookings also appear in the bookings inbox. You still accept or decline them in **Directory**.

### Fixed
- Text typed into some settings boxes (rate card, terms, Pay now) showed in faint grey.

## [3.11.1] - 2026-10-11

### Changed
- PayPal and card payments on FJD invoices are now charged in New Zealand dollars (NZD) by default, the currency closest in value to FJD. You can still choose AUD or USD in **Settings → Pay now on invoices**.
- Clients choosing card or PayPal now get a clear notice that PayPal doesn't accept Fijian dollars. It shows the currency they'll be charged in, the amount and the rate, and warns that their bank may add its own conversion fee. The card and PayPal options also say "charged in NZD" (or your chosen currency).

## [3.11.0] - 2026-10-11

### Added
- **Pay now on invoices.** Unpaid invoices show a Pay now box online and in the client portal, where clients choose how to pay:
  - **Bank transfer, M-PAiSA and MyCash:** clients see your details, the amount and the reference to use, then tell you they've paid. You confirm it as before.
  - **Credit or debit card and PayPal:** clients pay straight away through your own PayPal business account, with no PayPal account needed for cards. The invoice is marked paid automatically, the receipt is created, the payment goes into your ledger, and you're emailed.
- **Settings → Pay now on invoices:** choose the methods for each business, and connect PayPal with your PayPal app's client ID and secret. The secret is checked with PayPal and stored encrypted on the server.
- **Currency for PayPal:** PayPal doesn't take FJD, so FJD invoices are charged in the currency you choose (AUD, NZD or USD), converted at your exchange rate. Clients see the converted amount before paying. Invoices already in a PayPal currency are charged as they are.
- **Optional surcharge:** add up to 10% for card and PayPal payments, shown to the client before they pay, or leave it at 0 to absorb PayPal's fee. PayPal's fee is noted on the invoice's payment details.

### Changed
- The online invoice's "I've paid this invoice" button is now part of Pay now. A **Paid another way?** button stays for other methods.
- The client portal shows amounts in the document's currency instead of always FJD.

## [3.10.1] - 2026-10-11

### Fixed
- Converting a quote to an invoice gave the invoice the same online link as the quote, marked it as sent and ignored your payment terms. It now creates a draft invoice with its own link, number and your business's terms, and the quote stops offering to convert again.
- Recording a payment yourself (**Record payment**, or choosing **Paid**) now creates the receipt, as confirming a client's reported payment already did.
- Part payments are now added to your ledger as they're received. When the rest is paid, only the remaining balance is added, so the ledger matches the invoice.
- Lines you add from a bank statement now wait in **Reconcile** to be matched to invoices and expenses. Before, they were marked as matched straight away, so Reconcile was nearly always empty.
- Adding a business from the side menu filled blank fields with made-up details (a placeholder TIN, address, phone and email). They're now left blank for you to fill in.
- Billing tracked hours from a project:
  - Choosing "+ New draft invoice" again did nothing.
  - New invoices ignored your invoice numbering, payment terms and VAT setting.
  - Adding hours to an existing draft dropped its other taxes and fees from the total.
- Quotes and invoices made from a project's scope added VAT even with VAT turned off, used the wrong numbering and had no online link. The scope sections now show VAT as added on top, matching the document.
- The P&L period button said "2026 YTD" in every year. The VAT switch in Settings always said 12.5%. "Invoices / month" counted every invoice ever.
- The invoice and retainer item pickers listed catalogue items marked inactive, and the retainer picker listed other businesses' items.

## [3.10.0] - 2026-10-11

### Added
- **The assistant now runs on Claude** and works with your real records. Ask "who owes me money?", "what did I spend on fuel last quarter?" or "what tasks are due this week?" and it looks up your invoices, clients, expenses, projects and figures.
- **It can set things up for you.** Ask it to add a task, a client, a draft quote or invoice, or an expense. It shows a card with the details, and nothing is saved until you press **Confirm**. It never sends anything to clients, records payments or deletes anything.
- **Help** in Settings: searchable articles on how each part of Frilensa works. The assistant answers how-to questions from them.
- **Tasks for Claude and the API:** Claude (via the connector) and the API can list your project tasks and add new ones (`list_tasks`, `create_task`, `GET`/`POST /api/v1/tasks`).
- The deploy script asks once for an Anthropic API key and keeps it in Google Secret Manager.

### Changed
- If the assistant isn't set up or can't be reached, it says so plainly instead of giving canned answers.
- Assistant replies show tables, and numbered steps are numbered properly. Before, every step showed as "1.".
- Each user can ask the assistant up to 60 questions an hour.

## [3.9.0] - 2026-10-11

### Added
- **Services and rates** in Bookkeeping (the tab was called Rates). It's one catalogue for each business: rates, rush, weekend and retainer rates, cost prices and margins, starter packs for common trades, price adjustments and a rate sheet. Rate rules and currencies are still on this tab.
- **Shareable rate card.** Create a link to a page that lists your services, rates and terms. Clients can print it or save it as a PDF, pick quantities to see an estimate, and send you a quote request. Choose which items appear with "Show on rate card". "New link" replaces the old link, and "Turn off" stops it working.
- **Quote requests** show up on your dashboard, and you're emailed about each one. "Create quote" turns a request into a draft quote. If the person isn't already a client, they're added as one.
- **Default terms for each business.** Set when invoices are due, how long quotes are valid, and your standard invoice and quote terms. New quotes and invoices fill them in, including drafts made through Claude or the API, and retainers when they have no terms of their own.

### Changed
- The catalogue shows only the selected business's items. Adjusting prices no longer changes other businesses' items.
- New items and starter packs no longer come with made-up cost prices and rush or weekend rates, so the margins shown are real.

### Fixed
- Saving an inactive item turned it active again.
- An item's unit sometimes showed as "Hour" when you edited it.

## [3.8.0] - 2026-10-11

### Added
- **Reimbursable expenses.** When you log an expense you paid for a client, choose "Bill to a client". When you next write an invoice for that client, Frilensa offers those expenses. Add them with one click, at cost or with a markup.
- Each reimbursed line shows the date, vendor and what it was for, marked "Reimbursable". The client can open the receipt from the online invoice or the client portal. Receipts aren't shown on drafts.
- Reimbursed costs carry no VAT by default, and percentage taxes and fees aren't charged on them. Tick VAT on a line if you need to charge it.
- Receipts are now saved to secure file storage instead of on your device. You can view or remove them from the expense, and attach one without scanning it.
- An expense shows which invoice it was billed on, so it can't be billed twice. Deleting or cancelling the invoice frees its expenses again.
- Claude and the API can list unbilled expenses for a client, add them to a draft invoice (`expenseIds`), and log an expense as reimbursable (`billToClientId`).

### Changed
- The VAT return lists costs reimbursed by clients separately, not as sales. It warns you when you claimed input VAT on an expense you billed on without VAT.
- Profit and loss leaves out costs clients have repaid, from both income and expenses.

### Fixed
- In profit and loss, income now follows the period you pick. Before, it always showed all-time income next to the period's expenses. The "year to date" label now shows the current year.

## [3.7.0] - 2026-10-11

### Added
- **VAT return** in Bookkeeping: pick a period (month, quarter, half-year, year or custom dates), invoice or payments basis, and a business. It shows standard-rated and zero-rated sales, output VAT, credit notes, purchases with claimable VAT, input VAT, and net VAT payable or refundable, plus the invoices and expenses behind each figure.
- It warns you about things to check before filing: a business with no TIN, claimable expenses with no VAT amount, drafts left out, foreign-currency sales and part payments. Download it as CSV, or print or save it as a PDF. Frilensa doesn't file the return for you.
- **Exports for your accountant**: CSV files of invoices, quotes and receipts, invoice line items, expenses, bank transactions and clients (with amounts owed), for the period and business you choose.
- Claude and the API can get the same VAT return figures (`get_vat_return`, `GET /api/v1/vat-return`).

### Changed
- Only expenses and bank transactions marked "VAT claimable" count towards input VAT in the VAT return. A credit note reduces the period it's issued in only when it cancels an invoice from an earlier period.

## [3.6.1] - 2026-10-11

### Fixed
- Adding Frilensa as a connector in Claude failed with "Couldn't register with Frilensa's sign-in service". The sign-in addresses Frilensa gave Claude came from a server setting that, on services first created in AI Studio, pointed to AI Studio's private address. They now use the address Claude connected to.
- The deploy script now always sets the site address used in emails and links to `https://frilensa.com` (or `APP_URL=…` if given). Before, it kept an older value left by AI Studio.

## [3.6.0] - 2026-10-11

### Added
- **Add Frilensa to Claude on the web, desktop and phone.** In Claude, go to Settings → Connectors → Add custom connector and paste `https://frilensa.com/mcp`. Claude sends you to Frilensa to sign in and choose what it can do (read and create drafts, or read only). No key needed.
- **Connected apps** in Settings → API keys and AI assistants: see which apps are connected and when they were last used, and disconnect any of them.

### Security
- Sign-in follows the OAuth standard used by MCP clients, with PKCE. Access lasts an hour and renews automatically. A renewal code used twice ends the connection, in case it was stolen. Nothing is stored except hashes.

## [3.5.0] - 2026-10-11

### Added
- **Connect AI assistants and your own tools.** New Settings → API keys and AI assistants: create a personal key, then connect Claude or another AI assistant through the Frilensa MCP server (`https://frilensa.com/mcp`), or scripts and automation tools through the REST API (`https://frilensa.com/api/v1`). See `docs/API.md`.
- Keys can read your clients, quotes, invoices, receipts, expenses, projects and a profit and VAT summary. Keys with draft access can also add clients, create draft quotes and invoices, and add expenses. Nothing reached through a key can send anything to your clients or mark anything paid, and every change it makes shows in your activity log with the key's name.
- Keys are shown once and stored only as a hash; revoke one at any time and it stops working immediately. Up to 10 keys per account, 120 requests a minute per key.

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
