// Column visibility — a reusable "choose columns" control for data tables.
//
// One hook + one dropdown button, used the same way on every table:
//   const cols = useColumnVisibility('invoice-list', ['Invoice #', 'Date', ...]);
//   <ColumnVisibilityMenu controller={cols} />
//   ...
//   {cols.isVisible('Date') && <th>Date</th>}
//   {cols.isVisible('Date') && <td>{formatDate(x.date)}</td>}
//
// The storageKey namespaces localStorage so each table remembers its own
// choice independently and doesn't clash with any other table on the page.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Columns3, Check } from 'lucide-react';

export interface ColumnVisibilityController {
  columns: string[];
  isVisible: (name: string) => boolean;
  toggle: (name: string) => void;
  showAll: () => void;
  hideAll: () => void;
  visibleCount: number;
}

export function useColumnVisibility(storageKey: string, columns: string[]): ColumnVisibilityController {
  const key = `col-vis:${storageKey}`;
  const [visible, setVisible] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set(columns);
      const saved: string[] = JSON.parse(raw);
      const savedSet = new Set(saved);
      const knownAtSave: string[] = JSON.parse(localStorage.getItem(key + ':known') || '[]');
      const knownSet = new Set(knownAtSave);
      // A column visible now: it was explicitly saved as on, OR it's new
      // (wasn't known when the user last saved a choice).
      return new Set(columns.filter(c => savedSet.has(c) || !knownSet.has(c)));
    } catch {
      return new Set(columns);
    }
  });

  const persist = useCallback((next: Set<string>) => {
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(next)));
      localStorage.setItem(key + ':known', JSON.stringify(columns));
    } catch {}
  }, [key, columns]);

  const toggle = useCallback((name: string) => {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      persist(next);
      return next;
    });
  }, [persist]);

  const showAll = useCallback(() => {
    const next = new Set(columns);
    setVisible(next);
    persist(next);
  }, [columns, persist]);

  const hideAll = useCallback(() => {
    const next = new Set<string>();
    setVisible(next);
    persist(next);
  }, [persist]);

  return {
    columns,
    isVisible: (name: string) => visible.has(name),
    toggle,
    showAll,
    hideAll,
    visibleCount: visible.size,
  };
}

/** Dropdown button — "Columns (8/12)" — with a checkbox list. Drop this next
 *  to a table's search/filter row; it needs no layout of its own beyond
 *  being an inline-block trigger + absolutely-positioned panel. */
export function ColumnVisibilityMenu({ controller, label = 'Columns' }: {
  controller: ColumnVisibilityController; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
          borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: '#fff',
          fontSize: 13, color: '#334155', cursor: 'pointer', height: 36,
        }}>
        <Columns3 size={14} />
        {label} ({controller.visibleCount}/{controller.columns.length})
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
          backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,.14)', minWidth: 210, padding: 8,
          maxHeight: 340, overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', gap: 6, padding: '2px 4px 8px', borderBottom: '1px solid #f1f5f9', marginBottom: 6 }}>
            <button type="button" onClick={controller.showAll}
              style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
              Show all
            </button>
            <span style={{ color: '#e2e8f0' }}>|</span>
            <button type="button" onClick={controller.hideAll}
              style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
              Hide all
            </button>
          </div>
          {controller.columns.map(col => {
            const on = controller.isVisible(col);
            return (
              <label key={col} onClick={() => controller.toggle(col)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px',
                  fontSize: 12.5, color: '#1e293b', cursor: 'pointer', borderRadius: 6, userSelect: 'none',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
                <span style={{
                  width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                  border: `1.5px solid ${on ? '#1e3a8a' : '#cbd5e1'}`, backgroundColor: on ? '#1e3a8a' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {on && <Check size={10} color="#fff" strokeWidth={3} />}
                </span>
                {col}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
