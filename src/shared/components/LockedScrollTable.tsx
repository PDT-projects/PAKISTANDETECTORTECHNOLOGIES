// LockedScrollTable — solves the "horizontal scrollbar disappears when you
// scroll down a tall table" problem.
//
// THE PROBLEM: a plain `<div className="overflow-x-auto"><table>...</table></div>`
// puts the horizontal scrollbar at the very bottom of the table. If the table
// has many rows, that bottom edge is far below the visible screen — so to
// reach the horizontal scrollbar you first have to scroll the whole PAGE down
// past every row, scroll sideways, then scroll back up. On a long table this
// makes the horizontal scrollbar practically unreachable most of the time.
//
// THE FIX: give the table's own box a fixed height that fits inside the
// viewport (e.g. 70% of screen height) and let ROWS scroll inside that box
// (vertical scroll happens INSIDE the box, not on the page). Because the box
// itself never grows taller than the viewport, its bottom edge — where the
// horizontal scrollbar lives — is ALWAYS on screen, no matter how many rows
// there are or where you've scrolled within them.
//
// USAGE — replace this:
//   <div className="overflow-x-auto">
//     <table>...</table>
//   </div>
// with this:
//   <LockedScrollTable>
//     <table>...</table>
//   </LockedScrollTable>

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface LockedScrollTableProps {
  children: React.ReactNode;
  /** How tall the locked box is. Default fits most screens with room for a
   *  page header/toolbar above it. Pass a smaller value on a busy page. */
  maxHeight?: string;
  /** Sticky-header the table's own <thead> too (most report tables already
   *  do this with a CSS class — leave true unless the table handles it itself). */
  stickyHeader?: boolean;
  className?: string;
}

export const LockedScrollTable: React.FC<LockedScrollTableProps> = ({
  children, maxHeight = '70vh', stickyHeader = true, className = '',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateEdges();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateEdges, children]);

  const nudge = (dir: 1 | -1) => scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });

  return (
    <div className={`locked-scroll-wrapper ${className}`} style={{ position: 'relative' }}>
      {canLeft && (
        <>
          <div className="locked-scroll-fade locked-scroll-fade-left" />
          <button type="button" onClick={() => nudge(-1)} aria-label="Scroll left" className="locked-scroll-arrow locked-scroll-arrow-left">
            <ChevronLeft size={16} />
          </button>
        </>
      )}
      {canRight && (
        <>
          <div className="locked-scroll-fade locked-scroll-fade-right" />
          <button type="button" onClick={() => nudge(1)} aria-label="Scroll right" className="locked-scroll-arrow locked-scroll-arrow-right">
            <ChevronRight size={16} />
          </button>
        </>
      )}
      <div
        ref={scrollRef}
        onScroll={updateEdges}
        className={`locked-scroll-viewport ${stickyHeader ? 'locked-scroll-sticky-head' : ''}`}
        style={{ maxHeight, overflowY: 'auto', overflowX: 'auto', overscrollBehaviorX: 'contain' as any }}
      >
        {children}
      </div>
    </div>
  );
};

let injected = false;
function ensureStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
    .locked-scroll-viewport {
      scrollbar-width: auto;
      scrollbar-color: #94a3b8 #f1f5f9;
    }
    .locked-scroll-viewport::-webkit-scrollbar { height: 12px; width: 12px; }
    .locked-scroll-viewport::-webkit-scrollbar-track { background: #f1f5f9; }
    .locked-scroll-viewport::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 6px; border: 2px solid #f1f5f9; }
    .locked-scroll-viewport::-webkit-scrollbar-thumb:hover { background: #64748b; }
    .locked-scroll-sticky-head table thead th {
      position: sticky; top: 0; z-index: 10; background: inherit;
    }
    .locked-scroll-fade {
      pointer-events: none; position: absolute; top: 0; bottom: 12px; width: 32px; z-index: 20;
    }
    .locked-scroll-fade-left { left: 0; background: linear-gradient(to right, rgba(255,255,255,0.95), transparent); }
    .locked-scroll-fade-right { right: 0; background: linear-gradient(to left, rgba(255,255,255,0.95), transparent); }
    .locked-scroll-arrow {
      position: absolute; top: 50%; transform: translateY(-50%); z-index: 30;
      background: white; border: 1px solid #e2e8f0; box-shadow: 0 2px 6px rgba(0,0,0,0.12);
      border-radius: 9999px; padding: 6px; cursor: pointer;
    }
    .locked-scroll-arrow-left { left: 6px; }
    .locked-scroll-arrow-right { right: 6px; }
  `;
  document.head.appendChild(style);
}
ensureStyles();
