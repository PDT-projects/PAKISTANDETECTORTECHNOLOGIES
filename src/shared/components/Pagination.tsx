// Pagination — a reusable "how many rows per page" control for data tables.
//
// One hook + one bar, used the same way on every table:
//   const pg = usePagination(rows, 'transactions-list');
//   ...map over pg.pageRows instead of rows...
//   <PaginationBar controller={pg} />
//
// The page-size choice is remembered per table (own localStorage key), and
// the current page resets to 1 whenever the underlying row count changes
// (a new filter/search) so a person never lands on a page that no longer
// exists.

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

export interface PaginationController<T> {
  pageRows: T[];
  page: number;
  setPage: (p: number) => void;
  pageCount: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
}

export function usePagination<T>(rows: T[], storageKey: string): PaginationController<T> {
  const key = `page-size:${storageKey}`;
  const [pageSize, setPageSizeState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      return PAGE_SIZE_OPTIONS.includes(saved) ? saved : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [page, setPage] = useState(1);

  const totalCount = rows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageSafe = Math.min(page, pageCount);

  // A new filter/search can shrink the row count out from under the current
  // page — snap back to a page that still exists instead of showing blank.
  useEffect(() => {
    if (page !== pageSafe) setPage(pageSafe);
  }, [pageSafe]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPageSize = (n: number) => {
    setPageSizeState(n);
    setPage(1);
    try { localStorage.setItem(key, String(n)); } catch {}
  };

  const pageRows = useMemo(
    () => rows.slice((pageSafe - 1) * pageSize, pageSafe * pageSize),
    [rows, pageSafe, pageSize],
  );

  const rangeStart = totalCount === 0 ? 0 : (pageSafe - 1) * pageSize + 1;
  const rangeEnd = Math.min(pageSafe * pageSize, totalCount);

  return { pageRows, page: pageSafe, setPage, pageCount, pageSize, setPageSize, totalCount, rangeStart, rangeEnd };
}

/** Bar showing "Showing 1–25 of 340" + page-size picker + prev/next/number
 *  buttons. Drop it right after a table (inside or outside LockedScrollTable
 *  — it's a plain flex row, not scroll-aware). Renders nothing when there's
 *  only one page and the row count already fits, so it never clutters a
 *  short table. */
export function PaginationBar({ controller }: { controller: PaginationController<any> }) {
  const { page, setPage, pageCount, pageSize, setPageSize, totalCount, rangeStart, rangeEnd } = controller;

  if (totalCount === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 4px', flexWrap: 'wrap', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Showing {rangeStart}–{rangeEnd} of {totalCount}
        </span>
        <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
          style={{
            fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db',
            backgroundColor: '#fff', color: '#334155', cursor: 'pointer',
          }}>
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {pageCount > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid #d1d5db', backgroundColor: '#fff',
              cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <ChevronLeft size={14} />
          </button>

          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter(n => n === 1 || n === pageCount || Math.abs(n - page) <= 1)
            .map((n, idx, arr) => (
              <React.Fragment key={n}>
                {idx > 0 && arr[idx - 1] !== n - 1 && (
                  <span style={{ color: '#cbd5e1', fontSize: 12, padding: '0 2px' }}>…</span>
                )}
                <button type="button" onClick={() => setPage(n)}
                  style={{
                    minWidth: 28, height: 28, borderRadius: 6,
                    border: `1px solid ${n === page ? '#1e3a8a' : '#d1d5db'}`,
                    backgroundColor: n === page ? '#1e3a8a' : '#fff',
                    color: n === page ? '#fff' : '#334155',
                    cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  }}>
                  {n}
                </button>
              </React.Fragment>
            ))}

          <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid #d1d5db', backgroundColor: '#fff',
              cursor: page >= pageCount ? 'default' : 'pointer', opacity: page >= pageCount ? 0.4 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
