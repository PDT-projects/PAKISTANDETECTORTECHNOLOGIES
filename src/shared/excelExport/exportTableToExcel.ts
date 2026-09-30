// Shared Excel export — one function every table on the "needs Excel export"
// list calls, instead of each screen writing its own xlsx code.
//
// Uses the `xlsx` package already used elsewhere in this project
// (src/modules/purchased-orders/models/costingExcel.ts) — no new dependency.

import * as XLSX from 'xlsx';

export interface ExcelColumn {
  header: string;
}

export interface ExcelExportOptions {
  /** Shown as a title banner row at the top of the sheet. */
  title: string;
  /** Optional line under the title — active filters, date range, etc. */
  subtitle?: string;
  columns: ExcelColumn[];
  /** One array of cell values per row, in the same order as `columns`. */
  rows: (string | number)[][];
  /** Optional bold totals row appended at the end, same shape as a data row. */
  totalsRow?: (string | number)[];
  /** Used for the downloaded filename (no extension). */
  filename: string;
  /** Excel tab name — defaults to `title`, trimmed to Excel's 31-char limit. */
  sheetName?: string;
}

export function exportTableToExcel(opts: ExcelExportOptions): void {
  const generatedLine = `Generated on ${new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })}`;

  const sheetRows: (string | number)[][] = [
    [opts.title],
    ...(opts.subtitle ? [[opts.subtitle]] : []),
    [generatedLine],
    [],
    opts.columns.map(c => c.header),
    ...opts.rows,
    ...(opts.totalsRow ? [opts.totalsRow] : []),
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);

  // Reasonable default column widths so text/numbers aren't clipped.
  ws['!cols'] = opts.columns.map(() => ({ wch: 16 }));

  // Merge the banner rows (title / subtitle / generated-date) across every
  // column so they read as a header, not text stuck in column A.
  const lastCol = Math.max(0, opts.columns.length - 1);
  const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];
  let r = 1;
  if (opts.subtitle) { merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++; }
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  ws['!merges'] = merges;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (opts.sheetName || opts.title || 'Sheet').slice(0, 31));
  XLSX.writeFile(wb, `${opts.filename}.xlsx`);
}
