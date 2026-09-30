// Inventory Module - Wrapper
// ProductTransferCreateWrapper
//
// Now a tabbed container: the "Transfer" tile on the inventory dashboard
// opens this and users can switch between:
//   • New Transfer  → the existing ProductTransferCreateView form
//   • Transfer Report → a compact inline table of past transfers, with
//                      Mark-as-Received action for In-Transit rows.
//
// The report reuses `useProductTransferViewModel` (already fetches the full
// transfer collection via TransferFirebaseService.fetchAllTransfers) so no
// new service calls are needed.

import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Package, Loader2, Search, CheckCircle2, Truck, Clock, XCircle, Plus } from 'lucide-react';
import { useProductTransferCreateViewModel } from '../viewModels/useProductTransferCreateViewModel';
import { useProductTransferViewModel } from '../viewModels/useProductTransferViewModel';
import { ProductTransferCreateView } from './ProductTransferCreateView';
import { ProductTransfer } from '../models/types';

type Tab = 'report' | 'new';

export const ProductTransferCreateWrapper: React.FC = () => {
  // Default view is the Transfer Report — the "+ New Transfer" button
  // toggles to the create form. Everything stays in the popup; no route
  // changes happen when switching between views or after a save.
  const [tab, setTab] = useState<Tab>('report');

  // Bumped every time a transfer is saved. Used as a `key` on the report
  // section so it remounts and its VM refetches the transfer list — the
  // newly-created transfer then appears in the list right away.
  const [reportVersion, setReportVersion] = useState(0);

  const goToReport = React.useCallback(() => {
    setReportVersion(v => v + 1);
    setTab('report');
  }, []);

  const createVm = useProductTransferCreateViewModel({
    onSaveSuccess: goToReport,
    onCancel:      goToReport,
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      {/* Header bar. In REPORT mode it shows the title, stats summary, and a
          "+ New Transfer" button. In CREATE mode we hide the title (the create
          view has its own "New Product Transfer" header) and only show the
          "← Back to Report" toggle so users can flip back without leaving the
          popup.
          Right padding is bumped to leave room for the popup's absolutely
          positioned × close button (top:12, right:14, size:30) which lives
          on the parent portal in InventoryDashboardView. Without this the
          two buttons collide. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: tab === 'report' ? '14px 60px 14px 20px' : '10px 60px 10px 20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e2e8f0', flexShrink: 0,
      }}>
        {tab === 'report' ? (
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Product Transfers</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Move products between locations — serials removed from source, added on receipt
            </div>
          </div>
        ) : (
          <div />
        )}
        <button
          onClick={() => setTab(tab === 'report' ? 'new' : 'report')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 9,
            fontSize: 13, fontWeight: 700,
            border: 'none', cursor: 'pointer',
            backgroundColor: tab === 'report' ? '#0f172a' : '#f1f5f9',
            color:           tab === 'report' ? '#fff'    : '#0f172a',
            boxShadow: tab === 'report' ? '0 2px 6px rgba(15,23,42,0.25)' : 'none',
          }}
        >
          {tab === 'report' ? <><Plus size={14} /> New Transfer</> : <><ArrowLeft size={14} /> Back to Report</>}
        </button>
      </div>

      {/* Content — either the compact report or the create form.
          The report section owns its own VM instance; keying it on
          `reportVersion` forces a fresh mount (and thus a refetch) every
          time a transfer is saved, so the new row shows up immediately. */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'report'
          ? <TransferReportSectionContainer key={reportVersion} onNewTransferClick={() => setTab('new')} />
          : <ProductTransferCreateView {...createVm} />}
      </div>
    </div>
  );
};

// Thin container that owns the report VM — placed here so the wrapper can
// remount it via a `key` prop when a save happens elsewhere.
const TransferReportSectionContainer: React.FC<{ onNewTransferClick: () => void }> = ({ onNewTransferClick }) => {
  const vm = useProductTransferViewModel();
  return <TransferReportSection vm={vm} onNewTransferClick={onNewTransferClick} />;
};

// ── Compact Transfer Report section ────────────────────────────────────────
// Shows transfer history inline in the popup. Deliberately lighter than the
// full ProductTransferView page: no PDF download, no side details modal —
// just the essentials plus a Mark-Received button on In-Transit rows.
function TransferReportSection({ vm, onNewTransferClick }: {
  vm: ReturnType<typeof useProductTransferViewModel>;
  onNewTransferClick: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'In Transit' | 'Received' | 'Pending' | 'Cancelled'>('');

  // Receive-prompt state — opens when a Received button is clicked. Asks
  // for the recipient's name; on confirm, fires vm.handleMarkReceived
  // which does the inventory update (per-serial location + stock-in date
  // to today) and marks the transfer Received with the receiver name.
  const [receivingTransfer, setReceivingTransfer] = useState<ProductTransfer | null>(null);
  const [receiverName, setReceiverName] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);

  const openReceive  = (t: ProductTransfer) => { setReceivingTransfer(t); setReceiverName(''); };
  const closeReceive = () => { if (isReceiving) return; setReceivingTransfer(null); setReceiverName(''); };
  const confirmReceive = async () => {
    if (!receivingTransfer || !receiverName.trim() || isReceiving) return;
    setIsReceiving(true);
    try {
      await vm.handleMarkReceived(receivingTransfer, receiverName.trim());
      setReceivingTransfer(null);
      setReceiverName('');
    } finally {
      setIsReceiving(false);
    }
  };

  const filtered = vm.transfers.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (
        !((t.productName || '').toLowerCase().includes(s) ||
          (t.brandName   || '').toLowerCase().includes(s) ||
          (t.modelName   || '').toLowerCase().includes(s) ||
          (t.fromLocation|| '').toLowerCase().includes(s) ||
          (t.toLocation  || '').toLowerCase().includes(s) ||
          (t.transferredBy || '').toLowerCase().includes(s))
      ) return false;
    }
    return true;
  });

  if (vm.isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading transfers…
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      {/* Header removed — the wrapper already shows the title + stats.
          Stat pills stay here as a quick visual breakdown. */}

      {/* Stat pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatPill label="Total"     value={vm.stats.totalTransfers}     icon={<Truck size={13} />}         color="#334155" bg="#f1f5f9" />
        <StatPill label="In Transit" value={vm.stats.inTransitTransfers} icon={<Truck size={13} />}         color="#1d4ed8" bg="#eff6ff" />
        <StatPill label="Received"  value={vm.stats.receivedTransfers}  icon={<CheckCircle2 size={13} />}  color="#15803d" bg="#f0fdf4" />
        <StatPill label="Pending"   value={vm.stats.pendingTransfers}   icon={<Clock size={13} />}         color="#b45309" bg="#fffbeb" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product, brand, location, transferred by…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db',
              borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: '#fff',
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          style={{
            padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8,
            fontSize: 13, outline: 'none', backgroundColor: '#fff', cursor: 'pointer',
          }}
        >
          <option value="">All statuses</option>
          <option value="In Transit">In Transit</option>
          <option value="Received">Received</option>
          <option value="Pending">Pending</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{
          padding: 32, textAlign: 'center',
          backgroundColor: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
        }}>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: vm.transfers.length === 0 ? 14 : 0 }}>
            {vm.transfers.length === 0 ? 'No transfers yet.' : 'No transfers match the current filters.'}
          </div>
          {vm.transfers.length === 0 && (
            <button
              onClick={onNewTransferClick}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', borderRadius: 9,
                border: 'none', backgroundColor: '#0f172a', color: '#fff',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              <Plus size={13} /> Create your first transfer
            </button>
          )}
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                {['Date', 'Product', 'Route', 'Serials', 'By', 'Status', 'Action'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 700,
                    color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em',
                    borderBottom: '1px solid #e2e8f0',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const rowKey = t.id || `${t.productId}-${t.date}`;
                return (
                  <TransferRow key={rowKey} t={t} onOpenReceive={openReceive} formatDateTime={vm.formatDateTime} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Receive Prompt Modal ────────────────────────────────────────
          Opens when a Received button is clicked in any row. Asks for
          the receiver's name; on confirm, fires vm.handleMarkReceived
          which applies the per-serial location + stock-in-date update
          and marks the transfer Received. */}
      {receivingTransfer && (
        <div
          onClick={closeReceive}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)',
            zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.55)', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                backgroundColor: '#ecfdf5', color: '#059669',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Mark as Received</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Confirm who received {receivingTransfer.brandName} {receivingTransfer.modelName} at {receivingTransfer.toLocation}.
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                  Receiver's Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  autoFocus
                  value={receiverName}
                  onChange={e => setReceiverName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && receiverName.trim()) confirmReceive();
                    else if (e.key === 'Escape') closeReceive();
                  }}
                  disabled={isReceiving}
                  placeholder="Enter the recipient's full name"
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 14,
                    border: '2px solid #e2e8f0', borderRadius: 8, outline: 'none',
                    opacity: isReceiving ? 0.6 : 1,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{
                padding: '10px 12px', borderRadius: 8,
                backgroundColor: '#eff6ff', border: '1px solid #dbeafe',
                fontSize: 11.5, color: '#1e40af', lineHeight: 1.5,
              }}>
                On confirm: the stock-in date and location for the transferred serials will be updated
                to today (<b>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</b>)
                and this transfer will be marked <b>Received</b>.
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={closeReceive}
                disabled={isReceiving}
                style={{
                  padding: '9px 16px', fontSize: 12.5, fontWeight: 700,
                  color: '#334155', backgroundColor: '#fff',
                  border: '1px solid #e2e8f0', borderRadius: 8,
                  cursor: isReceiving ? 'not-allowed' : 'pointer',
                  opacity: isReceiving ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmReceive}
                disabled={!receiverName.trim() || isReceiving}
                style={{
                  padding: '9px 20px', fontSize: 12.5, fontWeight: 800,
                  color: '#fff', backgroundColor: (!receiverName.trim() || isReceiving) ? '#94a3b8' : '#059669',
                  border: 'none', borderRadius: 8,
                  cursor: (!receiverName.trim() || isReceiving) ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                {isReceiving
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Confirming…</>
                  : <><CheckCircle2 size={13} /> Confirm Receipt</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Row + helpers ──────────────────────────────────────────────────────────
interface TransferRowProps {
  t: ProductTransfer;
  onOpenReceive: (t: ProductTransfer) => void;
  formatDateTime: (d: string) => string;
}
const TransferRow: React.FC<TransferRowProps> = ({ t, onOpenReceive, formatDateTime }) => {
  const serials = t.serialNumbers || [];

  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#334155', whiteSpace: 'nowrap' }}>
        {formatDateTime(t.date || t.transferDate || '')}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Package size={12} color="#94a3b8" />
          <span style={{ fontWeight: 600, color: '#0f172a' }}>{t.productName || `${t.brandName || ''} ${t.modelName || ''}`.trim() || '—'}</span>
        </div>
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
          <span style={{ padding: '2px 8px', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: 99, fontWeight: 600 }}>{t.fromLocation}</span>
          <ArrowRight size={11} color="#94a3b8" />
          <span style={{ padding: '2px 8px', backgroundColor: '#f0fdf4', color: '#15803d', borderRadius: 99, fontWeight: 600 }}>{t.toLocation}</span>
        </div>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: 180 }}>
          {serials.slice(0, 2).map(s => (
            <span key={s} style={{ padding: '1px 6px', backgroundColor: '#f1f5f9', color: '#1e293b', borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }}>
              {s}
            </span>
          ))}
          {serials.length > 2 && (
            <span style={{ fontSize: 10, color: '#94a3b8' }}>+{serials.length - 2}</span>
          )}
          {serials.length === 0 && <span style={{ color: '#94a3b8', fontSize: 11 }}>{t.quantity} units</span>}
        </div>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
        {t.transferredBy || '—'}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <StatusBadge status={t.status} />
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        {t.status === 'In Transit' && (
          <button
            onClick={() => onOpenReceive(t)}
            style={{
              padding: '5px 11px', fontSize: 11, fontWeight: 700, borderRadius: 6,
              border: 'none', backgroundColor: '#15803d', color: '#fff',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <CheckCircle2 size={11} /> Received
          </button>
        )}
      </td>
    </tr>
  );
};

function StatusBadge({ status }: { status: ProductTransfer['status'] }) {
  const map: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    'In Transit': { bg: '#eff6ff', color: '#1d4ed8', icon: <Truck size={10} /> },
    'Received':   { bg: '#f0fdf4', color: '#15803d', icon: <CheckCircle2 size={10} /> },
    'Pending':    { bg: '#fffbeb', color: '#b45309', icon: <Clock size={10} /> },
    'Cancelled':  { bg: '#fef2f2', color: '#b91c1c', icon: <XCircle size={10} /> },
  };
  const s = map[status] || map['Pending'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
      backgroundColor: s.bg, color: s.color,
    }}>
      {s.icon} {status}
    </span>
  );
}

function StatPill({ label, value, icon, color, bg }: {
  label: string; value: number; icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '7px 12px', borderRadius: 10, backgroundColor: bg,
      border: `1px solid ${color}22`,
    }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{label}:</span>
      <span style={{ fontSize: 13, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}