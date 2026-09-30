// Shipment Module — shared dashboard UI primitives
//
// Every visual choice here reads off real, already-computed shipment state
// (shipmentPriority, shipmentWorkflow, ShipmentSummary) — nothing is a fresh
// business rule invented for the redesign. See PurchasedOrdersView.tsx and
// ShipmentDetailsView.tsx for how these are wired to actual data.

import React from 'react';
import { Check, Clock, AlertTriangle, Lock, TrendingUp } from 'lucide-react';
import { Shipment } from '../models/types';
import { shipmentPriority, PRIORITY_LABEL, shipmentWorkflow } from '../models/purchasedOrderService';

// ── Shared tokens ────────────────────────────────────────────────────────────
// Same palette ShipmentDetailsView already uses (T), plus one addition —
// `info` — for the "actively moving, nothing wrong" state that palette didn't
// need before but a list of many shipments does.
export const UI = {
  bg:      '#f6f8fb',
  surface: '#ffffff',
  border:  '#e6eaf0',
  hair:    '#f1f5f9',

  ink:     '#0f172a',
  body:    '#475569',
  muted:   '#94a3b8',
  faint:   '#cbd5e1',

  brand:    '#1e3a8a',
  brandBg:  '#eff6ff',
  info:     '#1d4ed8',
  infoBg:   '#eff6ff',
  infoLine: '#bfdbfe',
  ok:       '#15803d',
  okBg:     '#f0fdf4',
  okLine:   '#bbf7d0',
  warn:     '#b45309',
  warnBg:   '#fffbeb',
  warnLine: '#fde68a',
  danger:   '#b91c1c',
  dangerBg: '#fef2f2',
  dangerLine: '#fecaca',

  r:   12,
  rSm: 8,
} as const;

// ── Status badge ─────────────────────────────────────────────────────────────
// Priority (shipmentPriority/PRIORITY_LABEL) rather than the raw lifecycle
// status: "Costing due" tells you what to do next; "Arrived" only tells you
// where the box is. Both are real fields — this one is just more useful on a
// list a person is scanning for what needs them.
const PRIORITY_TONE: Record<number, { fg: string; bg: string; line: string; Icon: typeof Check }> = {
  1:  { fg: UI.danger, bg: UI.dangerBg, line: UI.dangerLine, Icon: AlertTriangle },
  2:  { fg: UI.warn,   bg: UI.warnBg,   line: UI.warnLine,   Icon: Clock },
  3:  { fg: UI.warn,   bg: UI.warnBg,   line: UI.warnLine,   Icon: Clock },
  4:  { fg: UI.ok,     bg: UI.okBg,     line: UI.okLine,     Icon: Check },
  5:  { fg: UI.info,   bg: UI.infoBg,   line: UI.infoLine,   Icon: TrendingUp },
  90: { fg: UI.body,   bg: UI.hair,     line: UI.border,     Icon: Check },
  99: { fg: UI.muted,  bg: UI.hair,     line: UI.border,     Icon: Clock },
};

export function ShipmentStatusBadge({ shipment, compact }: { shipment: Shipment; compact?: boolean }) {
  const p = shipmentPriority(shipment);
  const tone = PRIORITY_TONE[p] || PRIORITY_TONE[5];
  const { Icon } = tone;
  // Priorities 1–4 are genuinely payment-workflow stages (they all require
  // the shipment to have arrived first, so "what's still owed" is the right
  // thing to show). Priority 5 is everything BEFORE that — it used to always
  // read "In transit" regardless of whether the shipment had even shipped
  // yet, which quietly implied an arrived/not-arrived judgement the data
  // doesn't actually make. Showing the shipment's own real status (Draft,
  // Ordered, Dispatched, In Transit — whichever it actually is) here instead
  // says only what's known, not a guess about arrival.
  const label = (p === 1 || p === 2 || p === 3 || p === 4)
    ? PRIORITY_LABEL[p]
    : (p === 90 || p === 99)
      ? PRIORITY_LABEL[p]
      : (shipment.status || PRIORITY_LABEL[5]);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: compact ? 10.5 : 11.5, fontWeight: 700,
      padding: compact ? '3px 8px' : '4px 10px', borderRadius: 20,
      color: tone.fg, backgroundColor: tone.bg, border: `1px solid ${tone.line}`,
      whiteSpace: 'nowrap',
    }}>
      <Icon size={compact ? 10 : 11.5} />
      {label}
    </span>
  );
}

// ── Progress bar (X / 6) ─────────────────────────────────────────────────────
// Reads shipmentWorkflow(s) — the same six real gates (Customs/Freight/Tax/
// Other paid, Costing finalised, Supplier paid) the Detail page's payment
// timeline uses. A shipment's progress can never disagree with itself between
// the list and the detail page, because both read the same function.
export function useShipmentProgress(shipment: Shipment) {
  const stages = shipmentWorkflow(shipment);
  const done = stages.filter(s => s.state === 'Completed').length;
  return { stages, done, total: stages.length };
}

export function ShipmentProgressBar({ shipment, showLabel = true }: { shipment: Shipment; showLabel?: boolean }) {
  const { done, total } = useShipmentProgress(shipment);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = done === total ? UI.ok : done === 0 ? UI.faint : UI.info;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, backgroundColor: UI.hair, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 99, transition: 'width .2s' }} />
      </div>
      {showLabel && (
        <span style={{ fontSize: 11, fontWeight: 700, color: UI.body, minWidth: 30, textAlign: 'right' }}>
          {done}/{total}
        </span>
      )}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, icon, tone = 'neutral', hint }: {
  label: string; value: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'neutral' | 'info' | 'ok' | 'warn' | 'danger';
  hint?: string;
}) {
  const toneMap = {
    neutral: { fg: UI.ink,   bg: UI.hair,   line: UI.border },
    info:    { fg: UI.info,  bg: UI.infoBg, line: UI.infoLine },
    ok:      { fg: UI.ok,    bg: UI.okBg,   line: UI.okLine },
    warn:    { fg: UI.warn,  bg: UI.warnBg, line: UI.warnLine },
    danger:  { fg: UI.danger,bg: UI.dangerBg, line: UI.dangerLine },
  }[tone];
  return (
    <div style={{
      backgroundColor: UI.surface, border: `1px solid ${UI.border}`, borderRadius: UI.r,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: UI.muted }}>{label}</span>
        <div style={{
          width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: toneMap.bg, color: toneMap.fg,
        }}>
          {icon}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: UI.ink, lineHeight: 1 }}>{value}</span>
      </div>
      {hint && <span style={{ fontSize: 11, color: UI.muted }}>{hint}</span>}
    </div>
  );
}

// ── Lifecycle timeline (Detail page header) ─────────────────────────────────
// The real ShipmentStatus has nine values because the data needs that much
// precision, but four groups are what a person scans in a header. Each group
// below is a strict grouping of real status values — nothing is inferred
// from dates or other fields, and Cancelled is handled by the caller (it
// doesn't belong on a forward-moving timeline at all).
const LIFECYCLE_GROUPS: { label: string; statuses: string[] }[] = [
  { label: 'Order Created', statuses: ['Draft', 'Ordered'] },
  { label: 'In Transit',    statuses: ['Dispatched', 'In Transit'] },
  { label: 'Customs',       statuses: ['Arrived', 'Customs Cleared'] },
  { label: 'Delivered',     statuses: ['Costing Complete', 'Received Into Inventory'] },
];

export function ShipmentLifecycleTimeline({ status }: { status: string }) {
  const currentIndex = LIFECYCLE_GROUPS.findIndex(g => g.statuses.includes(status));
  // Cancelled (or any status this grouping doesn't recognise) has no
  // meaningful position on a forward timeline — showing it as "stuck" at
  // some stage would misrepresent it, so the timeline simply doesn't render.
  if (currentIndex === -1) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      {LIFECYCLE_GROUPS.map((g, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
        const dotColor = state === 'upcoming' ? UI.faint : UI.ok;
        const lineColor = i < currentIndex ? UI.ok : UI.hair;
        return (
          <React.Fragment key={g.label}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{
                width: state === 'current' ? 14 : 10, height: state === 'current' ? 14 : 10, borderRadius: '50%',
                backgroundColor: state === 'upcoming' ? UI.surface : dotColor,
                border: `2px solid ${state === 'upcoming' ? UI.faint : dotColor}`,
                boxShadow: state === 'current' ? `0 0 0 3px ${UI.okBg}` : 'none',
              }} />
              <span style={{ fontSize: 10.5, fontWeight: state === 'upcoming' ? 500 : 700,
                color: state === 'upcoming' ? UI.muted : UI.ink, whiteSpace: 'nowrap' }}>
                {g.label}
              </span>
            </div>
            {i < LIFECYCLE_GROUPS.length - 1 && (
              <div style={{ flex: 1, height: 2, backgroundColor: lineColor, margin: '0 6px 16px' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Locked payment row (used on the Detail page's Payment Status card) ──────
export function LockedPaymentRow({ label, amountText, closedAt, state }: {
  label: string;
  amountText: string;
  closedAt?: string;
  state: 'locked' | 'pending';
}) {
  const locked = state === 'locked';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px', borderRadius: UI.rSm,
      backgroundColor: locked ? UI.okBg : UI.hair,
      border: `1px solid ${locked ? UI.okLine : UI.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {locked ? <Check size={15} color={UI.ok} /> : <Clock size={15} color={UI.muted} />}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink }}>{label}</div>
          {closedAt && <div style={{ fontSize: 10.5, color: UI.muted, marginTop: 1 }}>{closedAt}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: locked ? UI.ok : UI.body, fontVariantNumeric: 'tabular-nums' }}>
          {amountText}
        </span>
        {locked ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700,
            color: UI.ok, backgroundColor: UI.surface, border: `1px solid ${UI.okLine}`, borderRadius: 20, padding: '2px 7px' }}>
            <Lock size={9} /> Locked
          </span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 700, color: UI.muted, backgroundColor: UI.surface,
            border: `1px solid ${UI.border}`, borderRadius: 20, padding: '2px 7px' }}>
            Pending
          </span>
        )}
      </div>
    </div>
  );
}
