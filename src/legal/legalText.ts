// Frilensa's privacy policy and terms of use, shown at /privacy and /terms (components/LegalPage.tsx).
// Written to match what the app does. Have a lawyer review them; update LEGAL_UPDATED when they change,
// and log the change in CHANGELOG.md.

export const LEGAL_UPDATED = '8 November 2026';

export function privacyPolicy(name: string, contact: string) {
  return `This policy explains what ${name} collects, why, who helps us run the service, and the choices you have. It applies to the ${name} app, its client portal and its public pages, such as online invoices, rate cards and booking pages.

## Who we are
${name} is invoicing, bookkeeping and booking software for freelancers and small businesses in Fiji. Questions about this policy or your information: ${contact}.

## What we collect
- **Your account**: your name, email address and sign-in details. Passwords are handled by Google Firebase Authentication; we never see them. If you sign in with Google, we receive your name and email from Google.
- **What you put in ${name}**: your business details (such as your TIN, address, bank, M-PAiSA and MyCash details and logo), clients, quotes, invoices, receipts, projects, services, expenses, receipts and bank statements you upload, notes and messages.
- **Your clients' information**: names, contact details, TINs and amounts you add to documents, and anything your clients send through the client portal, such as a reported payment or a message.
- **Requests from your public pages**: when someone uses your booking page, rate card or the directory, we collect what they enter (such as their name, email, the date and their answers) and pass it to you.
- **The marketplace**: listings you publish (with their photos, prices and town) are public. When you send a request for someone's listing, we pass your name, email, any phone number and your message to them, or to the ${name} team for listings ${name} manages on a provider's behalf.
- **Paying for a plan**: what you paid, when, how (bank, M-PAiSA, MyCash or PayPal) and your payment reference, to confirm payments and issue receipts. PayPal handles card and PayPal payments; we never see card numbers.
- **Payments**: if you turn on Pay now, PayPal handles card and PayPal payments. We never see or store card numbers. We store your PayPal API keys encrypted, and the details of payments needed to mark invoices paid.
- **Technical information**: IP addresses (to stop abuse and limit repeated requests), details of errors when a screen fails to load (so we can fix it), and usage statistics through Google Firebase Analytics.

## How we use it
- To run ${name} for you: store your records, make documents and PDFs, send the emails you ask us to send (invoices, quotes, reminders and receipts) and the notifications you choose.
- To keep the service secure, stop abuse and fix problems.
- To answer your questions and tell you about important changes.

We don't sell your information, and we don't use your clients' information for our own marketing.

## Your clients' information
You decide what you add about your clients, and you're responsible for having the right to use it, for example because you're doing business with them. We process it only to provide ${name} to you. Your clients can ask you to correct or remove their details.

## Who helps us run ${name}
We use these service providers. They process information only to provide their service to us:
- **Google Cloud and Firebase**: hosting, database, sign-in, file storage and usage statistics.
- **Google Gemini**: reading receipts and bank statements and suggesting expense categories, when you use those features.
- **Anthropic (Claude)**: the ${name} assistant, when you use it.
- **Twilio SendGrid**: sending emails.
- **PayPal**: card and PayPal payments, when a business turns on Pay now.
- **Cloudflare Turnstile**: checking that a booking request comes from a person, when a booking page uses it.

When you use an AI feature, we send only what that feature needs (for example the receipt image, or your question and the records it's about). These providers' servers may be outside Fiji.

## Where it's stored and for how long
Your information is stored on Google Cloud servers, which may be outside Fiji. We keep it while your account is open. When you delete your account (Settings → Delete my account), we delete your workspace, documents, online copies, client portal access, files and sign-in. Backup copies made when we update ${name} may keep information for a limited time before they're removed.

## Your choices
- **See and download your information**: Settings → Download backup.
- **Correct it**: edit it in ${name}.
- **Delete it**: delete records in ${name}, or your whole account in Settings.
- **Emails**: turn notifications off in Settings. Emails you send to clients are yours to control.

## Security
Your workspace can only be opened by your account. Client portals and public pages go through our server, which shows only what's meant to be seen. Connections are encrypted. Keep your password safe and tell us at ${contact} if you think your account has been used by someone else.

## Children
${name} is for people aged 18 and over running a business. We don't knowingly collect information from children.

## Changes
We'll update this policy when ${name} changes and show the date below. If a change matters, we'll tell you in the app or by email.`;
}

export function termsOfUse(name: string, contact: string) {
  return `These terms are an agreement between you and ${name}. By creating an account or using ${name}, you agree to them. If you use ${name} for a business, you agree on its behalf.

## Using ${name}
- You must be 18 or over and give accurate details when you sign up.
- Keep your sign-in details safe. You're responsible for what happens in your account.
- ${name} is in early access. Features may change, and some may be added or removed. We'll tell you before any plan you use starts to cost money.

## Your information
- What you put in ${name} stays yours. You allow us to store and process it to provide ${name} to you, for example to make your PDFs, send the emails you ask for and show your online invoices.
- You're responsible for the information you add, including about your clients, and for having the right to use it.
- You can download a backup or delete your account at any time from Settings.

## Invoices, tax and advice
- ${name} helps you prepare quotes, invoices, receipts, VAT figures and reports, but you're responsible for what you send and file.
- Check that your documents meet the Fiji Revenue and Customs Service (FRCS) requirements, and that tax rates and figures are right for your business. ${name} doesn't give tax, legal or financial advice; ask your accountant.

## Payments between you and your clients
- When you use Pay now, payments go to your own PayPal account under PayPal's terms. Bank, M-PAiSA and MyCash payments go directly to you.
- ${name} isn't a party to your agreements with your clients and doesn't hold their money.

## Public pages and requests
Online invoices, rate cards, booking pages, the directory and the marketplace show what you choose to publish. Requests and bookings made through them are between you and the other person. When ${name} lists a service on a provider's behalf, it acts as the provider's agent as agreed with that provider.

## Fair use
Don't use ${name} to break the law, mislead or defraud anyone, send spam, upload harmful code, try to get into other people's accounts, or overload or copy the service. We may limit, suspend or close accounts that do, and remove content that breaks these terms.

## Connected apps and API keys
If you create API keys or connect apps, you're responsible for what they do with your account. Keep keys secret and revoke ones you no longer use.

## Plans and paying ${name}
${name} has a Free plan and paid plans (shown in Settings → Plan). While ${name} is in early access, plans may be free; we'll tell you before paid plans start and give you time to choose.
- **Prepaid, no automatic renewal.** A paid plan is bought for a month or a year at the price shown when you pay. It isn't renewed or charged automatically: we remind you before it ends, and paying again adds to your paid time. Prices can change, but not for time you've already paid for.
- **How to pay.** By card or PayPal (charged in the currency shown, at the rate shown before you pay, because PayPal can't charge in FJD), or by bank transfer, M-PAiSA or MyCash. A transfer counts once we've received it and confirmed it; your plan starts then. You get a receipt, or a tax invoice if ${name} is VAT-registered, for each payment.
- **Limits.** Each plan has limits (such as invoices a month, clients and AI scans) and features. When you reach a limit, you can upgrade or wait for the next month; we don't delete anything.
- **When a plan ends.** After the grace period shown in Settings, your account moves to the Free plan. Everything you've made stays, and you can still view, download and send it; Free plan limits apply to new items, and features not on the Free plan stop until you renew.
- **Refunds.** Payments for time already started aren't refunded, except where the law requires it or we've charged you in error. If ${name} stops offering paid plans, we'll refund the unused part of your paid time.
- **Plans we give you.** Plans given through an invite or by our team last for the time we tell you and may be changed with notice.

## Availability and liability
- We work to keep ${name} available and your information backed up, but we can't promise it will always be available or free of errors. Keep your own copies of important records (Settings → Download backup).
- ${name} is provided "as is". To the extent the law allows, we aren't liable for indirect losses, such as lost profits or data, and our total liability is limited to what you paid us in the 12 months before the claim.
- Nothing in these terms limits rights you have under Fiji law that can't be limited.

## Ending
You can stop using ${name} and delete your account at any time. We may end or suspend your access if you seriously break these terms, and we'll tell you why unless the law or safety prevents it.

## Changes and contact
We'll update these terms when ${name} changes and show the date below. If a change matters, we'll tell you in advance. These terms are governed by the laws of Fiji. Questions: ${contact}.`;
}
