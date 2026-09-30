// Dummy Invoice Module — Excel export
//
// Dummy/Proforma/Booking/Quotation invoices are drafts that live outside
// inventory, so finance/sales often want the whole list in a spreadsheet to
// share or archive rather than opening each one individually. This mirrors
// the aoa_to_sheet + fixed column-width convention already used for the
// Purchase Order costing export (see purchased-orders/models/costingExcel.ts).

import * as XLSX from 'xlsx';
import { DummyInvoice } from './DummyInvoiceFirebaseService';

function fmtDate(d?: string): string {
  if (!d) return '';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function buildDummyInvoiceWorkbook(invoices: DummyInvoice[]): XLSX.WorkBook {
  const header = [
    'Invoice #', 'Type', 'Date', 'Valid Until',
    'Customer', 'Phone', 'CNIC', 'City', 'Country', 'Address',
    'Products', 'Item Count', 'Total Amount', 'Status', 'Salesperson', 'Notes',
  ];

  const rows: any[][] = [header];

  invoices.forEach(inv => {
    rows.push([
      inv.invoiceNumber,
      // Stored value is still 'Dummy' (unchanged) — only the exported label
      // reads "Fictitious", matching the rename used across the module's UI.
      inv.invoiceType === 'Dummy' ? 'Fictitious' : inv.invoiceType,
      fmtDate(inv.date),
      fmtDate(inv.validUntil),
      inv.customerName || '',
      inv.customerPhone || '',
      inv.customerCNIC || '',
      inv.customerCity || '',
      inv.customerProvince || '',
      inv.customerAddress || '',
      inv.products.map(p => `${p.productName}${p.quantity > 1 ? ` x${p.quantity}` : ''}`).join(', '),
      inv.products.length,
      inv.totalAmount || 0,
      inv.status,
      inv.salesperson || '',
      inv.notes || '',
    ]);
  });

  // Grand total under the Total Amount column, matching the totals row
  // pattern used in the costing export.
  const totalRow = rows.length + 1; // 1-based Excel row of the first data row is 2
  rows.push([]);
  rows.push([
    'TOTAL', '', '', '', '', '', '', '', '', '', '',
    invoices.reduce((s, i) => s + (i.products.length || 0), 0),
    { f: `SUM(M2:M${totalRow - 1})` },
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 22 }, { wch: 15 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 24 },
    { wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 11 }, { wch: 16 }, { wch: 28 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Draft Invoices');
  return wb;
}

export function downloadDummyInvoiceExcel(invoices: DummyInvoice[], label = 'All'): void {
  const wb = buildDummyInvoiceWorkbook(invoices);
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Draft-Invoices-${label}-${stamp}.xlsx`);
}
