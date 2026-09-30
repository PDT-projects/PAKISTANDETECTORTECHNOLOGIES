// Purchased Orders — Shipments dashboard
//
// KPI row, a dense data table, and pagination. "Completed" here means all
// six payment stages are done (shipmentWorkflow) — nothing on this page
// reads or displays the shipment's lifecycle status field (Draft/Ordered/
// In Transit/etc). No new business rule was invented for this screen.

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Plus, Search, Ship, CheckCircle2, AlertTriangle, TrendingUp,
  Trash2, RefreshCw, Loader2, X, ChevronLeft, ChevronRight, MoreVertical,
  MapPin, Filter,
} from 'lucide-react';
import { usePurchasedOrdersViewModel } from '../viewModels/usePurchasedOrdersViewModel';
import {
  calculateShipmentCosting, shipmentWorkflow, money,
} from '../models/purchasedOrderService';
import { Shipment, DisplayCurrency, SHIPMENT_CURRENCIES } from '../models/types';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';
import { seedDemoShipments } from '../models/seedDemoShipments';
import { UI, ShipmentProgressBar, KpiCard } from '../components/ShipmentUI';

const PAGE_SIZE = 10;

type TabKey = 'all' | 'progress' | 'completed';

/** "Complete" means every one of the six payment stages is done — Customs,
 *  Freight, Tax, Other Dues paid, Costing finalised, Supplier paid — not
 *  whatever the shipment's own lifecycle status field happens to say. A
 *  shipment can be fully paid off long before someone gets around to
 *  updating its shipping status, and this dashboard is about money, not
 *  where the box physically is. Cancelled shipments sit outside both tabs;
 *  they show up under "All" only. */
function matchesTab(s: Shipment, tab: TabKey): boolean {
  const cancelled = s.status === 'Cancelled';
  if (tab === 'all') return !cancelled;
  if (cancelled) return false;
  const stages = shipmentWorkflow(s);
  const done = stages.filter(st => st.state === 'Completed').length;
  if (tab === 'completed') return done === stages.length;
  if (tab === 'progress')  return done < stages.length;
  return true;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: UI.rSm, border: `1px solid #d1d5db`,
  backgroundColor: '#fff', fontSize: 13, color: UI.ink, outline: 'none', boxSizing: 'border-box',
};

function ShipmentRow({ s, view, rowNumber, onOpen, onDelete }: {
  s: Shipment; view: DisplayCurrency; rowNumber: number; onOpen: () => void; onDelete: () => void;
}) {
  const costing = calculateShipmentCosting(s);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <tr
      onClick={onOpen}
      style={{ cursor: 'pointer', borderBottom: `1px solid ${UI.hair}` }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fafbfc'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
    >
      <td style={{ padding: '12px 10px', fontSize: 12.5, color: UI.muted, width: 36 }}>{rowNumber}</td>
      <td style={{ padding: '12px 10px', fontSize: 13, fontWeight: 700, color: UI.ink, whiteSpace: 'nowrap' }}>
        {s.shipmentNumber}
      </td>
      <td style={{ padding: '12px 10px', fontSize: 12.5, color: UI.body, whiteSpace: 'nowrap' }}>
        {s.supplierOrderNumber || s.shipmentNumber}
      </td>
      <td style={{ padding: '12px 10px', fontSize: 12.5, color: UI.body, maxWidth: 150 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.supplierName || '—'}</div>
      </td>
      <td style={{ padding: '12px 10px', fontSize: 12.5, color: UI.body, whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <MapPin size={11} color={UI.muted} /> {s.destinationCountry || '—'}
        </span>
      </td>
      <td style={{ padding: '12px 10px', minWidth: 120 }}>
        <ShipmentProgressBar shipment={s} />
      </td>
      <td style={{ padding: '12px 10px', fontSize: 13, fontWeight: 700, color: UI.ink, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {money(costing.landedTotal, view)}
      </td>
      <td style={{ padding: '12px 10px', textAlign: 'center', width: 40, position: 'relative' }}
        onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => setMenuOpen(v => !v)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: UI.muted, padding: 4, display: 'inline-flex' }}>
          <MoreVertical size={15} />
        </button>
        {menuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setMenuOpen(false)} />
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 20,
              backgroundColor: '#fff', border: `1px solid ${UI.border}`, borderRadius: UI.rSm,
              boxShadow: '0 6px 20px rgba(15,23,42,.12)', minWidth: 140, overflow: 'hidden',
            }}>
              <button type="button" onClick={() => { setMenuOpen(false); onOpen(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none',
                  background: 'none', cursor: 'pointer', fontSize: 12.5, color: UI.ink }}>
                View details
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); onDelete(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '9px 12px',
                  border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, color: UI.danger }}>
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

export const PurchasedOrdersView: React.FC = () => {
  const navigate = useNavigate();
  const vm = usePurchasedOrdersViewModel();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  // Follows the Admin's global currency setting — money() takes a target
  // and converts the stored AED figure live; AED stays the source of truth.
  // Falls back to AED if the global pick (e.g. CAD) isn't one of the six
  // currencies this module's costing sheet supports.
  const { code: globalCode } = useGlobalCurrency();
  const view: DisplayCurrency = (SHIPMENT_CURRENCIES as string[]).includes(globalCode)
    ? (globalCode as DisplayCurrency)
    : 'AED';
  const [seeding, setSeeding] = useState(false);

  const loadDemo = async () => {
    setSeeding(true);
    try {
      const r = await seedDemoShipments();
      if (r.created > 0) toast.success(`Loaded ${r.created} demo shipment${r.created === 1 ? '' : 's'}`);
      else if (r.skipped > 0) toast.info('Demo shipments already exist');
      if (r.errors.length) toast.error(r.errors[0]);
      await vm.refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Could not load demo data');
    } finally {
      setSeeding(false);
    }
  };

  // KPI counts — same priority grouping as the tabs, computed once per render
  // off the full (unfiltered-by-tab) visible list so the numbers describe the
  // whole portfolio regardless of which tab is open.
  const kpi = useMemo(() => {
    const list = vm.shipments;
    return {
      total:      list.filter(s => s.status !== 'Cancelled').length,
      progress:   list.filter(s => matchesTab(s, 'progress')).length,
      completed:  list.filter(s => matchesTab(s, 'completed')).length,
    };
  }, [vm.shipments]);

  const tabbed = useMemo(() => vm.visible.filter(s => matchesTab(s, tab)), [vm.visible, tab]);
  const pageCount = Math.max(1, Math.ceil(tabbed.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const paged = tabbed.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const changeTab = (t: TabKey) => { setTab(t); setPage(1); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: UI.bg }}>

      {/* Header */}
      <div style={{ flexShrink: 0, backgroundColor: UI.surface, borderBottom: `1px solid ${UI.border}`,
        padding: '18px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: UI.ink }}>Shipments</div>
          <div style={{ fontSize: 12.5, color: UI.muted, marginTop: 2 }}>
            Manage and track all your import shipments in one place.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => vm.refresh()} disabled={vm.isLoading}
            style={{ padding: '9px 14px', borderRadius: UI.rSm, border: `1px solid ${UI.border}`, backgroundColor: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: UI.body }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" onClick={() => navigate('/purchased-orders/new')}
            style={{ padding: '9px 16px', borderRadius: UI.rSm, border: 'none', backgroundColor: UI.brand, color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Create Shipment
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* KPI row — three cards, each with a real business meaning */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <KpiCard label="Total Shipments" value={kpi.total} tone="neutral"
            icon={<Ship size={16} />} hint="Excludes cancelled" />
          <KpiCard label="In Progress" value={kpi.progress} tone="info"
            icon={<TrendingUp size={16} />} hint="Payment stages still open" />
          <KpiCard label="Completed" value={kpi.completed} tone="ok"
            icon={<CheckCircle2 size={16} />} hint="All 6 payment stages done" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${UI.border}`, paddingBottom: 0 }}>
          {([
            ['all', `All (${kpi.total})`],
            ['progress', `In Progress (${kpi.progress})`],
            ['completed', `Completed (${kpi.completed})`],
          ] as [TabKey, string][]).map(([key, label]) => {
            const active = tab === key;
            return (
              <button key={key} type="button" onClick={() => changeTab(key)}
                style={{
                  padding: '9px 4px', marginBottom: -1, border: 'none', borderBottom: `2px solid ${active ? UI.brand : 'transparent'}`,
                  backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                  color: active ? UI.brand : UI.muted, marginRight: 14,
                }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Search + filters */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: UI.muted }} />
              <input type="text" value={vm.filters.search} onChange={e => { vm.setSearch(e.target.value); setPage(1); }}
                placeholder="Search shipment number, supplier, tracking..."
                style={{ ...inputStyle, paddingLeft: 30 }} />
            </div>
          </div>
          <select value={vm.filters.brand} onChange={e => { vm.setBrand(e.target.value); setPage(1); }}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="ALL">All brands</option>
            {vm.brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <button type="button" onClick={() => { vm.clearFilters(); setPage(1); }}
            style={{ padding: '8px 14px', borderRadius: UI.rSm, border: `1px solid ${UI.border}`, backgroundColor: '#fff',
              cursor: 'pointer', fontSize: 13, color: UI.body, height: 36, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={13} /> Clear
          </button>
        </div>

        {/* States */}
        {vm.isLoading && (
          <div style={{ backgroundColor: UI.surface, border: `1px solid ${UI.border}`, borderRadius: UI.r, textAlign: 'center', padding: 40, color: UI.muted }}>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <div style={{ fontSize: 13 }}>Loading shipments...</div>
          </div>
        )}

        {!vm.isLoading && vm.error && (
          <div style={{ backgroundColor: UI.dangerBg, border: `1px solid ${UI.dangerLine}`, borderRadius: UI.r, padding: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertTriangle size={17} color={UI.danger} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: UI.danger }}>Could not load shipments</div>
              <div style={{ fontSize: 12, color: UI.danger, marginTop: 2, opacity: .85 }}>{vm.error}</div>
            </div>
          </div>
        )}

        {!vm.isLoading && !vm.error && vm.visible.length === 0 && (
          <div style={{ backgroundColor: UI.surface, border: `1px solid ${UI.border}`, borderRadius: UI.r, textAlign: 'center', padding: 46 }}>
            <Ship size={30} color={UI.faint} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: UI.ink, marginBottom: 4 }}>No shipments found</div>
            <div style={{ fontSize: 12, color: UI.muted, marginBottom: 16 }}>
              {vm.shipments.length === 0 ? 'Create your first import shipment to get started.' : 'No shipment matches the current filters.'}
            </div>
            <div style={{ display: 'inline-flex', gap: 8 }}>
              <button type="button" onClick={() => navigate('/purchased-orders/new')}
                style={{ padding: '9px 18px', borderRadius: UI.rSm, border: 'none', backgroundColor: UI.brand, color: '#fff',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={15} /> Create Shipment
              </button>
              {vm.shipments.length === 0 && (
                <button type="button" onClick={loadDemo} disabled={seeding}
                  style={{ padding: '9px 18px', borderRadius: UI.rSm, border: `1px solid ${UI.faint}`, backgroundColor: '#fff',
                    color: UI.body, fontWeight: 700, fontSize: 13, cursor: seeding ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {seeding
                    ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading…</>
                    : <>Load demo data</>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        {!vm.isLoading && !vm.error && vm.visible.length > 0 && (
          <div style={{ backgroundColor: UI.surface, border: `1px solid ${UI.border}`, borderRadius: UI.r, overflow: 'hidden' }}>
            {tabbed.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: UI.muted, fontSize: 13 }}>
                No shipments in this view.
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${UI.border}`, backgroundColor: '#fafbfc' }}>
                        {['#', 'Shipment No.', 'PO No.', 'Supplier', 'Destination', 'Progress', 'Landed Cost', ''].map((h, i) => (
                          <th key={i} style={{
                            padding: '10px', fontSize: 10.5, fontWeight: 700, color: UI.muted,
                            textTransform: 'uppercase', letterSpacing: '.04em', textAlign: i === 6 ? 'right' : 'left',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((s, i) => (
                        <ShipmentRow key={s.id} s={s} view={view} rowNumber={(pageSafe - 1) * PAGE_SIZE + i + 1}
                          onOpen={() => navigate(`/purchased-orders/${s.id}`)}
                          onDelete={() => setConfirmId(s.id)} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderTop: `1px solid ${UI.hair}` }}>
                  <span style={{ fontSize: 12, color: UI.muted }}>
                    Showing {(pageSafe - 1) * PAGE_SIZE + 1} to {Math.min(pageSafe * PAGE_SIZE, tabbed.length)} of {tabbed.length} shipments
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button type="button" disabled={pageSafe <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                      style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${UI.border}`, backgroundColor: '#fff',
                        cursor: pageSafe <= 1 ? 'default' : 'pointer', opacity: pageSafe <= 1 ? .4 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1)
                      .filter(n => n === 1 || n === pageCount || Math.abs(n - pageSafe) <= 1)
                      .map((n, idx, arr) => (
                        <React.Fragment key={n}>
                          {idx > 0 && arr[idx - 1] !== n - 1 && <span style={{ color: UI.faint, fontSize: 12, padding: '0 2px' }}>…</span>}
                          <button type="button" onClick={() => setPage(n)}
                            style={{ minWidth: 28, height: 28, borderRadius: 6, border: `1px solid ${n === pageSafe ? UI.brand : UI.border}`,
                              backgroundColor: n === pageSafe ? UI.brand : '#fff', color: n === pageSafe ? '#fff' : UI.body,
                              cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                            {n}
                          </button>
                        </React.Fragment>
                      ))}
                    <button type="button" disabled={pageSafe >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                      style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${UI.border}`, backgroundColor: '#fff',
                        cursor: pageSafe >= pageCount ? 'default' : 'pointer', opacity: pageSafe >= pageCount ? .4 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {confirmId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setConfirmId(null)}>
          <div style={{ backgroundColor: UI.surface, border: `1px solid ${UI.border}`, borderRadius: UI.r, padding: '18px 20px', width: 380 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: UI.ink }}>Delete shipment?</div>
              <button type="button" onClick={() => setConfirmId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: UI.muted }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 13, color: UI.muted, margin: '0 0 16px' }}>
              This removes the shipment and its costing. It cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmId(null)}
                style={{ padding: '8px 16px', borderRadius: UI.rSm, border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button type="button" onClick={() => { vm.removeShipment(confirmId); setConfirmId(null); }}
                style={{ padding: '8px 16px', borderRadius: UI.rSm, border: 'none', backgroundColor: UI.danger, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
