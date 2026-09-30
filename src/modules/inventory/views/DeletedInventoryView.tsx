// Inventory Module - View Layer
// DeletedInventoryView — Shows all soft-deleted inventory records
// FIX: Now accepts props from useDeletedInventoryViewModel (passed by the page/route)
//      instead of fetching data itself — keeps the View as a pure presentation layer.
// Each record shows who deleted it, when, and the original product details.

import React from 'react';
import { ArrowLeft, Trash2, User, Calendar, Package, MapPin, Search, Eye, X } from 'lucide-react';
import { DeletedProduct } from '../models/InventoryFirebaseService';
import { InventoryService } from '../models/inventoryService';

interface DeletedInventoryViewProps {
  records: DeletedProduct[];
  filteredRecords: DeletedProduct[];
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  viewItem: DeletedProduct | null;
  setViewItem: (item: DeletedProduct | null) => void;
  onBack: () => void;
  totalCount: number;
}

function getDisplayLocation(product: DeletedProduct): string {
  if (product.location) return product.location;
  const cities = Object.values(product.serialCities || {}).filter(Boolean);
  if (cities.length === 0) return '—';
  const freq: Record<string, number> = {};
  cities.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PK', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function DeletedInventoryView({
  filteredRecords, isLoading, error, search, setSearch,
  viewItem, setViewItem, onBack,
}: DeletedInventoryViewProps) {
  const fmt = InventoryService.formatCurrency;

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: '#f8fafc', padding: '28px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0',
            backgroundColor: '#fff', cursor: 'pointer', flexShrink: 0,
          }}
          title="Back">
          <ArrowLeft size={18} color="#374151" />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, backgroundColor: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, border: '1px solid #fecaca',
          }}>
            <Trash2 size={20} color="#b91c1c" />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Deleted Inventory</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0, marginTop: 2 }}>
              Archived records of removed inventory items — read-only
            </p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', maxWidth: 360, marginBottom: 20 }}>
        <Search size={14} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search brand, model, deleted by…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
            border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none',
            backgroundColor: '#fff', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 10, color: '#9ca3af' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#b91c1c', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: 13 }}>Loading deleted records…</span>
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10, color: '#9ca3af' }}>
          <Trash2 size={40} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: 13 }}>{search ? 'No matching records' : 'No deleted inventory yet'}</span>
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.8fr 1.2fr 1fr 0.8fr 1.4fr 1.6fr 80px',
            gap: 0, backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0', padding: '10px 16px',
          }}>
            {['Product', 'Category', 'Location', 'Stock', 'Deleted By', 'Deleted At', ''].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          {filteredRecords.map((item, idx) => (
            <div
              key={item._archiveId}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr 1.2fr 1fr 0.8fr 1.4fr 1.6fr 80px',
                gap: 0,
                padding: '12px 16px',
                borderBottom: idx < filteredRecords.length - 1 ? '1px solid #f1f5f9' : 'none',
                alignItems: 'center',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fef2f2')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {/* Product */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{item.brandName} {item.modelName}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>{item.originalId}</div>
              </div>

              {/* Category */}
              <div style={{ fontSize: 12, color: '#64748b' }}>{item.category}</div>

              {/* Location */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                <MapPin size={11} color="#94a3b8" />
                {getDisplayLocation(item)}
              </div>

              {/* Stock */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, backgroundColor: '#f1f5f9', color: '#374151' }}>
                  {item.stock} units
                </span>
              </div>

              {/* Deleted By */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={12} color="#b91c1c" />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{item.deletedByName}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{item.deletedByEmail}</div>
                </div>
              </div>

              {/* Deleted At */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6b7280' }}>
                <Calendar size={11} color="#94a3b8" />
                {formatDate(item.deletedAt)}
              </div>

              {/* Actions */}
              <div>
                <button
                  onClick={() => setViewItem(item)}
                  style={{ padding: '5px', borderRadius: 6, border: 'none', backgroundColor: 'transparent', cursor: 'pointer', color: '#94a3b8', transition: 'all 0.1s' }}
                  title="View details"
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fee2e2';
                    (e.currentTarget as HTMLButtonElement).style.color = '#b91c1c';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
                  }}
                >
                  <Eye size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary footer */}
      {!isLoading && !error && filteredRecords.length > 0 && (
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 12, textAlign: 'right' }}>
          {filteredRecords.length} deleted record{filteredRecords.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
      )}

      {/* Detail Modal */}
      {viewItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #fee2e2', backgroundColor: '#fef2f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Trash2 size={16} color="#b91c1c" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>Deleted Inventory Record</span>
              </div>
              <button
                onClick={() => setViewItem(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 6 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Deletion info banner */}
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deletion Record</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    ['Deleted By', viewItem.deletedByName],
                    ['Account',    viewItem.deletedByEmail],
                    ['Deleted At', formatDate(viewItem.deletedAt)],
                    ['Original ID', viewItem.originalId],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p style={{ fontSize: 10, color: '#f87171', margin: '0 0 2px 0', fontWeight: 600 }}>{label}</p>
                      <p style={{ fontSize: 12, color: '#7f1d1d', margin: 0, fontFamily: label === 'Original ID' || label === 'Account' ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
                        {value || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Product details */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Product Details</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    ['Brand',      viewItem.brandName],
                    ['Model',      viewItem.modelName],
                    ['Category',   viewItem.category],
                    ['Status',     viewItem.status],
                    ['Stock',      `${viewItem.stock} units`],
                    ['Location',   getDisplayLocation(viewItem)],
                    ['Cost Price', fmt(viewItem.costPrice)],
                    ['Sell Price', fmt(viewItem.sellPrice)],
                    ['Warranty',   `${viewItem.warrantyYears} yr${viewItem.warrantyYears !== 1 ? 's' : ''}`],
                    ['Buy Type',   viewItem.buyType],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: '8px 10px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                      <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 2px 0', fontWeight: 600 }}>{label}</p>
                      <p style={{ fontSize: 12, color: '#1e293b', margin: 0, fontWeight: 600 }}>{value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Serial numbers */}
              {viewItem.serialNumbers.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Serial Numbers ({viewItem.serialNumbers.length})
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {viewItem.serialNumbers.map(s => (
                      <span key={s} style={{ fontSize: 11, fontFamily: 'monospace', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 8px', color: '#475569' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {viewItem.description && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{viewItem.description}</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid #f1f5f9', backgroundColor: '#fafafa' }}>
              <button
                onClick={() => setViewItem(null)}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}