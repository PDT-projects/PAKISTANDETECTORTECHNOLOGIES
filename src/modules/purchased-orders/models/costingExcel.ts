// Costing sheet — Excel export
//
// Exported with live formulas, not computed values.
//
// The spreadsheet this screen replaced let an accountant click a cell and read
// how the number was reached. Exporting values loses exactly what made that
// spreadsheet trusted — you get a grid of numbers nobody can check. So the
// allocation, the landed total and the unit cost are written as real Excel
// formulas over the cells above them, and they recalculate.

import * as XLSX from 'xlsx';
import { Shipment, ShipmentCosting } from './types';
import { chargeTotals } from './purchasedOrderService';

export function buildCostingWorkbook(s: Shipment, c: ShipmentCosting): XLSX.WorkBook {
  const ct = chargeTotals(s);

  // ── Header block ──────────────────────────────────────────────────────────
  //
  // The charge cells are referenced by address further down, so the row order
  // here is load-bearing: customs at B9, freight at E9, tax at B10, other at
  // E10. Adding a row above them moves every allocation formula.
  const rows: any[][] = [
    ['IMPORT COSTING SHEET'],
    [],
    ['Shipment',    s.shipmentNumber,           '', 'Supplier',    s.supplierName || '—'],
    ['Brand',       s.brandName || '—',         '', 'Origin',      s.originCountry || '—'],
    ['Order date',  s.orderDate || '—',         '', 'Destination', s.destinationCountry || '—'],
    ['Arrived',     s.actualArrivalDate || '—', '', 'Costing',     s.costingStatus],
    [],
    ['IMPORT CHARGES'],
    ['Customs', ct.customs, '', 'Freight', ct.freight],   // row 9  — B9, E9
    ['Tax',     ct.tax,     '', 'Other',   ct.other],     // row 10 — B10, E10
    ['Total',   { f: 'B9+E9+B10+E10' }],
    [],
  ];

  const headerRows = rows.length;          // 12 — the header lands on Excel row 13

  rows.push([
    'Product', 'Model', 'Qty', 'Unit price', 'Amount',
    'Customs', 'Freight', 'Other', 'Landed total', 'Landed / unit',
  ]);

  const firstDataRow = headerRows + 2;     // 14 — first line, 1-based
  const lastDataRow  = firstDataRow + c.lines.length - 1;

  // Cells the formulas point at. Written once so a column change does not have
  // to be chased through every template string below.
  const NET  = (r: number) => `E${r}`;     // Amount
  const QTY  = (r: number) => `C${r}`;
  const LAND = (r: number) => `I${r}`;

  const netSumRange     = `$E$${firstDataRow}:$E$${lastDataRow}`;
  const customsTotalRef = '$B$9';
  const freightTotalRef = '$E$9';
  // Tax rides with other charges, matching the screen, which shows them in one
  // column. Left out of the export they would vanish from the landed total and
  // the closure check would fail on a sheet that balances on screen.
  const otherTotalRef   = '($E$10+$B$10)';

  c.lines.forEach((l, i) => {
    const r = firstDataRow + i;

    // Share is still the allocation basis — it is computed inline rather than
    // shown in a column, so the file recalculates exactly as the screen does
    // without displaying a number nobody reads.
    //
    // The ranges are absolute: a relative one would shift as Excel fills the
    // formula down, and each line would divide by a different total.
    const share = `IF(SUM(${netSumRange})=0,0,${NET(r)}/SUM(${netSumRange}))`;

    rows.push([
      l.productName,
      l.modelName || '',
      l.quantity,
      l.unitPrice,
      { f: `${QTY(r)}*D${r}` },                    // E — Amount
      { f: `${customsTotalRef}*(${share})` },      // F — Customs share
      { f: `${freightTotalRef}*(${share})` },      // G — Freight share
      { f: `${otherTotalRef}*(${share})` },        // H — Other + tax share
      { f: `E${r}+F${r}+G${r}+H${r}` },            // I — Landed total
      { f: `IF(${QTY(r)}=0,0,I${r}/${QTY(r)})` },  // J — Landed per unit
    ]);
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalRow = lastDataRow + 1;

  rows.push([
    'TOTAL', '',
    { f: `SUM(C${firstDataRow}:C${lastDataRow})` },   // C — Qty
    '',                                              // D — no meaningful total
    { f: `SUM(E${firstDataRow}:E${lastDataRow})` },   // E — Amount
    { f: `SUM(F${firstDataRow}:F${lastDataRow})` },   // F — Customs
    { f: `SUM(G${firstDataRow}:G${lastDataRow})` },   // G — Freight
    { f: `SUM(H${firstDataRow}:H${lastDataRow})` },   // H — Other + tax
    { f: `SUM(I${firstDataRow}:I${lastDataRow})` },   // I — Landed
    { f: `IF(C${totalRow}=0,0,I${totalRow}/C${totalRow})` }, // J — average
  ]);

  // ── Closure check ─────────────────────────────────────────────────────────
  //
  // The same assertion the screen makes, as a live formula. It is what tells
  // someone opening this file next year whether the arithmetic still holds
  // after they have edited a charge.
  rows.push([]);
  rows.push([
    'Closure check',
    {
      f: `IF(ABS(${LAND(totalRow)}-(${NET(totalRow)}+F${totalRow}+G${totalRow}+H${totalRow}))<0.02,`
       + `"BALANCED","OUT BY "&TEXT(${LAND(totalRow)}-(${NET(totalRow)}+F${totalRow}+G${totalRow}+H${totalRow}),"0.00"))`,
    },
  ]);
  rows.push([
    'Note',
    'Charges are allocated by each line\u2019s share of net purchase value. '
    + 'Editing a charge above recalculates every line. Tax is allocated with other charges.',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 30 }, { wch: 18 }, { wch: 7 },  { wch: 12 }, { wch: 13 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Costing');
  return wb;
}

export function downloadCostingExcel(s: Shipment, c: ShipmentCosting): void {
  const wb = buildCostingWorkbook(s, c);
  XLSX.writeFile(wb, `Costing-${s.shipmentNumber}.xlsx`);
}