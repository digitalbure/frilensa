import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import zlib from "zlib";
import { parseBankStatement } from "./src/lib/bankStatementParser";
import { sendViaSendGrid, SendDocumentEmailPayload } from "./src/lib/transactionalEmailServer";
import { sendDocumentEmail } from "./server/documentEmail";
import { requireUser, rateLimit, escapeHtml, isEmail } from "./server/security";
import { createPortalRouter } from "./server/portal";
import { createDirectoryRouter } from "./server/directory";
import { createPublicDocumentsRouter } from "./server/publicDocuments";
import { createJobsRouter, createAutomationRouter } from "./server/jobs";
import { createApiKeysRouter } from "./server/apiKeys";
import { createApiV1Router } from "./server/apiV1";
import { createMcpRouter } from "./server/mcp";
import { createOAuthRouter, createOAuthAppRouter } from "./server/oauth";
import { createFilesRouter } from "./server/files";
import { createRateCardsRouter, createPublicRateCardsRouter } from "./server/rateCards";
import { createAssistantRouter, assistantConfigured } from "./server/assistant";
import { createPaymentsRouter } from "./server/payNow";
import { createPublicBookingRouter, createBookingPageRouter } from "./server/bookingPage";
import { createWebhooksRouter, createEventsRouter, startWebhookRetries } from "./server/webhooks";
import { createAdminRouter } from "./server/admin";
import pkg from "./package.json";

dotenv.config();

// Gemini model failover chains. Override with comma-separated GEMINI_TEXT_MODELS / GEMINI_VISION_MODELS.
function modelList(envValue: string | undefined, fallback: string[]) {
  const fromEnv = (envValue || "").split(",").map(m => m.trim()).filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : fallback;
}
const TEXT_MODELS = modelList(process.env.GEMINI_TEXT_MODELS, ["gemini-flash-latest", "gemini-flash-lite-latest"]);
const VISION_OCR_MODELS = modelList(process.env.GEMINI_VISION_MODELS, ["gemini-flash-latest", "gemini-flash-lite-latest"]);

async function generateContentWithFallback(ai: GoogleGenAI, models: string[], config: any) {
  let lastError: any = null;
  for (const model of models) {
    try {
      const result = await ai.models.generateContent({
        ...config,
        model
      });
      return { response: result, modelUsed: model };
    } catch (err: any) {
      console.warn(`[Gemini Fallback] Model ${model} encountered notice (${err?.status || err?.message?.slice(0, 100)}). Trying fallback...`);
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Intelligent local fallback parser for PDF documents and receipt attachments.
 * If external AI models encounter service timeouts or demand spikes (503/429),
 * this extracts vendor, amount, date, and items directly from the document streams.
 */
function parseInvoiceFallback(base64Data: string, fileName: string = "", vatRate: number = 12.5) {
  let rawText = "";
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const binaryStr = buffer.toString("binary");

    // Extract streams (FlateDecode or raw)
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let m;
    while ((m = streamRegex.exec(binaryStr)) !== null) {
      let streamBuf = Buffer.from(m[1], "binary");
      let decompressed = streamBuf;
      try {
        decompressed = zlib.inflateSync(streamBuf);
      } catch (_) {}
      rawText += " " + decompressed.toString("latin1");
    }
    rawText += " " + binaryStr;
  } catch (e) {
    console.warn("Notice during fallback buffer decoding:", e);
  }

  // Common Pacific & Fiji vendors and international tech SaaS
  let vendor = "";
  let category = "Other Expense";
  const lowerText = rawText.toLowerCase();
  const lowerFile = fileName.toLowerCase();

  if (/fj\s*domain\s*registry|domain\s*registration|\.fj\b/i.test(rawText) || /domain/i.test(lowerFile)) {
    vendor = "FJ Domain Registry Services";
    category = "Software SaaS";
  } else if (/usp|university\s*of\s*the\s*south\s*pacific/i.test(rawText)) {
    vendor = "The University of the South Pacific (USP)";
    category = "Software SaaS";
  } else if (/vodafone/i.test(rawText) || /vodafone/i.test(lowerFile)) {
    vendor = "Vodafone Fiji";
    category = "Internet & Utilities";
  } else if (/digicel/i.test(rawText) || /digicel/i.test(lowerFile)) {
    vendor = "Digicel Fiji";
    category = "Internet & Utilities";
  } else if (/telecom|tfl/i.test(rawText) || /telecom/i.test(lowerFile)) {
    vendor = "Telecom Fiji (TFL)";
    category = "Internet & Utilities";
  } else if (/efl|energy\s*fiji/i.test(rawText) || /efl/i.test(lowerFile)) {
    vendor = "EFL Suva (Energy Fiji)";
    category = "Electricity & Utilities";
  } else if (/mh\s*supermarket|carpenters/i.test(rawText) || /supermarket/i.test(lowerFile)) {
    vendor = "MH Supermarket";
    category = "Office Supplies";
  } else if (/totalenergies|total\s*fiji/i.test(rawText) || /fuel|petrol/i.test(lowerFile)) {
    vendor = "TotalEnergies Fiji";
    category = "Travel & Transport";
  } else if (/post\s*fiji/i.test(rawText)) {
    vendor = "Post Fiji";
    category = "Office Supplies";
  } else if (/courts\s*fiji/i.test(rawText)) {
    vendor = "Courts Fiji";
    category = "Hardware & Equipment";
  } else if (/aws|amazon\s*web\s*services/i.test(rawText) || /aws/i.test(lowerFile)) {
    vendor = "AWS Cloud Services";
    category = "Software SaaS";
  } else if (/github/i.test(rawText)) {
    vendor = "GitHub";
    category = "Software SaaS";
  } else if (/google/i.test(rawText)) {
    vendor = "Google Workspace";
    category = "Software SaaS";
  }

  // Heuristic vendor fallback from invoice headers if vendor wasn't recognized
  if (!vendor) {
    const headerMatch = rawText.match(/(?:From|Merchant|Biller|Provider):\s*([A-Za-z0-9\s&.,'-]{3,40})/i);
    if (headerMatch) {
      vendor = headerMatch[1].trim();
    } else if (fileName && !fileName.startsWith("camera-") && !fileName.startsWith("Screenshot")) {
      vendor = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
    } else {
      vendor = "Scanned Merchant Invoice";
    }
  }

  // Extract amount
  let amount = 0;
  // Look for Total: $50.00 or $50.00FJD or Amount: 50.00
  const amtMatch = rawText.match(/(?:Total|Sub\s*Total|Amount|Balance\s*Due)[\s:$A-Za-z]*([0-9]{1,6}(?:\.[0-9]{2}))/i) ||
                   rawText.match(/\$\s*([0-9]{1,6}(?:\.[0-9]{2}))/i);
  if (amtMatch) {
    amount = parseFloat(amtMatch[1]);
  }

  // Extract date
  let date = new Date().toISOString().split("T")[0];
  const isoDateMatch = rawText.match(/\b(202[4-7]-[01][0-9]-[0-3][0-9])\b/);
  if (isoDateMatch) {
    date = isoDateMatch[1];
  } else {
    const textDateMatch = rawText.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?,?\s*([A-Za-z]+)\s+([0-9]{1,2})(?:st|nd|rd|th)?,?\s*(202[4-7])/i);
    if (textDateMatch) {
      const parsedD = new Date(`${textDateMatch[1]} ${textDateMatch[2]}, ${textDateMatch[3]}`);
      if (!isNaN(parsedD.getTime())) {
        date = parsedD.toISOString().split("T")[0];
      }
    }
  }

  // Extract description
  let description = `${vendor} expense`;
  const descMatch = rawText.match(/(?:Description|Item|Details):\s*([^\r\n]{5,80})/i) ||
                    rawText.match(/(Domain\s+Registration[^\r\n()]*)/i);
  if (descMatch) {
    description = descMatch[1].trim();
  }

  // Payment method
  let bankName = "Credit Card / Bank Transfer";
  if (/palpay|paypal/i.test(rawText)) bankName = "PalPay Express / PayPal";
  else if (/m-paisa|mpaisa/i.test(rawText)) bankName = "Vodafone M-PAiSA";
  else if (/mycash/i.test(rawText)) bankName = "Digicel MyCash";
  else if (/bsp/i.test(rawText)) bankName = "BSP Fiji";
  else if (/anz/i.test(rawText)) bankName = "ANZ Fiji";
  else if (/westpac/i.test(rawText)) bankName = "Westpac Fiji";

  const divisor = 1 + (vatRate / 100);
  const vatAmount = amount > 0 ? Number((amount - (amount / divisor)).toFixed(2)) : 0;

  return {
    vendor,
    date,
    // 0 means "not found": the user must enter the amount rather than trust a made-up figure.
    amount,
    description,
    category,
    vatAmount,
    bankName,
    currency: /aud/i.test(rawText) ? "AUD" : /usd/i.test(rawText) ? "USD" : "FJD",
    confidence: amount > 0 && vendor !== "Scanned Merchant Invoice" ? 60 : 30
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Client portal: its own small JSON limit and session scheme.
  app.use("/api/portal", express.json({ limit: "100kb" }), createPortalRouter());
  app.use("/api/directory", express.json({ limit: "100kb" }), createDirectoryRouter());
  app.use("/api/public/documents", express.json({ limit: "20kb" }), createPublicDocumentsRouter());
  app.use("/api/public/rate-cards", express.json({ limit: "20kb" }), createPublicRateCardsRouter());
  app.use("/api/rate-cards", express.json({ limit: "10kb" }), createRateCardsRouter());
  app.use("/api/payments", express.json({ limit: "10kb" }), createPaymentsRouter());
  app.use("/api/public/book", express.json({ limit: "40kb" }), createPublicBookingRouter());
  app.use("/api/booking-page", express.json({ limit: "10kb" }), createBookingPageRouter());
  app.use("/api/webhooks", express.json({ limit: "10kb" }), createWebhooksRouter());
  app.use("/api/events", express.json({ limit: "2kb" }), createEventsRouter());
  app.use("/api/admin", express.json({ limit: "20kb" }), createAdminRouter());
  startWebhookRetries();
  app.use("/api/jobs", express.json({ limit: "10kb" }), createJobsRouter());
  app.use("/api/automation", express.json({ limit: "10kb" }), createAutomationRouter());
  // Public API and MCP server (personal API keys), and managing those keys from the app.
  app.use("/api/keys", express.json({ limit: "10kb" }), createApiKeysRouter());
  // Receipt uploads (base64 in JSON, up to 8 MB per file) and downloads for the owner.
  app.use("/api/files", express.json({ limit: "12mb" }), createFilesRouter());
  app.use("/api/v1", express.json({ limit: "200kb" }), createApiV1Router());
  app.use("/mcp", express.json({ limit: "200kb" }), createMcpRouter());
  // OAuth sign-in for MCP clients such as claude.ai (discovery, registration, tokens), and the
  // consent page's approve call. The consent page itself (/oauth/authorize) is part of the web app.
  app.use(["/oauth", "/.well-known"], express.json({ limit: "20kb" }), express.urlencoded({ extended: false, limit: "20kb" }));
  app.use(createOAuthRouter());
  app.use("/api/oauth", express.json({ limit: "10kb" }), createOAuthAppRouter());

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Every other API route belongs to a signed-in consultant.
  app.use(["/api/bookkeeping", "/api/projects", "/api/ai", "/api/email"], requireUser);
  app.use(["/api/bookkeeping", "/api/projects", "/api/ai"], rateLimit({ name: "ai", max: 30, windowMs: 60_000 }));
  app.use(["/api/email/send-document", "/api/email/test", "/api/ai/email-transcript"], rateLimit({ name: "email", max: 40, windowMs: 60 * 60_000 }));

  // API health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: pkg.version });
  });

  // API endpoint for AI bookkeeping categorization
  app.post("/api/bookkeeping/categorize", async (req, res) => {
    try {
      const { transactions, textStatement, vatRate = 12.5 } = req.body;
      const rateNum = Number(vatRate) || 12.5;
      const divisor = 1 + (rateNum / 100);
      const apiKey = process.env.GEMINI_API_KEY;

      let preParsedItems: any[] = [];
      if (textStatement) {
        const parseResult = parseBankStatement(textStatement, rateNum);
        if (parseResult.transactions && parseResult.transactions.length > 0) {
          preParsedItems = parseResult.transactions;
        }
      }

      if (!apiKey) {
        console.warn("GEMINI_API_KEY is missing. Falling back to local rule-based keyword categorizer.");
        const categorized = fallbackCategorize(transactions || preParsedItems, textStatement, rateNum);
        return res.json({ categorized, isFallback: true });
      }

      // Lazy-initialize Gemini SDK to prevent startup crashes if key is absent
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      let prompt = "";
      if (preParsedItems.length > 0) {
        prompt = `You are an expert bookkeeping AI helper for Fiji businesses and freelancers.
Categorize the following pre-parsed bank statement transactions (from BSP Fiji, ANZ, Westpac, or M-Paisa).
For each transaction, assign the most appropriate category from:
- "Consulting Revenue" (client payments, crewing fees, sound recordist, invoices, foreign inward TT remittances)
- "Software SaaS" (Google Cloud, Apple, GitHub, AWS, Adobe, subscriptions)
- "Internet & Utilities" (Starlink, EFL, Telecom Fiji, Vodafone internet)
- "Office Supplies" (stationery, admin, supermarket, hardware)
- "Travel & Transport" (fuel, petrol, taxi, flights, visa applications)
- "Meals & Entertainment" (cafes, restaurants, food, shopping)
- "Bank Fees & Charges" (SERV FEE, IB FEE, DR INT overdraft interest, telegraphic transfer fees)
- "Director Loan & Drawings" (DIR LON, Dir Allow, director personal loans or drawings)
- "Subcontractors & Crew" (freelancers, crew payouts, production assistants, invoice payments to suppliers)
- "Tax & Licensing" (FRCS, VAT payments, business licenses, FNPF)
- "Other Expense"

Calculate Fiji VAT at ${rateNum}%:
- Bank Fees, Overdraft Interest, and Director Loans are 0% VAT.
- Overseas SaaS (Google Cloud, Apple, GitHub, AWS) is 0% VAT (reverse charge).
- Overseas Inward TT export payments are 0% VAT (zero-rated export).
- Local taxable goods and services are calculated as: amount - (amount / ${divisor.toFixed(4)}).

Return a JSON array of objects preserving the provided dates, descriptions, amounts, and balances.

Transactions:
${JSON.stringify(preParsedItems.map(p => ({
  date: p.date,
  description: p.description,
  amount: p.amount,
  balance: p.balance,
  suggestedCategory: p.category,
  bankName: p.bankName || "BSP Fiji"
})))}`;
      } else if (textStatement) {
        prompt = `You are an expert bookkeeping AI helper for Fiji freelancers and businesses.
Analyze the following bank statement text and extract the individual transactions.
Note: BSP Fiji bank statements format columns as: Date, Description, Credit (FJD), Debit (FJD), Balance (FJD).
Credit is positive income, Debit is negative expense. Small cents may be written like .09 or .45.
Identify the Date (convert Fiji D/M/YYYY to YYYY-MM-DD format, current year 2026), Description, Amount (positive for deposit/credit/income, negative for withdrawal/debit/expense), Balance (if provided), and Bank Name ("BSP Fiji").
Categorize each into: "Consulting Revenue", "Software SaaS", "Internet & Utilities", "Office Supplies", "Travel & Transport", "Meals & Entertainment", "Bank Fees & Charges", "Director Loan & Drawings", "Subcontractors & Crew", "Tax & Licensing", "Other Expense".
Calculate the Fiji VAT portion (${rateNum}%, 0 for bank fees, overseas SaaS, and director loans).
Return a JSON array of objects.

Statement text:
${textStatement}`;
      } else if (transactions && transactions.length > 0) {
        prompt = `You are an expert bookkeeping AI helper for Fiji freelancers.
Categorize the following transactions into: "Consulting Revenue", "Software SaaS", "Internet & Utilities", "Office Supplies", "Travel & Transport", "Meals & Entertainment", "Bank Fees & Charges", "Director Loan & Drawings", "Subcontractors & Crew", "Tax & Licensing", "Other Expense".
Also estimate a classification confidence percentage (0-100).
Calculate the Fiji VAT portion (${rateNum}% VAT, 0 for bank fees/exempt items).
Return a JSON array of objects corresponding to the input.

Transactions:
${JSON.stringify(transactions)}`;
      } else {
        return res.status(400).json({ error: "Paste a statement or add transactions to categorize." });
      }

      // Execute with multi-model fallback chain to protect against temporary 503 high-demand spikes
      const { response } = await generateContentWithFallback(ai, TEXT_MODELS, {
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING, description: "YYYY-MM-DD date" },
                description: { type: Type.STRING, description: "Detailed description of item" },
                amount: { type: Type.NUMBER, description: "Numeric amount (positive for income, negative for expense)" },
                category: { type: Type.STRING, description: "One of the designated categories" },
                vatAmount: { type: Type.NUMBER, description: "Standard VAT component" },
                confidence: { type: Type.INTEGER, description: "Confidence score 0 to 100" },
                bankName: { type: Type.STRING, description: "Estimated bank name" },
                balance: { type: Type.NUMBER, description: "Running balance if available" }
              },
              required: ["date", "description", "amount", "category"]
            }
          }
        }
      });

      const text = response.text || "[]";
      const result = JSON.parse(text);
      return res.json({ categorized: result, isFallback: false });

    } catch (error: any) {
      console.error("Gemini categorization error:", error);
      // Fallback gracefully on error
      try {
        const { transactions, textStatement, vatRate = 12.5 } = req.body;
        const rateNum = Number(vatRate) || 12.5;
        const fallback = fallbackCategorize(transactions || [], textStatement, rateNum);
        return res.json({ categorized: fallback, isFallback: true });
      } catch (fbErr) {
        return res.status(500).json({ error: error.message || "Couldn't categorize these transactions. Please try again." });
      }
    }
  });

  // API endpoint for Receipt & Invoice OCR
  app.post("/api/bookkeeping/receipt-ocr", async (req, res) => {
    const { fileData, fileName = "", vatRate = 12.5 } = req.body;
    const rateNum = Number(vatRate) || 12.5;
    const divisor = 1 + (rateNum / 100);

    if (!fileData) {
      return res.status(400).json({ error: "Choose a receipt or invoice file to upload." });
    }

    // Parse data URL to extract base64 data and mimeType
    let base64Data = fileData;
    let mimeType = "image/jpeg";

    const match = fileData.match(/^data:([^;]+);base64,(.*)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    // Normalize mimeType based on file extension if ambiguous or octet-stream
    if (fileName && typeof fileName === 'string') {
      const lowerName = fileName.toLowerCase();
      if (lowerName.endsWith('.pdf')) {
        mimeType = 'application/pdf';
      } else if (lowerName.endsWith('.png')) {
        mimeType = 'image/png';
      } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (lowerName.endsWith('.webp')) {
        mimeType = 'image/webp';
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn("GEMINI_API_KEY not present. Using smart local document fallback parser.");
      const fallback = parseInvoiceFallback(base64Data, fileName, rateNum);
      return res.json({ extracted: fallback, isFallback: true });
    }

    try {
      // Initialize Gemini SDK
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `You are an expert bookkeeping AI helper for Fiji and Pacific freelancers and businesses.
Analyze this invoice or receipt document carefully (it may be a PDF or image screenshot of an invoice).
Extract all billing and purchase details as a JSON object:
- vendor: The actual SELLER, MERCHANT, SERVICE PROVIDER, or ISSUING ENTITY (e.g. "FJ Domain Registry Services", "The University of the South Pacific (USP)", "Telecom Fiji", "Vodafone Fiji", "TotalEnergies", "MH Supermarket", "Post Fiji", "AWS", "Google", "GitHub").
  CRITICAL: Do NOT confuse the vendor with the customer/client! For example, if the invoice says "Invoiced To: Ocean Level Media Productions", "Ocean Level Media" is the recipient customer/buyer, NOT the vendor. Always extract the organization issuing the invoice as the vendor.
- date: Date of purchase or invoice date formatted strictly as "YYYY-MM-DD" (e.g. "2026-09-14"). Convert textual dates like "Monday, September 14th, 2026" to "YYYY-MM-DD".
- amount: The total invoice/receipt amount as a positive number (e.g. 50.00). If it displays "$50.00FJD", extract 50.00.
- description: Concise summary of items or services purchased (e.g. "Domain Registration - (.fj) - 1 Year(s)", "Broadband Fiber Internet", "Office Supplies").
- category: The single most accurate category from: "Software SaaS", "Internet & Utilities", "Office Supplies", "Travel & Transport", "Meals & Entertainment", "Electricity & Utilities", "Hardware & Equipment", "Tax & Licensing", "Marketing & Ads", "Subcontractors", "Other Expense". (For domain registration (.fj) or web services, use "Software SaaS" or "Marketing & Ads").
- vatAmount: The calculated Fiji standard VAT portion (${rateNum}% standard rate: amount - (amount / ${divisor.toFixed(4)})). Set to 0 if foreign SaaS, untaxed, or zero-rated.
- confidence: Integer 0 to 100 indicating extraction confidence.
- bankName: Payment method or gateway if noted (e.g. "PalPay Express", "PayPal", "Vodafone M-PAiSA", "Digicel MyCash", "BSP Fiji", "ANZ Fiji", "Westpac Fiji", "Credit Card", "Cash").
- currency: Currency code identified on invoice (e.g. "FJD", "AUD", "USD", "NZD"). Default to "FJD" if Fiji Dollar or unstated.
- invoiceNumber: The invoice or receipt number if visible (e.g. "7744").`;

      // Call multimodal models with automatic failover (gemini-3.1-flash-lite -> gemini-3.8-flash -> gemini-flash-latest)
      const { response, modelUsed } = await generateContentWithFallback(ai, VISION_OCR_MODELS, {
        contents: [
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              vendor: { type: Type.STRING, description: "Name of merchant or issuing vendor" },
              date: { type: Type.STRING, description: "YYYY-MM-DD date" },
              amount: { type: Type.NUMBER, description: "Numeric total amount (e.g. 50.00)" },
              description: { type: Type.STRING, description: "Item description or summary" },
              category: { type: Type.STRING, description: "Designated expense category" },
              vatAmount: { type: Type.NUMBER, description: "Standard VAT component" },
              confidence: { type: Type.INTEGER, description: "Confidence score 0 to 100" },
              bankName: { type: Type.STRING, description: "Bank or payment method/gateway" },
              currency: { type: Type.STRING, description: "Currency code (FJD, USD, etc)" },
              invoiceNumber: { type: Type.STRING, description: "Invoice or receipt number" }
            },
            required: ["vendor", "date", "amount", "category"]
          }
        }
      });

      const text = response.text || "{}";
      const result = JSON.parse(text);
      console.log(`Receipt OCR succeeded using ${modelUsed}:`, result.vendor, result.amount);
      return res.json({ extracted: result, isFallback: false, modelUsed });

    } catch (error: any) {
      console.error("Gemini receipt OCR error across models, invoking local parser:", error?.message);
      // Resilient local fallback: parse document stream heuristics directly
      try {
        const fallbackResult = parseInvoiceFallback(base64Data, fileName, rateNum);
        return res.json({ extracted: fallbackResult, isFallback: true, warning: error.message });
      } catch (fbErr) {
        return res.status(500).json({ error: error.message || "Couldn't read this receipt. Please try again or enter it by hand." });
      }
    }
  });

  // API endpoint for AI-powered Expense Category Suggestion based on service description & project context
  app.post("/api/bookkeeping/suggest-category", async (req, res) => {
    try {
      const {
        description = "",
        vendor = "",
        projectName = "",
        projectType = "",
        serviceType = "",
        amount = 0,
        businessType = "studio",
        vatRate = 12.5
      } = req.body;

      if (!description && !vendor && !serviceType) {
        return res.status(400).json({ error: "Add a description, vendor or service type first." });
      }

      const rateNum = Number(vatRate) || 12.5;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        console.warn("GEMINI_API_KEY is missing. Using local rule-based category inference.");
        const fallback = fallbackSuggestCategory(description, vendor, projectName, projectType, serviceType, amount, rateNum);
        return res.json({ ...fallback, isFallback: true });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const allowedCategories = [
        "Office Supplies",
        "Internet & Utilities",
        "Software SaaS",
        "Travel & Transport",
        "Meals & Entertainment",
        "Electricity & Utilities",
        "Hardware & Equipment",
        "Tax & Licensing",
        "Subcontractors",
        "Marketing & Ads",
        "Other Expense"
      ];

      const prompt = `You are an expert bookkeeping and tax compliance AI for freelance professionals and businesses in Fiji and the Pacific.
Your job is to recommend the single most accurate expense category for a business expense based on its service description, vendor name, project type, and industry context.

The available standard categories are:
1. "Office Supplies" - Stationery, printing, paper, desk supplies, office consumables
2. "Internet & Utilities" - Mobile data, broadband, fibre internet (Vodafone, Digicel, Telecom Fiji)
3. "Software SaaS" - Cloud software, GitHub, AWS, Figma, Zoom, OpenAI, domains, digital tools
4. "Travel & Transport" - Fuel, petrol, taxis, vehicle rentals, flights (Fiji Airways, Fiji Link), mileage, parking
5. "Meals & Entertainment" - Business meals, client hospitality, coffee meetings, catering during shoots/events
6. "Electricity & Utilities" - EFL electricity bills, water, utility grid charges
7. "Hardware & Equipment" - AV gear, camera lenses, lighting rigs, audio mics, mechanical replacement parts/tools, computers, building tools
8. "Tax & Licensing" - FRCS tax filing fees, business registration renewals, legal council, court fees, compliance
9. "Subcontractors" - Freelancer hires, sound engineers, voice actors, legal counsel, mechanics, specialist trades
10. "Marketing & Ads" - Social media ads, print promotional banners, marketing photography, branding campaigns
11. "Other Expense" - Miscellaneous operational expenses not fitting above

Context provided by the user:
- Item / Service Description: "${description}"
- Vendor / Payee: "${vendor || 'Unspecified'}"
- Project Name: "${projectName || 'General Operations'}"
- Industry Sector / Project Type: "${projectType || 'Freelance Professional'}"
- Service Classification: "${serviceType || 'Standard Expense'}"
- Expense Amount: FJD $${amount || 0}
- Business Type: ${businessType === 'saas' ? 'SaaS Software Platform' : 'Freelance Consulting Studio / Trades Provider'}
- Current Fiji VAT Rate: ${rateNum}%

Rules:
- For overseas digital SaaS (e.g. AWS, GitHub, Vercel, OpenAI), isVatClaimable is false (0% VAT).
- For local Fiji goods and registered services (e.g. Vodafone, EFL, Suva Camera Hire, MH Supermarket, TotalEnergies), isVatClaimable is true and recommendedVatRate is ${rateNum}%.
- Most business operational expenses are tax deductible (isTaxDeductible = true).
- Give a concise, professional 1-sentence reason explaining why this category fits the service description and project context.
- Provide a confidence score from 60 to 99.
- Provide 2 relevant suggestedTags (e.g. ["Film & Audio", "Camera Gear"]).
- Provide 1-2 alternativeCategories if applicable.`;

      const { response } = await generateContentWithFallback(ai, TEXT_MODELS, {
        contents: [prompt],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { 
                type: Type.STRING, 
                enum: allowedCategories,
                description: "The primary chosen category" 
              },
              confidence: { 
                type: Type.INTEGER, 
                description: "Confidence percentage (0-100)" 
              },
              reason: { 
                type: Type.STRING, 
                description: "Brief professional explanation justifying the choice" 
              },
              isVatClaimable: { 
                type: Type.BOOLEAN, 
                description: "Whether Fiji VAT input credit is claimable" 
              },
              isTaxDeductible: { 
                type: Type.BOOLEAN, 
                description: "Whether the expense is tax deductible" 
              },
              recommendedVatRate: { 
                type: Type.NUMBER, 
                description: "Recommended VAT rate percentage" 
              },
              suggestedTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "1-3 thematic tags"
              },
              alternativeCategories: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Alternative applicable categories"
              }
            },
            required: ["category", "confidence", "reason", "isVatClaimable", "isTaxDeductible"]
          }
        }
      });

      const text = response.text || "{}";
      const result = JSON.parse(text);

      return res.json({
        category: result.category || "Other Expense",
        confidence: result.confidence || 85,
        reason: result.reason || `Categorized under ${result.category} based on service description.`,
        isVatClaimable: result.isVatClaimable !== false,
        isTaxDeductible: result.isTaxDeductible !== false,
        recommendedVatRate: result.recommendedVatRate ?? (result.category === "Software SaaS" ? 0 : rateNum),
        suggestedTags: result.suggestedTags || [],
        alternativeCategories: result.alternativeCategories || [],
        isFallback: false
      });

    } catch (error: any) {
      console.error("Gemini suggest-category error:", error);
      const fallback = fallbackSuggestCategory(
        req.body.description || "",
        req.body.vendor || "",
        req.body.projectName || "",
        req.body.projectType || "",
        req.body.serviceType || "",
        req.body.amount || 0,
        req.body.vatRate || 12.5
      );
      return res.json({ ...fallback, isFallback: true, error: error.message });
    }
  });

  // Local heuristic fallback for AI-powered expense category suggestions
  function fallbackSuggestCategory(
    description: string,
    vendor: string = "",
    projectName: string = "",
    projectType: string = "",
    serviceType: string = "",
    amount: number = 0,
    vatRate: number = 12.5
  ) {
    const combined = `${description} ${vendor} ${projectName} ${projectType} ${serviceType}`.toLowerCase();
    
    // Check for Film / Video / Audio / AV keywords
    if (
      combined.includes("camera") || combined.includes("lens") || combined.includes("audio") || 
      combined.includes("mic") || combined.includes("boom") || combined.includes("lighting") || 
      combined.includes("drone") || combined.includes("gimbal") || combined.includes("rig") || 
      combined.includes("shoot") || combined.includes("production gear") || combined.includes("tripod") ||
      combined.includes("film") || combined.includes("sound")
    ) {
      if (combined.includes("crew") || combined.includes("voice") || combined.includes("actor") || combined.includes("assistant")) {
        return {
          category: "Subcontractors",
          confidence: 94,
          reason: "Crew, camera operators and talent for shoots go under Subcontractors.",
          isVatClaimable: true,
          isTaxDeductible: true,
          recommendedVatRate: vatRate,
          suggestedTags: ["Film & Media", "Crew Hire"],
          alternativeCategories: ["Other Expense", "Hardware & Equipment"]
        };
      }
      return {
        category: "Hardware & Equipment",
        confidence: 96,
        reason: "Audio, video and filming gear go under Hardware & Equipment.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["AV Production", "Camera Gear"],
        alternativeCategories: ["Office Supplies", "Other Expense"]
      };
    }

    // Check for Automotive / Mechanics keywords
    if (
      combined.includes("mechanic") || combined.includes("brake") || combined.includes("tyre") || 
      combined.includes("tire") || combined.includes("oil filter") || combined.includes("engine") || 
      combined.includes("radiator") || combined.includes("coolant") || combined.includes("gasket") || 
      combined.includes("diagnostic") || combined.includes("spark plug") || combined.includes("auto parts") ||
      combined.includes("vehicle") || combined.includes("car repair")
    ) {
      return {
        category: "Hardware & Equipment",
        confidence: 95,
        reason: "Vehicle parts, fluids and workshop tools go under Hardware & Equipment.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["Automotive", "Mechanical Parts"],
        alternativeCategories: ["Other Expense", "Travel & Transport"]
      };
    }

    // Check for Construction / Trades keywords
    if (
      combined.includes("timber") || combined.includes("cement") || combined.includes("concrete") || 
      combined.includes("drywall") || combined.includes("scaffold") || combined.includes("plumbing") || 
      combined.includes("pipe") || combined.includes("roofing") || combined.includes("tiles") || 
      combined.includes("drill") || combined.includes("paint") || combined.includes("construction") ||
      combined.includes("hardware") || combined.includes("trades")
    ) {
      return {
        category: "Hardware & Equipment",
        confidence: 93,
        reason: "Building materials, site supplies and trade tools go under Hardware & Equipment.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["Construction", "Trade Supplies"],
        alternativeCategories: ["Office Supplies", "Other Expense"]
      };
    }

    // Check for Software SaaS / Digital Web Cloud keywords
    if (
      combined.includes("github") || combined.includes("aws") || combined.includes("vercel") || 
      combined.includes("figma") || combined.includes("openai") || combined.includes("adobe") || 
      combined.includes("cloud") || combined.includes("saas") || combined.includes("software") || 
      combined.includes("api") || combined.includes("domain") || combined.includes("hosting") || 
      combined.includes("zoom") || combined.includes("slack") || combined.includes("google workspace")
    ) {
      return {
        category: "Software SaaS",
        confidence: 98,
        reason: "Cloud services and software subscriptions go under Software SaaS (0% VAT for overseas providers).",
        isVatClaimable: false,
        isTaxDeductible: true,
        recommendedVatRate: 0,
        suggestedTags: ["Cloud SaaS", "Digital Tools"],
        alternativeCategories: ["Internet & Utilities", "Other Expense"]
      };
    }

    // Check for Internet, Telecom & Utilities
    if (
      combined.includes("vodafone") || combined.includes("digicel") || combined.includes("telecom") || 
      combined.includes("tfl") || combined.includes("fibre") || combined.includes("broadband") || 
      combined.includes("internet") || combined.includes("data topup") || combined.includes("mobile data")
    ) {
      return {
        category: "Internet & Utilities",
        confidence: 97,
        reason: "Phone, broadband and mobile data go under Internet & Utilities.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["Telecommunications", "Connectivity"],
        alternativeCategories: ["Electricity & Utilities", "Other Expense"]
      };
    }

    // Check for EFL / Power / Electricity
    if (
      combined.includes("efl") || combined.includes("energy fiji") || combined.includes("electricity") || 
      combined.includes("power bill") || combined.includes("water authority") || combined.includes("waf")
    ) {
      return {
        category: "Electricity & Utilities",
        confidence: 99,
        reason: "Electricity and water bills go under Electricity & Utilities.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["Utilities", "Power & Energy"],
        alternativeCategories: ["Internet & Utilities", "Other Expense"]
      };
    }

    // Check for Legal, Tax, Licensing & Court Fees
    if (
      combined.includes("frcs") || combined.includes("frca") || combined.includes("tax") || 
      combined.includes("tin") || combined.includes("license") || combined.includes("court") || 
      combined.includes("filing fee") || combined.includes("stamp duty") || combined.includes("solicitor") || 
      combined.includes("lawyer") || combined.includes("legal") || combined.includes("compliance") || 
      combined.includes("registration")
    ) {
      return {
        category: "Tax & Licensing",
        confidence: 95,
        reason: "Filing fees, licences and legal costs go under Tax & Licensing.",
        isVatClaimable: false,
        isTaxDeductible: true,
        recommendedVatRate: 0,
        suggestedTags: ["Tax", "Legal & Licensing"],
        alternativeCategories: ["Subcontractors", "Other Expense"]
      };
    }

    // Check for Travel, Transport, Fuel, Taxis
    if (
      combined.includes("taxi") || combined.includes("fuel") || combined.includes("petrol") || 
      combined.includes("diesel") || combined.includes("totalenergies") || combined.includes("fiji airways") || 
      combined.includes("fiji link") || combined.includes("flight") || combined.includes("cab") || 
      combined.includes("parking") || combined.includes("mileage") || combined.includes("rental car")
    ) {
      return {
        category: "Travel & Transport",
        confidence: 94,
        reason: "Fares, fuel and parking go under Travel & Transport.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["Transport", "Travel"],
        alternativeCategories: ["Other Expense", "Meals & Entertainment"]
      };
    }

    // Check for Meals & Entertainment
    if (
      combined.includes("coffee") || combined.includes("cafe") || combined.includes("restaurant") || 
      combined.includes("lunch") || combined.includes("dinner") || combined.includes("meal") || 
      combined.includes("catering") || combined.includes("hospitality") || combined.includes("food")
    ) {
      return {
        category: "Meals & Entertainment",
        confidence: 92,
        reason: "Client meals, catering and project meals go under Meals & Entertainment.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["Hospitality", "Business Meals"],
        alternativeCategories: ["Other Expense", "Travel & Transport"]
      };
    }

    // Check for Marketing, Advertising & Social Campaigns
    if (
      combined.includes("ads") || combined.includes("facebook ad") || combined.includes("instagram ad") || 
      combined.includes("marketing") || combined.includes("banner") || combined.includes("flyer") || 
      combined.includes("billboard") || combined.includes("promotion") || combined.includes("seo")
    ) {
      return {
        category: "Marketing & Ads",
        confidence: 94,
        reason: "Ads, promotions and social media campaigns go under Marketing & Ads.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["Marketing", "Campaigns"],
        alternativeCategories: ["Software SaaS", "Other Expense"]
      };
    }

    // Check for Subcontractors & External Talent
    if (
      combined.includes("freelancer") || combined.includes("contractor") || combined.includes("subcontractor") || 
      combined.includes("external developer") || combined.includes("consultant fee") || combined.includes("outsourced")
    ) {
      return {
        category: "Subcontractors",
        confidence: 93,
        reason: "Contractor and freelancer fees go under Subcontractors.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["Contractor Services", "Outsourcing"],
        alternativeCategories: ["Other Expense", "Office Supplies"]
      };
    }

    // Check for Office Supplies
    if (
      combined.includes("stationery") || combined.includes("paper") || combined.includes("pens") || 
      combined.includes("printing") || combined.includes("mh supermarket") || combined.includes("post fiji") || 
      combined.includes("desk") || combined.includes("office")
    ) {
      return {
        category: "Office Supplies",
        confidence: 91,
        reason: "Stationery, printing and office consumables go under Office Supplies.",
        isVatClaimable: true,
        isTaxDeductible: true,
        recommendedVatRate: vatRate,
        suggestedTags: ["Office Supplies", "Administration"],
        alternativeCategories: ["Hardware & Equipment", "Other Expense"]
      };
    }

    // Default fallback
    return {
      category: "Other Expense",
      confidence: 75,
      reason: "General business expense. Check the category before saving.",
      isVatClaimable: true,
      isTaxDeductible: true,
      recommendedVatRate: vatRate,
      suggestedTags: ["General expense"],
      alternativeCategories: ["Office Supplies", "Hardware & Equipment"]
    };
  }

  function fallbackScopeSections(name: string, description: string, prompt: string, businessType: string) {
    const isSaaS = businessType === "saas";
    if (isSaaS) {
      return [
        {
          title: "Hosting and setup",
          description: `Set up cloud hosting, package the app services and configure a staging environment.`,
          cost: 1500,
          deliverables: [
            "AWS network setup with public and private subnets",
            "Automated build and deploy with GitHub Actions",
            "Database setup for multiple customer accounts"
          ]
        },
        {
          title: "AI categorisation and VAT reporting",
          description: `Connect an AI model to categorise income and expenses and work out the Fiji VAT on each.`,
          cost: 2500,
          deliverables: [
            "Import for BSP and ANZ bank statements",
            "VAT summary report",
            "Error handling and an offline fallback"
          ]
        },
        {
          title: "Client portal",
          description: `A responsive dashboard where clients review their work, built with Tailwind CSS.`,
          cost: 2000,
          deliverables: [
            "Customer login and shareable links",
            "Itemised statements with print and export",
            "Milestone checklists"
          ]
        }
      ];
    } else {
      return [
        {
          title: "Phase 1: Discovery",
          description: `Work through requirements, business goals and the local tax rules the project needs to follow.`,
          cost: 1200,
          deliverables: [
            "Stakeholder workshops and a technical spec",
            "Site structure and mobile-first wireframes",
            "List of Fiji TIN and FRCS requirements"
          ]
        },
        {
          title: "Phase 2: Design and build",
          description: `Build the main features, custom styling, client-facing screens and local bank integrations.`,
          cost: 3500,
          deliverables: [
            "Custom components styled with Tailwind CSS",
            "Offline bank reconciliation that saves in the browser",
            "Rates and FJD surcharge calculator"
          ]
        },
        {
          title: "Phase 3: Invoicing, testing and handover",
          description: `User acceptance testing, VAT checks, handover guides and training sessions.`,
          cost: 1800,
          deliverables: [
            "PDF export for invoices",
            "Unit tests for the Fiji VAT calculations",
            "Handover checklist and training sessions"
          ]
        }
      ];
    }
  }

  // API endpoint for AI Scope of Work Section Generator
  app.post("/api/projects/generate-scope", async (req, res) => {
    try {
      const { name, description, prompt, businessType } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        console.warn("GEMINI_API_KEY is missing. Falling back to rules-based template generation.");
        const fallback = fallbackScopeSections(name, description, prompt, businessType);
        return res.json({ scopeSections: fallback, isFallback: true });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemPrompt = `You are "Bula AI SOW Architect", a specialized assistant that designs professional, section-by-section Scope of Work (SOW) documents for Fijian freelancers, tech studios, and SaaS products.
Your objective is to generate highly itemized, polished scope sections. Each section must align costs properly, formulate detailed itemized deliverables, and provide descriptions that reflect Fijian VAT regulations (such as the standard Fiji VAT rate where applicable, or specific tax invoices).

Generate a list of 3-4 professional project scope sections for a project titled "${name}" described as "${description}".
User guidelines/modifiers: "${prompt || 'None'}"
The service provider runs a ${businessType === 'saas' ? 'SaaS Software Platform' : 'Freelance Consulting Agency/Tech Studio'}.

Ensure costs are realistic (expressed in Fijian Dollars FJD, generally between 200 and 5000 FJD per section depending on complexity).
For each section, provide:
- title: concise stage or milestone name (e.g., "Fiji VAT Compliance Auditing System", "Phase 1: Suva UX Discovery & wireframing")
- description: clear, professional, client-friendly explanation of what is being built or audited
- cost: numeric value representing FJD cost for this section
- deliverables: an array of 2-4 concrete, specific bullets/deliverables.`;

      const { response } = await generateContentWithFallback(ai, TEXT_MODELS, {
        contents: [systemPrompt],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scopeSections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    cost: { type: Type.NUMBER },
                    deliverables: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["title", "description", "cost", "deliverables"]
                }
              }
            },
            required: ["scopeSections"]
          }
        }
      });

      const text = response.text || "{}";
      const result = JSON.parse(text);
      return res.json({ scopeSections: result.scopeSections, isFallback: false });

    } catch (error: any) {
      console.error("Gemini scope generator error:", error);
      const fallback = fallbackScopeSections(req.body.name || "", req.body.description || "", req.body.prompt || "", req.body.businessType || "");
      return res.json({ scopeSections: fallback, isFallback: true, error: error.message });
    }
  });

  // API endpoint for AI assistant advisor
  app.use("/api/ai/assistant", createAssistantRouter());

  // API endpoint to email conversation transcript to the user
  app.post("/api/ai/email-transcript", async (req, res) => {
    try {
      const {
        recipientEmail,
        sessionTitle = "Frilensa AI advisor chat",
        businessName = "Fiji Business",
        messages = [],
        memories = [],
        notes = "",
        customSubject
      } = req.body;

      if (!isEmail(recipientEmail)) {
        return res.status(400).json({ error: "Enter a valid recipient email address." });
      }
      const sendgridKey = process.env.SENDGRID_API_KEY?.trim();
      if (!sendgridKey) {
        return res.status(503).json({ error: "Email delivery isn't set up yet. Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to the server environment." });
      }

      const timestamp = new Date().toLocaleString("en-US", {
        timeZone: "Pacific/Fiji",
        dateStyle: "full",
        timeStyle: "medium"
      });

      const emailSubject = customSubject || `Frilensa AI advisor chat: ${sessionTitle} (${new Date().toLocaleDateString()})`;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(emailSubject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; margin: 0; padding: 24px; }
    .container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07); }
    .header { background: #0284c7; color: #ffffff; padding: 28px; }
    .header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 0; font-size: 13px; opacity: 0.95; }
    .meta-bar { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 28px; font-size: 12px; color: #475569; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
    .content { padding: 28px; }
    .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0284c7; margin: 24px 0 12px 0; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
    .memory-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; }
    .memory-item { font-size: 13px; color: #166534; margin-bottom: 4px; font-weight: 500; }
    .message-card { margin-bottom: 16px; padding: 14px 18px; border-radius: 12px; }
    .user-msg { background: #f0f9ff; border: 1px solid #bae6fd; margin-left: 20px; }
    .ai-msg { background: #f8fafc; border: 1px solid #e2e8f0; margin-right: 20px; }
    .sender-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .user-sender { color: #0284c7; }
    .ai-sender { color: #334155; }
    .msg-text { font-size: 13px; line-height: 1.6; color: #1e293b; white-space: pre-wrap; word-break: break-word; }
    .attachment-badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; margin-top: 6px; }
    .footer { background: #f8fafc; padding: 20px 28px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Frilensa AI advisor chat</h1>
      <p>Session: <strong>${escapeHtml(sessionTitle)}</strong> &bull; Business: <strong>${escapeHtml(businessName)}</strong></p>
    </div>
    <div class="meta-bar">
      <span>Sent to: <strong>${escapeHtml(recipientEmail)}</strong></span>
      <span>${timestamp}</span>
    </div>
    <div class="content">
      ${notes ? `<div style="background:#fffbeb; border:1px solid #fde68a; padding:12px 16px; border-radius:8px; margin-bottom:20px; font-size:13px; color:#92400e;"><strong>Note:</strong> ${escapeHtml(notes)}</div>` : ''}

      ${memories && memories.length > 0 ? `
      <div class="section-title">What the advisor remembers about your business</div>
      <div class="memory-box">
        ${memories.map((m: any) => `<div class="memory-item">&bull; ${escapeHtml(typeof m === 'string' ? m : m?.fact)}</div>`).join('')}
      </div>
      ` : ''}

      <div class="section-title">Conversation (${messages.length} messages)</div>
      ${messages.map((m: any) => `
        <div class="message-card ${m.sender === 'user' ? 'user-msg' : 'ai-msg'}">
          <div class="sender-label ${m.sender === 'user' ? 'user-sender' : 'ai-sender'}">
            ${m.sender === 'user' ? 'You' : 'Frilensa AI Advisor'} &bull; <span style="color:#94a3b8; font-weight:normal;">${escapeHtml(m.timestamp || '')}</span>
          </div>
          ${m.attachments && m.attachments.length > 0 ? `
            <div style="margin-bottom:6px;">
              ${m.attachments.map((att: any) => `<span class="attachment-badge">Attached: ${escapeHtml(att?.name)}</span>`).join(' ')}
            </div>
          ` : ''}
          <div class="msg-text">${escapeHtml(m.text || '')}</div>
        </div>
      `).join('')}
    </div>
    <div class="footer">
      Sent from <strong>Frilensa</strong> (frilensa.com).<br/>
      To continue this chat, log in to Frilensa.
    </div>
  </div>
</body>
</html>
      `;

      const sgResult = await sendViaSendGrid({
        apiKey: sendgridKey,
        fromEmail: process.env.SENDGRID_FROM_EMAIL?.trim() || "noreply@frilensa.com",
        fromName: process.env.SENDGRID_FROM_NAME?.trim() || "Frilensa",
        toEmail: recipientEmail,
        subject: String(emailSubject).slice(0, 200),
        htmlContent,
        textContent: messages.map((m: any) => `${m.sender === 'user' ? 'You' : 'Advisor'}: ${m.text || ''}`).join("\n\n")
      });
      if (!sgResult.success) {
        return res.status(502).json({ error: `Couldn't send the email: ${sgResult.error}` });
      }

      return res.json({
        success: true,
        recipient: recipientEmail,
        subject: emailSubject,
        timestamp,
        previewHtml: htmlContent,
        message: `Transcript for "${sessionTitle}" sent to ${recipientEmail}`
      });

    } catch (error: any) {
      console.error("Email transcript error:", error);
      return res.status(500).json({ error: error.message || "Couldn't send the transcript. Please try again." });
    }
  });

  // GET /api/email/config - Check email provider status
  app.get("/api/email/config", (req, res) => {
    const hasSendGrid = Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.trim() !== "");
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || null;
    const fromName = process.env.SENDGRID_FROM_NAME || null;

    res.json({
      sendgridConfigured: hasSendGrid,
      sendgridFromEmail: fromEmail,
      sendgridFromName: fromName,
      firebaseExtensionReady: false,
      supportedProviders: [
        {
          id: 'sendgrid',
          name: 'Twilio SendGrid API',
          active: hasSendGrid,
          description: hasSendGrid ? 'Connected. Emails are sent through SendGrid.' : 'Needs SENDGRID_API_KEY in the server environment'
        },
        {
          id: 'preview_mode',
          name: 'Preview only',
          active: !hasSendGrid,
          description: hasSendGrid ? 'Not used while SendGrid is configured' : 'Emails are not sent until SendGrid is set up'
        }
      ]
    });
  });

  // POST /api/email/send-document - Dispatches transactional invoices, receipts, quotes
  app.post("/api/email/send-document", async (req, res) => {
    try {
      const payload: SendDocumentEmailPayload = req.body;
      const result = await sendDocumentEmail(payload);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      const { document, recipientEmail } = payload;
      return res.json({
        success: true,
        provider: 'sendgrid',
        messageId: result.messageId,
        recipient: recipientEmail,
        subject: result.subject,
        timestamp: result.timestamp,
        deliveryNote: `Sent through SendGrid to ${recipientEmail}`,
        previewHtml: result.html,
        message: `${document.type.toUpperCase()} #${document.documentNumber} sent to ${recipientEmail}`
      });
    } catch (error: any) {
      console.error("Failed to send document email:", error);
      return res.status(500).json({ error: error.message || "Couldn't send this document. Please try again." });
    }
  });

  // POST /api/email/test - Sends a test transactional email to verify setup
  app.post("/api/email/test", async (req, res) => {
    try {
      const { recipientEmail } = req.body;
      const businessName = escapeHtml(String(req.body.businessName || "Frilensa").slice(0, 120));
      if (!isEmail(recipientEmail)) {
        return res.status(400).json({ error: "Enter a valid recipient email address." });
      }

      const apiKey = process.env.SENDGRID_API_KEY?.trim();
      const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim() || "billing@frilensa.com";
      const fromName = process.env.SENDGRID_FROM_NAME?.trim() || businessName;

      const subject = `Test email from ${businessName} (Frilensa)`;
      const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background-color: #f8fafc; padding: 24px; color: #0f172a;">
  <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; border: 1px solid #e2e8f0;">
    <h2 style="color: #0284c7; margin-top: 0;">Email is working</h2>
    <p>This test email shows that Frilensa can send invoices and receipts for <strong>${businessName}</strong>.</p>
    <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px 16px; color: #166534; font-size: 13px;">
      &bull; <strong>Status:</strong> Sent<br/>
      &bull; <strong>Provider:</strong> ${apiKey ? 'SendGrid' : 'Preview only (not sent)'}<br/>
      &bull; <strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Pacific/Fiji' })} (Fiji Time)
    </div>
    <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
      Sent from Frilensa (frilensa.com).
    </p>
  </div>
</body>
</html>`;

      if (apiKey) {
        const sgResult = await sendViaSendGrid({
          apiKey,
          fromEmail,
          fromName,
          toEmail: recipientEmail,
          subject,
          htmlContent: html,
          textContent: `Test email from ${businessName} via Frilensa. Email is working.`
        });

        if (sgResult.success) {
          return res.json({
            success: true,
            provider: 'sendgrid',
            message: `Test email sent to ${recipientEmail}`,
            messageId: sgResult.messageId
          });
        } else {
          return res.json({
            success: false,
            error: sgResult.error,
            provider: 'sendgrid'
          });
        }
      }

      return res.json({
        success: false,
        provider: 'simulated',
        error: 'Email sending isn\'t set up.',
        message: `No email was sent. Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to the server environment to deliver email.`,
        previewHtml: html
      });

    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Couldn't send the test email. Please try again." });
    }
  });

  // Local fallback for AI Advisor chat


  // Local rule-based classifier fallback
  function fallbackCategorize(transactionsList: any[], textStatement?: string, vatRate: number = 12.5) {
    const list: any[] = [];
    const divisor = 1 + (vatRate / 100);
    const categories = [
      { keywords: ["airways", "bula", "consulting", "payment", "received", "invoice", "client", "retainer"], cat: "Consulting Revenue" },
      { keywords: ["github", "aws", "vercel", "adobe", "google cloud", "openai", "figma", "subscription", "saas", "software"], cat: "Software SaaS" },
      { keywords: ["telecom", "vodafone", "efl", "water", "electricity", "internet", "power", "utility"], cat: "Internet & Utilities" },
      { keywords: ["stationery", "paper", "mh", "supermarket", "office", "supplies", "printing"], cat: "Office Supplies" },
      { keywords: ["taxi", "fuel", "petrol", "parking", "flight", "fiji link", "bus", "travel"], cat: "Travel & Transport" },
      { keywords: ["restaurant", "cafe", "coffee", "meals", "lunch", "dinner", "food"], cat: "Meals & Entertainment" },
      { keywords: ["frca", "tax", "license", "vat", "business registration", "ecal", "levy"], cat: "Tax & Licensing" }
    ];

    if (textStatement) {
      const parsed = parseBankStatement(textStatement, vatRate);
      if (parsed.transactions && parsed.transactions.length > 0) {
        return parsed.transactions.map((t, index) => ({
          id: `tx-f-${Date.now()}-${index}`,
          date: t.date,
          description: t.description,
          amount: t.amount,
          balance: t.balance,
          category: t.category,
          vatAmount: t.vatAmount,
          confidence: t.confidence || 88,
          bankName: t.bankName || "BSP Fiji"
        }));
      }

      const lines = textStatement.split("\n").filter(l => l.trim().length > 0);
      lines.forEach((line, index) => {
        const amtMatch = line.match(/(-?\d+[\d,]*\.\d{2})|(-?\d+[\d,]*)/);
        const amount = amtMatch ? parseFloat(amtMatch[0].replace(/,/g, '')) : -75.00;
        
        let matchedCategory = "Other Expense";
        if (amount > 0) matchedCategory = "Consulting Revenue";
        
        const lowercaseLine = line.toLowerCase();
        for (const c of categories) {
          if (c.keywords.some(kw => lowercaseLine.includes(kw))) {
            matchedCategory = c.cat;
            break;
          }
        }

        const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{1,2}\s+[A-Za-z]{3})/);
        const date = dateMatch ? dateMatch[0] : new Date().toISOString().split('T')[0];

        const vat = matchedCategory === "Software SaaS" 
          ? 0 
          : Number((amount - (amount / divisor)).toFixed(2));

        list.push({
          id: `tx-f-${Date.now()}-${index}`,
          date,
          description: line.substring(0, 60),
          amount,
          category: matchedCategory,
          vatAmount: vat,
          confidence: 85,
          bankName: "BSP Fiji"
        });
      });
    } else {
      transactionsList.forEach((tx) => {
        let matchedCategory = tx.category || "Other Expense";
        const desc = (tx.description || "").toLowerCase();
        
        for (const c of categories) {
          if (c.keywords.some(kw => desc.includes(kw))) {
            matchedCategory = c.cat;
            break;
          }
        }
        
        const amt = Number(tx.amount || 0);
        const vat = matchedCategory === "Software SaaS"
          ? 0
          : Number((amt - (amt / divisor)).toFixed(2));

        list.push({
          ...tx,
          category: matchedCategory,
          vatAmount: vat,
          confidence: 90
        });
      });
    }
    return list;
  }

  // Unknown API routes and unexpected errors return JSON rather than the SPA shell.
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled API error:", err?.message || err);
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "That upload is too large." });
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  // Vite middleware in dev
  if (process.env.NODE_ENV !== "production") {
    const isHmrDisabled = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : undefined,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use.`);
      process.exit(1);
    } else {
      console.error("Server error:", err);
    }
  });

  const cleanup = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}

startServer();
