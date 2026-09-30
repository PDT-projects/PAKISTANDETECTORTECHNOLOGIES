// Inventory Module - View Layer
// DamagedInventoryView

import React from 'react';
import { ArrowLeft, AlertTriangle, Search, Loader2, Download } from 'lucide-react';
import { DamagedProduct } from '../models/types';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../../shared/reportExport/reportExport';

interface Props {
  filteredRecords: DamagedProduct[];
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  onBack: () => void;
  totalCount: number;
}

export const DamagedInventoryView: React.FC<Props> = ({ filteredRecords, isLoading, error, search, setSearch, onBack, totalCount }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>
    <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={17} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Damaged Inventory</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{totalCount} damaged item(s) archived</div>
        </div>
        <button
          onClick={() => {
            const rows = filteredRecords.map(r => [
              r.brandName, r.modelName, r.serialNumber, r.location || '—',
              r.reason || '—', r.damagedAt ? new Date(r.damagedAt).toLocaleString() : '—',
            ]);
            exportReportToExcel({
              title: 'Damaged Inventory',
              subtitle: `${totalCount} item(s)`,
              columns: ['Brand', 'Model', 'Serial', 'Location', 'Reason', 'Damaged At'].map(h => ({ header: h })),
              rows,
              filename: `damaged-inventory-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          disabled={filteredRecords.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e2e8f0',
            borderRadius: 9, backgroundColor: '#fff', color: '#334155', fontSize: 13, fontWeight: 600,
            cursor: filteredRecords.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredRecords.length === 0 ? 0.5 : 1,
            whiteSpace: 'nowrap' }}>
          <Download size={14} /> Excel
        </button>
        <button
          onClick={() => {
            const rows = filteredRecords.map(r => [
              r.brandName, r.modelName, r.serialNumber, r.location || '—',
              r.reason || '—', r.damagedAt ? new Date(r.damagedAt).toLocaleString() : '—',
            ]);
            exportReportToPdf({
              title: 'Damaged Inventory',
              subtitle: `${totalCount} item(s)`,
              columns: ['Brand', 'Model', 'Serial', 'Location', 'Reason', 'Damaged At'].map(h => ({ header: h })),
              rows,
              filename: `damaged-inventory-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          disabled={filteredRecords.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e2e8f0',
            borderRadius: 9, backgroundColor: '#fff', color: '#334155', fontSize: 13, fontWeight: 600,
            cursor: filteredRecords.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredRecords.length === 0 ? 0.5 : 1,
            whiteSpace: 'nowrap' }}>
          <Download size={14} /> PDF
        </button>
      </div>
    </div>

    <div style={{ padding: '14px 24px' }}>
      <div style={{ position: 'relative', maxWidth: 320 }}>
        <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brand, model, serial…"
          style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' }} />
      </div>
    </div>

    <div style={{ flex: 1, overflow: 'hidden', padding: '0 24px 24px', display: 'flex', flexDirection: 'column' }}>
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
        </div>
      ) : error ? (
        <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>
      ) : filteredRecords.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>No damaged inventory records.</div>
      ) : (
        <LockedScrollTable maxHeight="65vh">
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['Brand', 'Model', 'Serial', 'Location', 'Reason', 'Damaged At'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{r.brandName}</td>
                <td style={{ padding: '10px 14px', fontSize: 13 }}>{r.modelName}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: 'monospace' }}>{r.serialNumber}</td>
                <td style={{ padding: '10px 14px', fontSize: 13 }}>{r.location || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#6b7280' }}>{r.reason || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#6b7280' }}>{r.damagedAt ? new Date(r.damagedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </LockedScrollTable>
      )}
    </div>
  </div>
);