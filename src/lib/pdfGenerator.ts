import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { CRMDocument, Business, Client, UserProfile } from '../types';
import { getCurrencyConfig } from './currencies';

export interface PdfExportOptions {
  includeBankDetails?: boolean;
  includeNotes?: boolean;
  includeFrcsBadge?: boolean;
  includeWatermark?: boolean;
  colorTheme?: string; // hex code or 'brand'
  pageSize?: 'a4' | 'letter';
}

/**
 * Helper to convert hex color to RGB tuple
 */
function hexToRgb(hex: string): [number, number, number] {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num) || cleanHex.length !== 6) {
    return [2, 132, 199]; // default sky-600 #0284c7
  }
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Synchronously renders a crisp vector QR code onto a jsPDF document
 */
function renderVectorQrCode(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  sizeMm: number,
  color: [number, number, number] = [15, 23, 42]
): void {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const moduleCount = qr.modules.size;
    const cellSize = sizeMm / moduleCount;

    doc.setFillColor(color[0], color[1], color[2]);
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.modules.get(r, c)) {
          // Add 0.04mm bleed to avoid anti-aliasing hairline gaps in vector rendering
          doc.rect(x + c * cellSize, y + r * cellSize, cellSize + 0.04, cellSize + 0.04, 'F');
        }
      }
    }
  } catch (err) {
    console.warn('Vector QR code generation failed:', err);
  }
}

/**
 * Generates a jsPDF instance for an Invoice, Quote, Receipt or Credit Note
 * accurately mirroring the visual layout, typography, and structure of the Bill Preview widget.
 */
export function generateDocumentPdf(
  document: CRMDocument,
  business: Business,
  client?: Client | null,
  userProfile?: UserProfile | null,
  options: PdfExportOptions = {}
): jsPDF {
  const {
    includeBankDetails = true,
    includeNotes = true,
    includeFrcsBadge = true,
    includeWatermark = true,
    colorTheme,
    pageSize = 'a4'
  } = options;

  // Initialize jsPDF (portrait, mm, a4/letter)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: pageSize
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15; // 15mm margins matching crisp modern sheet layout
  const contentWidth = pageWidth - margin * 2;

  // Color Palette mirroring the Bill Preview widget
  const rawTheme = colorTheme || business?.colorTheme || '#0284c7';
  const primaryRgb = hexToRgb(rawTheme);
  const slate900: [number, number, number] = [15, 23, 42];    // #0f172a
  const slate800: [number, number, number] = [30, 41, 59];    // #1e293b
  const slate700: [number, number, number] = [51, 65, 85];    // #334155
  const slate600: [number, number, number] = [71, 85, 105];   // #475569
  const slate500: [number, number, number] = [100, 116, 139]; // #64748b
  const slate400: [number, number, number] = [148, 163, 184]; // #94a3b8
  const slate200: [number, number, number] = [226, 232, 240]; // #e2e8f0 border
  const slate100: [number, number, number] = [241, 245, 249]; // #f1f5f9
  const slate50: [number, number, number] = [248, 250, 252];  // #f8fafc card bg

  const docCurrency = document.currency || userProfile?.defaultCurrency || 'FJD';
  const currencyCfg = getCurrencyConfig(docCurrency);
  const currencySymbol = currencyCfg.symbol;

  // 1. Watermark for Paid, Cancelled, Accepted, or Draft (subtle and non-intrusive)
  if (includeWatermark) {
    doc.saveGraphicsState();
    let watermarkText = '';
    let watermarkColor: [number, number, number] = [200, 200, 200];

    if (document.status === 'paid') {
      watermarkText = 'PAID';
      watermarkColor = [16, 185, 129]; // emerald
    } else if (document.status === 'partial') {
      watermarkText = 'PARTIAL PAYMENT';
      watermarkColor = [245, 158, 11]; // amber
    } else if (document.status === 'cancelled') {
      watermarkText = 'CANCELLED / VOID';
      watermarkColor = [239, 68, 68]; // rose
    } else if (document.status === 'accepted') {
      watermarkText = 'ACCEPTED';
      watermarkColor = [99, 102, 241]; // indigo
    } else if (document.status === 'draft') {
      watermarkText = 'DRAFT';
      watermarkColor = [148, 163, 184]; // slate-400
    }

    if (watermarkText) {
      doc.setTextColor(watermarkColor[0], watermarkColor[1], watermarkColor[2]);
      doc.setFontSize(50);
      doc.setFont('helvetica', 'bold');
      doc.setGState(new (doc as any).GState({ opacity: 0.06 }));
      doc.text(watermarkText, pageWidth / 2, pageHeight / 2 + 10, {
        align: 'center',
        angle: 32
      });
    }
    doc.restoreGraphicsState();
  }

  // 2. HEADER SECTION (Two distinct non-overlapping columns matching Bill Preview)
  const headerTopY = 14;
  let currentY = headerTopY;

  // --- RIGHT COLUMN: Document Type, Number, Dates & QR Code Card ---
  const rightColRightX = pageWidth - margin;
  let rightY = headerTopY;

  // Document Type Label (e.g. "QUOTE", "TAX INVOICE", "RECEIPT", "CREDIT NOTE")
  let docTypeLabel = 'TAX INVOICE';
  if (document.type === 'quote') docTypeLabel = 'QUOTE';
  else if (document.type === 'receipt') docTypeLabel = 'RECEIPT';
  else if (document.type === 'credit_note') docTypeLabel = 'CREDIT NOTE';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.text(docTypeLabel, rightColRightX, rightY + 3.5, { align: 'right' });
  rightY += 5;

  // Document Number (#SLD-Q-2026-0728-01)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(slate800[0], slate800[1], slate800[2]);
  doc.text(`#${document.documentNumber}`, rightColRightX, rightY + 3.5, { align: 'right' });
  rightY += 5;

  // Issue Date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(slate400[0], slate400[1], slate400[2]);
  const issueDateStr = document.issueDate || new Date().toISOString().split('T')[0];
  doc.text(`Issued: ${issueDateStr}`, rightColRightX, rightY + 3, { align: 'right' });
  rightY += 4;

  // Due Date (if exists)
  if (document.dueDate) {
    doc.text(`Due: ${document.dueDate}`, rightColRightX, rightY + 3, { align: 'right' });
    rightY += 4.5;
  } else {
    rightY += 1;
  }

  // QR Code Verification & Online View Card (Identical to Bill Preview)
  const qrCardW = 23;
  const qrCardH = 28;
  const qrCardX = rightColRightX - qrCardW;
  const qrCardY = rightY + 1;

  // QR Card Background & Border
  doc.setFillColor(slate50[0], slate50[1], slate50[2]);
  doc.roundedRect(qrCardX, qrCardY, qrCardW, qrCardH, 2.5, 2.5, 'F');
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(qrCardX, qrCardY, qrCardW, qrCardH, 2.5, 2.5, 'D');

  // Online document URL
  const qrUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?viewDoc=${document.id}&num=${document.documentNumber}`
    : `https://frilensa.com/docs/${document.documentNumber}`;

  // Render Crisp Vector QR Code
  const qrCodeSize = 16.5;
  const qrCodeX = qrCardX + (qrCardW - qrCodeSize) / 2;
  const qrCodeY = qrCardY + 2.4;
  renderVectorQrCode(doc, qrUrl, qrCodeX, qrCodeY, qrCodeSize, slate900);

  // Text below QR Code: "SCAN / VIEW ONLINE"
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.text('SCAN / VIEW ONLINE', qrCardX + (qrCardW / 2), qrCardY + 23.6, { align: 'center' });

  const rightColBottomY = qrCardY + qrCardH;

  // --- LEFT COLUMN: Business Logo, Name, Address, TIN & Registration ---
  const leftColX = margin;
  let leftY = headerTopY;

  let logoWidthUsed = 0;
  const logoType = business?.logoType || (business?.logoUrl ? 'image' : 'symbol');

  if (logoType === 'image' && business?.logoUrl) {
    try {
      const maxLogoW = 20;
      const maxLogoH = 11;
      doc.addImage(business.logoUrl, 'PNG', leftColX, leftY, maxLogoW, maxLogoH, undefined, 'FAST');
      logoWidthUsed = maxLogoW + 3.5;
    } catch (e) {
      console.warn('PDF image logo rendering fallback:', e);
      // Fallback symbol badge
      doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
      doc.roundedRect(leftColX, leftY, 11, 11, 2.5, 2.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text((business?.name || 'FJ').slice(0, 2).toUpperCase(), leftColX + 5.5, leftY + 7.2, { align: 'center' });
      logoWidthUsed = 14.5;
    }
  } else if (logoType === 'text' && business?.logoText) {
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    const textBadgeW = Math.max(13, business.logoText.length * 3.4 + 4);
    doc.roundedRect(leftColX, leftY, textBadgeW, 9.5, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.text(business.logoText.toUpperCase(), leftColX + (textBadgeW / 2), leftY + 6.3, { align: 'center' });
    logoWidthUsed = textBadgeW + 3.5;
  } else {
    // Default symbol badge (rounded icon matching Bill Preview)
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.roundedRect(leftColX, leftY, 11, 11, 2.5, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const symbolChar = (business?.name || userProfile?.name || 'FJ').slice(0, 2).toUpperCase();
    doc.text(symbolChar, leftColX + 5.5, leftY + 7.2, { align: 'center' });
    logoWidthUsed = 14.5;
  }

  const bizTextStartX = leftColX + logoWidthUsed;
  const maxBizTextWidth = 100 - logoWidthUsed; // Strictly constrained to prevent collision with right column

  // Business Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(slate800[0], slate800[1], slate800[2]);
  const businessName = business?.name || userProfile?.name || 'Frilensa Business';
  const splitBizName = doc.splitTextToSize(businessName, maxBizTextWidth);
  doc.text(splitBizName, bizTextStartX, leftY + 4.5);
  leftY += Math.max(12, (splitBizName.length * 4.8) + 2);

  // Business Address
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(slate400[0], slate400[1], slate400[2]);
  const bizAddress = business?.address || 'Suva, Fiji Islands';
  doc.text(bizAddress, leftColX, leftY);
  leftY += 3.8;

  // TIN Line (e.g. "TIN: 2900866768")
  const bizTin = business?.tin || userProfile?.tin || '';
  if (bizTin) {
    doc.text('TIN: ', leftColX, leftY);
    const tinLabelWidth = doc.getTextWidth('TIN: ');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(slate700[0], slate700[1], slate700[2]);
    doc.text(bizTin, leftColX + tinLabelWidth, leftY);
    leftY += 3.8;
  }

  // Registration or Contact Line
  const extraDetails: string[] = [];
  if (business?.registrationNumber) extraDetails.push(`Reg #: ${business.registrationNumber}`);
  const bizEmail = business?.email || userProfile?.email;
  const bizPhone = business?.phone || userProfile?.phone;
  if (bizEmail) extraDetails.push(bizEmail);
  if (bizPhone) extraDetails.push(bizPhone);

  if (extraDetails.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(slate400[0], slate400[1], slate400[2]);
    const extraStr = extraDetails.join('  •  ');
    const splitExtra = doc.splitTextToSize(extraStr, 110);
    doc.text(splitExtra, leftColX, leftY);
    leftY += (splitExtra.length * 3.4);
  }

  const leftColBottomY = leftY;

  // Move past the entire header section
  currentY = Math.max(leftColBottomY, rightColBottomY) + 5;

  // 3. BILLED TO CARD (Matching the soft rounded card in Bill Preview)
  const billedToLabel = 'Billed To:';
  const clientName = client?.name || 'Client Name';

  // Compute text lines inside Billed To card matching BillingView preview
  const clientLines: Array<{ text: string; isBold?: boolean; isTin?: boolean }> = [];
  if (client?.email) {
    clientLines.push({ text: client.email });
  }
  if (client?.phone) {
    clientLines.push({ text: client.phone });
  }
  if (client?.tin) {
    clientLines.push({ text: `TIN: ${client.tin}`, isTin: true });
  } else if (client?.address) {
    clientLines.push({ text: client.address });
  }

  const billedToBoxPadding = 3.5;
  const billedToBoxHeight = 11 + (clientLines.length * 3.8);
  const billedToBoxY = currentY;

  // Rounded Card Background & Subtle Border
  doc.setFillColor(slate50[0], slate50[1], slate50[2]);
  doc.roundedRect(margin, billedToBoxY, contentWidth, billedToBoxHeight, 2.5, 2.5, 'F');
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.18);
  doc.roundedRect(margin, billedToBoxY, contentWidth, billedToBoxHeight, 2.5, 2.5, 'D');

  // Label: "Billed To:"
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(slate400[0], slate400[1], slate400[2]);
  doc.text(billedToLabel, margin + billedToBoxPadding, billedToBoxY + 4.2);

  // Client Name: Bold Slate-800
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(slate800[0], slate800[1], slate800[2]);
  doc.text(clientName, margin + billedToBoxPadding, billedToBoxY + 8.5);

  let curClientTextY = billedToBoxY + 12.2;
  clientLines.forEach(line => {
    if (line.isTin) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(slate500[0], slate500[1], slate500[2]);
      doc.text('TIN: ', margin + billedToBoxPadding, curClientTextY);
      const tinW = doc.getTextWidth('TIN: ');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(slate700[0], slate700[1], slate700[2]);
      doc.text(line.text.replace('TIN: ', ''), margin + billedToBoxPadding + tinW, curClientTextY);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(slate500[0], slate500[1], slate500[2]);
      doc.text(line.text, margin + billedToBoxPadding, curClientTextY);
    }
    curClientTextY += 3.8;
  });

  currentY = billedToBoxY + billedToBoxHeight + 6;

  // 4. ITEMS LIST (Matching the clean, minimalist layout from Bill Preview)
  // Header: "DESCRIPTION" on left, "TOTAL" on right with thin bottom border
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(slate400[0], slate400[1], slate400[2]);
  doc.text('DESCRIPTION', margin, currentY);
  doc.text('TOTAL', pageWidth - margin, currentY, { align: 'right' });

  currentY += 2.2;
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.25);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 4;

  const items = document.items && document.items.length > 0 ? document.items : [
    { id: '1', name: 'Professional Consulting Services', quantity: 1, rate: document.subtotal || document.total, total: document.subtotal || document.total }
  ];

  items.forEach((item) => {
    const rowStartY = currentY;

    // Item Title (Bold Slate-700)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(slate700[0], slate700[1], slate700[2]);
    const splitName = doc.splitTextToSize(item.name || 'Service Item', 125);
    doc.text(splitName, margin, rowStartY);

    let rowTextOffset = splitName.length * 3.8;

    // Subtitle: "4 x FJD $1,100.00" in Slate-400 (Matching Bill Preview)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(slate400[0], slate400[1], slate400[2]);
    const rateFormatted = `${Number(item.rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const subtitleText = `${item.quantity || 1} x ${docCurrency} $${rateFormatted}`;
    doc.text(subtitleText, margin, rowStartY + rowTextOffset);
    rowTextOffset += 3.5;

    // Optional Item Description (if present)
    if (item.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(slate500[0], slate500[1], slate500[2]);
      const splitDesc = doc.splitTextToSize(item.description, 125);
      doc.text(splitDesc, margin, rowStartY + rowTextOffset);
      rowTextOffset += splitDesc.length * 3.4;
    }

    // Right-Aligned Item Total: Bold Slate-800
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(slate800[0], slate800[1], slate800[2]);
    const totalFormatted = `${docCurrency} $${Number(item.total || ((item.quantity || 1) * (item.rate || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    doc.text(totalFormatted, pageWidth - margin, rowStartY, { align: 'right' });

    const rowTotalHeight = Math.max(rowTextOffset + 1.5, 9);
    currentY = rowStartY + rowTotalHeight;

    // Hairline divider between items
    doc.setDrawColor(slate100[0], slate100[1], slate100[2]);
    doc.setLineWidth(0.18);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 3.5;
  });

  currentY += 2;

  // 5. TOTALS CALCULATION (Mirrored directly from Bill Preview widget)
  const totalsBoxWidth = 85;
  const totalsBoxX = pageWidth - margin - totalsBoxWidth;
  const financialStartY = currentY;

  // Top Border of Totals Area
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.25);
  doc.line(totalsBoxX, financialStartY, pageWidth - margin, financialStartY);

  let totalsY = financialStartY + 4;

  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(slate500[0], slate500[1], slate500[2]);
  doc.text('Subtotal:', totalsBoxX, totalsY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate700[0], slate700[1], slate700[2]);
  const subtotalFormatted = `${docCurrency} $${(document.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  doc.text(subtotalFormatted, pageWidth - margin, totalsY, { align: 'right' });
  totalsY += 4.2;

  // Taxes (Applied taxes or Fiji VAT)
  if (document.appliedTaxes && document.appliedTaxes.length > 0) {
    document.appliedTaxes.forEach(tax => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
      const taxRateLabel = tax.rateType === 'flat' ? `$${tax.rate}` : `${tax.rate}%`;
      doc.text(`${tax.name} (${taxRateLabel}):`, totalsBoxX, totalsY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
      doc.text(`${docCurrency} $${(tax.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, totalsY, { align: 'right' });
      totalsY += 4.2;
    });
  } else if (!document.isTaxExempt) {
    const vatRateVal = document.vatRate !== undefined ? document.vatRate : 12.5;
    const vatAmtVal = document.vatAmount !== undefined && document.vatAmount > 0
      ? document.vatAmount
      : ((document.subtotal || 0) * (vatRateVal / 100));

    if (vatAmtVal > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(slate500[0], slate500[1], slate500[2]);
      doc.text(`Fiji VAT (${vatRateVal}%):`, totalsBoxX, totalsY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(slate700[0], slate700[1], slate700[2]);
      doc.text(`${docCurrency} $${vatAmtVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, totalsY, { align: 'right' });
      totalsY += 4.2;
    }
  } else if (document.isTaxExempt) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(slate500[0], slate500[1], slate500[2]);
    doc.text('Fiji VAT:', totalsBoxX, totalsY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(slate700[0], slate700[1], slate700[2]);
    doc.text('0.00 (Exempt)', pageWidth - margin, totalsY, { align: 'right' });
    totalsY += 4.2;
  }

  // Fees / Surcharges (if any)
  if (document.appliedFees && document.appliedFees.length > 0) {
    document.appliedFees.forEach(fee => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(5, 150, 105); // emerald-600
      const feeRateLabel = fee.rateType === 'flat' ? `$${fee.rate}` : `${fee.rate}%`;
      doc.text(`${fee.name} (${feeRateLabel}):`, totalsBoxX, totalsY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(5, 150, 105);
      doc.text(`${docCurrency} $${(fee.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, totalsY, { align: 'right' });
      totalsY += 4.2;
    });
  }

  // Divider above Total Due
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.25);
  doc.line(totalsBoxX, totalsY, pageWidth - margin, totalsY);
  totalsY += 4.2;

  // Grand Total Due Row (Matching Bill Preview: "TOTAL DUE:")
  const totalLabel = document.type === 'quote' ? 'TOTAL DUE:' : 'TOTAL DUE:';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(slate900[0], slate900[1], slate900[2]);
  doc.text(totalLabel, totalsBoxX, totalsY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  const totalFormatted = `${docCurrency} $${(document.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  doc.text(totalFormatted, pageWidth - margin, totalsY, { align: 'right' });
  totalsY += 6;

  currentY = totalsY + 3;

  // 6. FIJI BANK & PAYMENT INSTRUCTIONS (Full width rounded card matching Bill Preview)
  if (includeBankDetails && business?.bankDetails) {
    const bankBoxX = margin;
    const bankBoxY = currentY;

    const bankLines = doc.splitTextToSize(business.bankDetails, contentWidth - 7);
    const bankBoxHeight = 8 + (bankLines.length * 3.3);

    // Bank Card (bg-slate-50 border border-slate-100 matching Bill Preview)
    doc.setFillColor(slate50[0], slate50[1], slate50[2]);
    doc.roundedRect(bankBoxX, bankBoxY, contentWidth, bankBoxHeight, 2.5, 2.5, 'F');
    doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
    doc.setLineWidth(0.18);
    doc.roundedRect(bankBoxX, bankBoxY, contentWidth, bankBoxHeight, 2.5, 2.5, 'D');

    // Title: "FIJI BANK & PAYMENT INSTRUCTIONS:"
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(slate700[0], slate700[1], slate700[2]);
    doc.text('FIJI BANK & PAYMENT INSTRUCTIONS:', bankBoxX + 3.5, bankBoxY + 4.5);

    // Body Lines
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(slate500[0], slate500[1], slate500[2]);
    doc.text(bankLines, bankBoxX + 3.5, bankBoxY + 8);

    currentY = bankBoxY + bankBoxHeight + 4;
  }

  // 7. TERMS & ADVICE / NOTES (Matching Bill Preview)
  if (includeNotes && document.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(slate500[0], slate500[1], slate500[2]);
    doc.text('Terms & Advice:', margin, currentY);
    currentY += 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(slate400[0], slate400[1], slate400[2]);
    const notesLines = doc.splitTextToSize(document.notes, contentWidth);
    doc.text(notesLines, margin, currentY);
    currentY += (notesLines.length * 3.4) + 2;
  }

  // Attached Records indicator if present
  if (document.paymentAttachments && document.paymentAttachments.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    const proofText = `Attached Records: ${document.paymentAttachments.length} verified payment proof(s) on file (${document.paymentAttachments.map(a => a.name).slice(0, 3).join(', ')})`;
    doc.text(proofText, margin, currentY);
    currentY += 4;
  }

  // 7. FOOTER: FRCS TAX COMPLIANCE & DIGITAL VERIFICATION HASH
  const footerY = pageHeight - 14;

  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.25);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

  if (includeFrcsBadge) {
    const hash = `FRCS-FJ-${document.documentNumber}-${(bizTin || 'TAX').replace(/[^0-9]/g, '').slice(0, 6)}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.text('OFFICIAL FIJI REVENUE & CUSTOMS SERVICE (FRCS) TAX COMPLIANT DOCUMENT', margin, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(slate400[0], slate400[1], slate400[2]);
    doc.text(`Digital Verification Hash: ${hash}  •  Generated by Frilensa Fiji CRM Platform`, margin, footerY + 3.2);

    doc.setFontSize(6.5);
    doc.text('Page 1 of 1', pageWidth - margin, footerY + 3.2, { align: 'right' });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(slate400[0], slate400[1], slate400[2]);
    doc.text(`Generated by Frilensa CRM  •  ${businessName}`, margin, footerY);
    doc.text('Page 1 of 1', pageWidth - margin, footerY, { align: 'right' });
  }

  return doc;
}

/**
 * Downloads a generated PDF document with an appropriate formatted filename
 */
export function downloadDocumentPdf(
  document: CRMDocument,
  business: Business,
  client?: Client | null,
  userProfile?: UserProfile | null,
  options: PdfExportOptions = {}
): void {
  const doc = generateDocumentPdf(document, business, client, userProfile, options);
  const prefix = document.type === 'quote' ? 'Quote' :
                 document.type === 'receipt' ? 'Receipt' :
                 document.type === 'credit_note' ? 'CreditNote' : 'TaxInvoice';
  
  const clientSafe = client?.name ? `-${client.name.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
  const filename = `${prefix}-${document.documentNumber}${clientSafe}.pdf`;

  doc.save(filename);
}

/**
 * Returns a Data URI string of the generated PDF for iframe embedding or live preview
 */
export function getDocumentPdfDataUri(
  document: CRMDocument,
  business: Business,
  client?: Client | null,
  userProfile?: UserProfile | null,
  options: PdfExportOptions = {}
): string {
  const doc = generateDocumentPdf(document, business, client, userProfile, options);
  return doc.output('datauristring');
}

/**
 * Returns base64 encoded PDF string and standardized filename for email attachments
 */
export function getDocumentPdfBase64(
  document: CRMDocument,
  business: Business,
  client?: Client | null,
  userProfile?: UserProfile | null,
  options: PdfExportOptions = {}
): { base64: string; filename: string } {
  const doc = generateDocumentPdf(document, business, client, userProfile, options);
  const prefix = document.type === 'quote' ? 'Quote' :
                 document.type === 'receipt' ? 'Receipt' :
                 document.type === 'credit_note' ? 'CreditNote' : 'TaxInvoice';
  const clientSafe = client?.name ? `-${client.name.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
  const filename = `${prefix}-${document.documentNumber}${clientSafe}.pdf`;
  
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',')[1] || '';
  return { base64, filename };
}


