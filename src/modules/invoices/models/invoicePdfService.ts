// Invoice Module â€” PDF Generation Service (v6 â€” Sales Invoice layout)
//
// GoldXtra-style sales invoice layout:
//   â€¢ Yellow strip + black header bar with brand name
//   â€¢ SALES INVOICE title, right-aligned date + Inv #
//   â€¢ Company info block (seller)
//   â€¢ Bill To / Ship To dual columns with gold header bars
//   â€¢ Product table (IMAGE | DESCRIPTION | QTY | UNIT PRICE | TOTAL)
//   â€¢ Totals block with gold-highlighted TOTAL row
//   â€¢ Amount in words
//   â€¢ Company logo/stamp (opt-in via checkbox on the form)
//   â€¢ Beneficiary payment instructions
//   â€¢ Thank You footer
//
// The "Terms & Conditions" block has been removed per product requirements.
//
// Same exports as prior versions (generateInvoicePdf / downloadInvoicePdf)
// so all upstream callers (InventoryDashboardView eye icon, InvoiceListView
// download button, etc.) keep working unchanged.

import { jsPDF } from 'jspdf';
import { Invoice } from './types';
import { getGlobalCurrency } from '../../../shared/currency/globalCurrency';

// â”€â”€ Palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GOLD      = { r: 232, g: 185, b: 57  };   // #E8B939 â€” yellow strips
const GOLD_DARK = { r: 212, g: 160, b: 23  };   // #D4A017 â€” brand text
const BLACK     = { r: 20,  g: 20,  b: 20  };   // near-black for header
const LINE      = { r: 210, g: 210, b: 210 };   // grey borders
const LIGHT_BG  = { r: 250, g: 250, b: 250 };   // zebra row tint
const TEXT_D    = { r: 30,  g: 30,  b: 30  };   // primary text
const TEXT_M    = { r: 90,  g: 90,  b: 90  };   // muted text
const RED       = { r: 190, g: 30,  b: 30  };

// â”€â”€ Page geometry (A4 portrait) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PAGE_W = 210;
const PAGE_H = 297;
const ML     = 8;                  // left margin
const MR     = 8;                  // right margin
const CONTENT_W = PAGE_W - ML - MR;

// â”€â”€ Seller (hardcoded â€” same values as prior PDF versions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SELLER = {
  brand:    'Bullion Electronics',
  name:     'BULLION Specialized Electronic Devices Trading',
  contact:  'Ref: Sales Team',
  email:    'sales@bullionelectronics.ae',
  address1: 'C108 Building 936 M-04, Plot Mohammed Bin Zayed City',
  address2: 'ME9, Abu Dhabi',
  country:  'UAE',
  phone:    '+971 56 985 2213',
};

// â”€â”€ Beneficiary bank info (hardcoded â€” from existing PDF) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BENEFICIARY = {
  companyName:   'BULLION Specialized Electronic Devices Trading L.L.C - O.P.C',
  bankName:      'Emirates NBD',
  swiftCode:     'EBILAEAD',
  accountNumber: '1015895052001',
  routingCode:   '302620122',
  iban:          'AE220260000101589505200001',
  branch:        'Dalma Mall, Abu Dhabi, UAE',
};

// â”€â”€ Pakistan Detectors Technologies â€” simplified green template â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Set VITE_INVOICE_TEMPLATE=detector to switch to this layout. Unset (or any
// other value) keeps every existing deployment â€” Bullion Electronics
// included â€” on the exact GoldXtra-style PDF above, completely unchanged.
const USE_DETECTOR_TEMPLATE = import.meta.env.VITE_INVOICE_TEMPLATE === 'detector';

const GREEN       = { r: 31,  g: 138, b: 61  };   // #1F8A3D
const GREEN_LIGHT = { r: 143, g: 209, b: 158 };   // #8FD19E
const GREEN_TINT  = { r: 236, g: 247, b: 239 };   // zebra rows

const DETECTOR_SELLER = {
  name:    import.meta.env.VITE_INVOICE_COMPANY_NAME || 'Pakistan Detector Technologies Pvt. Ltd - Islamabad',
  address: import.meta.env.VITE_INVOICE_ADDRESS      || 'Office #11, 5th floor, Gulberg Trade center, Gulberg Green Islamabad',
  phone:   import.meta.env.VITE_INVOICE_PHONE        || '03111444615',
  ntn:     import.meta.env.VITE_INVOICE_NTN          || '52723',
  logo:    import.meta.env.VITE_COMPANY_LOGO         || '/PDTLogo.jpg',
};

const DETECTOR_TERMS = [
  'Company guarantees that this device is a 100% genuine branded product with an official warranty.',
  'We are not responsible for the performance, accuracy, and results of any device as per the claims of the manufacturer.',
  'Customer hereby agrees that the above-purchased product is non-returnable, neither exchangeable nor refundable.',
  'Customer hereby acknowledged that all accessories and parts of the device are complete and the device is in working condition.',
  'The company is not responsible for field testing of the machine.',
  'Customers can watch/visit our YouTube Channel for machine training and Air testing before purchasing the machine.',
  'Machines work well on old/buried objects.',
  'Company is exclusively responsible for providing after-sales services to customers who have purchased machines from us.',
  'For warranty claims, the client must show the person who purchased the machine and whose CNIC is written on the invoice, as well as a copy of the CNIC and the invoice.',
  'Warranty claim takes around 90 working days.',
  'The COMPANY shall not be held responsible for any illegal activities undertaken by clients.',
  'CLIENTS are strictly prohibited from excavating on legally owned properties; the COMPANY disclaims any responsibility for such actions.',
  'The COMPANY will not hold customers responsible for any illegal activities they may engage in, and will also discourage them from engaging in illegal activities.',
];

// â”€â”€ Currency â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Follows the Admin's global currency setting (User Management â†’ System
// Currency) instead of a fixed 'AED' â€” same symbol-only rule as every other
// module: no figure on this PDF is ever converted, only the code/symbol/
// subunit name printed next to it changes. Read fresh every time a PDF is
// generated, since this file has no live subscription of its own.
const SUBUNIT_NAME: Record<string, string> = {
  AED: 'Fils', SAR: 'Halalas', USD: 'Cents', CAD: 'Cents', PKR: 'Paisa',
};
const currencyCode   = (): string => getGlobalCurrency().code;
const currencySymbol = (): string => getGlobalCurrency().symbol;
const subunitName    = (): string => SUBUNIT_NAME[currencyCode()] ?? 'Fils';

// â”€â”€ Image loader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Two-stage loader:
//   1. Fast path: HTMLImageElement + canvas. Handles any browser format
//      (PNG, JPEG, WebP, GIF, SVG). Requires the image server to send CORS
//      headers, otherwise canvas gets tainted and toDataURL throws.
//   2. Fallback: XHR blob â†’ FileReader. Reads bytes directly. Only works for
//      PNG or JPEG (jsPDF constraint) but avoids the canvas-taint problem.
interface ImageData { dataUrl: string; format: 'PNG' | 'JPEG'; }

async function loadImageViaCanvas(src: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => resolve(null), 15000);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0 || canvas.height === 0) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL('image/png'), format: 'PNG' });
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(timeout); resolve(null); };
    img.src = src;
  });
}

async function loadImageViaXhr(src: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    try { xhr.open('GET', src, true); }
    catch { resolve(null); return; }
    xhr.responseType = 'blob';
    xhr.timeout = 15000;
    xhr.onload = () => {
      if (xhr.status !== 200) { resolve(null); return; }
      const blob: Blob = xhr.response;
      if (!blob || blob.size === 0) { resolve(null); return; }
      const r = new FileReader();
      r.onload = () => {
        try {
          const bytes = new Uint8Array(r.result as ArrayBuffer);
          let format: 'PNG' | 'JPEG';
          if (bytes[0] === 0x89 && bytes[1] === 0x50) format = 'PNG';
          else if (bytes[0] === 0xff && bytes[1] === 0xd8) format = 'JPEG';
          else { resolve(null); return; }
          const r2 = new FileReader();
          r2.onload  = () => resolve(r2.result ? { dataUrl: r2.result as string, format } : null);
          r2.onerror = () => resolve(null);
          r2.readAsDataURL(blob);
        } catch { resolve(null); }
      };
      r.onerror = () => resolve(null);
      r.readAsArrayBuffer(blob);
    };
    xhr.onerror   = () => resolve(null);
    xhr.ontimeout = () => resolve(null);
    xhr.send();
  });
}

async function loadImage(src: string): Promise<ImageData | null> {
  if (!src) return null;

  // CRITICAL: Firebase Storage URLs are often displayed in <img> tags earlier
  // in the app (e.g. the invoice form thumbnail). That first fetch happens
  // WITHOUT crossOrigin='anonymous', so the browser caches the response
  // WITHOUT CORS headers. When we later try to load the same URL WITH
  // crossOrigin='anonymous' for the PDF, the browser serves the cached
  // (non-CORS) response â†’ canvas gets tainted â†’ toDataURL throws.
  //
  // Appending a unique query param forces a fresh network fetch, which
  // Firebase Storage responds to with proper CORS headers, keeping the
  // canvas clean. Same-origin URLs (like /BullionStamp.jpeg) are unaffected
  // because we serve those with default cache/CORS.
  const cacheBust = (u: string) => {
    // Skip data: / blob: URLs â€” they don't hit the network
    if (u.startsWith('data:') || u.startsWith('blob:')) return u;
    const sep = u.includes('?') ? '&' : '?';
    return `${u}${sep}_pdfcb=${Date.now()}`;
  };
  const busted = cacheBust(src);

  // Try canvas first (works for any format when the response has CORS headers)
  const viaCanvas = await loadImageViaCanvas(busted);
  if (viaCanvas) return viaCanvas;
  // Fallback: XHR blob (also needs CORS but sometimes succeeds when canvas doesn't)
  const viaXhr = await loadImageViaXhr(busted);
  if (viaXhr) return viaXhr;
  // Last-resort: retry the ORIGINAL URL (no cache-bust). Some CDNs vary on
  // query params and treat the busted URL as a different resource that 404s.
  if (busted !== src) {
    const viaCanvasOriginal = await loadImageViaCanvas(src);
    if (viaCanvasOriginal) return viaCanvasOriginal;
    const viaXhrOriginal = await loadImageViaXhr(src);
    if (viaXhrOriginal) return viaXhrOriginal;
  }
  console.warn('[InvoicePdf] All loading strategies failed for:', src);
  return null;
}

// Try a list of possible stamp/logo file paths in order and return the first
// one that loads successfully. Deployments sometimes store the file with a
// different extension or casing, so we don't want a single hardcoded path to
// be the single point of failure.
async function loadStampFromCandidates(paths: string[]): Promise<ImageData | null> {
  for (const p of paths) {
    const img = await loadImage(p);
    if (img) {
      console.log('[InvoicePdf] Stamp loaded from:', p);
      return img;
    }
  }
  console.warn('[InvoicePdf] No stamp file found. Tried:', paths.join(', '));
  return null;
}

// â”€â”€ Formatters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const fmt = (n: number) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Convert integer to English words. Used for the "In Words" line. */
function numberToWords(n: number): string {
  n = Math.floor(Number(n) || 0);
  if (n === 0) return 'Zero';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const inner = (num: number): string => {
    if (num < 20) return a[num];
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
    if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + inner(num % 100) : '');
    return '';
  };
  const parts: string[] = [];
  const crore  = Math.floor(n / 10000000); n %= 10000000;
  const lakh   = Math.floor(n / 100000);   n %= 100000;
  const thou   = Math.floor(n / 1000);     n %= 1000;
  if (crore) parts.push(inner(crore) + ' Crore');
  if (lakh)  parts.push(inner(lakh)  + ' Lakh');
  if (thou)  parts.push(inner(thou)  + ' Thousand');
  if (n)     parts.push(inner(n));
  return parts.join(' ');
}

function formatDateDDMMMYYYY(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const day = d.getDate();
    const suf = day % 10 === 1 && day !== 11 ? 'st'
             : day % 10 === 2 && day !== 12 ? 'nd'
             : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${day}${suf} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return iso; }
}

// â”€â”€ Drawing primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fill(doc: jsPDF, c: {r:number;g:number;b:number}) { doc.setFillColor(c.r,c.g,c.b); }
function stroke(doc: jsPDF, c: {r:number;g:number;b:number}) { doc.setDrawColor(c.r,c.g,c.b); }
function text(doc: jsPDF, c: {r:number;g:number;b:number}) { doc.setTextColor(c.r,c.g,c.b); }

/** Draws a rectangle with an optional border and fill in one call. */
function box(doc: jsPDF, x: number, y: number, w: number, h: number, opts: {
  fill?: {r:number;g:number;b:number};
  border?: {r:number;g:number;b:number};
  borderWidth?: number;
}) {
  if (opts.fill) {
    fill(doc, opts.fill);
    doc.rect(x, y, w, h, 'F');
  }
  if (opts.border) {
    stroke(doc, opts.border);
    doc.setLineWidth(opts.borderWidth || 0.2);
    doc.rect(x, y, w, h);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Page sections
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/** Top yellow strip + black header bar with brand name. */
function renderHeader(doc: jsPDF): number {
  // Thin yellow strip at very top
  box(doc, 0, 0, PAGE_W, 4, { fill: GOLD });

  // Black bar
  box(doc, 0, 4, PAGE_W, 14, { fill: BLACK });

  // Brand name in gold
  text(doc, GOLD_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(SELLER.brand, PAGE_W / 2, 13.5, { align: 'center' });

  // Thin gold underline separator below the bar
  box(doc, 0, 18, PAGE_W, 0.6, { fill: GOLD });

  return 22;  // y-cursor after the header
}

/** "SALES INVOICE" title + right-aligned date and Inv #. */
function renderTitleRow(doc: jsPDF, invoice: Invoice, y: number): number {
  text(doc, TEXT_D);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SALES INVOICE', PAGE_W / 2, y + 6, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Date: ${formatDateDDMMMYYYY(invoice.date)}`, PAGE_W - MR, y + 3, { align: 'right' });
  doc.text(`Inv # ${invoice.invoiceNumber}`,              PAGE_W - MR, y + 8, { align: 'right' });

  return y + 15;
}

/** Company info block on the left side, below the title. */
function renderSellerInfo(doc: jsPDF, y: number): number {
  text(doc, TEXT_D);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(SELLER.name, ML, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let ly = y + 4.5;
  const lines = [SELLER.contact, SELLER.email, SELLER.address1, SELLER.address2, SELLER.country, SELLER.phone];
  for (const l of lines) { doc.text(l, ML, ly); ly += 4; }

  // Subtle divider under the seller block
  stroke(doc, LINE);
  doc.setLineWidth(0.2);
  doc.line(ML, ly + 1, PAGE_W - MR, ly + 1);

  return ly + 4;
}

/** BILL TO / SHIP TO dual columns with gold header bars. */
function renderBillShipTo(doc: jsPDF, invoice: Invoice, y: number): number {
  const colW = (CONTENT_W - 2) / 2;           // 2mm gutter between columns
  const gutter = 2;
  const bh = 6;                                // header bar height

  // Header bars (light gold background, dark text)
  box(doc, ML,               y, colW, bh, { fill: { r: 250, g: 235, b: 200 } });
  box(doc, ML + colW + gutter, y, colW, bh, { fill: { r: 250, g: 235, b: 200 } });

  text(doc, TEXT_D);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BILL TO', ML + 2, y + 4);
  doc.text('SHIP TO', ML + colW + gutter + 2, y + 4);

  // Customer info under both headers
  const detailY = y + bh + 4;
  doc.setFontSize(9);
  const cName  = invoice.customerName  || 'â€”';
  const phone1 = invoice.customerPhone || '';
  const cCity  = invoice.customerCity  || '';
  // customerCountry was never a field on Invoice, so the fallback silently did
  // nothing and the province printed empty whenever it was blank.
  const cProv  = invoice.customerProvince || '';
  const cAddr  = invoice.customerAddress || '';

  const infoLines = [
    { text: cName,                     bold: true },
    { text: phone1 ? `Phone: ${phone1}` : '',       bold: false },
    { text: cCity && cProv ? `${cCity}, ${cProv}` : cCity || cProv, bold: false },
    { text: cAddr,                     bold: false },
  ].filter(l => l.text);

  let ly = detailY;
  for (const l of infoLines) {
    doc.setFont('helvetica', l.bold ? 'bold' : 'normal');
    // BILL TO column
    const wrapped = doc.splitTextToSize(l.text, colW - 4);
    doc.text(wrapped, ML + 2, ly);
    // SHIP TO column (same info by default â€” matches reference)
    doc.text(wrapped, ML + colW + gutter + 2, ly);
    ly += wrapped.length * 4;
  }

  // Divider
  stroke(doc, LINE);
  doc.setLineWidth(0.2);
  doc.line(ML, ly + 2, PAGE_W - MR, ly + 2);

  return ly + 5;
}

// â”€â”€ Product table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Column layout, built for the width actually available.
 *
 * With images off the image column is not left blank â€” it is removed and the
 * description takes the space. A 30mm empty gutter on every row reads as a
 * rendering fault rather than a choice.
 */
function columns(withImages: boolean) {
  const imgW  = withImages ? 30 : 0;
  const extra = withImages ? 0 : 30;      // width the description reclaims
  return {
    withImages,
    image: { x: ML,                       w: imgW },
    desc:  { x: ML + imgW,                w: 90 + extra },
    qty:   { x: ML + imgW + 90 + extra,   w: 20 },
    unit:  { x: ML + imgW + 110 + extra,  w: 27 },
    total: { x: ML + imgW + 137 + extra,  w: 27 },
  };
}
type Columns = ReturnType<typeof columns>;

/** Yellow header row for the product table. */
function renderProductsHeader(doc: jsPDF, y: number, COL: Columns): number {
  const h = 9;
  box(doc, ML, y, CONTENT_W, h, { fill: GOLD });

  text(doc, TEXT_D);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  if (COL.withImages) doc.text('IMAGE', COL.image.x + COL.image.w / 2, y + 6, { align: 'center' });
  doc.text('DESCRIPTION',     COL.desc.x + 4,                y + 6);
  doc.text('QTY',             COL.qty.x + COL.qty.w / 2,     y + 6, { align: 'center' });
  doc.text(`UNIT PRICE ${currencySymbol()}`, COL.unit.x + COL.unit.w / 2,  y + 6, { align: 'center' });
  doc.text(`TOTAL ${currencySymbol()}`,      COL.total.x + COL.total.w / 2, y + 6, { align: 'center' });

  return y + h;
}

/** One product row. Returns the y-cursor after the row. */
function renderProductRow(
  doc: jsPDF, product: any, y: number,
  imageData: ImageData | null, rowIdx: number, COL: Columns,
): number {
  const ROW_H = 24;

  // Zebra tinting
  if (rowIdx % 2 === 1) {
    box(doc, ML, y, CONTENT_W, ROW_H, { fill: LIGHT_BG });
  }

  // Column borders
  stroke(doc, LINE);
  doc.setLineWidth(0.15);
  doc.line(ML, y, ML, y + ROW_H);                                        // left
  if (COL.withImages) doc.line(COL.desc.x, y, COL.desc.x, y + ROW_H);
  doc.line(COL.qty.x,   y, COL.qty.x,   y + ROW_H);
  doc.line(COL.unit.x,  y, COL.unit.x,  y + ROW_H);
  doc.line(COL.total.x, y, COL.total.x, y + ROW_H);
  doc.line(PAGE_W - MR, y, PAGE_W - MR, y + ROW_H);                      // right
  doc.line(ML, y + ROW_H, PAGE_W - MR, y + ROW_H);                       // bottom

  // Product image â€” drawn flat on the page, no card and no border.
  //
  // The grey box and hairline outline existed to make an empty slot look
  // deliberate. A product photo reads better against the page than inside a
  // frame, and a row with no photo is better shown as empty space than as a
  // box announcing "No image".
  if (COL.withImages && imageData) {
    const imgPad  = 2;
    const imgSize = ROW_H - imgPad * 2;
    const imgX    = COL.image.x + (COL.image.w - imgSize) / 2;
    const imgY    = y + imgPad;
    try {
      // White fill behind the image so a transparent PNG lands on white
      // rather than on whatever the zebra tint put under the row.
      doc.setFillColor(255, 255, 255);
      doc.rect(imgX, imgY, imgSize, imgSize, 'F');
      doc.addImage(imageData.dataUrl, imageData.format, imgX, imgY, imgSize, imgSize);
    } catch { /* nothing drawn â€” the row simply has no picture */ }
  }

  // Description
  text(doc, TEXT_D);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const brand = (product.brandName || '').toUpperCase();
  const model = product.modelName || '';
  const nameLine = `${brand} ${model}`.trim() || (product.productName || 'Item');
  doc.text(nameLine, COL.desc.x + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  text(doc, TEXT_M);
  const typeLine = product.type || product.category || 'Product';
  doc.text(typeLine, COL.desc.x + 4, y + 11);
  const warrantyLine = product.warranty || product.warrantyPeriod || (product.exchangeWarrantyNote ? '' : '');
  if (warrantyLine) doc.text(warrantyLine, COL.desc.x + 4, y + 16);

  // Numbers
  const qty       = Number(product.quantity) || 1;
  const unitPrice = Number(product.sellPrice || product.unitPrice || product.price) || 0;
  const total     = qty * unitPrice;

  text(doc, TEXT_D);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(String(qty),   COL.qty.x + COL.qty.w / 2,   y + 13, { align: 'center' });
  doc.text(fmt(unitPrice), COL.unit.x + COL.unit.w - 3, y + 13, { align: 'right' });
  doc.text(fmt(total),     COL.total.x + COL.total.w - 3, y + 13, { align: 'right' });

  return y + ROW_H;
}

/** Totals block on the right side. */
function renderTotals(doc: jsPDF, invoice: Invoice, y: number): number {
  const rowW = 90;
  const labelW = 50;
  const valW = rowW - labelW;
  const rowH = 6;
  const rightX = PAGE_W - MR;
  const leftX  = rightX - rowW;

  const subtotal = (invoice.products || []).reduce((s, p: any) => s + (Number(p.sellPrice || p.unitPrice || p.price) || 0) * (Number(p.quantity) || 1), 0);
  const discount = Number((invoice as any).deductionCharges) || 0;
  const afterDisc = Math.max(0, subtotal - discount);
  const shipping  = Number((invoice as any).cargoAmount) || 0;
  const totalDue  = afterDisc + shipping;

  const rows: Array<{ label: string; value: string; highlight?: boolean }> = [
    { label: 'SUBTOTAL',              value: fmt(subtotal) },
    { label: 'DISCOUNT',              value: fmt(discount) },
    { label: 'SUBTOTAL LESS DISCOUNT', value: fmt(afterDisc) },
    { label: shipping > 0 ? 'SHIPPING' : 'Free SHIPPING', value: fmt(shipping) },
  ];

  let cursorY = y;
  stroke(doc, LINE);
  doc.setLineWidth(0.15);
  for (const r of rows) {
    doc.line(leftX, cursorY, rightX, cursorY);
    text(doc, TEXT_D);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(r.label, leftX + labelW - 2, cursorY + 4, { align: 'right' });
    doc.text(r.value, rightX - 2,          cursorY + 4, { align: 'right' });
    cursorY += rowH;
  }
  doc.line(leftX, cursorY, rightX, cursorY);

  // TOTAL row â€” gold background
  box(doc, leftX, cursorY, rowW, rowH + 2, { fill: GOLD });
  text(doc, TEXT_D);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`TOTAL  ${currencyCode()}`, leftX + labelW - 2, cursorY + 5, { align: 'right' });
  doc.text(`${currencySymbol()}  ${fmt(totalDue)}`, rightX - 2, cursorY + 5, { align: 'right' });
  cursorY += rowH + 2;

  // In Words row (spans full width)
  const wordsY = cursorY + 3;
  box(doc, ML, wordsY, CONTENT_W, 8, { border: LINE, borderWidth: 0.15 });
  text(doc, TEXT_D);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('In Words', ML + 2, wordsY + 5.2);
  doc.setFont('helvetica', 'normal');
  const words = numberToWords(Math.floor(totalDue)) + ` ${currencyCode()}${totalDue % 1 > 0 ? ' and ' + numberToWords(Math.round((totalDue % 1) * 100)) + ' ' + subunitName() : ''}`;
  doc.text(words, ML + 22, wordsY + 5.2);

  return wordsY + 8 + 4;
}

/**
 * Reads the "add logo" flag from the invoice, tolerating several possible
 * field names since different form versions have used different keys.
 * Returns true ONLY when one of these fields is strictly true â€” undefined,
 * false, null, 0, or an empty string all mean "don't render".
 *
 * If the logo is still appearing when the checkbox is unchecked, the form is
 * saving `true` to whatever field it uses regardless of the checkbox state â€”
 * that fix belongs in the form component, not here.
 */
function wantsLogo(invoice: Invoice): boolean {
  const inv = invoice as any;
  const flags = [inv.digitalStamp, inv.includeLogo, inv.showLogo, inv.addLogo, inv.companyLogo, inv.withLogo];
  // Truthy check (not strict === true) so "true"/"1"/1/true all work â€” the
  // form may serialise the checkbox in any of these forms.
  return flags.some(v => !!v && v !== 'false' && v !== '0' && v !== 0);
}

/**
 * Renders the company logo/stamp on the right side of the page.
 * Only draws when `wantsLogo(invoice)` returns true.
 *
 * Sizing rules:
 *   â€¢ Reserved block height: 52mm (bigger than the previous 32mm)
 *   â€¢ Logo bounding box: 48mm Ã— 48mm square, right-aligned
 *   â€¢ The image's natural aspect ratio is preserved so a circular source
 *     (e.g. a round stamp/logo) renders as an actual circle, not stretched.
 *   â€¢ If the source is already square/circular, it fills the box.
 */
function renderLogo(doc: jsPDF, invoice: Invoice, y: number, logo: ImageData | null): number {
  const blockH = 52;

  if (!logo || !wantsLogo(invoice)) {
    // No logo requested â€” just return the y-cursor as if we drew a small gap.
    // Skipping the full blockH keeps the page tighter when no logo is used.
    return y + 6;
  }

  try {
    const boxMax = 48;                            // 48mm square bounding box
    let drawW = boxMax;
    let drawH = boxMax;
    try {
      const props = doc.getImageProperties(logo.dataUrl);
      const ratio = props.width / props.height;
      // Preserve aspect ratio â€” a circular source stays circular.
      if (ratio >= 1) { drawW = boxMax; drawH = boxMax / ratio; }
      else            { drawH = boxMax; drawW = boxMax * ratio; }
    } catch { /* if we can't read dimensions, use the square defaults */ }

    // Right-aligned, vertically centered within the reserved block
    const sX = PAGE_W - MR - drawW;
    const sY = y + (blockH - drawH) / 2;
    doc.addImage(logo.dataUrl, logo.format, sX, sY, drawW, drawH);
  } catch { /* draw failed â€” no fallback needed */ }

  return y + blockH;
}

// NOTE: this file used to have a renderAttachment() here that drew a custom
// uploaded photo (invoice.imageDataUrl) on Dummy/Proforma/Booking/Quotation
// invoices â€” the one thing that made a Dummy invoice's PDF look different
// from a real invoice's. It's been removed so every invoice type produces
// the exact same format (per request, 2026-09-28). Re-add it if that photo
// block is ever wanted back â€” it was a self-contained function, safe to
// call from generateInvoicePdf() again without touching anything else here.

/** Beneficiary payment instructions block at the bottom. */
function renderBeneficiary(doc: jsPDF, y: number): number {
  text(doc, TEXT_D);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Beneficiary Payment Instructions:', ML, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const rows = [
    `Company Name: ${BENEFICIARY.companyName}`,
    `Bank Name: ${BENEFICIARY.bankName}`,
    `SWIFT Code: ${BENEFICIARY.swiftCode}`,
    `Account Number: ${BENEFICIARY.accountNumber}`,
    `Routing Code: ${BENEFICIARY.routingCode}`,
    `IBAN: ${BENEFICIARY.iban}`,
    `Bank Branch: ${BENEFICIARY.branch}`,
  ];
  let ly = y + 5;
  for (const r of rows) { doc.text(r, ML, ly); ly += 4.2; }

  return ly + 2;
}

/** Thank You footer bar. */
function renderThankYou(doc: jsPDF, y: number) {
  const h = 6;
  box(doc, 0, y, PAGE_W, h, { fill: BLACK });
  text(doc, { r: 255, g: 255, b: 255 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('THANK YOU', PAGE_W / 2, y + 4.3, { align: 'center' });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Detector template (Pakistan Detectors Technologies) â€” simplified layout
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function renderDetectorHeader(doc: jsPDF, logo: ImageData | null): number {
  const y = 14;

  if (logo) {
    try { doc.addImage(logo.dataUrl, logo.format, ML, y - 12, 18, 18); } catch { /* no logo drawn */ }
  }

  const textX = ML + 22;
  text(doc, BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(DETECTOR_SELLER.name, textX, y - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  text(doc, TEXT_M);
  doc.text(DETECTOR_SELLER.address, textX, y);

  doc.setFont('helvetica', 'bold');
  text(doc, TEXT_D);
  doc.setFontSize(8);
  doc.text(`Phone No: ${DETECTOR_SELLER.phone}`, PAGE_W - MR, y - 4, { align: 'right' });
  doc.text(`NTN: ${DETECTOR_SELLER.ntn}`,         PAGE_W - MR, y,     { align: 'right' });

  let cy = y + 6;
  box(doc, ML, cy, CONTENT_W, 1.2, { fill: GREEN });
  cy += 6;
  return cy;
}

function renderDetectorInvoiceToRow(doc: jsPDF, invoice: Invoice, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  text(doc, TEXT_D);
  doc.text(`Inv No: ${invoice.invoiceNumber}`, PAGE_W - MR, y, { align: 'right' });
  doc.text(`Date: ${formatDateDDMMMYYYY(invoice.date)}`, PAGE_W - MR, y + 5, { align: 'right' });

  box(doc, ML, y - 5, 40, 6, { fill: GREEN });
  text(doc, { r: 255, g: 255, b: 255 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('INVOICE TO', ML + 3, y - 0.7);

  let cy = y + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  text(doc, TEXT_D);

  const rows = [
    invoice.customerName  ? invoice.customerName : null,
    invoice.customerCity  ? `City ${invoice.customerCity}` : null,
    invoice.customerCNIC  ? `CNIC: ${invoice.customerCNIC}` : null,
    invoice.customerPhone ? `Mobile: ${invoice.customerPhone}${invoice.customerPhone2 ? ', ' + invoice.customerPhone2 : ''}` : null,
  ].filter((l): l is string => !!l);

  for (const line of rows) { doc.text(line, ML, cy); cy += 4.5; }

  cy += 3;
  stroke(doc, LINE);
  doc.setLineWidth(0.2);
  doc.line(ML, cy, PAGE_W - MR, cy);
  cy += 6;

  return cy;
}

function detectorColumns() {
  return {
    image:  { x: ML,       w: 24 },
    sr:     { x: ML + 24,  w: 10 },
    name:   { x: ML + 34,  w: 38 },
    detail: { x: ML + 72,  w: 46 },
    serial: { x: ML + 118, w: 37 },
    amount: { x: ML + 155, w: CONTENT_W - 155 },
  };
}
type DetectorColumns = ReturnType<typeof detectorColumns>;

function renderDetectorTableHeader(doc: jsPDF, y: number, COL: DetectorColumns): number {
  const h = 8;
  box(doc, ML, y, CONTENT_W, h, { fill: GREEN });
  text(doc, { r: 255, g: 255, b: 255 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('IMAGE',          COL.image.x + COL.image.w / 2,   y + 5.3, { align: 'center' });
  doc.text('SR.NO',          COL.sr.x + COL.sr.w / 2,          y + 5.3, { align: 'center' });
  doc.text('PRODUCT NAME',   COL.name.x + 2,                   y + 5.3);
  doc.text('PRODUCT DETAIL', COL.detail.x + 2,                 y + 5.3);
  doc.text('SERIAL NUMBER',  COL.serial.x + 2,                 y + 5.3);
  doc.text('AMOUNT',         COL.amount.x + COL.amount.w - 2,  y + 5.3, { align: 'right' });
  return y + h;
}

function renderDetectorProductRow(doc: jsPDF, product: any, y: number, idx: number, COL: DetectorColumns, imageData: ImageData | null): number {
  const ROW_H = 22;
  if (idx % 2 === 1) box(doc, ML, y, CONTENT_W, ROW_H, { fill: GREEN_TINT });

  stroke(doc, LINE);
  doc.setLineWidth(0.15);
  doc.line(ML, y + ROW_H, PAGE_W - MR, y + ROW_H);

  // Product image -- flat on the page, no card/border (matches the Bullion layout)
  if (imageData) {
    const imgPad  = 2;
    const imgSize = ROW_H - imgPad * 2;
    const imgX    = COL.image.x + (COL.image.w - imgSize) / 2;
    const imgY    = y + imgPad;
    try {
      doc.setFillColor(255, 255, 255);
      doc.rect(imgX, imgY, imgSize, imgSize, 'F');
      doc.addImage(imageData.dataUrl, imageData.format, imgX, imgY, imgSize, imgSize);
    } catch { /* nothing drawn -- the row simply has no picture */ }
  }

  text(doc, TEXT_D);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(String(idx + 1), COL.sr.x + COL.sr.w / 2, y + ROW_H / 2 + 1, { align: 'center' });

  const nameLine = `${product.brandName || ''} ${product.modelName || ''}`.trim() || product.productName || 'Item';
  doc.text(doc.splitTextToSize(nameLine, COL.name.w - 3), COL.name.x + 2, y + 8);

  const detailLine = product.description || product.category || 'â€”';
  doc.text(doc.splitTextToSize(detailLine, COL.detail.w - 3), COL.detail.x + 2, y + 8);

  const serials = (product.serialNumbers && product.serialNumbers.length) ? product.serialNumbers.join(', ') : 'â€”';
  doc.text(doc.splitTextToSize(serials, COL.serial.w - 3), COL.serial.x + 2, y + 8);

  doc.setFont('helvetica', 'bold');
  const amount = product.total ?? (product.price * product.quantity);
  doc.text(fmt(amount), COL.amount.x + COL.amount.w - 2, y + ROW_H / 2 + 1, { align: 'right' });

  return y + ROW_H;
}

function renderDetectorNote(doc: jsPDF, invoice: Invoice, y: number): number {
  const note = invoice.exchangeWarrantyNote;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  text(doc, TEXT_D);
  doc.text('Note:', ML, y);
  if (note) {
    doc.setFont('helvetica', 'normal');
    text(doc, TEXT_M);
    const lines = doc.splitTextToSize(note, CONTENT_W - 15);
    doc.text(lines, ML + 12, y);
    return y + lines.length * 4 + 4;
  }
  return y + 6;
}

function renderDetectorTotal(doc: jsPDF, invoice: Invoice, y: number): number {
  const rowW = 70;
  const rightX = PAGE_W - MR;
  const leftX = rightX - rowW;
  box(doc, leftX, y, rowW, 8, { fill: GREEN });
  text(doc, { r: 255, g: 255, b: 255 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL:', leftX + 4, y + 5.3);
  doc.text(fmt(invoice.totalAmount), rightX - 3, y + 5.3, { align: 'right' });
  return y + 12;
}

function renderDetectorTerms(doc: jsPDF, y: number): number {
  if (y > PAGE_H - 80) { doc.addPage(); y = 15; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  text(doc, TEXT_D);
  doc.text('Terms and Conditions', ML, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  text(doc, TEXT_M);
  for (const term of DETECTOR_TERMS) {
    if (y > PAGE_H - 15) { doc.addPage(); y = 15; }
    const lines = doc.splitTextToSize(`${term}`, CONTENT_W - 4);
    doc.text(lines, ML + 2, y);
    y += lines.length * 3.6 + 1;
  }
  return y + 4;
}

/**
 * Renders the PDT company stamp/seal above the footer, right-aligned --
 * mirrors renderLogo() from the Bullion template. Only draws when the same
 * "add stamp" checkbox (wantsLogo) is on and a stamp image was found.
 */
function renderDetectorStamp(doc: jsPDF, invoice: Invoice, y: number, stamp: ImageData | null): number {
  if (!stamp || !wantsLogo(invoice)) return y;

  const blockH = 38;
  if (y + blockH > PAGE_H - 14) { doc.addPage(); y = 15; }

  try {
    const boxMax = 32;
    let drawW = boxMax;
    let drawH = boxMax;
    try {
      const props = doc.getImageProperties(stamp.dataUrl);
      const ratio = props.width / props.height;
      if (ratio >= 1) { drawW = boxMax; drawH = boxMax / ratio; }
      else            { drawH = boxMax; drawW = boxMax * ratio; }
    } catch { /* use square defaults */ }

    const sX = PAGE_W - MR - drawW;
    const sY = y + (blockH - drawH) / 2;
    doc.addImage(stamp.dataUrl, stamp.format, sX, sY, drawW, drawH);
  } catch { /* draw failed -- no fallback needed */ }

  return y + blockH;
}

function renderDetectorFooter(doc: jsPDF, y: number) {
  if (y > PAGE_H - 14) { doc.addPage(); y = PAGE_H - 20; }
  box(doc, 0, y, PAGE_W, 8, { fill: GREEN });
  text(doc, { r: 255, g: 255, b: 255 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Thank you for your purchase!', PAGE_W / 2, y + 5.3, { align: 'center' });
}

async function generateDetectorInvoicePdf(invoice: Invoice, options: GenerateInvoicePdfOptions = {}): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const shouldLoadStamp = wantsLogo(invoice);
  const products = invoice.products || [];

  // Same enrichment fallback as the Bullion path below -- an invoice's own
  // product row doesn't always carry imageUrls directly. When the caller
  // passes the current inventory records (InvoiceListView, the invoice
  // form), a missing imageUrls on the row is filled in by productId lookup.
  const enrichMap: Record<string, string[]> = {};
  if (options.enrichWithProducts) {
    const src = options.enrichWithProducts;
    if (Array.isArray(src)) {
      for (const p of src) if (p?.id && Array.isArray(p.imageUrls) && p.imageUrls.length > 0) enrichMap[p.id] = p.imageUrls;
    } else {
      for (const [id, p] of Object.entries(src)) if (Array.isArray(p?.imageUrls) && p!.imageUrls!.length > 0) enrichMap[id] = p!.imageUrls!;
    }
  }
  const pickImageUrl = (p: any): string | null => {
    if (Array.isArray(p?.imageUrls) && p.imageUrls.length > 0) return p.imageUrls[0];
    if (typeof p?.imageUrl === 'string' && p.imageUrl) return p.imageUrl;
    const enriched = p?.productId && enrichMap[p.productId];
    if (enriched && enriched.length > 0) return enriched[0];
    return null;
  };

  const [logo, stamp, productImages] = await Promise.all([
    loadStampFromCandidates([
      DETECTOR_SELLER.logo,
      '/PDTLogo.jpg',
      '/PDTLogo.jpeg',
      '/PDTLogo.png',
    ]),
    shouldLoadStamp
      ? loadStampFromCandidates([
          '/PDTStamp.jpg',
          '/PDTStamp.jpeg',
          '/PDTStamp.png',
          '/pdtstamp.jpg',
          '/pdtstamp.png',
        ])
      : Promise.resolve(null),
    Promise.all(products.map(async (p: any) => {
      const url = pickImageUrl(p);
      return url ? loadImage(url) : null;
    })),
  ]);

  let y = renderDetectorHeader(doc, logo);
  y = renderDetectorInvoiceToRow(doc, invoice, y);

  const COL = detectorColumns();
  y = renderDetectorTableHeader(doc, y, COL);

  for (let i = 0; i < products.length; i++) {
    if (y + 22 > PAGE_H - 90) {
      doc.addPage();
      y = 15;
      y = renderDetectorTableHeader(doc, y, COL);
    }
    y = renderDetectorProductRow(doc, products[i], y, i, COL, productImages[i]);
  }

  y += 4;
  y = renderDetectorNote(doc, invoice, y);
  y += 2;
  y = renderDetectorTotal(doc, invoice, y);
  y += 6;
  y = renderDetectorTerms(doc, y);
  y = renderDetectorStamp(doc, invoice, y, stamp);
  renderDetectorFooter(doc, Math.min(y + 4, PAGE_H - 8));

  return doc.output('blob');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Main entry point
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Optional lookup source for enriching product images. Pass an array (or
 * record) of inventory products keyed by id. If an invoice-product row is
 * missing imageUrls, we'll look it up here by productId. Solves the case
 * where an old invoice was saved before imageUrls were captured, but the
 * inventory record has since been updated with images.
 */
export type PdfEnrichSource = Array<{ id: string; imageUrls?: string[] }>
                            | Record<string, { imageUrls?: string[] }>;

export interface GenerateInvoicePdfOptions {
  enrichWithProducts?: PdfEnrichSource;
  /**
   * Overrides the invoice's own showProductImages, for a preview toggle.
   * Leave unset and the invoice decides.
   */
  showProductImages?: boolean;
}

export async function generateInvoicePdf(
  invoice: Invoice,
  options: GenerateInvoicePdfOptions = {},
): Promise<Blob> {
  if (USE_DETECTOR_TEMPLATE) {
    return generateDetectorInvoicePdf(invoice, options);
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Build a quick lookup map from the enrichment source, if provided.
  const enrichMap: Record<string, string[]> = {};
  if (options.enrichWithProducts) {
    const src = options.enrichWithProducts;
    if (Array.isArray(src)) {
      for (const p of src) if (p?.id && Array.isArray(p.imageUrls) && p.imageUrls.length > 0) enrichMap[p.id] = p.imageUrls;
    } else {
      for (const [id, p] of Object.entries(src)) if (Array.isArray(p?.imageUrls) && p!.imageUrls!.length > 0) enrichMap[id] = p!.imageUrls!;
    }
  }

  // Load product images + logo in parallel so drawing isn't blocked serially.
  // Skip the logo fetch entirely when the invoice hasn't opted in â€” no point
  // hitting the network for an asset we won't draw.
  //
  // Invoice products carry `imageUrls: string[]` (populated from inventory's
  // imageUrls at product-selection time). Older invoices may only have a
  // singular `imageUrl` string. We accept either and use the first available.
  // As a last resort we look up `enrichMap[productId]` â€” this rescues
  // invoices that were saved before imageUrls were being captured.
  //
  // Final fallback: `invoice.imageDataUrl` â€” the manually uploaded photo used
  // by Dummy/Proforma/Booking/Quotation invoices, which have no inventory
  // link and so never have imageUrls on their product lines. It used to be
  // drawn in a separate "Attachment" box below the totals; now it fills the
  // same IMAGE column a real invoice's product photo would, so a dummy
  // invoice's row looks exactly like a real one's instead of coming up
  // blank. `loadImage()` already handles data: URLs fine (see cacheBust,
  // which skips them), so no change was needed there.
  const products = invoice.products || [];
  const shouldLoadLogo = wantsLogo(invoice);
  const invoiceImageDataUrl = typeof (invoice as any).imageDataUrl === 'string' && (invoice as any).imageDataUrl
    ? (invoice as any).imageDataUrl as string
    : null;
  const pickImageUrl = (p: any): string | null => {
    if (Array.isArray(p?.imageUrls) && p.imageUrls.length > 0) return p.imageUrls[0];
    if (typeof p?.imageUrl === 'string' && p.imageUrl) return p.imageUrl;
    const enriched = p?.productId && enrichMap[p.productId];
    if (enriched && enriched.length > 0) return enriched[0];
    if (invoiceImageDataUrl) return invoiceImageDataUrl;
    return null;
  };

  console.log('[InvoicePdf] Generating invoice', (invoice as any).invoiceNumber,
    '- products:', products.length,
    '- wantsLogo:', shouldLoadLogo,
    '- enrichMapSize:', Object.keys(enrichMap).length);

  const [productImages, logoImage] = await Promise.all([
    Promise.all(products.map(async (p: any, i: number) => {
      const url = pickImageUrl(p);
      if (!url) {
        console.log(`[InvoicePdf] Product #${i + 1} (${p.productName || p.brandName}) has no image URL â€” imageUrls:`, p.imageUrls, 'imageUrl:', p.imageUrl, 'enriched:', p?.productId ? enrichMap[p.productId] : undefined);
        return null;
      }
      const img = await loadImage(url);
      if (!img) console.warn(`[InvoicePdf] Product #${i + 1} image failed to load:`, url);
      else       console.log(`[InvoicePdf] Product #${i + 1} image loaded ok:`, url);
      return img;
    })),
    // Try a series of common filenames/casings so a rename doesn't silently
    // break the stamp. Add more if your deploy uses a different filename.
    shouldLoadLogo
      ? loadStampFromCandidates([
          '/BullionStamp.jpeg',
          '/BullionStamp.jpg',
          '/BullionStamp.png',
          '/bullionstamp.jpeg',
          '/bullionstamp.jpg',
          '/bullionstamp.png',
          '/bullion-stamp.png',
          '/stamp.png',
          '/logo.png',
        ])
      : Promise.resolve(null),
  ]);

  // â”€â”€ First page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let y = renderHeader(doc);
  y = renderTitleRow(doc, invoice, y);
  y = renderSellerInfo(doc, y);
  y = renderBillShipTo(doc, invoice, y);
  // The invoice's own setting wins; the option is an override for previews.
  // `!== false` because undefined means an invoice issued before this setting
  // existed, and those must keep showing images.
  const showImages = options.showProductImages
    ?? ((invoice as any).showProductImages !== false);
  const COL = columns(showImages);

  y = renderProductsHeader(doc, y, COL);

  for (let i = 0; i < products.length; i++) {
    // Rough end-of-content check â€” reserve enough space for totals + logo +
    // beneficiary + thank-you at the bottom.
    if (y + 26 > PAGE_H - 100) {
      // New page â€” repeat just the yellow strip + black bar + products header
      renderThankYou(doc, PAGE_H - 7);
      doc.addPage();
      y = renderHeader(doc);
      y = renderProductsHeader(doc, y + 3, COL);
    }
    y = renderProductRow(doc, products[i], y, showImages ? productImages[i] : null, i, COL);
  }

  // â”€â”€ Trailing sections on the last page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  y += 4;
  y = renderTotals(doc, invoice, y);
  // Logo/stamp (right) only. The "Attachment" photo box that used to render
  // here for Dummy/Proforma/Booking/Quotation invoices (a manually uploaded
  // reference photo, via invoice.imageDataUrl) has been removed per request â€”
  // every invoice type, dummy or real, now produces the exact same PDF
  // format. See the NOTE further down where renderAttachment() used to be
  // defined if this is ever wanted back.
  y = renderLogo(doc, invoice, y, logoImage);
  y += 2;
  renderBeneficiary(doc, y);
  renderThankYou(doc, PAGE_H - 7);

  return doc.output('blob');
}

export async function downloadInvoicePdf(
  invoice: Invoice,
  options: GenerateInvoicePdfOptions = {},
): Promise<void> {
  const blob = await generateInvoicePdf(invoice, options);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${invoice.invoiceNumber || 'invoice'}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}