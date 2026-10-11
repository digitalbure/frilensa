// In-app help articles. Shown in Settings → Help, and given to the assistant (server/assistant.ts)
// so it can answer "how do I…" questions. Plain TypeScript with no React or browser imports,
// because the server imports this file too.
//
// Keep every screen name, tab and button label exactly as it appears in the app. When you change
// a screen, update the article that describes it.

export interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  body: string;
  keywords: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'businesses',
    title: 'Set up your businesses',
    summary: 'Add a business, switch between businesses, and fill in the details shown on your documents.',
    keywords: ['business', 'venture', 'workspace', 'switch', 'TIN', 'bank details', 'M-PAiSA', 'MyCash', 'logo', 'brand', 'primary', 'profile', 'getting started'],
    body: `Frilensa keeps each business (or brand) separately: its own details, clients' documents, numbering, services, rate card and terms. The business you have selected is the active business, and new quotes, invoices and expenses use it.

### Switch business
- On **Home**, tap a business under **Business**.
- On a computer you can also use the business switcher at the top of the sidebar, under **Switch business**.

### Add a business
1. On **Home**, tap **Add business** (or use **Add business** in the sidebar switcher).
2. Enter the business name, type and TIN, then save.
3. Fill in the rest of its details as below.

### Details used on your documents
Open **Home → Edit profile**, or go to **Settings → Businesses** and press **Save business** when you're done. The details are:
- Business name, TIN and registration number. Your TIN is printed on tax invoices.
- Billing email, phone and address.
- Bank details, your M-PAiSA number or merchant ID, and your MyCash number. These appear under "How to pay" on invoices, PDFs and the online invoice, with the invoice number as the payment reference.
- Logo and brand colour (**Home → Edit logo**, or **Settings → Businesses → Logo and colors**).

Mark one business as the main one with **Set as primary** on **Home**. It's used by default for new documents.

Check your TIN and your clients' TINs before you send tax invoices. FRCS sets the rules for what a tax invoice must show.`
  },
  {
    id: 'clients',
    title: 'Add and manage clients',
    summary: 'Add clients, see what they owe, and keep their details for invoices.',
    keywords: ['client', 'customer', 'contact', 'TIN', 'currency', 'outstanding', 'balance', 'CSV', 'messages', 'getting started'],
    body: `Every quote and invoice belongs to a client, so add your clients first.

### Add a client
1. Go to **Clients** and press **Add client**.
2. Enter the **Client name**. Contact person, TIN, email, phone and billing address are optional, but you need an email to send documents by email.
3. Pick a **Billing currency** if they pay in something other than your home currency. New quotes and invoices for them use it.
4. Save.

### Find and review clients
- Search by name, contact, email, phone or TIN, and switch between **Table** and **Cards**.
- The **Balance due** filter shows clients who owe you money. The totals at the top show what you've invoiced and what's outstanding.
- **Export CSV** downloads your client list.

### A client's details
Open a client (the eye icon, or **Details** on a card) to see four tabs:
- **Details**: contact details, total invoiced and outstanding.
- **Portal**: their portal link and PIN. See the client portal article.
- **Documents**: their quotes, invoices and receipts.
- **Messages**: messages they sent from the client portal. Reply here.

Use the edit and delete icons to change or remove a client.`
  },
  {
    id: 'quotes-invoices',
    title: 'Create quotes and invoices',
    summary: 'Build a quote, invoice or receipt with items from your catalogue, taxes and fees, and automatic numbering.',
    keywords: ['quote', 'invoice', 'receipt', 'new invoice', 'line items', 'catalogue', 'catalog', 'VAT', 'tax', 'fees', 'surcharge', 'numbering', 'currency', 'draft', 'due date', 'terms'],
    body: `### Start a document
- **Billing → New document** starts an invoice. **+ New quote** and **+ New receipt** are just below it.
- On **Home**, use the **Quote**, **Invoice** or **Receipt** quick actions. On a computer, the sidebar has **New invoice**.
- From a project, use **+ New quote** or **+ New invoice** on its **Billing** tab.

### Fill it in
1. Check the **Number**. Frilensa suggests the next one in the active business's series, like INV-2026-1000. Change prefixes and starting numbers in **Settings → Document numbering**, or switch to **Manual** numbering there.
2. Choose the **Client**, and optionally a **Project**. The currency follows the project or client; change it under **Currency** if needed.
3. Set the **Issue date** and the **Due date** (on a quote, the **Expiry date**). These start from your business's default terms.
4. Add lines: pick an item **From catalog**, or choose **Custom item** and type a description. Enter **Qty / hours** and **Rate**, then press **Add line**.
5. Open **Taxes and fees** with **Show options** to choose taxes and fees. VAT uses your VAT rate (12.5% by default). Press the **Tax on** switch to make a document tax exempt.
6. Edit **Terms and notes** if needed, then press **Create**.

New documents start as **Draft**. Drafts are hidden from clients until you send them or mark them **Sent**.

### Edit or change status
Open a document from the list to see the preview. Use **Edit** to change it, or the status buttons (draft, sent, partial, paid) to update its status. The list can be filtered by quotes, invoices or receipts and searched by number, client or status.

Fees and surcharges you charge often (handling, call-out, card fees) are set up in **Settings → Fees and surcharges**. Tick **Add to new invoices by default** to have one picked automatically.

Frilensa helps you prepare tax invoices, but check with FRCS or your accountant which taxes apply to your work.`
  },
  {
    id: 'sending-documents',
    title: 'Send a quote or invoice',
    summary: 'Email a document, share its "view online" link or QR code, and download or print the PDF.',
    keywords: ['send', 'email', 'share', 'link', 'view online', 'online invoice', 'QR code', 'PDF', 'print', 'WhatsApp', 'download'],
    body: `Open the document in **Billing** to see the preview. The buttons at the top are **Email**, **PDF**, **Edit**, print and share link.

### Email it
1. Press **Email**.
2. Check the client's email address, the subject and the message.
3. Leave **Attach PDF** ticked to attach the PDF, and tick **Send me a copy** if you want one.
4. Send. A draft is marked as sent, and the email is listed under **Sent emails**.

The email includes a link to view and pay online. If email isn't set up on the server, the email screen says so; download the PDF and send it yourself instead.

### Share the online link
Every document has a private "view online" link. Press the share link button to share it, or to copy it so you can paste it into WhatsApp, Viber or an email. The QR code on the preview and on the PDF opens the same page.

On that page, with no sign-in, the client can see the document, download the PDF, accept a quote or report a payment. Drafts aren't shown: mark the document as sent first.

### PDF and print
Press **PDF** to choose what to include (bank details, terms and notes, a tax reference footer, a status watermark), then **Download PDF**. You can also print from there or from the preview.`
  },
  {
    id: 'quotes-credit-notes',
    title: 'Accepted quotes, converting documents and credit notes',
    summary: 'What happens when a client accepts a quote, how to turn it into an invoice, and how to cancel an invoice with a credit note.',
    keywords: ['accept quote', 'accepted', 'convert', 'quote to invoice', 'invoice to receipt', 'credit note', 'cancel', 'cancelled', 'void', 'restore'],
    body: `### When a client accepts a quote
A client can press **Accept quote** on the online quote or in the client portal. This works once the quote is sent. You then see "Quote accepted" under **Needs your attention** on **Home**, with **Open quote** and **Dismiss**, and you're emailed if email notifications are on.

### Turn a quote into an invoice
Open the quote and press **Convert to invoice**. Frilensa creates a draft invoice with the same lines, the next invoice number, its own online link, and your business's payment terms. Check the details, then email or share it. The quote no longer offers **Convert to invoice** once it has been converted.

### Turn an invoice into a receipt
On an unpaid invoice, **Convert to receipt** marks the invoice paid and creates a receipt with the next receipt number, linked to the invoice.

### Cancel an invoice
1. Open the invoice and press **Cancel**.
2. Pick a **Reason** and add notes if you like.
3. Leave **Issue a credit note** ticked to create a credit note for the full amount. Credit notes are numbered CN-2026-1000, CN-2026-1001 and so on.
4. Press **Cancel invoice**.

The invoice is kept, marked cancelled, with the reason and credit note number. Any reimbursable expenses on it can be billed again. To undo a cancellation, open it and press **Restore as draft**.

In the VAT return, a credit note reduces the period it's issued in when it cancels an invoice from an earlier period. Check with your accountant if you're unsure how to treat one.`
  },
  {
    id: 'getting-paid',
    title: 'Get paid and record payments',
    summary: 'Pay now on invoices (bank, M-PAiSA, MyCash, card and PayPal), confirming reported payments, recording payments and part payments yourself, and automatic receipts.',
    keywords: ['pay now', 'paypal', 'card', 'credit card', 'surcharge', 'payment', 'paid', 'record payment', 'confirm', 'reject', 'reported payment', 'part payment', 'partial', 'deposit', 'receipt', 'M-PAiSA', 'bank transfer', 'foreign currency', 'exchange rate', 'bank fee', 'proof of payment'],
    body: `### Pay now
Unpaid invoices show a **Pay now** box online and in the client portal. Clients choose how to pay:
- **Bank transfer**, **M-PAiSA** or **MyCash**: they see your details, the amount and the invoice number to use as the reference, pay, then press **I've paid** with their transaction reference. You confirm it when the money arrives (below).
- **Credit or debit card** or **PayPal**: they pay there and then through PayPal. The invoice is marked paid straight away, a receipt is created, the payment goes into your ledger, and you're emailed.

Choose the methods in **Settings → Pay now on invoices**, for the business selected at the top. Bank, M-PAiSA and MyCash appear once their details are filled in on the business.

### Connect PayPal for card and PayPal payments
1. Sign in at developer.paypal.com with your PayPal business account.
2. Under **Apps & Credentials**, choose **Live**, create an app and copy its **Client ID** and **Secret**.
3. Paste them in **Settings → Pay now on invoices** and press **Connect PayPal**. Frilensa checks them with PayPal and stores the secret encrypted.

PayPal doesn't take FJD, so FJD invoices are charged in New Zealand dollars (NZD) by default, the currency closest in value to FJD. You can choose AUD or USD instead. The amount is converted at your exchange rate for that currency, or an approximate one if you haven't set it. Clients are told before they pay that they'll be charged in NZD (or your chosen currency), the amount and the rate, and that their bank may add its own conversion fee. Invoices already in a PayPal currency are charged as they are. You can add a surcharge (up to 10%) to cover PayPal's fee; clients see it before they pay. PayPal's own fee is noted on the invoice's payment details. Money goes to your PayPal account; withdraw it to your bank from PayPal. Check that your PayPal account can receive payments in Fiji.

### When a client reports a payment
On the online invoice or in the client portal, the client chooses bank transfer, M-PAiSA or MyCash under **Pay now** and presses **I've paid** (or **Paid another way?**) with the transaction reference. You see "Payment reported" under **Needs your attention** on **Home**, and you're emailed if notifications are on.

1. Check your bank or wallet for the money.
2. Press **Confirm**. The **Record payment** form opens with the client's method filled in. Check the details and save.
3. The invoice is marked paid and a receipt is created automatically with the next receipt number.

If you can't find the payment, press **Reject** and add an optional note. The client sees that it couldn't be matched and can report it again. Tick **Email the client** at the top of the panel to email them the receipt on confirm, or your note on reject.

### Record a payment yourself
Open the invoice in **Billing** and press **Record payment**. Choose the method, date and reference, and attach proof of payment if you have it. For a foreign-currency invoice, enter the exchange rate and any bank fees to see the net amount received. Leave **Add to bookkeeping** ticked to add the payment to your ledger. This marks the invoice paid and creates its receipt. Choosing **Paid** in the invoice's status buttons opens the same form.

### Part payments
Press **Partial** on the invoice's status buttons. Enter the **Amount received** so far (or pick 25%, 33%, 50% or 75%), the method, date and reference, then **Save payment**. The invoice shows the amount received and balance due, and the client sees the balance on the online invoice. Each part payment is added to your ledger as it comes in. Use **Edit payment** to update it, and **Record payment** when the rest arrives: the ledger then gets only the remaining balance, and a receipt is created.`
  },
  {
    id: 'retainers-reminders',
    title: 'Retainers and automatic reminders',
    summary: 'Bill clients on a schedule and send automatic overdue reminders.',
    keywords: ['retainer', 'recurring', 'subscription', 'monthly', 'schedule', 'automatic', 'auto-invoice', 'reminder', 'overdue', 'late', 'chase', 'run now', 'automation'],
    body: `### Set up a retainer
1. Go to **Billing → Retainers** and press **New retainer**. Or open an invoice and press **Make retainer** to start from it.
2. Choose the business, client, a **Retainer name**, and optionally a project and currency.
3. Pick the **Billing interval** (monthly, quarterly, fortnightly or yearly), the **Payment terms**, and a start date (an end date is optional).
4. Under **New invoices**, choose **Mark as sent** or **Save as draft to review**.
5. Add line items, set **Status** to **Active**, and tick **Create invoices automatically** if you want Frilensa to invoice it for you.

Retainers set to create invoices automatically get their invoice every morning on the due date (8:00 am Fiji time), even when Frilensa isn't open. A retainer is never invoiced twice for the same period. You can also press **Bill now** on a retainer, or **Bill due retainers** to create every invoice that's due. Invoices use your VAT setting.

### Overdue reminders
Go to **Settings → Automatic invoices and reminders**. Everything is off until you switch it on:
- **Email retainer invoices to clients**: emails retainer invoices marked "sent" with their online link.
- **Send overdue reminders**: emails clients about unpaid invoices 3, 10 and 21 days after the due date (friendly, then firm, then final). Each invoice gets at most one reminder per stage. Invoices the client has reported paying are skipped, and invoices more than 120 days late are left for you to follow up yourself.
- **Copy me on reminders**: sends you a copy of each reminder.

The card shows what the last run did. **Run now** runs it straight away. An overdue invoice shows which reminders were sent. Emails need email to be set up on the server; the card tells you if it isn't.`
  },
  {
    id: 'client-portal',
    title: 'The client portal',
    summary: 'Give a client a private portal link or a PIN so they can see their documents, accept quotes, report payments and message you.',
    keywords: ['portal', 'client portal', 'link', 'PIN', 'sign in', 'access', 'revoke', 'QR code', 'WhatsApp', 'messages', 'I am a client'],
    body: `The client portal is a private page where a client sees everything you've sent them.

### Give a client access
1. Go to **Clients**, open the client and choose the **Portal** tab.
2. Press **Create portal link**. Use **Copy link**, **Share or QR code** or **Open link**.
3. From **Share portal** you can also **Send on WhatsApp** or **Send by email**, or show the QR code.

The link opens the portal without a password, so share it only with the client.

### Sign in with a PIN
On the **Portal** tab, under **Portal PIN**, type a 6 to 10 digit PIN or press **Random PIN**, then **Save PIN**. Share the PIN privately: it can't be viewed again. The client signs in at frilensa.com on the **I’m a client** tab with their email and PIN.

### What clients see
- Their quotes, invoices and receipts that you've sent. Drafts are never shown.
- Their projects.
- Your payment details ("Pay to").
- Receipts for reimbursable expenses on their invoices.

They can download PDFs, accept quotes, report a payment with its reference, and send you messages. Messages appear under **Needs your attention** on **Home** and in the client's **Messages** tab, where you reply.

### Stop access
In **Share portal**, **New link (old one stops working)** replaces the link, and **Revoke access** ends access and signs out any open sessions.`
  },
  {
    id: 'expenses',
    title: 'Log expenses and receipts',
    summary: 'Record expenses, scan receipts, mark VAT you can claim, and keep receipt files.',
    keywords: ['expense', 'spend', 'cost', 'receipt', 'scan', 'photo', 'OCR', 'upload', 'VAT claimable', 'input VAT', 'tax deductible', 'category', 'attachment'],
    body: `### Add an expense
1. Go to **Finance → P&L and expenses** and press **Add expense**. To start from a receipt, press **Scan receipt** instead.
2. On **Scan receipt**, use **Take photo** or **Upload file** (PDF, PNG, JPG or a screenshot). Frilensa reads the vendor, amount and date. Always check what it filled in.
3. Fill in or check the **Vendor**, date, **Amount** and **Category**, plus description, payment method and project if you like. If you paid in another currency, choose it and enter the rate.
4. Tick **Claim input VAT** if the purchase includes VAT you can claim. Frilensa works out the VAT in the amount at your VAT rate (12.5% by default). Tick **Tax deductible** if it reduces your taxable income.
5. Press **Save expense**.

### Receipts
Use **Attach receipt (photo or PDF)** to keep a receipt without scanning it. Receipts are kept in secure file storage. Open an expense later to view or remove its receipt.

### Find and change expenses
The list on **P&L and expenses** can be searched and filtered by period, category and payment method. Use the edit and delete icons on each expense. **AI categories** suggests categories for your expenses; check each suggestion before you accept it.

### VAT
Only expenses marked as VAT claimable count towards input VAT in the VAT return. Frilensa helps prepare the figures; check with FRCS or your accountant which purchases you can claim.

If you paid for something on a client's behalf, see the reimbursable expenses article.`
  },
  {
    id: 'reimbursable-expenses',
    title: 'Bill expenses to a client',
    summary: 'Mark expenses you paid for a client as reimbursable, then add them to their invoice at cost or with a markup.',
    keywords: ['reimbursable', 'reimburse', 'rebill', 'disbursement', 'pass on', 'bill to client', 'markup', 'expense on invoice', 'receipt'],
    body: `When you pay for something on a client's behalf, such as materials, travel or a booking, you can pass the cost on in their next invoice.

### Mark the expense
1. Add the expense as usual (**Finance → P&L and expenses → Add expense**).
2. Under **Bill to a client (reimbursable)**, choose the client.
3. Attach the receipt so the client can see it.

### Add it to an invoice
1. Create an invoice for that client. The editor shows how many expenses are waiting to be billed to them.
2. Press **Add expenses** and tick the ones to bill. Expenses without a receipt are marked "no receipt".
3. Optionally enter a **Markup** percentage. Tick **Charge VAT on these** only if you need to charge VAT on them.
4. Press **Add to invoice**.

Each line shows the date, vendor and description, marked **Reimbursable**. By default they carry no VAT, and percentage taxes and fees aren't charged on them. You can tick **VAT** on a single line. Expenses in another currency are added at their recorded home-currency amount.

### What the client sees
On the online invoice and in the client portal, each reimbursed line is labelled as a reimbursable expense, with **View receipt** when you attached one. Receipts aren't shown on drafts.

### Billed once
An expense shows which invoice it was billed on, so it can't be billed twice. Deleting or cancelling that invoice frees it again.

Reimbursed costs are left out of profit and loss and listed separately in the VAT return. Whether VAT applies depends on how you paid for the item; check with your accountant if unsure.`
  },
  {
    id: 'services-rate-card',
    title: 'Services, rate card and default terms',
    summary: 'Keep a catalogue of services and rates, share a rate card, take booking requests from your rate card, apps and websites, choose what can be booked and what to ask, and set default terms for each business.',
    keywords: ['services', 'rates', 'catalogue', 'catalog', 'price list', 'rate card', 'rate sheet', 'quote request', 'booking', 'booking request', 'booking questions', 'bookable', 'business id', 'terms', 'payment terms', 'quote validity', 'margin', 'starter pack', 'adjust prices', 'rate rules'],
    body: `Everything here is in **Finance → Services**, for the active business.

### Your catalogue
Press **Add item** and enter the name, unit (**Per**) and rate. You can add an item code, category, description, your cost (to see margins), rush, weekend and retainer rates, a minimum quantity and stock. Items appear under **From catalog** when you write quotes and invoices.
- Tabs: **Catalogue**, **Rate tiers**, **Margins** and **Starter packs** (ready-made items for common trades; pick the ones to add).
- **Adjust prices** changes rates in bulk. **Rate sheet** gives you a printable price list.
- **Rate rules** below the catalogue add weekend, rush or after-hours modifiers, and the rate calculator shows what a job costs with them.

### Rate card
Under **Rate card**, press **Create rate card link**. The link opens a page with your services, rates and quote terms. Clients can print it or save it as a PDF, pick quantities to see an estimate, and send you a booking request. Untick **Show on rate card** on an item to hide it. **New link** replaces the link and **Turn off** stops it working.

### Booking requests
Every booking request, from your rate card, the directory, or an app or website connected with an API key, appears under **Needs your attention** on **Home**, and you're emailed about each one. Each shows where it came from (for example "Booked via Soqo Stream"), the customer's answers, and the event date, time and location. The soonest events are listed first. **Open in** goes to the booking in the app it came from. **Create quote** makes a draft quote with the requested services and a **Booking details** block in its notes, so the customer sees what they're being quoted for. It adds the person as a client if they aren't one already. Check it and send it from **Billing**.

### Bookings settings
Under **Bookings for** your business:
- **Bookable services**: everything on your rate card can be booked unless you untick it. Set a minimum or maximum quantity per service.
- **Booking questions**: switch on the event or job date, start time and location, and add your own questions (short or long text, number, date, time, single or multiple choice, yes or no). Each can be required, have help text, and be asked only when certain services are chosen. Use the arrows to order them.
- **Intro text** and **After-booking message**, shown to customers by apps that use them.
- The **Business id** is what an app or website developer needs, with an API key, to show your booking form.

### Default terms
Under **Terms for** your business, set **Invoices due after (days)**, **Quotes valid for (days)**, **Invoice terms and notes** and **Quote terms and conditions**, then press **Save terms**. New quotes and invoices fill these in (you can still change them on each one), including drafts made by the assistant or the API, and retainers with no terms of their own.`
  },
  {
    id: 'projects-tasks',
    title: 'Projects and tasks',
    summary: 'Plan jobs with a scope, track tasks and time, and bill tracked hours.',
    keywords: ['project', 'job', 'task', 'to do', 'kanban', 'board', 'timer', 'time tracking', 'hours', 'bill hours', 'scope', 'scope of work', 'deliverables', 'due date', 'priority'],
    body: `### Create a project
Go to **Projects** and press **New project**. Start from a template (it fills in scope and tasks) or **Blank**. Enter the **Project name**, dates, currency, **Budget**, **Rate type** (fixed price, hourly or retainer), client, status and business.

Projects show on a **Board** with columns for leads, in progress, pending review and completed. Drag a project to change its status, or switch to **Grid**.

### Inside a project
Open a project to see three tabs:
- **Scope**: sections with a cost and deliverables. Press **Add section**, or **Draft a scope with AI** to get suggested sections to edit. **Create quote** or **Create invoice** turns the sections into a draft.
- **Tasks**: your to-do list for the job.
- **Billing**: quotes and invoices linked to the project. Use **+ New quote** or **+ New invoice**, or link an existing document.

### Tasks
1. On **Tasks**, press **Add task**.
2. Enter a **Title**, and optionally a description, **Due date** and **Priority**.
3. Move tasks between to do, in progress and completed by dragging them or with the arrows. You can show them as a board or a list, and sort by priority.

Open a task to edit it and add notes and links (for example client feedback or a design file).

### Track and bill time
Press **Start timer** on a task and **Stop timer** when you finish; the time is added to the task. Press **Bill hours spent**, enter your hourly rate, and add the hours to one of the client's draft invoices or to a new draft invoice. Check the draft in **Billing** before sending it.`
  },
  {
    id: 'bookkeeping',
    title: 'Bank statements, reconciliation and the ledger',
    summary: 'Import bank statements, add ledger entries, match transactions to invoices, and undo changes.',
    keywords: ['bank statement', 'import', 'CSV', 'BSP', 'ANZ', 'Westpac', 'M-PAiSA', 'ledger', 'transactions', 'reconcile', 'reconciliation', 'match', 'duplicates', 'undo', 'history', 'bookkeeping'],
    body: `The ledger holds your bank and wallet transactions. It's in **Finance → Ledger**.

### Import a bank statement
1. On **Ledger**, press **Import statement**.
2. Paste the statement lines, or choose **Upload file** for a .csv, .tsv or .txt export from your bank. BSP, ANZ, Westpac and M-PAiSA formats are read.
3. Check the rows. Frilensa suggests a category and the VAT for each.
4. Import. The rows wait under **To review**.
5. Check the categories, accounts and VAT. Suggestions can be wrong. Then add rows one by one, press **Add all**, or press **Add new only** to skip rows that look like entries you already have. **Discard all** throws the import away.

### Add an entry by hand
Press **Add entry** and enter the date, description, amount, category (press **Suggest** for a suggestion) and account.

### Keep the ledger clean
- **Duplicates** finds entries that were imported twice, which would count income or expenses twice, and removes them.
- **History** shows restore points so you can undo recent changes.
- Filter the ledger by type, category and account, or search it.

### Reconcile
Rows you add from a bank statement start as pending. **Finance → Reconcile** lists pending transactions and suggests matching invoices and subscriptions, with a match score. Press **Reconcile** on a match to mark the transaction reconciled; when the match is an invoice, the invoice is marked paid. **Find matches** checks all pending transactions at once. If nothing matches, use **Categorise it yourself**. In the ledger, the tick on each entry switches it between pending and reconciled.

Payments you record in **Billing** with **Add to bookkeeping** ticked are added to the ledger automatically.`
  },
  {
    id: 'profit-and-loss',
    title: 'Profit and loss',
    summary: 'See income, expenses, net profit and net VAT for a period, and print a statement.',
    keywords: ['profit', 'loss', 'P&L', 'income', 'revenue', 'expenses', 'net profit', 'report', 'statement', 'AI advisor'],
    body: `Go to **Finance → P&L and expenses**.

### Pick a period
Choose **All time**, the current year to date, **This quarter**, **This month** or **Last month**. Income and expenses both follow the period you pick.

### What you see
- **Income**: paid invoices and receipts.
- **Expenses**: the expenses you've logged.
- **Net profit**: income less expenses.
- **Net VAT**: output VAT on sales less input VAT on purchases.

Costs that clients repaid you (reimbursable expenses) are left out of both income and expenses, so they don't inflate your figures.

Below the totals you'll find your expenses for the period, which you can search and filter.

### Print a statement
Press **P&L statement** to open a printable profit and loss statement, then **Print / PDF** to print it or save it as a PDF.

### Ask about your figures
Press **AI advisor** at the top of **Finance** to ask questions about your profit, spending and VAT. You can also ask the assistant on the **Assistant** tab. It uses your real figures, and it isn't formal tax or accounting advice.

For your VAT return, use **Finance → VAT return**, which works out the figures for a VAT period in more detail.`
  },
  {
    id: 'vat-return',
    title: 'VAT return and exports for your accountant',
    summary: 'Work out your VAT return figures for a period and download CSV files for your accountant. Frilensa does not file returns.',
    keywords: ['VAT', 'VAT return', 'FRCS', 'tax', 'output VAT', 'input VAT', 'zero-rated', 'exempt', 'accountant', 'export', 'CSV', 'filing', 'VAT rate', 'not VAT registered'],
    body: `### Your VAT setting
In **Settings → Your profile and tax**, switch VAT on or off and set your **Fiji VAT rate (%)** (12.5% by default). If you're not VAT-registered, turn VAT off and your quotes and invoices won't include it. Check with FRCS whether you need to register.

### Work out a VAT return
1. Go to **Finance → VAT return**.
2. Choose the **Period** (a month, quarter, half-year, year, or custom dates).
3. Choose the **Basis**: **Invoice basis (when invoiced)** or **Payments basis (when paid)**. Your accountant or FRCS can tell you which one you use.
4. Choose a **Business** or **All businesses**.

You'll see standard-rated sales, zero-rated or exempt sales, output VAT, credit notes, purchases with claimable VAT, input VAT, and the net VAT payable or refundable. Costs reimbursed by clients are listed separately, not as sales. The invoices and expenses behind each figure are listed below.

### Check before filing
Frilensa warns you about things to check, such as a business with no TIN, claimable expenses with no VAT amount, drafts left out, foreign-currency sales and part payments. Only expenses marked as VAT claimable count as input VAT.

Press **Download CSV**, or **Print or save as PDF**.

### Exports for your accountant
Under **Exports for your accountant**, download CSV files of invoices, quotes and receipts, invoice line items, expenses, bank transactions, and clients with amounts owed. Dated records use the period and business you chose. The files open in Excel, Google Sheets and accounting software.

Frilensa prepares the figures from your records. It doesn't file your return with FRCS: check the figures, or have your accountant check them, before you file.`
  },
  {
    id: 'directory',
    title: 'Directory and bookings',
    summary: 'List your business in the Frilensa directory, find other businesses, and handle booking requests.',
    keywords: ['directory', 'listing', 'list my business', 'booking', 'book', 'request', 'marketplace', 'find a freelancer', 'accept booking', 'decline'],
    body: `The **Directory** lists Frilensa businesses that chose to be found. Other users can send them booking requests.

### List your business
1. Go to **Directory**.
2. Press **List my business**. Listing is part of the Pro and Premium plans; during early access you can switch plan for free with **Upgrade to Pro to list**.
3. After you change your business profile, press **Update listing** so the directory shows the new details.

To hide your listing, press **Listed (click to hide)**.

### Book another business
On **Browse**, search by name or skill, filter by location, and open a business to see what it does, its skills, contact details and payment methods. Press **Request booking**, fill in the service, date, preferred time, meeting type, your details, budget and payment method, and send it. Track your requests on **My bookings**, where you can **Cancel request**.

### Handle booking requests
New requests appear under **Needs your attention** on **Home** (press **Review**) and on **Received bookings**. You're emailed about each one if notifications are on.
- Press **Accept** or **Decline**. The person who booked is emailed either way.
- For an accepted booking, **Create invoice** makes a draft invoice using your invoice numbering. Check it in **Billing** before sending.
- **Email client** opens an email to them.

Bookings and listings aren't reviewed or verified by Frilensa.`
  },
  {
    id: 'assistant',
    title: 'Using the assistant',
    summary: 'What the assistant can do: answer how-to questions, look up your figures, and propose tasks, clients, drafts and expenses for you to confirm.',
    keywords: ['assistant', 'AI', 'Claude', 'chat', 'ask', 'help', 'propose', 'confirm', 'memory', 'consultation', 'transcript', 'attach'],
    body: `Open the **Assistant** tab. On a phone it's in the bottom bar.

### What you can ask
- **How to use Frilensa**: the assistant answers from these help articles. If they don't cover something, it says it's not sure rather than guessing.
- **Your business**: "Who owes me money?", "Which invoices are overdue?", "What did I spend on fuel last quarter?", "What's my VAT for last month?". It looks up your clients, quotes, invoices, receipts, expenses, projects, tasks, profit and VAT figures. It doesn't invent numbers.
- **General guidance** on pricing, invoicing, bookkeeping and Fiji tax. This isn't formal tax or legal advice; for rules that matter, check with FRCS or an accountant.

### Getting things done
Ask it to add a task, add a client, draft a quote or invoice for an existing client, or record an expense (for example from a receipt you attach). It shows a card with the details and a **Confirm** button. Nothing is saved until you press **Confirm**. Draft quotes and invoices stay drafts until you check and send them from **Billing**.

### What it can't do
It never sends anything to clients, emails anyone, records or confirms payments, edits or deletes existing records, or changes settings. It tells you where to do those things yourself.

### Files, memory and saved chats
- Attach a receipt, invoice or bank statement (photo, PDF or CSV) and it reads it.
- **Consultations** keeps your past chats. Start a fresh one with **New chat**.
- **AI memory** holds facts and preferences the assistant uses in every answer. Add or delete them yourself.
- **Email transcript** emails a chat and its action items.

The **AI advisor** in **Finance** uses the same assistant for questions about your figures.`
  },
  {
    id: 'claude-api',
    title: 'Connect Claude and other tools',
    summary: 'Connect Claude or your own scripts to Frilensa with OAuth or a personal API key.',
    keywords: ['Claude', 'connector', 'MCP', 'API', 'API key', 'integration', 'OAuth', 'connected apps', 'revoke', 'read only', 'drafts', 'automation', 'Claude Code'],
    body: `Frilensa can be used from Claude and from your own tools. Everything is in **Settings → API keys and AI assistants**.

### Claude on the web, desktop or phone
1. In Claude, open Settings → Connectors → Add custom connector.
2. Paste https://frilensa.com/mcp (there's a **Copy** button in Frilensa).
3. Claude sends you to Frilensa to sign in. Choose **Read and create drafts** or **Read only**, and allow it.

No key is needed. The connection appears under **Connected apps**, with when it was last used. Press **Disconnect** to remove it.

### Personal API keys
For Claude Code, scripts and automation tools, create a key:
1. Enter a key name, for example "Claude", and choose **Read and create drafts** or **Read only**.
2. Press **Create key** and copy it straight away. It won't be shown again.
3. Use it with the MCP server (https://frilensa.com/mcp) or the REST API (https://frilensa.com/api/v1), sent as an "Authorization: Bearer" header.

You can have up to 10 keys. **Revoke** stops a key working immediately. Treat keys like passwords: anyone with a key can read your business records.

### What connected tools can do
- **Read only**: read your account, businesses, clients, quotes, invoices, receipts, credit notes, expenses, projects, tasks, and profit and VAT summaries.
- **Read and create drafts**: also add clients, tasks and expenses, create draft quotes and invoices (which can include reimbursable expenses), and send you **booking requests**.

### Take bookings from your own website or app
A developer building your booking page or app needs a **Read and create drafts** key (name it after the app, for example "Soqo Stream") and your **Business id** from **Finance → Services → Bookings**. The app reads your booking form (bookable services, prices and questions), sends booking requests, and can check how far each one has got: quoted, quote accepted, invoiced, part paid or paid. Prices always come from Frilensa. Requests land in your inbox like any other booking. The app's documentation is at frilensa.com in docs/API.md.

Nothing reached through a key or connector can send anything to your clients, mark anything paid, or edit or delete existing records. Drafts stay hidden from clients until you send them from Frilensa. Every change shows in your activity log with the key's or app's name.`
  },
  {
    id: 'settings-account',
    title: 'Settings, notifications and your account',
    summary: 'Your profile, email notifications, numbering, fees, backups, plan, release notes and signing out.',
    keywords: ['settings', 'profile', 'account', 'email notifications', 'notifications', 'numbering', 'prefix', 'fees', 'backup', 'restore', 'sync', 'plan', 'release notes', 'version', 'sign out', 'logout', 'idle', 'install', 'app'],
    body: `Open **Settings**.

### Your profile and tax
Your name, email, mobile number and TIN, VAT on or off with your VAT rate, and your **Default currency** for new documents. Press **Save settings** when you're done.

### Email notifications
Under **Email notifications**, choose whether you're emailed when a client reports a payment, accepts a quote, sends a message or books you. You're also emailed about every booking request. Turn it off to stop these emails.

### Other settings
- **Automatic invoices and reminders**: see the retainers and reminders article.
- **API keys and AI assistants**: see the article on connecting Claude.
- **Sign out when idle**: signs you out after a period of no activity (15 minutes is recommended). You get a 60-second warning first.
- **Businesses**: details, logo and colours, and working currencies for the active business.
- **Document numbering**: **Automatic** or **Manual**, with a prefix and starting number for invoices, receipts and quotes. Press **Save numbering**.
- **Fees and surcharges**: fees you add to invoices. The Fiji taxes and levies themselves are set by Frilensa.
- **Cloud sync**: your data syncs automatically between devices. **Sync now** forces a sync.
- **Backups**: **Download backup**, **Import backup**, **Copy backup**, **Restore auto-backup** or **Paste a backup**.
- **Plan**: your current plan. Plan changes are free during early access (**Change plan**).
- **Install the app**: add Frilensa to your phone's home screen.
- **App Version & Release Notes**: the version you're using. Press **View Changelog** to see what changed in each release.
- **Help**: these articles.

### Sign out
Press **Sign out** at the bottom of **Settings**, or the sign-out button in the sidebar on a computer.`
  }
];

/** All articles as Markdown ("## Title" then the body), for the assistant's system prompt. */
export function helpAsText(): string {
  return HELP_ARTICLES.map(a => `## ${a.title}\n\n${a.body}`).join('\n\n');
}
