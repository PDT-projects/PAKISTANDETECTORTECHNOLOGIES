// Inventory Module - Utility
// transferPdfGenerator.ts
//
// Generates a branded Product Transfer Note PDF using jsPDF (browser-native, no server needed).
// Matches the company PDF style: PDT letterhead, green theme, table, terms.
//
// Usage:
//   import { downloadTransferPDF } from '../utils/transferPdfGenerator';
//   downloadTransferPDF(transfer);
//
// Install dependency if not already present:
//   npm install jspdf

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProductTransfer } from '../models/types';

const COMPANY = {
  name:    'Bullion Electronics',
  branch:  'Islamabad',
  address: 'Office#5, 4th floor, Gulberg Trade center, Gulberg Green Islamabad',
  phone:   '03111444615',
  ntn:     '52723',
  asifAddress: 'Asif Branch Address - TBD',
  // Dark green matching company logo/theme
  themeR: 45, themeG: 80, themeB: 22,
};

const TERMS = [
  'This transfer document is an official record of goods movement between company locations.',
  'The receiving party must verify serial numbers and quantities upon receipt.',
  'Any discrepancies must be reported within 24 hours of receipt.',
  'Products in transit remain the property of Bullion Electronics.',
  'The transferring party is responsible for safe packaging and handover.',
  'This document must be retained for audit and warranty purposes.',
];

/** Format ISO date string → readable date */
function fmtDate(d?: string): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-PK'); } catch { return d; }
}

/** Download a Product Transfer Note PDF for the given transfer record */
export function downloadTransferPDF(transfer: ProductTransfer): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();   // 210 mm
  const lm = 20;   // left margin
  const rm = 20;   // right margin
  const cw = pw - lm - rm;  // content width
  let y = 15;

  const themeRGB: [number, number, number] = [COMPANY.themeR, COMPANY.themeG, COMPANY.themeB];

  // ── HEADER ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...themeRGB);
  doc.text(`${COMPANY.name} - ${COMPANY.branch}`, pw / 2, y, { align: 'center' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(COMPANY.address, pw / 2, y, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Phone No: ${COMPANY.phone}`, pw / 2, y, { align: 'center' });
  y += 4;
  doc.text(`NTN: ${COMPANY.ntn}`, pw / 2, y, { align: 'center' });
  y += 5;

  // Divider
  doc.setDrawColor(...themeRGB);
  doc.setLineWidth(0.6);
  doc.line(lm, y, pw - rm, y);
  y += 7;

  // ── TITLE ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Product Transfer Note', lm, y);
  y += 8;

  // ── META GRID (2 columns) ────────────────────────────────────────────────
  const xferDate   = fmtDate(transfer.transferDate || (transfer as any).date);
  const receivedAt = transfer.receivedAt ? fmtDate(transfer.receivedAt) : null;
  const col1x = lm;
  const col2x = lm + cw / 2;

  const metaRows: [string, string, string, string][] = [
    ['From Location:', transfer.fromLocation || '—', 'Transfer ID:', transfer.id || '—'],
    ['To Location:',   transfer.toLocation   || '—', 'Date:',        xferDate],
    ['Transferred By:',transfer.transferredBy || '—', 'Status:',     transfer.status || '—'],
  ];

  doc.setFontSize(9);
  for (const [lbl1, val1, lbl2, val2] of metaRows) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(lbl1, col1x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(val1, col1x + 32, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(lbl2, col2x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(val2, col2x + 25, y);
    y += 5;
  }
  y += 4;

  // ── ITEMS TABLE ──────────────────────────────────────────────────────────
  const serials = (transfer.serialNumbers || []).join(', ') || '—';

  (autoTable as any)(doc, {
    startY: y,
    margin: { left: lm, right: rm },
    head: [['Sr.No', 'Product Name', 'Model', 'Serial Numbers', 'Quantity']],
    body: [[
      '1',
      transfer.brandName  || transfer.productName || '—',
      transfer.modelName  || '—',
      serials,
      String(transfer.quantity || 0),
    ]],
    headStyles: {
      fillColor: themeRGB,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [40, 40, 40],
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 38 },
      2: { cellWidth: 35 },
      3: { cellWidth: 65 },
      4: { cellWidth: 20, halign: 'center' },
    },
    theme: 'grid',
    didDrawPage: () => {},
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ── NOTE ─────────────────────────────────────────────────────────────────
  if (transfer.note) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Note:', lm, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const noteLines = doc.splitTextToSize(transfer.note, cw - 15);
    doc.text(noteLines, lm + 13, y);
    y += noteLines.length * 4.5 + 4;
  }

  // ── RECEIVED BANNER ──────────────────────────────────────────────────────
  if (receivedAt) {
    doc.setFillColor(212, 237, 218);
    doc.roundedRect(lm, y, cw, 7, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(21, 87, 36);
    doc.text(`✓ Received At: ${receivedAt}`, lm + 4, y + 5);
    y += 11;
  }

  // ── DIVIDER ──────────────────────────────────────────────────────────────
  doc.setDrawColor(...themeRGB);
  doc.setLineWidth(0.4);
  doc.line(lm, y, pw - rm, y);
  y += 6;

  // ── TERMS ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Terms and Conditions', lm, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  for (const term of TERMS) {
    const lines = doc.splitTextToSize(`\u2022  ${term}`, cw - 5);
    doc.text(lines, lm + 3, y);
    y += lines.length * 4 + 1;
  }

  y += 8;

  // ── FOOTER ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('Thank you!', pw / 2, y, { align: 'center' });

  // ── DOWNLOAD ─────────────────────────────────────────────────────────────
  const filename = `Transfer_${transfer.id || 'note'}_${transfer.fromLocation}_to_${transfer.toLocation}.pdf`
    .replace(/\s+/g, '_');
  doc.save(filename);
}