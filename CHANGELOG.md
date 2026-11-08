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

## [4.17.0] - 2026-11-08

### Added
- **Admin → Analytics:** how Frilensa is used, for any period (7 days to a year):
  - **People:** accounts, sign-ups, sign-in methods, verified emails, people active today, this week and this month, a daily chart of active people and sign-ups, and weekly retention (the share of each week's sign-ups who came back 1 to 4 weeks later).
  - **App use:** the most used screens and actions, and phone or desktop.
  - **Workspaces and plans:** how many, how full (clients, documents, projects), and who's on which plan.
  - **Money flowing through Frilensa:** invoices issued, paid and owing by currency, invoice status, and the share of quotes won.
  - **Bookings:** requests by day and by channel (booking page, widget, rate card, marketplace, API), and how many became quotes; directory listings and bookings.
  - **Marketplace:** listings by status, top categories and towns, requests and confirmed rentals.
  - **Plan revenue, AI scans, assistant use, API keys, webhooks and screen errors.**
  - **Exports for studies:** users, app use by day, documents, booking requests and marketplace listings as CSV files, with anonymous ids instead of people, and no names, emails, client details or anything typed.
- The app now records which screens and actions are used (names only, counted per person per day) to power these reports. These records are deleted with the account and after about 13 months.

### Changed
- The privacy policy explains the usage statistics and that research only uses anonymised exports.

## [4.16.0] - 2026-11-08

### Added
- **Admin → Modules:** super admins can switch each part of Frilensa on or off for everyone, and set its limits. Switched-off modules are refused by the server, hidden in the app (with a short note where their settings were), and nothing is deleted.
  - **Marketplace:** on/off, whether a user's first listing is reviewed, listings per user, photos per listing.
  - **Booking page and widget:** on/off, booking requests a day per business, whether acknowledgement emails may be sent.
  - **Rate cards, client portal, emailing documents, projects, finance and bookkeeping, AI tools:** on/off.
  - **Pay now:** on/off, and card and PayPal on/off.
  - **AI assistant:** on/off, and messages a month per user.
  - **Public API and MCP:** on/off, the MCP server on/off, and API keys per user.
  - **Webhooks:** on/off (nothing is sent while off) and webhooks per user.
  - **Daily automation:** on/off, retainer invoices on/off, overdue reminders on/off.
  - Areas with their own tab (sign-ups, plans, paid plans, taxes and fees, directory, marketplace content, branding) are linked from the same page.

## [4.15.0] - 2026-11-08

### Added
- **Plan features apply** once paid plans are on: recurring invoices and retainers, the client portal, quotes and invoices in other currencies, your own logo and brand colours, bank statement import, your own taxes and fees, AI receipt scanning and PDF downloads follow each plan's switches in Admin → Plans. Trying one that isn't in your plan opens the plan picker saying which plan has it. Nothing you've already made is removed: existing portal links, retainers and branding keep working, and the daily job just doesn't create new retainer invoices without the feature. The API refuses documents in another currency without it.
- **Receipts for plan payments:** every approved payment gets a numbered receipt (FRL-2026-0001…), or a tax invoice showing the VAT included when Frilensa is VAT-registered, with Frilensa's legal name, TIN and address from Admin → Billing. Open, print or save them from Settings → Plan (admins from Admin → Billing).

### Changed
- **Terms of use:** a new "Plans and paying Frilensa" section (prepaid plans, no automatic renewal, how to pay, limits, what happens when a plan ends, refunds, and plans we give), and the privacy policy now mentions plan payment details. Please have these reviewed.

## [4.14.0] - 2026-11-08

### Added
- **Paid plans, ready to switch on.** Nothing changes until an admin turns on paid plans in Admin → Billing; until then everyone keeps switching plans for free (early access).
  - Plans are **prepaid** for a month or a year: nothing renews or charges by itself. Paying again before the end adds to the paid time.
  - **Ways to pay:** bank transfer, M-PAiSA or MyCash (the customer enters their reference and an admin approves it once the money arrives), or card and PayPal with Frilensa's own PayPal account (confirmed straight away, charged in AUD, USD or NZD at the rate you set, since PayPal can't charge FJD).
  - **Limits apply** once paid plans are on: invoices a month, clients, services, businesses, projects and AI receipt scans. Reaching one opens the plan picker with the reason. The API also refuses new clients or invoices beyond the plan.
  - **Reminders:** emails 7 days and 1 day before a plan runs out; after the grace days you set, the account moves back to Free (nothing is deleted) and is emailed.
  - **Early access:** set the date early-access Pro and Premium plans keep working until, so people have time to pay.
  - **Settings → Plan** shows your plan, how long it's paid for, payments waiting to be confirmed, past payments, and what you've used against each limit.
  - **Admin → Billing** (replacing the empty Payments tab): switch paid plans on, set payment details, approve or reject transfers, and see who's on a paid plan and what's been received. Changing someone's plan in Admin → Workspaces gives them that plan.

### Changed
- Your plan is now kept on Frilensa's servers, so it can't be changed by editing data on a device. The directory's "paid plans only" check uses it.
- Invites that come with a plan give that plan on the server.

### Fixed
- Rental checks in the test suite no longer depend on fixed dates.

## [4.13.0] - 2026-11-08

### Added
- **Rate conditions on the booking page and website widget.** Customers choose the condition that fits their project (for example local production, international production in Fiji, or overseas work), and the prices, currency and VAT follow it, as on the rate card. The booking arrives in that currency, priced by the server, with the condition shown in the booking details, and the quote you create from it has no VAT for VAT-free conditions. A service with no rate in that currency shows "Price on request".
- **Booking API:** the booking form now includes the business's `conditions` and each service's `conditionRates`, and a booking request can send `conditionId` to be priced by it (see the API guide).

## [4.12.0] - 2026-11-08

### Added
- **Rate conditions:** charge different rates for the same service depending on the job. For example, location audio recording at FJD 600/day for a local production, FJD 900/day for an international production hiring you in Fiji, and AUD 1,000/day for overseas work (AUD 400 gear + AUD 600 labour).
  - Set up your conditions under Services → Rate conditions, or start from a ready-made set: film, video and audio production (local, international in Fiji, overseas), type of client, or where the work is. Each condition has its own currency, a short note for clients on when it applies, and can be marked **No VAT** (e.g. work done overseas).
  - When you edit a service, set its rate for each condition, and optionally **split it into parts** such as gear and labour. Leave one blank to use your standard rate.
  - **Rate cards:** clients choose the condition that fits their project; prices, currency and VAT follow it, the other conditions' rates are shown for comparison, and the request (and the quote you create from it) comes in that currency, without VAT for VAT-free conditions. A service with no rate in that currency shows "Price on request".
  - **Quotes and invoices:** when you add a catalogue item, pick the condition. An empty quote switches to that condition's currency; otherwise the rate is converted for you to check. VAT-free conditions turn tax off, and gear and labour can go on separate lines.
  - The rate sheet lists each service's rates by condition.
- **Marketplace service listings** can have rates for different jobs too (each with its own currency, optionally split into gear and labour). Requesters choose the one that fits, and the request arrives in that currency with each part as its own line.

## [4.11.1] - 2026-11-08

### Fixed
- Project scope: you can now change a deliverable after adding it (tap it in Edit section), move deliverables up and down, and see the whole list instead of only the first few.
- Project scope: editing a section that was created without an internal id (older projects and some templates) added a copy instead of changing it. It now edits the section, and deleting such a section works too.
- A deliverable typed into the box but not yet added with "+ Add" is no longer lost when you save the section.

### Changed
- Scope sections have a clear Edit button, an "Edit deliverables" link, and arrows to reorder sections.

## [4.11.0] - 2026-11-08

### Added
- Rental bookings in the marketplace, for equipment, vehicles, event and AV hire:
  - **Availability calendar.** Renters pick their pick-up and return days on a calendar that shows which days are booked out (or, for items you have several of, how many are free). Dates are held when the owner confirms a request or blocks them, and the server refuses requests for dates that are taken.
  - **Owner calendar** in Market → My listings (the calendar button on a rental): confirm requests (which holds the dates and emails the renter), block dates for servicing or other bookings, and free them again.
  - **Deposits:** ask for a refundable bond or a deposit up front, as a fixed amount or a percentage of the booking. Renters see it before they request.
  - **Included items and add-ons:** list what comes free with the hire (e.g. a kit lens), and optional add-ons renters can choose, free or charged once or per day (e.g. SD cards, a second lens, a child seat).
  - **Dry or wet hire:** offer equipment only, with an operator, or both, with the extra rate for the operator. For vehicles this reads as self-drive or with a driver.
  - **Pick-up and return:** your locations with addresses, return to a different location, delivery with a fee, and pick-up and return times within your hours. Hourly rentals are charged by the hour; daily rentals by 24-hour periods when times are given.
  - **How many you have,** so several renters can book the same item on the same days, and a **minimum hire**.
  - The renter sees the price build up as they choose, and the server works out the same price. The request arrives in your inbox with each charge as its own line, ready to quote.
- **Brands:** admins add brands with their logos in Admin → Marketplace. Listers pick the brand from a list (or type one under Other), the logo shows on the listing, and renters can filter by brand. Renaming a brand updates its listings; removing one keeps the name on them.
- New categories: rental cars, vans and minibuses, trucks and utes, motorbikes and scooters, drivers and chauffeurs, AV equipment, LED screens and projectors, event power and generators, and decor and tableware.

### Changed
- "Audio, music and events" is now "Audio, AV and event hire", and "Transport and marine" is now "Vehicles, transport and marine".
- For agent listings, admins confirm rental dates from the listing's calendar in Admin → Marketplace.

### Fixed
- Requests to rent no longer ask for the number of days separately from the dates; the price comes from the dates and times.

## [4.10.0] - 2026-11-07

### Changed
- The directory switches in Admin → Directory ("Public directory" and "Paid plan required to be listed") now apply to every account and are enforced. Before, they only changed the admin's own account and had no effect.
  - When the directory is off, nobody can browse, list or book through it; people see that it's closed, and their existing bookings stay under My bookings.
  - When a paid plan is required, free accounts can't list, and listings from accounts that have since moved to the free plan are hidden and can't be booked. Turn it off to let every plan list.
- Businesses that are no longer allowed to list can still remove their listing.

## [4.9.0] - 2026-11-07

### Changed
- Plans (names, descriptions, prices, limits and features), the Fiji taxes and fees every business can apply, and the standard VAT rate are now set once by Frilensa admins and reach every account. Before, changes in Admin → Plans and Admin → Taxes and fees only changed the admin's own account. Invoices and quotes already issued keep the rates they were issued with, and each business's own VAT rate in Settings still applies to its invoices.
- The plan picker shows the plans as admins set them, with an annual price of twelve months less 20%.
- New accounts start with the standard VAT rate admins set.
- Admins can now rename plans and edit their descriptions. Removing a tax or fee asks first.

### Fixed
- Taxes and fees an admin turns off no longer appear when creating invoices and quotes (documents that already use one keep it).

### Removed
- The unused "Default currency" and "Require TIN" switches in Admin → Taxes and fees. They had no effect.

## [4.8.0] - 2026-11-07

### Added
- **Marketplace (beta)**, in the menu and public at frilensa.com/marketplace.
  - **Gear** to **rent** or **buy** (switch at the top), and **Services**. Search, and filter by industry, category and town; sort by newest or price. Eleven industries, each with its own gear and service categories.
  - **Send a request** to rent (choose the dates), make an offer to buy, or ask for a service quote. Anyone can browse; requests and listings need an account.
  - **List your gear or services** under **Marketplace → My listings**, with up to 6 photos (resized on your phone before upload), rent and sale prices, condition, brand and model. You can edit, hide or delete them, and see the requests you sent.
  - **Requests for your listings arrive in your inbox** on Home ("From the marketplace"), with an email, so you can **Create quote** and invoice as usual.
  - A user's **first listing is reviewed** by the admins before it goes live; after one is approved, their listings go live straight away.
- **Admin → Marketplace**: approve or reject listings waiting for review (the seller sees the reason), hide or delete any listing, and **list for a provider** with Frilensa as their agent. Those listings show "Listed by Frilensa", and their requests come to the admins, who record progress and the commission earned. The commission terms are never shown publicly.
- On phones, **Market** replaces Directory in the bottom bar. The directory is still in the desktop menu and linked from **Marketplace → Services**.
- The privacy policy now covers the marketplace.

## [4.7.0] - 2026-11-07

### Added
- **Delete my account** in **Settings → Your account**. It permanently removes your workspace, documents, online invoice links, client portal access, booking pages, rate cards, listings, uploaded files, API keys, connected apps, webhooks, PayPal connection and sign-in. You type DELETE and confirm with your password (or Google) first, and you're reminded to download a backup.
- **Privacy policy** (frilensa.com/privacy) and **Terms of use** (frilensa.com/terms). They're linked from sign-up, the sign-in page, Settings and online invoices.
- **Admin → Sign-ups**: choose who can create an account (open, invite only or closed) and make invite codes. An invite can be for one email or anyone, give a plan, have a number of uses and an expiry date, and comes with a sign-up link to copy.

### Security
- **Sign-up settings are now enforced.** The old invite-only and closed settings were only checked in the visitor's browser, against settings nobody else could see, so they did nothing. Now the server and the database rules decide: a new account can't create a workspace until it's approved. People who already have an account are unaffected.
- Made-up invite codes no longer work. Before, any code starting with "BULA-", "SUVA-" or "VIP-" was accepted as a Pro invite.
- **For the operator:** this release changes `firestore.rules`. Answer **y** when the deploy asks to publish the rules.

### Removed
- The email and phone verification-code switches and the idle sign-out setting from the admin panel. They were stored in the admin's own account, so they had no effect on anyone else; phone codes were never connected. Each person still sets **Sign out when idle** in their own Settings.

## [4.6.1] - 2026-11-07

### Fixed
- VAT shows its rate once ("Fiji VAT (12.5%)") instead of twice ("Fiji VAT (12.5%) (12.5%)") on PDFs, the editor, the preview, the online copy, the client portal and emails. Other taxes still show their rate, for example "ECAL (5%)".

## [4.6.0] - 2026-11-07

### Added
- **Discounts on quotes and invoices.** Take a percentage or an amount off, with an optional label (for example "Returning client"), and choose when it applies:
  - **Before tax**: VAT and other taxes are charged on the discounted amount.
  - **After tax**: taken off the total after taxes, which stay as charged. Frilensa reminds you to check with your accountant when this is on a tax invoice.
- **Round the total.** Round to the nearest $1 or $10, down to $10 or $100, or type an exact figure (for example 5000) and press **Set total**. A small "Rounding" line takes the total there, and keeps it there if you change the lines. You're warned when the adjustment is large, since a discount is clearer for your client.
- Discounts and rounding appear on the PDF, the online copy, the client portal, emails, receipts and the in-app preview. They carry over when a quote becomes an invoice, and a final invoice less deposits keeps the quote's discount and rounding, so the deposit and final invoices add up to the quote.

### Fixed
- Emailed quotes and invoices now list fees (such as a surcharge) in the totals. Before, the total included them but the email didn't show them.

## [4.5.2] - 2026-11-07

### Changed
- **Totals update while you edit a line.** As you type a new quantity or rate, the subtotal, VAT, other taxes, fees and total update straight away. The line editor also shows the running total (for example "Quote total incl. taxes"), so you can tune a quote to a client's budget, say exactly FJD 5,000.00 including VAT. The same works for retainers.
- Saving a quote, invoice or retainer while a line is still open keeps your changes to that line.

### Fixed
- VAT, other taxes, fees and totals are rounded to the cent, with halves rounded up. For example, 12.5% VAT on 4,444.44 is 555.56, and the total is exactly 5,000.00. Before, a total could be saved with a fraction of a cent (such as 3,151.125) and show a cent different from the sum of its parts.

## [4.5.1] - 2026-11-07

### Fixed
- **Edit a line on a quote, invoice or retainer.** Press the pencil next to a line to change its name, details, quantity or rate in place, then **Save line** (or **Cancel**, or press Esc). The line total and the document totals update as you go. Before, you had to delete the line and add it again. For reimbursable expense lines you can change the wording, while the amount stays tied to the expense.
- Line details now show under each line in the editor, and rates show with cents (for example 1,250.50).

## [4.5.0] - 2026-10-13

### Added
- **App icons from your logo.** Uploading the Frilensa logo in **Admin → Branding** now also makes square 512×512 app icons:
  - a plain one for the browser tab and for installing on computers and Android;
  - a home-screen one with the logo on your primary colour, sized so the round and squircle shapes on Android phones don't cut it off. iPhones and iPads use this one too, so they don't show a black background.
  - Wide or small logos are centred and fitted. Change the primary colour and press Save, and the home-screen icon is remade in the new colour.
- Notifications show the app icon too.

### Fixed
- **Android home screens kept the old Frilensa icon** after a logo was uploaded, because the standard icon was still offered for Android's shaped icons. Once your icons exist, the install manifest lists only your logo's icons, including for app shortcuts.
- A logo uploaded in 4.4.0 gets its icons the next time you press **Save changes** in Branding.

## [4.4.0] - 2026-10-13

### Added
- **Upload the Frilensa logo** in **Admin → Branding**. Drag a file in or choose one (PNG, JPG, WebP or SVG). It's resized for you and checked on the server. You can replace or remove it at any time. Before, the logo could only be a web address.
- **Use logo colours** fills in the primary and accent colours from the uploaded logo.
- A **live preview** of the sidebar, sign-in page, browser tab and phone home screen. It warns you when white letters would be hard to read on your colour, and when a logo is too small or not square enough for an app icon.

### Changed
- **Branding now shows for everyone.** It used to be saved only in the admin's own account, so nobody else ever saw it. The app name, logo, tagline and colours now appear on:
  - the sign-in page, the sidebar, the setup wizard and the install prompt;
  - the browser tab title and icon;
  - the installed app's name, icon and colour.
- The support email and phone show on the sign-in page and in Help, and the footer text shows on the sign-in page.
- Branding changes are made in one go with **Save changes**, instead of being saved, with a pop-up, on every key press. **Defaults** restores the standard Frilensa look, and you then press Save to keep it.

## [4.3.0] - 2026-10-13

### Changed
- **Admin → Workspaces shows your real users** instead of sample accounts:
  - Each person's name, email and businesses.
  - How many clients, documents and projects they have.
  - When they joined, last signed in and last saved.
  - You can search and change a person's plan (Free, Pro or Premium).
- **Admin → Overview** counts real workspaces: total, active in the last 30 days, on a paid plan, and documents and clients across all of them. The made-up revenue figure is gone.

### Removed
- The sample payments in **Admin → Billing**. Nothing records subscription payments yet, so the list starts empty.
- The **Inspect** button on workspaces. It only showed your own data.

## [4.2.0] - 2026-10-13

### Added
- **App errors** in the admin panel. When a screen shows "This screen couldn't be shown", the details are now sent automatically, so the problem can be fixed without a screenshot. Each report shows the message, the screen, the app version, who hit it and how many times, and can be copied or cleared.

### Fixed
- **Fewer crashes from incomplete data.** Services, bank lines, expenses, rate rules, projects, retainers and clients with a missing or garbled amount, rate or name (from older versions, imports or connected apps) are repaired as they load. Before, one such item could stop a whole screen opening.

## [4.1.0] - 2026-10-13

### Changed
- **Services has its own place in the menu**, after Clients, instead of being the last tab in Finance. It has four tabs:
  - **Services**: your catalogue, starter packs, margins and price adjustments.
  - **Rate card & terms**: your shareable rate card and the default terms for quotes and invoices.
  - **Bookings**: what can be booked, booking questions, availability, deposits, and the booking page and website button.
  - **Rate rules**: weekend, rush and after-hours modifiers, with the rate calculator.
- **Finance** now covers P&L and expenses, VAT return, Reconcile, Ledger and **Currencies** (your working currencies and exchange rates).
- On phones, **Services** is in the bottom bar.
- The rate calculator only lists the active business's services, and says what to do when there are no services or rate rules yet.

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
