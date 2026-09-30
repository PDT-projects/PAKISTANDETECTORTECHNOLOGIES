// Inventory Module - View Layer
// ProductTransferView
//
// CHANGES (v3):
//  • formatDate prop renamed to formatDateTime — shows full date + time in table, modal, etc.
//  • "Date" column in table now renders date+time
//  • "Received" timestamp in modal shows date+time
//  • PDF generator updated:
//    - Date field shows full date+time
//    - Received At banner shows full date+time
//    - Serial numbers table row split into individual rows when >1 serial (clearer PDF)

import React from 'react';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import {
  Plus, Eye, Trash2, X, Package, CheckCircle2,
  Clock, ArrowRight, MapPin, Hash, Truck, Calendar,
  User, FileText, ArrowRightLeft, Download,
} from 'lucide-react';
import { ProductTransfer } from '../models/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

// ── Bullion Electronics brand tokens ────────────────────────────────────────
const _BLACK      = '#0D0D0D';
const _YELLOW     = '#F5B800';
const _YELLOW_BG  = '#FFF8DC';
const _WHITE      = '#FFFFFF';
const _GRAY_TEXT  = '#555555';

const _COMPANY = {
  name:    'Bullion Electronics',
  branch:  'Saudia',
  address: 'C108 Building 936 - M-04, Plot - Mohamed Bin Zayed City - ME9',
  city:    'Abu Dhabi, United Arab Emirates',
  phone:   '+971 56 985 2213',
};

function _hex(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const n = parseInt(c, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _fill(doc: jsPDF, hex: string)  { doc.setFillColor(..._hex(hex)); }
function _text(doc: jsPDF, hex: string)  { doc.setTextColor(..._hex(hex)); }
function _draw(doc: jsPDF, hex: string)  { doc.setDrawColor(..._hex(hex)); }

/** Format ISO string → "01 Jun 2026, 14:30" */
function _fmtDateTime(d?: string): string {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleString('en-PK', {
      day:    '2-digit',
      month:  'short',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch { return d; }
}

function downloadTransferPDF(transfer: ProductTransfer): void {
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = 210;
  const mL     = 14;
  const mR     = 14;
  const cW     = pageW - mL - mR;
  let y        = 0;

  // ── 1. Black header bar ──────────────────────────────────────────────────
  _fill(doc, _BLACK);
  doc.rect(0, 0, pageW, 36, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  _text(doc, _YELLOW);
  doc.text(_COMPANY.name, mL, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  _text(doc, _YELLOW);
  doc.text(_COMPANY.branch, mL, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  _text(doc, _WHITE);
  doc.text(_COMPANY.phone,   pageW - mR, 10, { align: 'right' });
  doc.text(_COMPANY.address, pageW - mR, 16, { align: 'right' });
  doc.text(_COMPANY.city,    pageW - mR, 21, { align: 'right' });

  // Badge: PRODUCT TRANSFER NOTE
  const bW = 62, bH = 8, bX = pageW - mR - bW, bY = 36 - bH - 3;
  _fill(doc, _YELLOW);
  doc.roundedRect(bX, bY, bW, bH, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  _text(doc, _BLACK);
  doc.text('PRODUCT TRANSFER NOTE', bX + bW / 2, bY + 5.5, { align: 'center' });

  y = 36 + 8;

  // ── 2. Meta info card ────────────────────────────────────────────────────
  _fill(doc, _YELLOW_BG);
  doc.roundedRect(mL, y, cW, 28, 3, 3, 'F');
  _draw(doc, _YELLOW);
  doc.setLineWidth(0.5);
  doc.roundedRect(mL, y, cW, 28, 3, 3, 'S');

  const col2X   = pageW / 2 + 4;
  const labelW  = 34;
  const metaY0  = y + 6;
  const lineH   = 8;

  // Full date+time in the Date field
  const xferDateTime   = _fmtDateTime(transfer.transferDate || (transfer as any).date);
  const receivedAt     = transfer.receivedAt ? _fmtDateTime(transfer.receivedAt) : null;

  const leftRows  = [
    { label: 'From Location:',  value: transfer.fromLocation  || '-' },
    { label: 'To Location:',    value: transfer.toLocation    || '-' },
    { label: 'Transferred By:', value: transfer.transferredBy || '-' },
  ];
  const rightRows = [
    { label: 'Transfer ID:', value: (transfer.id || '-').slice(0, 18) },
    { label: 'Date & Time:', value: xferDateTime },
    { label: 'Status:',      value: transfer.status || 'In Transit' },
  ];

  leftRows.forEach(({ label, value }, i) => {
    const ry = metaY0 + i * lineH;
    doc.setFont('helvetica', 'bold');   doc.setFontSize(8); _text(doc, _GRAY_TEXT); doc.text(label,          mL + 3,          ry);
    doc.setFont('helvetica', 'normal');                     _text(doc, _BLACK);     doc.text(value,          mL + 3 + labelW, ry);
  });
  rightRows.forEach(({ label, value }, i) => {
    const ry = metaY0 + i * lineH;
    doc.setFont('helvetica', 'bold');   doc.setFontSize(8); _text(doc, _GRAY_TEXT); doc.text(label, col2X,          ry);
    const statusColor = label === 'Status:'
      ? (value === 'Received' ? '#16a34a' : value === 'In Transit' ? '#1d4ed8' : '#b45309')
      : _BLACK;
    doc.setFont('helvetica', label === 'Status:' ? 'bold' : 'normal');
    _text(doc, statusColor);
    doc.text(value, col2X + labelW, ry);
  });

  y += 28 + 8;

  // ── 3. Route bar ─────────────────────────────────────────────────────────
  _fill(doc, _BLACK);
  doc.roundedRect(mL, y, cW, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  _text(doc, '#FF8080'); doc.text(`FROM: ${transfer.fromLocation || '-'}`, mL + 5, y + 6.5);
  _text(doc, _YELLOW);   doc.text('>>', pageW / 2 - 5, y + 6.5);
  _text(doc, '#86efac'); doc.text(`TO: ${transfer.toLocation || '-'}`, pageW / 2 + 7, y + 6.5);

  y += 10 + 7;

  // ── 4. Items table — one row per serial for clarity ──────────────────────
  const serials = transfer.serialNumbers || [];
  const tableBody: string[][] = serials.length > 0
    ? serials.map((s, i) => [
        String(i + 1),
        transfer.productName || '-',
        transfer.modelName || transfer.brandName || '-',
        s,
        '1',
      ])
    : [['1', transfer.productName || '-', transfer.modelName || '-', '-', String(transfer.quantity || 0)]];

  // If only one serial (or none), fall back to single-row with all serials joined
  const useSingleRow = serials.length <= 1;
  const finalBody = useSingleRow
    ? [[
        '1',
        transfer.productName || '-',
        transfer.modelName || transfer.brandName || '-',
        serials.join(', ') || '-',
        String(transfer.quantity || serials.length || 0),
      ]]
    : tableBody;

  autoTable(doc, {
    startY: y,
    head: [['Sr.No', 'Product Name', 'Model', 'Serial Number', 'Qty']],
    body: finalBody,
    margin: { left: mL, right: mR },
    tableWidth: cW,
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: _hex(_BLACK),
      lineColor: _hex(_YELLOW),
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: _hex(_BLACK),
      textColor: _hex(_YELLOW),
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: _hex(_YELLOW_BG) },
    bodyStyles:         { fillColor: _hex(_WHITE) },
    columnStyles: {
      0: { cellWidth: 13, halign: 'center' },
      1: { cellWidth: 45 },
      2: { cellWidth: 30 },
      3: { cellWidth: 70 },
      4: { cellWidth: 18, halign: 'center' },
    },
    // Footer row showing total quantity
    foot: serials.length > 1
      ? [['', '', '', 'Total Units:', String(serials.length)]]
      : undefined,
    footStyles: {
      fillColor: _hex(_BLACK),
      textColor: _hex(_YELLOW),
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'right',
    },
  });

  y = (doc as any).lastAutoTable.finalY + 7;

  // ── 5. Shipment Cost ─────────────────────────────────────────────────────
  if (transfer.shipmentCost && transfer.shipmentCost > 0) {
    const costPerUnit = transfer.costPerUnit ?? 0;
    _fill(doc, _YELLOW_BG);
    doc.roundedRect(mL, y, cW, 14, 2, 2, 'F');
    _draw(doc, _YELLOW); doc.setLineWidth(0.4);
    doc.roundedRect(mL, y, cW, 14, 2, 2, 'S');

    const curSym = getGlobalCurrencySymbol();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); _text(doc, _GRAY_TEXT);
    doc.text('Total Shipment Cost:', mL + 3, y + 5.5);
    doc.setFont('helvetica', 'bold'); _text(doc, '#92400e');
    doc.text(`${curSym} ${transfer.shipmentCost.toFixed(2)}`, mL + 45, y + 5.5);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); _text(doc, _GRAY_TEXT);
    doc.text('Cost Per Unit:', mL + 3, y + 11);
    doc.setFont('helvetica', 'bold'); _text(doc, '#15803d');
    doc.text(`${curSym} ${costPerUnit.toFixed(2)} / unit`, mL + 45, y + 11);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); _text(doc, _GRAY_TEXT);
    doc.text(
      `(${curSym} ${transfer.shipmentCost.toFixed(2)} ÷ ${transfer.quantity} units)`,
      pageW - mR, y + 11, { align: 'right' }
    );

    y += 14 + 6;
  }

  // ── 6. Note ───────────────────────────────────────────────────────────────
  if (transfer.note) {
    doc.setFont('helvetica', 'bold');   doc.setFontSize(8.5); _text(doc, _GRAY_TEXT);
    doc.text('Note:', mL, y);
    doc.setFont('helvetica', 'normal');                       _text(doc, _BLACK);
    const noteLines = doc.splitTextToSize(transfer.note, cW - 20);
    doc.text(noteLines, mL + 14, y);
    y += (noteLines.length * 4.5) + 8;
  }

  // ── 6. Received banner (shows full date+time) ─────────────────────────────
  if (receivedAt) {
    _fill(doc, '#dcfce7');
    doc.roundedRect(mL, y, cW, 9, 2, 2, 'F');
    _draw(doc, '#16a34a'); doc.setLineWidth(0.4);
    doc.roundedRect(mL, y, cW, 9, 2, 2, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); _text(doc, '#15803d');
    const receivedLabel = transfer.receiverName
      ? `Received by ${transfer.receiverName}: ${receivedAt}`
      : `Received: ${receivedAt}`;
    doc.text(receivedLabel, mL + 4, y + 6);
    y += 9 + 7;
  }

  // ── 7. Yellow divider rule ───────────────────────────────────────────────
  _draw(doc, _YELLOW); doc.setLineWidth(0.8); doc.line(mL, y, pageW - mR, y);
  y += 8;

  // ── 8. Terms & Conditions ─────────────────────────────────────────────────
  _fill(doc, _YELLOW); doc.rect(mL, y, cW, 6.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); _text(doc, _BLACK);
  doc.text('Terms and Conditions', mL + 3, y + 4.5);
  y += 6.5 + 4;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); _text(doc, _GRAY_TEXT);
  [
    'This transfer document is an official record of goods movement between company locations.',
    'The receiving party must verify serial numbers and quantities upon receipt.',
    'Any discrepancies must be reported within 24 hours of receipt.',
    'Products in transit remain the property of Bullion Electronics.',
    'The transferring party is responsible for safe packaging and handover.',
    'This document must be retained for audit and warranty purposes.',
  ].forEach(t => { doc.text(`* ${t}`, mL + 2, y); y += 5; });

  // ── 9. Black footer ──────────────────────────────────────────────────────
  const pageH   = 297;
  const footerH = 18;
  const footerY = pageH - footerH;
  _fill(doc, _BLACK); doc.rect(0, footerY, pageW, footerH, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); _text(doc, _YELLOW);
  doc.text('Thank you!', pageW / 2, footerY + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); _text(doc, _WHITE);
  doc.text(
    `${_COMPANY.name} · ${_COMPANY.address}, ${_COMPANY.city} · ${_COMPANY.phone}`,
    pageW / 2, footerY + 13, { align: 'center' }
  );

  // ── Save ──────────────────────────────────────────────────────────────────
  const from = (transfer.fromLocation || 'Unknown').replace(/\s+/g, '_');
  const to   = (transfer.toLocation   || 'Unknown').replace(/\s+/g, '_');
  doc.save(`Transfer_${transfer.id || 'draft'}_${from}_to_${to}.pdf`);
}

// ── View component ───────────────────────────────────────────────────────────

interface ProductTransferViewProps {
  transfers: ProductTransfer[];
  viewTransfer: ProductTransfer | null;
  isLoading: boolean;
  stats: {
    totalTransfers: number;
    pendingTransfers: number;
    inTransitTransfers: number;
    receivedTransfers: number;
  };
  onAdd: () => void;
  onView: (transfer: ProductTransfer) => void;
  onMarkReceived: (transfer: ProductTransfer, receiverName: string) => void;
  onDelete: (id: string) => void;
  onCloseView: () => void;
  /** Formats an ISO datetime string → "1 Jun 2026, 14:30" */
  formatDateTime: (date: string) => string;
}

export const ProductTransferView: React.FC<ProductTransferViewProps> = ({
  transfers, viewTransfer, isLoading, stats,
  onAdd, onView, onMarkReceived, onDelete, onCloseView, formatDateTime,
}) => {
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  const { symbol: currencySymbol } = useGlobalCurrency();

  // Receiver-name prompt state — replaces the direct onMarkReceived call.
  // When the user clicks "Receive" (either from the row or the detail modal)
  // we open this prompt asking for the recipient's name. Only after they
  // confirm do we call onMarkReceived, which applies the inventory updates.
  const [receivingTransfer, setReceivingTransfer] = React.useState<ProductTransfer | null>(null);
  const [receiverName, setReceiverName] = React.useState('');
  const [isReceiving, setIsReceiving] = React.useState(false);

  const openReceivePrompt = (t: ProductTransfer) => {
    setReceivingTransfer(t);
    setReceiverName('');
  };
  const closeReceivePrompt = () => {
    if (isReceiving) return;
    setReceivingTransfer(null);
    setReceiverName('');
  };
  const confirmReceive = async () => {
    if (!receivingTransfer || !receiverName.trim() || isReceiving) return;
    setIsReceiving(true);
    try {
      await onMarkReceived(receivingTransfer, receiverName.trim());
      setReceivingTransfer(null);
      setReceiverName('');
    } finally {
      setIsReceiving(false);
    }
  };

  const statusBadge = (status: string) => {
    const base = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold';
    if (status === 'Received' || status === 'Completed') return `${base} bg-green-100 text-green-700`;
    if (status === 'In Transit')                          return `${base} bg-slate-100 text-[#1e293b]`;
    if (status === 'Pending')                             return `${base} bg-amber-100 text-amber-700`;
    return `${base} bg-gray-100 text-gray-600`;
  };

  const statusIcon = (status: string) => {
    if (status === 'Received' || status === 'Completed') return <CheckCircle2 size={13} />;
    if (status === 'In Transit') return <Truck size={13} />;
    return <Clock size={13} />;
  };

  return (
    <div className="h-full overflow-y-auto p-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Product Transfers</h2>
          <p className="text-sm text-gray-500 mt-1">
            Move products between locations — serials removed from source, added to destination on receipt
          </p>
        </div>
        <button
          onClick={onAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 18px', borderRadius: 8, border: 'none',
            backgroundColor: '#0f172a', color: '#fff',
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15,23,42,0.3)', transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e293b'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0f172a'; }}
        >
          <Plus size={18} /> New Transfer
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total',      value: stats.totalTransfers,     color: 'bg-gray-50 border-gray-200',   text: 'text-gray-800' },
          { label: 'Pending',    value: stats.pendingTransfers,   color: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
          { label: 'In Transit', value: stats.inTransitTransfers, color: 'bg-blue-50 border-blue-200',   text: 'text-[#1e293b]' },
          { label: 'Received',   value: stats.receivedTransfers,  color: 'bg-green-50 border-green-200', text: 'text-green-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.text}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Transfers Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">
            All Transfers ({transfers.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Clock className="w-6 h-6 animate-spin mr-2" /> Loading transfers...
          </div>
        ) : transfers.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No transfers yet</p>
            <p className="text-gray-400 text-sm mt-1">Click "New Transfer" to move products between locations</p>
          </div>
        ) : (
          <LockedScrollTable maxHeight="65vh">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  {['Date & Time', 'Product', 'Route', 'Qty', 'Serials', 'Shipment Cost', 'By', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-6 py-3.5 text-left text-sm font-semibold text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transfers.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">

                    {/* Date + Time */}
                    <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {formatDateTime(t.transferDate || t.date || '').split(',')[0]}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDateTime(t.transferDate || t.date || '').split(',')[1]?.trim() || ''}
                        </span>
                      </div>
                    </td>

                    {/* Product */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-sm font-semibold text-gray-900">{t.productName}</span>
                      </div>
                    </td>

                    {/* Route */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          {t.fromLocation}
                        </span>
                        <ArrowRight size={13} className="text-gray-400" />
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          {t.toLocation}
                        </span>
                      </div>
                    </td>

                    {/* Qty */}
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                      {t.quantity}
                    </td>

                    {/* Serials preview */}
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {(t.serialNumbers || []).slice(0, 2).map(s => (
                          <span key={s} className="px-1.5 py-0.5 bg-slate-50 text-[#1e293b] rounded text-xs font-mono">
                            {s}
                          </span>
                        ))}
                        {(t.serialNumbers || []).length > 2 && (
                          <span className="text-xs text-gray-400">+{t.serialNumbers.length - 2} more</span>
                        )}
                      </div>
                    </td>

                    {/* Shipment Cost */}
                    <td className="px-6 py-4 text-sm whitespace-nowrap">
                      {t.shipmentCost && t.shipmentCost > 0 ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-amber-700">{currencySymbol} {t.shipmentCost.toFixed(2)}</span>
                          <span className="text-xs text-green-600">{(t.costPerUnit ?? 0).toFixed(2)}/unit</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Transferred By */}
                    <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                      {t.transferredBy || '-'}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={statusBadge(t.status)}>
                        {statusIcon(t.status)}
                        {t.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onView(t)}
                          className="p-2 text-[#334155] hover:bg-slate-50 rounded-lg transition-colors"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>

                        {(t.status === 'Pending' || t.status === 'In Transit') && (
                          <button
                            onClick={() => openReceivePrompt(t)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors font-semibold"
                          >
                            <CheckCircle2 size={13} /> Receive
                          </button>
                        )}

                        <button
                          onClick={() => downloadTransferPDF(t)}
                          className="p-2 text-gray-800 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border border-gray-300 rounded-lg transition-colors"
                          title="Download PDF"
                        >
                          <Download size={16} />
                        </button>

                        <button
                          onClick={() => onDelete(t.id)}
                          className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </LockedScrollTable>
        )}
      </div>

      {/* ── View Transfer Modal ── */}
      {viewTransfer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-2xl"
            style={{ maxHeight: 'min(700px, calc(100vh - 2rem))' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <ArrowRightLeft size={18} className="text-[#0f172a]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Transfer Details</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDateTime(viewTransfer.transferDate || viewTransfer.date || '')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={statusBadge(viewTransfer.status)}>
                  {statusIcon(viewTransfer.status)}
                  {viewTransfer.status}
                </span>
                <button
                  onClick={onCloseView}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ml-1"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 min-h-0 px-6 py-5 space-y-5">

              {/* Product */}
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <div className="p-2.5 bg-slate-100 rounded-lg">
                  <Package size={20} className="text-[#0f172a]" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Product</p>
                  <p className="text-base font-bold text-gray-900 mt-0.5">{viewTransfer.productName}</p>
                </div>
              </div>

              {/* Route */}
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Route</p>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                  <div className="flex-1 text-center">
                    <p className="text-xs text-gray-500 mb-1">From</p>
                    <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-semibold">
                      {viewTransfer.fromLocation}
                    </span>
                  </div>
                  <ArrowRight size={20} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 text-center">
                    <p className="text-xs text-gray-500 mb-1">To</p>
                    <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-semibold">
                      {viewTransfer.toLocation}
                    </span>
                  </div>
                </div>
              </div>

              {/* Details row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Quantity</p>
                  <p className="text-2xl font-bold text-gray-900">{viewTransfer.quantity}</p>
                  <p className="text-xs text-gray-400">unit{viewTransfer.quantity !== 1 ? 's' : ''}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1">
                    <User size={12} className="text-gray-400" />
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Transferred By</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {viewTransfer.transferredBy || '-'}
                  </p>
                </div>
              </div>

              {/* Transfer Date+Time */}
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                <Calendar size={14} className="text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Transfer Date &amp; Time</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">
                    {formatDateTime(viewTransfer.transferDate || viewTransfer.date || '')}
                  </p>
                </div>
              </div>

              {/* Serial Numbers */}
              {(viewTransfer.serialNumbers || []).length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Hash size={13} className="text-gray-400" />
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                      Serial Numbers ({viewTransfer.serialNumbers.length})
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50 rounded-xl">
                    {viewTransfer.serialNumbers.map(s => (
                      <span
                        key={s}
                        className="px-2 py-1 bg-slate-50 text-[#1e293b] border border-slate-200 rounded-lg text-xs font-mono"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Shipment Cost */}
              {(viewTransfer.shipmentCost != null && viewTransfer.shipmentCost > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <p className="text-xs text-amber-600 font-medium uppercase tracking-wide mb-1">Shipment Cost</p>
                    <p className="text-xl font-bold text-amber-800">{currencySymbol} {viewTransfer.shipmentCost.toFixed(2)}</p>
                    <p className="text-xs text-amber-500">total</p>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-100 rounded-xl">
                    <p className="text-xs text-green-600 font-medium uppercase tracking-wide mb-1">Cost Per Unit</p>
                    <p className="text-xl font-bold text-green-700">{currencySymbol} {(viewTransfer.costPerUnit ?? 0).toFixed(2)}</p>
                    <p className="text-xs text-green-500">per piece</p>
                  </div>
                </div>
              )}

              {/* Note */}
              {viewTransfer.note && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText size={13} className="text-gray-400" />
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Note</p>
                  </div>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3 leading-relaxed">
                    {viewTransfer.note}
                  </p>
                </div>
              )}

              {/* Received At — full date+time, plus who confirmed receipt */}
              {viewTransfer.receivedAt && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-xl">
                  <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-green-700">
                      Received{viewTransfer.receiverName ? ` by ${viewTransfer.receiverName}` : ''}
                    </p>
                    <p className="text-xs text-green-600">
                      {formatDateTime(viewTransfer.receivedAt)}
                    </p>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => downloadTransferPDF(viewTransfer)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm bg-gray-100 text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors font-semibold"
              >
                <Download size={15} /> Download PDF
              </button>

              <div className="flex items-center gap-2">
                {(viewTransfer.status === 'Pending' || viewTransfer.status === 'In Transit') && (
                  <button
                    onClick={() => openReceivePrompt(viewTransfer)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
                  >
                    <CheckCircle2 size={16} /> Mark as Received
                  </button>
                )}
                <button
                  onClick={onCloseView}
                  className="px-5 py-2.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Receive Prompt Modal ────────────────────────────────────────
          Opens when a Receive button is clicked. Asks for the receiver's
          name; on confirm, fires the actual onMarkReceived(transfer, name)
          which does all the inventory updates + records the receiver + the
          receive date on the transfer. */}
      {receivingTransfer && (
        <div
          onClick={closeReceivePrompt}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(15,23,42,0.55)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-700">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">Mark as Received</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Confirm who received {receivingTransfer.brandName} {receivingTransfer.modelName} at {receivingTransfer.toLocation}.
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Receiver's Name <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={receiverName}
                  onChange={e => setReceiverName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && receiverName.trim()) confirmReceive();
                    else if (e.key === 'Escape') closeReceivePrompt();
                  }}
                  disabled={isReceiving}
                  placeholder="Enter the recipient's full name"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800">
                On confirm: the stock-in date and location for the transferred serials will be updated
                to today ({new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})
                and this transfer will be marked <b>Received</b>.
              </div>
            </div>

            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={closeReceivePrompt}
                disabled={isReceiving}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmReceive}
                disabled={!receiverName.trim() || isReceiving}
                className="px-5 py-2 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isReceiving
                  ? (<><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Confirming…</>)
                  : (<><CheckCircle2 size={14} /> Confirm Receipt</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};