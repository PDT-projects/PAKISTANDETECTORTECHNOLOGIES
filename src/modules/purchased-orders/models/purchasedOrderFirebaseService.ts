// Purchased Orders — Firestore access layer
//
// Collection: purchasedOrders
//
// Lines are stored on the shipment document rather than in a subcollection.
// A consignment carries tens of lines, not thousands, and they are always read
// and written together — a subcollection would cost an extra round trip per
// shipment on the list screen for no benefit.

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { allocateNewChargeAcrossShipment } from './orphanedChargeAbsorption';
import {
  Shipment, CreateShipmentDTO, UpdateShipmentDTO,
  ShipmentCharge, ShipmentSupplierPayment, ChargeKind,
} from './types';
import {
  validateShipment, canFinaliseReceiving, calculateShipmentCosting,
  supplierPayable, round2,
  isChargeKindClosed, canFinaliseCosting, unallocatedCharge
} from './purchasedOrderService';
const COLLECTION = 'purchasedOrders';

/** Firestore rejects undefined. Strip before every write. */
/**
 * Remove undefined anywhere in the value, not just at the top level.
 *
 * Firestore rejects an undefined field with "Unsupported field value", and the
 * previous shallow version only cleaned the outer object. A save from the
 * details screen sends `lines`, and every line carries
 * `linkedProductId: undefined` straight out of the read mapper — nested one
 * level down, so it survived the filter and reached Firestore.
 *
 * Arrays are walked too, because that is exactly where the lines live.
 */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(v => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, any>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T;
  }
  return value;
}

function toShipment(d: any): Shipment {
  const x = d.data();
  return {
    id: d.id,
    shipmentNumber: x.shipmentNumber || '',
    brandId: x.brandId || undefined,
    brandName: x.brandName || '',
    supplierName: x.supplierName || '',
    originCountry: x.originCountry || '',
    destinationCountry: x.destinationCountry || 'UAE',
    orderDate: x.orderDate || '',
    shipmentDate: x.shipmentDate || undefined,
    expectedArrivalDate: x.expectedArrivalDate || undefined,
    actualArrivalDate: x.actualArrivalDate || undefined,
    shipMethod: x.shipMethod || undefined,
    trackingNumber: x.trackingNumber || undefined,
    currency: x.currency || 'AED',
    exchangeRate: Number(x.exchangeRate) > 0 ? Number(x.exchangeRate) : 1,
    status: x.status || 'Draft',
    customsStatus: x.customsStatus || 'Not Applied',
    freightStatus: x.freightStatus || 'Not Applied',
    costingStatus: x.costingStatus || 'Pending',
    freightTerms: x.freightTerms || undefined,
    supplierOrderNumber: x.supplierOrderNumber || undefined,
    freightAmount: Number(x.freightAmount) || 0,
    customsAmount: Number(x.customsAmount) || 0,
    otherCharges: Number(x.otherCharges) || 0,
    salesTaxAmount: Number(x.salesTaxAmount) || 0,
    // Older documents predate uom/discount/received, and older ones still
    // carry an sku that is no longer part of the model. Default the rest here so
    // every consumer sees a complete line and no screen has to guard for gaps.
    lines: (Array.isArray(x.lines) ? x.lines : []).map((l: any) => ({
      id: l.id || Math.random().toString(36).slice(2),
      productName: l.productName || '',
      modelName: l.modelName || '',
      uom: l.uom || 'EA',
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      discountPercent: Number(l.discountPercent) || 0,
      receivedQuantity: Number(l.receivedQuantity) || 0,
      linkedProductId: l.linkedProductId || undefined,

      // Stock-in history. It was being written by recordStockBatch and then
      // dropped here on the way back — the mapper lists line fields explicitly,
      // and a field it does not name simply does not survive the read.
      //
      // Nothing reported it. The write succeeded, the document held the data,
      // and every screen showed zero stocked because every screen reads through
      // this function.
      stockBatches: Array.isArray(l.stockBatches) ? l.stockBatches : [],
    })),
    // Absent on every shipment created before receiving could be finalised.
    // Defaulted here so the details screen never has to test for undefined.
    receivingStatus: x.receivingStatus || 'Pending',
    receivingFinalisedAt: x.receivingFinalisedAt || undefined,
    receivingFinalisedBy: x.receivingFinalisedBy || undefined,
    attachments: Array.isArray(x.attachments) ? x.attachments : [],
    charges: Array.isArray(x.charges) ? x.charges : [],
    supplierPaidAmount: Number(x.supplierPaidAmount) || 0,
    supplierPayments: Array.isArray(x.supplierPayments) ? x.supplierPayments : [],
    chargeClosure: x.chargeClosure || {},
    notes: x.notes || undefined,
    createdAt: x.createdAt || '',
    updatedAt: x.updatedAt || '',
    createdBy: x.createdBy || undefined,
  };
}

export class PurchasedOrderFirebaseService {
  static async fetchAll(): Promise<Shipment[]> {
    try {
      const snap = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt', 'desc')));
      const out: Shipment[] = [];
      snap.forEach(d => out.push(toShipment(d)));
      console.log(`[PO] fetched ${out.length} shipments`);
      return out;
    } catch (err) {
      // Logged, not swallowed. An empty list and a permission error look
      // identical on screen otherwise.
      console.error('[PO] fetchAll failed:', err);
      throw new Error('Failed to load shipments');
    }
  }

  static async fetchById(id: string): Promise<Shipment | null> {
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      return snap.exists() ? toShipment(snap) : null;
    } catch (err) {
      console.error('[PO] fetchById failed:', err);
      throw new Error('Failed to load shipment');
    }
  }

  /**
   * The same validation the form runs is repeated here on purpose: this is the
   * last point before the write, and it is reachable without the form.
   */
  static async create(dto: CreateShipmentDTO): Promise<Shipment> {
    const v = validateShipment(dto);
    if (!v.isValid) throw new Error(v.errors[0]);

    const existing = await PurchasedOrderFirebaseService.fetchAll();
    const clash = existing.find(
      s => s.shipmentNumber.trim().toLowerCase() === dto.shipmentNumber.trim().toLowerCase(),
    );
    if (clash) throw new Error(`Shipment number "${dto.shipmentNumber}" already exists`);

    const now = new Date().toISOString();
    const data = stripUndefined({ ...dto, createdAt: now, updatedAt: now });
    const ref = await addDoc(collection(db, COLLECTION), data);
    console.log('[PO] created', ref.id);
    return { ...(data as any), id: ref.id } as Shipment;
  }

  static async update(id: string, dto: UpdateShipmentDTO): Promise<void> {
    // Partial updates only carry the fields being changed, so validate the
    // merged document rather than the patch on its own.
    const current = await PurchasedOrderFirebaseService.fetchById(id);
    if (!current) throw new Error('Shipment not found');
    const v = validateShipment({ ...current, ...dto });
    if (!v.isValid) throw new Error(v.errors[0]);

    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      ...dto, updatedAt: new Date().toISOString(),
    }));
    console.log('[PO] updated', id);
  }

  /** Status-only patch — skips full validation so a workflow click is one write. */
  static async patchStatus(id: string, patch: UpdateShipmentDTO): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      ...patch, updatedAt: new Date().toISOString(),
    }));
  }

  static async finaliseReceiving(id: string, by?: string): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');

    const check = canFinaliseReceiving(current);
    if (!check.allowed) throw new Error(check.reason || 'Cannot finalise receiving');

    await updateDoc(doc(db, COLLECTION, id), {
      receivingStatus: 'Complete',
      receivingFinalisedAt: new Date().toISOString(),
      receivingFinalisedBy: by || '',
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Reopen a finalised receipt.
   *
   * A late correction has to go somewhere, and blocking it entirely means people
   * work around the lock rather than through it. The reason is stored so the
   * change is visible afterwards.
   */
  static async reopenReceiving(id: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('A reason is required to reopen receiving');
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');

    await updateDoc(doc(db, COLLECTION, id), {
      receivingStatus: 'Partial',
      receivingFinalisedAt: '',
      receivingFinalisedBy: '',
      notes: [current.notes, `Receiving reopened ${new Date().toLocaleString('en-GB')}: ${reason.trim()}`]
        .filter(Boolean).join('\n'),
      updatedAt: new Date().toISOString(),
    });
  }

  static async saveAttachments(id: string, attachments: any[]): Promise<void> {
    // stripUndefined walks the array, which is what matters here: every
    // attachment row carries `uploadedBy`, and it is undefined whenever the
    // caller did not pass one. Firestore rejects an undefined field anywhere in
    // the value, not just at the top level.
    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      attachments,
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Add an import charge.
   *
   * Refused once costing is finalised: the landed cost is a figure someone has
   * signed off, and a late charge silently restating it is how a number that
   * was right on Monday is wrong on Friday with nothing recording why. Reopen
   * the costing first.
   */
  static async addCharge(id: string, charge: Omit<ShipmentCharge, 'id' | 'createdAt'>): Promise<{ adjustmentInvoiceNumber: string | null; adjustmentInvoiceNumbers: string[] }> {
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');
    if (current.costingStatus === 'Complete') {
      throw new Error('Costing is finalised. Reopen it before adding a charge.');
    }
    if (isChargeKindClosed(current, charge.kind)) {
      throw new Error(
        `${charge.kind} is marked complete on this shipment. Reopen it to add another charge.`,
      );
    }
    if (!(Number(charge.amount) > 0)) throw new Error('Charge amount must be greater than zero');

    const next: ShipmentCharge = {
      ...charge,
      id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount: Number(charge.amount),
      createdAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      charges: [...(current.charges || []), next],
      updatedAt: new Date().toISOString(),
    }));

    // Give every line its value-proportional share of the new charge, and
    // absorb it via a dummy adjustment invoice for any line that has already
    // been stocked in — whether its unit(s) are unsold or already sold, both
    // get the same treatment now. Never let a hiccup here fail the charge
    // that was already saved above.
    let allocation: { adjustmentInvoiceNumbers: string[] } = { adjustmentInvoiceNumbers: [] };
    try {
      allocation = await allocateNewChargeAcrossShipment(current, next.amount, next.description);
    } catch (err) {
      console.error('[addCharge] charge allocation failed (charge was still saved):', err);
    }

    // Record which adjustment invoice(s) this charge caused, on the charge
    // itself — the charge was already written above, before the allocation
    // ran, so this is a second, small update rather than something foldable
    // into the first. Without it, the only trace of the link was a toast
    // shown once at the moment this happened; the charge history (Charges
    // and payments, on the shipment's own page) had no memory of it at all.
    // Re-fetches rather than reusing `current` because addCharge and
    // allocateNewChargeAcrossShipment may have both touched the document by
    // now, and writing from a stale copy would drop whichever changed.
    if (allocation.adjustmentInvoiceNumbers.length > 0) {
      try {
        const after = await this.fetchById(id);
        if (after) {
          await updateDoc(doc(db, COLLECTION, id), stripUndefined({
            charges: (after.charges || []).map(c =>
              c.id === next.id ? { ...c, adjustmentInvoiceNumbers: allocation.adjustmentInvoiceNumbers } : c
            ),
            updatedAt: new Date().toISOString(),
          }));
        }
      } catch (err) {
        console.error('[addCharge] failed to record the adjustment-invoice link on the charge:', err);
      }
    }

    return {
      adjustmentInvoiceNumber: allocation.adjustmentInvoiceNumbers[0] || null,
      adjustmentInvoiceNumbers: allocation.adjustmentInvoiceNumbers,
    };
  }

  static async removeCharge(id: string, chargeId: string): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');
    if (current.costingStatus === 'Complete') {
      throw new Error('Costing is finalised. Reopen it before removing a charge.');
    }
    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      charges: (current.charges || []).filter(c => c.id !== chargeId),
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Remove whichever charge came from a given transaction.
   *
   * Called when a linked ledger entry is deleted, so the costing sheet cannot
   * keep a figure the ledger no longer has.
   */
  static async removeChargeByTransaction(id: string, transactionId: string): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) return;
    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      charges: (current.charges || []).filter(c => c.transactionId !== transactionId),
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Record a payment to the supplier.
   *
   * Gated on receiving being finalised: what is owed is built on received
   * quantity, and until receiving is finalised that number can still change.
   * Paying against a figure that has not settled means the remaining balance
   * moves after the money has gone.
   *
   * Overpayment is refused rather than allowed to go negative. A payment larger
   * than what is owed is nearly always a typo, and a negative remaining would
   * quietly drop the shipment out of the picker.
   */
  static async recordSupplierPayment(
    id: string,
    payment: Omit<ShipmentSupplierPayment, 'id' | 'createdAt'>,
  ): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');
    if (current.receivingStatus !== 'Complete') {
      throw new Error('Finalise the goods receipt before paying the supplier');
    }

    const amount = Number(payment.amount);
    if (!(amount > 0)) throw new Error('Payment amount must be greater than zero');

    const owed = supplierPayable(current);
    const paid = Number(current.supplierPaidAmount) || 0;
    const left = round2(owed - paid);
    if (amount > left + 0.01) {
      throw new Error(`Only ${left.toFixed(2)} is outstanding on this shipment`);
    }

    const next: ShipmentSupplierPayment = {
      ...payment,
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount,
      createdAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      supplierPayments: [...(current.supplierPayments || []), next],
      supplierPaidAmount: round2(paid + amount),
      updatedAt: new Date().toISOString(),
    }));
  }

  static async removeSupplierPayment(id: string, paymentId: string): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');

    const gone = (current.supplierPayments || []).find(p => p.id === paymentId);
    if (!gone) return;
    if (gone.transactionId) {
      throw new Error('This payment came from a transaction. Delete that entry instead.');
    }

    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      supplierPayments: (current.supplierPayments || []).filter(p => p.id !== paymentId),
      supplierPaidAmount: round2(Math.max(0, (Number(current.supplierPaidAmount) || 0) - gone.amount)),
      updatedAt: new Date().toISOString(),
    }));
  }

  /** Reverse whichever supplier payment came from a given transaction. */
  static async removeSupplierPaymentByTransaction(id: string, transactionId: string): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) return;
    const gone = (current.supplierPayments || []).find(p => p.transactionId === transactionId);
    if (!gone) return;

    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      supplierPayments: (current.supplierPayments || []).filter(p => p.transactionId !== transactionId),
      supplierPaidAmount: round2(Math.max(0, (Number(current.supplierPaidAmount) || 0) - gone.amount)),
      updatedAt: new Date().toISOString(),
    }));
  }
  /**
 * Declare a charge kind finished.
 *
 * Customs, freight, tax and other are billed as often as the agent invoices
 * them, and nothing in the numbers says the last one has arrived. Somebody
 * declares it, and until they do the shipment keeps appearing under that kind
 * in the Transactions picker.
 */
  static async closeChargeKind(id: string, kind: ChargeKind, by?: string): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');
    if (current.costingStatus === 'Complete') {
      throw new Error('Costing is finalised. Reopen it before changing the charges.');
    }

    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      chargeClosure: {
        ...(current.chargeClosure || {}),
        [kind]: { closedAt: new Date().toISOString(), closedBy: by || '' },
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Reopen a kind. No reason asked for: this restates nothing, it only says
   * another invoice turned up. Reopening the costing does restate a signed-off
   * figure, which is why that one asks.
   */
  static async reopenChargeKind(id: string, kind: ChargeKind): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');
    if (current.costingStatus === 'Complete') {
      throw new Error('Costing is finalised. Reopen it first.');
    }

    const next = { ...(current.chargeClosure || {}) };
    delete next[kind];

    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      chargeClosure: next,
      updatedAt: new Date().toISOString(),
    }));
  }
  /**
 * Record units taken off a line into stock.
 *
 * The landed cost is frozen here. Charges paid later cannot reach these
 * units — some are on sold invoices — so they raise the cost of whatever is
 * still on the shipment instead.
 */

  static async recordStockBatch(id: string, lineId: string, batch: {
    quantity: number; landedUnitCost: number; productId?: string; stockedBy?: string;
  }): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');

    const line = current.lines.find(l => l.id === lineId);
    if (!line) throw new Error('Line not found on this shipment');

    const already = (line.stockBatches || []).reduce((a, b) => a + (Number(b.quantity) || 0), 0);
    if (already + batch.quantity > line.quantity) {
      throw new Error(`Only ${line.quantity - already} unit(s) remain on this line`);
    }

    const next = {
      id: `sb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      quantity: batch.quantity,
      landedUnitCost: batch.landedUnitCost,
      stockedAt: new Date().toISOString(),
      productId: batch.productId,
      stockedBy: batch.stockedBy,
    };

    // `linkedProductId` is meant to record which inventory product this
    // line's units became, but nothing ever wrote it — every stock-in only
    // stored the product id on the StockBatch itself (above). Setting it
    // here too, going forward, means new shipments no longer depend on the
    // stockBatches fallback in resolveLineProductId(); `l.linkedProductId ||`
    // keeps whatever was already there if a line is stocked in more than
    // once across different products.
    const lines = current.lines.map(l =>
      l.id === lineId
        ? { ...l, stockBatches: [...(l.stockBatches || []), next], linkedProductId: l.linkedProductId || batch.productId }
        : l);

    // Charges that no line can carry any more, stored rather than recomputed.
    //
    // It was only ever calculated on render, which gives the right answer but
    // leaves nothing for a report to read and nothing to reconcile against.
    // Written here because this is the moment it can change: a line becoming
    // fully stocked is what orphans a charge.
    const orphaned = unallocatedCharge(calculateShipmentCosting({ ...current, lines }).lines);

    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      lines,
      unallocatedCharges: orphaned > 0 ? orphaned : undefined,
      updatedAt: new Date().toISOString(),
    }));
  }
  static async finaliseCosting(id: string): Promise<void> {
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');

    // Every charge kind has to be closed first. Locking while customs is still
    // open would freeze a landed cost the next duty invoice is about to change.
    const gate = canFinaliseCosting(current);
    if (!gate.allowed) throw new Error(gate.reason || 'Cannot finalise the costing');

    const c = calculateShipmentCosting(current);
    if (!c.reconciles) {
      throw new Error('Closure check failed — the line totals do not sum to the shipment total');
    }
    await updateDoc(doc(db, COLLECTION, id), {
      costingStatus: 'Complete',
      updatedAt: new Date().toISOString(),
    });
  }

  /** Reopen a finalised costing. The reason is kept with the shipment. */
  static async reopenCosting(id: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('A reason is required to reopen the costing');
    const current = await this.fetchById(id);
    if (!current) throw new Error('Shipment not found');

    await updateDoc(doc(db, COLLECTION, id), stripUndefined({
      costingStatus: 'Pending',
      notes: [current.notes, `Costing reopened ${new Date().toLocaleString('en-GB')}: ${reason.trim()}`]
        .filter(Boolean).join('\n'),
      updatedAt: new Date().toISOString(),
    }));
  }

  static async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
    console.log('[PO] deleted', id);
  }
}

/**
 * Next shipment number for a brand: SHP-NOKTA-2609-001
 *
 * The YYMM segment means a number tells you when it was raised without opening
 * it, and the sequence restarts each month so it stays short.
 *
 * Derived from the numbers already stored rather than a counter document: one
 * less thing to keep in step, and a gap in the sequence — from a cancelled
 * draft — is harmless. Two people creating a shipment in the same second would
 * collide, which createShipment already rejects as a duplicate number.
 */
export async function nextShipmentNumber(brandName: string): Promise<string> {
  const brand = (brandName || 'GEN').trim().toUpperCase()
    .replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'GEN';

  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `SHP-${brand}-${ym}-`;

  let used: number[] = [];
  try {
    const all = await PurchasedOrderFirebaseService.fetchAll();
    used = all
      .map(s => s.shipmentNumber || '')
      .filter(n => n.startsWith(prefix))
      .map(n => parseInt(n.slice(prefix.length), 10))
      .filter(Number.isFinite);
  } catch {
    // A failed read must not block the form. The number stays editable and
    // createShipment rejects a duplicate, so the worst case is one retry.
  }

  const next = used.length ? Math.max(...used) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}