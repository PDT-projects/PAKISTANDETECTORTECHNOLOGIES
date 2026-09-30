// Purchased Orders — business logic layer
//
// Pure functions only. No Firestore, no React. The costing engine, the display
// conversion, the priority rule and the validators all live here so the same
// numbers come out on a card, a detail page or an export, and so they can be
// tested without a browser.

import {
  Shipment, CostedLine, ShipmentCosting, ShipmentSummary, ShipmentFilters,
  ShipmentLine, DisplayCurrency, UnitOfMeasure, ShipmentCharge, ChargeKind, CHARGE_KINDS, StockBatch} from './types';

// ── Currency ──────────────────────────────────────────────────────────────────

/**
 * Units of each currency per 1 AED, used for DISPLAY ONLY.
 *
 * These never touch stored data. A shipment's own `exchangeRate` — frozen on
 * the document at entry — is what converts the supplier invoice into AED. If
 * these display rates drift, a closed shipment's AED figures stay exactly as
 * they were; only the on-screen conversion moves.
 *
 * Kept as a fallback only — convertForDisplay() below now goes through the
 * app's live rate feed (the same one the Admin's global currency selector
 * uses) instead of this frozen snapshot, so it never goes stale.
 */
export const DISPLAY_RATES: Record<DisplayCurrency, number> = {
  AED: 1,
  USD: 1 / 3.67,
  EUR: 1 / 3.95,
  GBP: 1 / 4.62,
  SAR: 1.02,
  PKR: 279.5 / 3.67,
  CAD: 1 / 2.70,
};

export const CURRENCY_SYMBOL: Record<DisplayCurrency, string> = {
  AED: 'AED', USD: 'USD', EUR: 'EUR', GBP: 'GBP', SAR: 'SAR', PKR: 'PKR', CAD: 'CA$',
};

/**
 * Round to 2dp ONCE, at the end.
 *
 * Intermediate values stay at full precision deliberately. Rounding each
 * allocation as it is computed lets the error accumulate, and the per-line
 * landed costs then stop summing to the shipment total — the exact drift that
 * makes an import costing sheet untrustworthy.
 */
export const round2 = (n: number): number =>
  Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;

/** Display-only passthrough — the AED figure is shown as-is, just with a
 *  different currency symbol next to it (see money() below). No conversion
 *  happens anywhere in this function. */
export const convertForDisplay = (aed: number, to: DisplayCurrency): number => round2(aed);

export const fmt = (n: number, min = 2) =>
  round2(n).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: 2 });

/** Format a stored AED figure in the viewing currency. */
export const money = (aed: number, to: DisplayCurrency = 'AED'): string =>
  `${CURRENCY_SYMBOL[to]} ${fmt(convertForDisplay(aed, to))}`;

/** Format a figure that is already in the shipment's own invoice currency. */
export const moneyRaw = (n: number, code: string): string => `${code} ${fmt(n)}`;

/** AED with two decimals. Legacy — kept only for anything still importing it
 *  from this module's barrel export. The goods-received PDF now uses its own
 *  fmtGlobal() (goodsReceivedPdf.ts), which reads the live global currency
 *  symbol instead of always printing AED. */
export const fmtAed = (n: number): string => `AED ${fmt(n)}`;

// ── Receiving ─────────────────────────────────────────────────────────────────

/**
 * Whether receiving can be finalised.
 *
 * A short delivery is finalised on purpose — a supplier shipping 45 of 50 has
 * finished delivering, and the shortfall is recorded rather than treated as an
 * error. What is refused is finalising nothing at all, which would produce a
 * receiving note listing no goods.
 */
export function canFinaliseReceiving(s: Shipment): { allowed: boolean; reason?: string } {
  if (s.receivingStatus === 'Complete') return { allowed: false, reason: 'Receiving is already finalised' };
  if (s.status === 'Cancelled')         return { allowed: false, reason: 'This shipment is cancelled' };
  if (!(s.lines || []).length)          return { allowed: false, reason: 'There are no lines to receive' };

  // No quantity check. A shipment either arrived or it did not — partial
  // receipt is no longer tracked, because the figure it fed (what the supplier
  // is owed) now comes from the costing sheet, and two sources for one number
  // is what makes them disagree.
  return { allowed: true };
}

/**
 * What the supplier is owed for this shipment.
 *
 * Goods only, at received quantity.
 *
 * Received rather than ordered because you pay for what arrived — a short
 * delivery is a claim against the supplier, not a debt to them. Raising a
 * received quantity therefore raises what is owed, and the figure in the
 * payment picker moves with it.
 *
 * Goods only because customs and freight go to the clearing agent and the
 * government. Paying the supplier the landed value would settle that duty
 * twice: once where it was due and once here.
 */
export function supplierPayable(s: Pick<Shipment, 'lines' | 'currency' | 'exchangeRate'>): number {
  // Read from the costing sheet rather than recomputed here. Every figure the
  // module shows comes from one calculation, so the picker, the panel and the
  // sheet cannot drift apart — they are the same number, not two that ought to
  // agree.
  //
  // purchaseNetBase is goods only, in AED. Customs and freight go to the
  // clearing agent and the government; paying the supplier the landed value
  // would settle that duty twice.
  const c = calculateShipmentCosting({
    lines: s.lines || [],
    currency: (s as any).currency || 'AED',
    exchangeRate: (s as any).exchangeRate ?? 1,
    freightAmount: 0, customsAmount: 0, otherCharges: 0, salesTaxAmount: 0,
  });
  return c.purchaseNetBase;
}

/** Owed minus paid. Zero means settled, and the shipment drops out of the picker. */
export function supplierRemaining(
  s: Pick<Shipment, 'lines' | 'currency' | 'exchangeRate'> & { supplierPaidAmount?: number },
): number {
  return round2(Math.max(0, supplierPayable(s) - (Number(s.supplierPaidAmount) || 0)));
}

/** True once receiving is finalised — quantities and charges stop being editable. */
export const isReceivingLocked = (s: Shipment | null): boolean =>
  !!s && s.receivingStatus === 'Complete';

/** Pending, Partial or Complete, derived from the numbers for display only. */
export function receivingProgress(s: Shipment): { label: string; received: number; ordered: number } {
  const ordered  = (s.lines || []).reduce((a, l) => a + (Number(l.quantity) || 0), 0);
  const label = s.receivingStatus === 'Complete' ? 'Received' : 'Not received';
  return { label, received: s.receivingStatus === 'Complete' ? ordered : 0, ordered };
}

export const pct = (n: number): string => `${(n * 100).toFixed(3)}%`;

// ── Costing engine ────────────────────────────────────────────────────────────

/**
 * Compute the landed cost of a shipment and of every line in it, in AED.
 *
 *   grossTotal_i     = quantity_i x unitPrice_i                (invoice currency)
 *   netTotal_i       = grossTotal_i - discount_i
 *   netTotalBase_i   = netTotal_i x exchangeRate               (AED)
 *   share_i          = netTotalBase_i / purchaseNetBase
 *   freightShare_i   = freightBase x share_i
 *   customsShare_i   = customsBase x share_i
 *   otherShare_i     = (otherBase + taxBase) x share_i
 *   landedTotal_i    = netTotalBase_i + the three shares
 *   landedUnitCost_i = landedTotal_i / quantity_i
 *
 * The shares sum to 1, so the line landed totals sum back to the shipment
 * landed total. `reconciles` asserts that closure on every call — the
 * spreadsheet this replaces had no such check, so a broken formula could sit
 * unnoticed.
 *
 * Degenerate case: when the purchase total is zero (every line free, or none
 * priced) there is no value to allocate against. Splitting equally would
 * silently invent a rule the business never agreed to, so import costs are left
 * unallocated and the shipment total still reports them.
 */
/**
 * Sum the charge list by kind.
 *
 * Falls back to the four amounts when a shipment has no list — every shipment
 * created before charges became a list is in that state, and their landed costs
 * must not move because the storage shape changed.
 */
export function chargeTotals(s: {
  charges?: ShipmentCharge[];
  freightAmount?: number; customsAmount?: number;
  otherCharges?: number;  salesTaxAmount?: number;
  exchangeRate?: number;
}): Record<Lowercase<ChargeKind>, number> & { total: number } {
  const list = s.charges || [];

  if (list.length === 0) {
    const rate = Number(s.exchangeRate) > 0 ? Number(s.exchangeRate) : 1;
    const customs = round2((Number(s.customsAmount)  || 0) * rate);
    const freight = round2((Number(s.freightAmount)  || 0) * rate);
    const tax     = round2((Number(s.salesTaxAmount) || 0) * rate);
    const other   = round2((Number(s.otherCharges)   || 0) * rate);
    return { customs, freight, tax, other, total: round2(customs + freight + tax + other) };
  }

  const sum = (k: ChargeKind) =>
    round2(list.filter(c => c.kind === k).reduce((a, c) => a + (Number(c.amount) || 0), 0));

  const customs = sum('Customs');
  const freight = sum('Freight');
  const tax     = sum('Tax');
  const other   = sum('Other');
  return { customs, freight, tax, other, total: round2(customs + freight + tax + other) };
}

/** True once someone has declared this kind of charge finished. */
export const isChargeKindClosed = (
  s: { chargeClosure?: Partial<Record<ChargeKind, { closedAt: string }>> },
  kind: ChargeKind,
): boolean => !!s.chargeClosure?.[kind];

/** The kinds still expecting payments. What the Transactions picker filters on. */
export function openChargeKinds(
  s: { chargeClosure?: Partial<Record<ChargeKind, { closedAt: string }>> },
): ChargeKind[] {
  return CHARGE_KINDS.filter(k => !isChargeKindClosed(s, k));
}

/**
 * Whether the costing can be finalised.
 *
 * Every charge kind has to be closed first. Finalising while customs is still
 * open would lock a landed cost that the next duty invoice is about to change —
 * and the person who closed customs is the only one who knows it is finished.
 */
export function canFinaliseCosting(s: Shipment): { allowed: boolean; reason?: string } {
  if (s.costingStatus === 'Complete') return { allowed: false, reason: 'Costing is already finalised' };
  if (s.status === 'Cancelled')       return { allowed: false, reason: 'This shipment is cancelled' };

  const open = openChargeKinds(s);
  if (open.length > 0) {
    return {
      allowed: false,
      reason: `Close ${open.join(', ').toLowerCase()} first — the costing cannot lock while charges are still expected`,
    };
  }
  return { allowed: true };
}

/** One entry on the shipment's money timeline. */
export interface ShipmentTimelineEntry {
  id: string;
  date: string;
  kind: ChargeKind | 'Supplier' | 'Closed';
  label: string;
  amount: number;
  transactionRef?: string;
  bankName?: string;
  /** Adjustment invoice(s) this charge caused — see ShipmentCharge. */
  adjustmentInvoiceNumbers?: string[];
}

/**
 * Every payment against a shipment, newest first.
 *
 * Charges and supplier payments in one list, because "what has this shipment
 * cost so far and when" is one question. Split across two panels it takes two
 * readings and a mental merge.
 *
 * Closure entries are included: they are what explains a gap, and without them
 * a reader cannot tell a kind that finished from one nobody has billed yet.
 */
export function shipmentTimeline(s: Shipment): ShipmentTimelineEntry[] {
  const out: ShipmentTimelineEntry[] = [];

  for (const ch of s.charges || []) {
    out.push({
      id: ch.id, date: ch.date, kind: ch.kind,
      label: ch.description || `${ch.kind} paid`,
      amount: Number(ch.amount) || 0,
      transactionRef: ch.transactionRef, bankName: ch.bankName,
      adjustmentInvoiceNumbers: ch.adjustmentInvoiceNumbers,
    });
  }

  for (const p of s.supplierPayments || []) {
    out.push({
      id: p.id, date: p.date, kind: 'Supplier',
      label: p.description || 'Payment to supplier',
      amount: Number(p.amount) || 0,
      transactionRef: p.transactionRef, bankName: p.bankName,
    });
  }

  for (const k of CHARGE_KINDS) {
    const c = s.chargeClosure?.[k];
    if (c) {
      out.push({
        id: `closed_${k}`, date: (c.closedAt || '').slice(0, 10), kind: 'Closed',
        label: `${k} marked complete`, amount: 0,
      });
    }
  }

  // Newest first. Same-day entries keep the order they were added, which for
  // a closure is after the payment that prompted it.
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ── Stock-in and cost layers ─────────────────────────────────────────────────

/**
 * The inventory product a line's units became, however that is recorded.
 *
 * `line.linkedProductId` is the field meant to carry this — but no writer in
 * the codebase ever actually set it; stockInFromShipment() only ever wrote
 * the product id onto each StockBatch, so linkedProductId sat undefined on
 * every shipment, forever. recordStockBatch() now also sets it going
 * forward, but a shipment stocked in before that fix still has it empty, so
 * this falls back to the most recent batch's productId — the same value —
 * whenever linkedProductId itself is missing. Reading through this function
 * instead of the raw field is what keeps both old and new shipments working
 * without a data migration.
 */
export const resolveLineProductId = (
  l: { linkedProductId?: string; stockBatches?: StockBatch[] },
): string | undefined => {
  if (l.linkedProductId) return l.linkedProductId;
  const batches = l.stockBatches || [];
  return batches.length > 0 ? batches[batches.length - 1].productId : undefined;
};

/** Units already taken into stock from a line. */
export const stockedQuantity = (l: { stockBatches?: StockBatch[] }): number =>
  (l.stockBatches || []).reduce((a, b) => a + (Number(b.quantity) || 0), 0);

/** What those units cost, at the rates frozen when each batch was taken. */
export const stockedValue = (l: { stockBatches?: StockBatch[] }): number =>
  round2((l.stockBatches || []).reduce(
    (a, b) => a + (Number(b.quantity) || 0) * (Number(b.landedUnitCost) || 0), 0));

/** Still on the shipment. */
export const remainingToStock = (l: { quantity: number; stockBatches?: StockBatch[] }): number =>
  Math.max(0, (Number(l.quantity) || 0) - stockedQuantity(l));

/**
 * What each remaining unit now costs.
 *
 *     (line landed total − value already stocked) / units remaining
 *
 * Charges that arrive after a stock-in cannot reach the units that left, so the
 * remainder absorbs them and its per-unit cost rises. Nineteen units gone and
 * one left means that one carries the lot — arithmetically right, and the only
 * answer that does not restate figures already on sold invoices.
 *
 * Returns 0 when nothing is left; the shortfall becomes unallocatedCharges on
 * the shipment instead.
 */
export function remainingLandedUnitCost(
  l: { quantity: number; landedTotal: number; stockBatches?: StockBatch[] },
): number {
  const left = remainingToStock(l);
  if (left <= 0) return 0;
  return round2(Math.max(0, (Number(l.landedTotal) || 0) - stockedValue(l)) / left);
}

/**
 * Charges with no units left to carry them.
 *
 * Summed across the lines that are fully stocked in. This is the figure that
 * goes on the shipment's dummy row.
 */
export function unallocatedCharge(lines: Array<{
  quantity: number; landedTotal: number; stockBatches?: StockBatch[];
}>): number {
  return round2(lines.reduce((a, l) => {
    if (remainingToStock(l) > 0) return a;
    return a + Math.max(0, (Number(l.landedTotal) || 0) - stockedValue(l));
  }, 0));
}

/** Whether a quantity can be taken into stock from this line. */
export function canStockIn(
  l: { quantity: number; stockBatches?: StockBatch[]; productName?: string },
  qty: number,
): { allowed: boolean; reason?: string } {
  if (!(qty > 0)) return { allowed: false, reason: 'Enter a quantity greater than zero' };
  const left = remainingToStock(l);
  if (left <= 0) return { allowed: false, reason: `All ${l.quantity} units are already in stock` };
  if (qty > left) return { allowed: false, reason: `Only ${left} unit${left === 1 ? '' : 's'} remain on this line` };
  return { allowed: true };
}

export function calculateShipmentCosting(
  s: Pick<
    Shipment,
    'lines' | 'exchangeRate' | 'freightAmount' | 'customsAmount'
    | 'otherCharges' | 'salesTaxAmount' | 'currency'
  > & { charges?: ShipmentCharge[] },
): ShipmentCosting {
  const rate  = Number(s.exchangeRate) > 0 ? Number(s.exchangeRate) : 1;
  const cur   = s.currency || 'AED';
  const lines = Array.isArray(s.lines) ? s.lines : [];

  // Charges come from the list when there is one, and from the four amounts
  // when there is not. Every shipment created before charges became a list is
  // in the second state, and their figures must not move.
  //
  // The list is already AED — charges are recorded as paid, in the currency the
  // shipment is costed in — so the rate is not applied to it.
  const t = chargeTotals(s);
  const fromList = (s.charges || []).length > 0;

  const freightBase = fromList ? t.freight : (Number(s.freightAmount)  || 0) * rate;
  const customsBase = fromList ? t.customs : (Number(s.customsAmount)  || 0) * rate;
  const otherBase   = fromList ? t.other   : (Number(s.otherCharges)   || 0) * rate;
  const taxBase     = fromList ? t.tax     : (Number(s.salesTaxAmount) || 0) * rate;
  // Kept for the shipment total. Tax and other are allocated separately per
  // line now, and their sum is this — so the closure check still balances.
  const spreadBase  = otherBase + taxBase;

  let purchaseGross = 0;
  let discountTotal = 0;
  lines.forEach(l => {
    const g = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    purchaseGross += g;
    discountTotal += g * ((Number(l.discountPercent) || 0) / 100);
  });
  const purchaseNet     = purchaseGross - discountTotal;
  const purchaseNetBase = purchaseNet * rate;

  const totalQuantity = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0);
  // Kept on the shape so nothing downstream breaks, but derived from the
  // receipt flag rather than per-line counts: a shipment is received or it is
  // not, and partial receipt is no longer tracked.
  const totalReceived = 0;

  const costed: CostedLine[] = lines.map(l => {
    const qty   = Number(l.quantity)  || 0;
    const price = Number(l.unitPrice) || 0;
    const disc  = Number(l.discountPercent) || 0;
    const recvd = 0;

    const grossTotal     = qty * price;
    const discountAmount = grossTotal * (disc / 100);
    const netTotal       = grossTotal - discountAmount;
    const netTotalBase   = netTotal * rate;
    const share          = purchaseNetBase > 0 ? netTotalBase / purchaseNetBase : 0;

    const freightShare = freightBase * share;
    const customsShare = customsBase * share;
    // Tax split out from other. They were summed because the sheet showed one
    // column; it now shows both, and a figure that exists on the shipment
    // should be traceable to the line it landed on.
    const taxShare     = taxBase   * share;
    const otherShare   = otherBase * share;
    const landedTotal  = netTotalBase + freightShare + customsShare + taxShare + otherShare;

    return {
      ...l,
      grossTotal:      round2(grossTotal),
      discountAmount:  round2(discountAmount),
      netTotal:        round2(netTotal),
      netTotalBase:    round2(netTotalBase),
      share,
      freightShare:    round2(freightShare),
      customsShare:    round2(customsShare),
      taxShare:        round2(taxShare),
      otherShare:      round2(otherShare),
      dutyPerUnit:     qty > 0 ? round2(customsShare / qty) : 0,
      freightPerUnit:  qty > 0 ? round2(freightShare / qty) : 0,
      taxPerUnit:      qty > 0 ? round2(taxShare / qty)     : 0,
      otherPerUnit:    qty > 0 ? round2(otherShare / qty)   : 0,
      unitPriceBase:   round2(price * (1 - disc / 100) * rate),
      landedTotal:     round2(landedTotal),
      landedUnitCost:  qty > 0 ? round2(landedTotal / qty) : 0,
      remainingQuantity: qty,
      receivedValue: 0,
      formulas: {
        grossTotal:     `Gross = Qty x Unit price\n= ${qty} x ${fmt(price)} ${cur}\n= ${fmt(grossTotal)} ${cur}`,
        discountAmount: `Discount = Gross x Disc%\n= ${fmt(grossTotal)} x ${disc}%\n= ${fmt(discountAmount)} ${cur}`,
        netTotal:       `Net = Gross - Discount\n= ${fmt(grossTotal)} - ${fmt(discountAmount)}\n= ${fmt(netTotal)} ${cur}`,
        netTotalBase:   `Net in AED = Net x Exchange rate\n= ${fmt(netTotal)} ${cur} x ${rate}\n= AED ${fmt(netTotalBase)}`,
        share:          `Share = this line's net AED / shipment net AED\n= ${fmt(netTotalBase)} / ${fmt(purchaseNetBase)}\n= ${pct(share)}`,
        customsShare:   `Customs on this line = Customs total x Share\n= AED ${fmt(customsBase)} x ${pct(share)}\n= AED ${fmt(customsShare)}`,
        freightShare:   `Freight on this line = Freight total x Share\n= AED ${fmt(freightBase)} x ${pct(share)}\n= AED ${fmt(freightShare)}`,
        taxShare:       `Tax on this line = Tax x Share\n= AED ${fmt(taxBase)} x ${pct(share)}\n= AED ${fmt(taxShare)}`,
        otherShare:     `Other on this line = Other x Share\n= AED ${fmt(otherBase)} x ${pct(share)}\n= AED ${fmt(otherShare)}`,
        taxPerUnit:     `Tax per unit = Tax on line / Qty\n= ${fmt(taxShare)} / ${qty}\n= AED ${fmt(qty ? taxShare / qty : 0)}`,
        otherPerUnit:   `Other per unit = Other on line / Qty\n= ${fmt(otherShare)} / ${qty}\n= AED ${fmt(qty ? otherShare / qty : 0)}`,
        dutyPerUnit:    `Customs per unit = Customs on line / Qty\n= ${fmt(customsShare)} / ${qty}\n= AED ${fmt(qty ? customsShare / qty : 0)}`,
        freightPerUnit: `Freight per unit = Freight on line / Qty\n= ${fmt(freightShare)} / ${qty}\n= AED ${fmt(qty ? freightShare / qty : 0)}`,
        landedTotal:    `Landed = Net AED + Customs + Freight + Other\n= ${fmt(netTotalBase)} + ${fmt(customsShare)} + ${fmt(freightShare)} + ${fmt(otherShare)}\n= AED ${fmt(landedTotal)}`,
        landedUnitCost: `Landed per unit = Landed / Qty\n= ${fmt(landedTotal)} / ${qty}\n= AED ${fmt(qty ? landedTotal / qty : 0)}`,
        receivedValue: 'Partial receipt is no longer tracked.',
        remainingQuantity: `Ordered = ${qty} ${l.uom || 'EA'}`,
      },
    };
  });

  const landedTotal = purchaseNetBase + freightBase + customsBase + spreadBase;
  const lineSum     = costed.reduce((a, l) => a + l.landedTotal, 0);

  return {
    purchaseGross:   round2(purchaseGross),
    discountTotal:   round2(discountTotal),
    purchaseNet:     round2(purchaseNet),
    purchaseNetBase: round2(purchaseNetBase),
    freightBase:     round2(freightBase),
    customsBase:     round2(customsBase),
    otherBase:       round2(otherBase),
    taxBase:         round2(taxBase),
    landedTotal:     round2(landedTotal),
    totalQuantity,
    totalReceived,
    averageLandedUnitCost: totalQuantity > 0 ? round2(landedTotal / totalQuantity) : 0,
    receivedValue: 0,
    // Tolerance of 1 fils absorbs 2dp rounding on the individual lines;
    // anything larger is a real arithmetic fault, not a rounding artefact.
    reconciles: Math.abs(lineSum - landedTotal) < 0.02,
    lines: costed,
    formulas: {
      purchaseNet:     `Net purchase = Gross - Discounts\n= ${fmt(purchaseGross)} - ${fmt(discountTotal)}\n= ${fmt(purchaseNet)} ${cur}`,
      purchaseNetBase: `Net purchase in AED = Net x Exchange rate\n= ${fmt(purchaseNet)} ${cur} x ${rate}\n= AED ${fmt(purchaseNetBase)}`,
      freightBase:     `Freight in AED = Freight x Exchange rate\n= ${fmt(Number(s.freightAmount) || 0)} ${cur} x ${rate}\n= AED ${fmt(freightBase)}`,
      customsBase:     `Customs in AED = Customs x Exchange rate\n= ${fmt(Number(s.customsAmount) || 0)} ${cur} x ${rate}\n= AED ${fmt(customsBase)}`,
      otherBase:       `Other charges in AED = Other x Exchange rate\n= ${fmt(Number(s.otherCharges) || 0)} ${cur} x ${rate}\n= AED ${fmt(otherBase)}`,
      taxBase:         `Tax in AED = Tax x Exchange rate\n= ${fmt(Number(s.salesTaxAmount) || 0)} ${cur} x ${rate}\n= AED ${fmt(taxBase)}`,
      landedTotal:     `Total landed = Net purchase + Freight + Customs + Other + Tax\n= ${fmt(purchaseNetBase)} + ${fmt(freightBase)} + ${fmt(customsBase)} + ${fmt(otherBase)} + ${fmt(taxBase)}\n= AED ${fmt(landedTotal)}`,
      averageLandedUnitCost: `Average landed per unit = Total landed / Total qty\n= ${fmt(landedTotal)} / ${totalQuantity}\n= AED ${fmt(totalQuantity ? landedTotal / totalQuantity : 0)}\n\nBlended figure. Use the per-line landed unit cost for valuation.`,
      reconciles:      `Closure check\nSum of line landed totals = AED ${fmt(lineSum)}\nShipment landed total     = AED ${fmt(landedTotal)}\nDifference = ${fmt(Math.abs(lineSum - landedTotal))}`,
    },
  };
}

// ── Priority ──────────────────────────────────────────────────────────────────

/**
 * Lower sorts first. The ordering follows what needs a human next, not what is
 * furthest along: a shipment sitting in the warehouse with unfinished costing
 * is the most urgent thing on the page, because the stock is sellable but its
 * cost is unknown, so every sale from it books an unreliable margin.
 */
export function shipmentPriority(s: Shipment): number {
  if (s.status === 'Cancelled') return 99;
  if (s.status === 'Received Into Inventory') return 90;

  const arrived = !!s.actualArrivalDate || s.status === 'Arrived' || s.status === 'Customs Cleared';
  const customs = s.customsStatus === 'Applied';
  const freight = s.freightStatus === 'Applied';
  const costed  = s.costingStatus === 'Complete';

  if (arrived && customs && freight && !costed) return 1;
  if (arrived && customs && !freight)           return 2;
  if (arrived && !customs)                      return 3;
  if (arrived && costed)                        return 4;
  return 5;
}

export const PRIORITY_LABEL: Record<number, string> = {
  1: 'Costing due', 2: 'Freight due', 3: 'Customs due',
  4: 'Ready', 5: 'In transit', 90: 'Received', 99: 'Cancelled',
};

// ── Workflow ──────────────────────────────────────────────────────────────────

export interface WorkflowStage { label: string; state: 'Completed' | 'Pending' }

/**
 * Every stage is derived from a stored field, never a separate display flag.
 *
 * Four stages, and each one is a real gate rather than a step someone ticks.
 * Purchase order, Dispatched, Goods received and Fully received were dropped:
 * the first is true the moment the shipment exists, the second was a date
 * nobody filled in, and the last two said the same thing.
 *
 * Customs and Freight now read the charge list rather than a status flag. A
 * flag says someone remembered to click; a charge says the money moved.
 */
export function shipmentWorkflow(s: Shipment): WorkflowStage[] {
  const done = (b: boolean): WorkflowStage['state'] => (b ? 'Completed' : 'Pending');

  // Each charge kind is complete when someone says so, not when a payment
  // lands. Customs is billed two or three times on a normal shipment, and
  // nothing in the numbers can tell you the last invoice has arrived.
  //
  // 'Arrived' is gone with the Mark arrived button. A stage nobody can complete
  // is worse than no stage — it reads as something forgotten rather than
  // something not offered.
  const supplierDone = supplierPayable(s) > 0 && supplierRemaining(s) <= 0;

  return [
    { label: 'Customs paid',      state: done(isChargeKindClosed(s, 'Customs')) },
    { label: 'Freight paid',      state: done(isChargeKindClosed(s, 'Freight')) },
    { label: 'Tax paid',          state: done(isChargeKindClosed(s, 'Tax')) },
    { label: 'Other dues paid',   state: done(isChargeKindClosed(s, 'Other')) },
    { label: 'Costing finalised', state: done(s.costingStatus === 'Complete') },
    { label: 'Supplier paid',     state: done(supplierDone) },
  ];
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult { isValid: boolean; errors: string[] }

/**
 * Validated here rather than in the form so a direct service call cannot skip
 * it. Numeric guards use Number.isFinite, which rejects NaN and Infinity —
 * `> 0` alone lets Infinity through.
 */
export function validateShipment(s: Partial<Shipment>): ValidationResult {
  const errors: string[] = [];
  const num = (v: any) => Number(v);

  if (!s.shipmentNumber?.trim()) errors.push('Shipment number is required');
  if (!s.brandName?.trim())      errors.push('Brand is required');
  if (!s.supplierName?.trim())   errors.push('Supplier is required');
  if (!s.originCountry?.trim())  errors.push('Origin country is required');
  if (!s.orderDate?.trim())      errors.push('Order date is required');
  if (!s.currency)               errors.push('Currency is required');

  const rate = num(s.exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) errors.push('Exchange rate must be greater than 0');
  if (s.currency === 'AED' && rate !== 1)  errors.push('Exchange rate must be 1 when the invoice currency is AED');

  (['freightAmount', 'customsAmount', 'otherCharges', 'salesTaxAmount'] as const).forEach(k => {
    const v = num(s[k]);
    const label = k.replace('Amount', '').replace('Charges', ' charges');
    if (!Number.isFinite(v) || v < 0) errors.push(`${label} cannot be negative`);
  });

  // A shipment cannot leave before it was ordered, or arrive before it left.
  if (s.orderDate && s.shipmentDate && s.shipmentDate < s.orderDate)
    errors.push('Dispatch date cannot be before the order date');
  if (s.shipmentDate && s.actualArrivalDate && s.actualArrivalDate < s.shipmentDate)
    errors.push('Arrival date cannot be before the dispatch date');

  const lines = s.lines || [];
  if (lines.length === 0) errors.push('Add at least one product line');

  const seen = new Set<string>();
  lines.forEach((l, i) => {
    const n = i + 1;
    if (!l.productName?.trim()) errors.push(`Line ${n}: product name is required`);

    // Duplicate detection moved from the supplier's item number to
    // product + model, because the item number is no longer collected. Two
    // lines for the same product are usually a mistake — a split delivery is
    // one line with a partial received quantity, not two lines.
    const key = `${(l.productName || '').trim().toLowerCase()}|${(l.modelName || '').trim().toLowerCase()}`;
    if (key !== '|') {
      if (seen.has(key)) {
        errors.push(`Line ${n}: "${l.productName} ${l.modelName}".trim() appears more than once`);
      }
      seen.add(key);
    }

    const q = num(l.quantity);
    const p = num(l.unitPrice);
    const d = num(l.discountPercent);

    if (!Number.isFinite(q) || q <= 0)      errors.push(`Line ${n}: quantity must be greater than 0`);
    else if (!Number.isInteger(q))          errors.push(`Line ${n}: quantity must be a whole number`);
    if (!Number.isFinite(p) || p < 0)       errors.push(`Line ${n}: unit price cannot be negative`);
    if (!Number.isFinite(d) || d < 0 || d > 100) errors.push(`Line ${n}: discount must be between 0 and 100`);
  });

  return { isValid: errors.length === 0, errors };
}

// ── Filtering, summary, numbering ─────────────────────────────────────────────

export function filterShipments(list: Shipment[], f: ShipmentFilters): Shipment[] {
  const q = (f.search || '').trim().toLowerCase();
  return list.filter(s => {
    if (f.brand   && f.brand   !== 'ALL' && s.brandName !== f.brand)         return false;
    if (f.status  && f.status  !== 'ALL' && s.status !== f.status)           return false;
    if (f.costing && f.costing !== 'ALL' && s.costingStatus !== f.costing)   return false;
    if (!q) return true;
    const hay = [s.shipmentNumber, s.supplierOrderNumber, s.brandName, s.supplierName,
                 s.trackingNumber, s.originCountry,
                 ...(s.lines || []).flatMap(l => [l.productName, l.modelName])];
    return hay.some(v => (v || '').toLowerCase().includes(q));
  });
}

export function summariseShipments(list: Shipment[]): ShipmentSummary {
  const live = list.filter(s => s.status !== 'Cancelled');
  // Partial receipt is no longer tracked. Kept on the summary shape so the
  // dashboard tile does not need changing; it now counts shipments that have
  // arrived but not been marked received.
  const partial = live.filter(s =>
    !!s.actualArrivalDate && s.receivingStatus !== 'Complete').length;
  return {
    total:             live.length,
    inTransit:         live.filter(s => s.status === 'In Transit' || s.status === 'Dispatched').length,
    arrived:           live.filter(s => !!s.actualArrivalDate || s.status === 'Arrived').length,
    pendingCustoms:    live.filter(s => s.customsStatus !== 'Applied').length,
    pendingFreight:    live.filter(s => s.freightStatus !== 'Applied').length,
    pendingCosting:    live.filter(s => s.costingStatus !== 'Complete').length,
    partiallyReceived: partial,
    landedValue:       round2(live.reduce((a, s) => a + calculateShipmentCosting(s).landedTotal, 0)),
  };
}

/** SHP-<BRAND>-<YY>-<NNN>, e.g. SHP-NOKTA-26-004. */
export function suggestShipmentNumber(brandName: string, existing: Shipment[]): string {
  const brand = (brandName || 'GEN').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'GEN';
  const yy     = String(new Date().getFullYear()).slice(-2);
  const prefix = `SHP-${brand}-${yy}-`;
  const used = existing
    .filter(s => s.shipmentNumber?.startsWith(prefix))
    .map(s => parseInt(s.shipmentNumber.slice(prefix.length), 10))
    .filter(n => Number.isFinite(n));
  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
}

export const emptyLine = (): ShipmentLine => ({
  id: Math.random().toString(36).slice(2),
  productName: '', modelName: '',
  uom: 'EA' as UnitOfMeasure,
  quantity: 1, unitPrice: 0, discountPercent: 0,
});