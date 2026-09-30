// Shared report export â€” PDF and Excel, both from the same data shape.
// Uses jspdf + jspdf-autotable (already installed) and xlsx (already used
// elsewhere in this project).

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ReportColumn {
  header: string;
  align?: 'left' | 'right' | 'center';
}

export interface ReportExportOptions {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  filename: string;
  orientation?: 'portrait' | 'landscape';
}

// â”€â”€ PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function exportReportToPdf(opts: ReportExportOptions): void {
  const orientation = opts.orientation ?? 'landscape';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const INK: [number, number, number]   = [15, 23, 42];
  const MUTED: [number, number, number] = [100, 116, 139];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(opts.title, 14, 16);

  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(opts.subtitle, 14, 22);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const generatedLine = `This report was generated on ${new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })}`;
  doc.text(generatedLine, pageWidth - 14, 16, { align: 'right' });

  const body = [...opts.rows];
  if (opts.totalsRow) body.push(opts.totalsRow);

  autoTable(doc, {
    startY: opts.subtitle ? 27 : 23,
    head: [opts.columns.map(c => c.header)],
    body,
    styles: { fontSize: 7.5, cellPadding: 2, textColor: INK },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: Object.fromEntries(
      opts.columns.map((c, i) => [i, { halign: c.align ?? 'left' }]),
    ),
    didParseCell: (data) => {
      if (opts.totalsRow && data.row.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [245, 245, 245];
      }
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${opts.filename}.pdf`);
}

// â”€â”€ Excel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function exportReportToExcel(opts: ReportExportOptions): void {
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
  ws['!cols'] = opts.columns.map(() => ({ wch: 16 }));

  const lastCol = Math.max(0, opts.columns.length - 1);
  const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];
  let r = 1;
  if (opts.subtitle) { merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++; }
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  ws['!merges'] = merges;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (opts.title || 'Report').slice(0, 31));
  XLSX.writeFile(wb, `${opts.filename}.xlsx`);
}

