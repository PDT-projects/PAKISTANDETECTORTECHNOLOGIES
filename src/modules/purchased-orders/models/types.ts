// Purchased Orders (Import Shipments) — data model
//
// CURRENCY MODEL
// --------------
// AED is the base currency. Every stored figure and every calculation is in
// AED, without exception. `currency` and `exchangeRate` describe the supplier's
// commercial invoice; `exchangeRate` converts that invoice INTO AED at the time
// the shipment was entered, and is frozen on the document so a later rate
// change cannot silently restate a closed shipment.
//
// Viewing in another currency is a display concern only — see convertForDisplay
// in purchasedOrderService. Nothing converted for display is ever written back.
//
// ALLOCATION MODEL
// ----------------
// Freight, customs duty and other import charges are allocated across the lines
// in proportion to EACH LINE'S SHARE OF PURCHASE VALUE — not by quantity, not
// by weight. This is the rule the business already uses in its shipment costing
// spreadsheet, and the one the inventory costing screen implements
// (src/modules/inventory/models/costingCalculator.ts). Keeping all three on the
// same rule is deliberate: two rules would make the same shipment cost two
// different amounts depending on which screen entered it.

export type ShipmentStatus =
  | 'Draft'
  | 'Ordered'
  | 'Dispatched'
  | 'In Transit'
  | 'Arrived'
  | 'Customs Cleared'
  | 'Costing Complete'
  | 'Received Into Inventory'
  | 'Cancelled';

export type ApplyStatus  = 'Not Applied' | 'Applied';

/**
 * What an import charge is for.
 *
 * These four are the sub-categories a payment can be recorded under in
 * Transactions. Supplier payments are not one of them — that money settles the
 * goods and goes to a different party, so it is tracked separately.
 */
export type ChargeKind = 'Customs' | 'Freight' | 'Tax' | 'Other';
export const CHARGE_KINDS: ChargeKind[] = ['Customs', 'Freight', 'Tax', 'Other'];

/**
 * One payment against a shipment's import costs.
 *
 * Stored as a list rather than four running totals because customs rarely
 * arrives as a single payment — a clearing agent bills duty, then storage, then
 * a handling fee, and the sheet has to show which is which when someone asks
 * why the landed cost moved.
 */
export interface ShipmentCharge {
  id: string;
  kind: ChargeKind;
  /** AED. Shipments are costed in AED, so charges are recorded in AED. */
  amount: number;
  date: string;
  description: string;
  /** Set when the charge came from a Transactions entry, so the two can be reconciled. */
  transactionId?: string;
  /** Human-readable TXN reference, for display beside the amount. */
  transactionRef?: string;
  bankName?: string;
  createdAt: string;

  /**
   * Adjustment invoice(s) this specific charge caused, if any.
   *
   * Set when adding this charge found a line with no stock left to carry
   * its share (see orphanedChargeAbsorption.ts) — one charge can spawn more
   * than one, if several lines were already fully sold. Previously the only
   * record of this was a one-time toast shown at the moment the charge was
   * added; once dismissed there was no way to see it again from the
   * shipment itself. Persisting it here lets the charge history show it
   * permanently instead.
   */
  adjustmentInvoiceNumbers?: string[];
}

/**
 * How far goods receipt has got.
 *
 * 'Complete' is a deliberate act, not a derived state. A supplier shipping 45 of
 * 50 is a finished delivery, not an unfinished one — only a human knows which,
 * so the flag is set by pressing Finalise rather than inferred from the numbers.
 */
export type ReceivingStatus = 'Pending' | 'Partial' | 'Complete';

/**
 * NOTE ON PARTIAL RECEIPT
 * -----------------------
 * It is no longer tracked. A shipment is received or it is not.
 *
 * The figure partial receipt fed — what the supplier is owed — now comes from
 * the costing sheet's purchaseNetBase. One number, one source. Two sources for
 * the same figure is what makes them disagree, and the supplier panel and the
 * payment picker were reading different ones.
 *
 * 'Partial' stays in the union so a shipment reopened before this change still
 * loads. Nothing sets it now.
 */

/** What a file attached to a shipment is. */
export type AttachmentKind =
  | 'Proforma' | 'Commercial invoice' | 'Bill of lading'
  | 'Customs' | 'Photo' | 'Other';

export const ATTACHMENT_KINDS: AttachmentKind[] = [
  'Proforma', 'Commercial invoice', 'Bill of lading', 'Customs', 'Photo', 'Other',
];

/** One payment made to the supplier against a shipment. */
export interface ShipmentSupplierPayment {
  id: string;
  /** AED. */
  amount: number;
  date: string;
  description: string;
  /** Set when the payment came from a Transactions entry. */
  transactionId?: string;
  transactionRef?: string;
  bankName?: string;
  createdAt: string;
}

export interface ShipmentAttachment {
  id: string;
  name: string;
  /** Firebase Storage download URL. */
  url: string;
  /** Storage path, kept so the file can be deleted when the row is removed. */
  storagePath: string;
  sizeBytes: number;
  contentType: string;
  kind: AttachmentKind;
  uploadedAt: string;
  uploadedBy?: string;
}
export type CostingState = 'Pending' | 'Complete';
export type ShipMethod   = 'Air' | 'Sea' | 'Road' | 'Courier';
export type FreightTerms = 'Prepaid' | 'Collect';

/** Currency of the supplier's commercial invoice. */
export type ShipmentCurrency = 'AED' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'PKR' | 'CAD';

/** Currency the user is *looking* at. Storage is always AED. */
export type DisplayCurrency = ShipmentCurrency;

export const SHIPMENT_CURRENCIES: ShipmentCurrency[] = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'PKR', 'CAD'];
export const SHIP_METHODS: ShipMethod[]    = ['Air', 'Sea', 'Road', 'Courier'];
export const FREIGHT_TERMS: FreightTerms[] = ['Prepaid', 'Collect'];

/** Unit of measure, as printed on supplier proforma invoices. */
/**
 * Every product in this catalogue is a countable item, and EA is the only unit
 * that can carry a landed cost into inventory — inventory tracks stock by serial
 * number, and a serial belongs to one physical unit.
 *
 * BOX and SET were offered and are now not. The costing engine divides:
 *
 *     landedUnitCost = landedTotal / quantity
 *
 * so a line of 20 BOX produced a cost per box while inventory counted the units
 * inside them — a tenth of the real figure, with nothing reporting the
 * difference. Supporting packs needs a unitsPerPack field and a conversion in
 * the engine; worth adding when a supplier actually ships that way.
 *
 * KG and M cannot reach inventory at all for the same reason. PC was a second
 * spelling of EA, which meant two clerks entering the same product differently.
 */
export type UnitOfMeasure = 'EA';
export const UNITS_OF_MEASURE: UnitOfMeasure[] = ['EA'];

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  'Draft', 'Ordered', 'Dispatched', 'In Transit', 'Arrived',
  'Customs Cleared', 'Costing Complete', 'Received Into Inventory', 'Cancelled',
];

/**
 * One product line on the supplier's commercial invoice.
 *
 * Field names follow the proforma layout so a data-entry clerk can read across
 * from the paper document without translating anything: ITEM NUMBER, QTY
 * ORDERED, UNIT PRICE, DISC%, UOM.
 */
/**
 * Units taken off a shipment line into stock, and what they cost that day.
 *
 * The cost is frozen. Charges that arrive later cannot reach units that have
 * already left — some of them are on sold invoices — so the extra lands on
 * whatever is still on the shipment, and the per-unit cost of the remainder
 * rises.
 */
export interface StockBatch {
  id: string;
  quantity: number;
  /** Landed cost per unit at the moment of stock-in. Never recalculated. */
  landedUnitCost: number;
  stockedAt: string;
  /** The inventory product these units became. */
  productId?: string;
  stockedBy?: string;
}

export interface ShipmentLine {
  id: string;
  productName: string;
  modelName: string;
  uom: UnitOfMeasure;
  quantity: number;
  /** Unit price in the shipment's currency, before discount. */
  unitPrice: number;
  /** Line discount, 0..100. */
  discountPercent: number;
  /**
   * Kept optional and unused.
   *
   * Partial receipt is no longer tracked — a shipment is received or it is not,
   * and what the supplier is owed comes from the costing sheet rather than a
   * per-line count. The field stays so shipments already in Firestore load
   * without the mapper having to special-case them.
   */
  receivedQuantity?: number;
  /** Our inventory product id, once the line has been received. */
  linkedProductId?: string;

  /** Stock-in history for this line. Absent means nothing has been stocked. */
  stockBatches?: StockBatch[];
}

/**
 * A line with every derived figure filled in, plus the arithmetic that produced
 * it. `formulas` exists so the UI can show a user how a number was reached —
 * the spreadsheet this replaces let an accountant click a cell and read its
 * formula, and losing that is what makes people distrust a costing screen.
 */
export interface CostedLine extends ShipmentLine {
  grossTotal: number;
  discountAmount: number;
  netTotal: number;
  netTotalBase: number;
  share: number;
  freightShare: number;
  customsShare: number;
  taxShare: number;
  otherShare: number;
  /** Charge per unit, one for each kind — the columns the costing sheet shows. */
  dutyPerUnit: number;
  freightPerUnit: number;
  taxPerUnit: number;
  otherPerUnit: number;
  unitPriceBase: number;
  landedTotal: number;
  landedUnitCost: number;
  remainingQuantity: number;
  /** Always 0. Partial receipt is no longer tracked; kept on the shape. */
  receivedValue: number;
  formulas: Record<string, string>;
}

export interface ShipmentCosting {
  purchaseGross: number;
  discountTotal: number;
  purchaseNet: number;
  purchaseNetBase: number;
  freightBase: number;
  customsBase: number;
  otherBase: number;
  taxBase: number;
  landedTotal: number;
  totalQuantity: number;
  totalReceived: number;
  averageLandedUnitCost: number;
  /** Always 0. Partial receipt is no longer tracked; kept on the shape. */
  receivedValue: number;
  /** True when the line landed totals sum back to the shipment total. */
  reconciles: boolean;
  lines: CostedLine[];
  formulas: Record<string, string>;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  /** Supplier's own order number, from their proforma. */
  supplierOrderNumber?: string;

  brandId?: string;
  brandName: string;
  supplierName: string;
  originCountry: string;
  destinationCountry: string;

  orderDate: string;
  shipmentDate?: string;
  expectedArrivalDate?: string;
  actualArrivalDate?: string;

  shipMethod?: ShipMethod;
  freightTerms?: FreightTerms;
  trackingNumber?: string;

  /**
   * Kept on the record and always 'AED' at rate 1.
   *
   * The costing engine multiplies by exchangeRate to reach its AED base, so the
   * field cannot be deleted without rewriting the engine. It is no longer asked
   * for: prices are entered in AED, which moves the conversion to whoever reads
   * the supplier's invoice rather than hiding it in a rate nobody checks.
   *
   * Older shipments keep whatever currency and rate they were costed at. Their
   * figures do not move.
   */
  currency: ShipmentCurrency;
  exchangeRate: number;

  status: ShipmentStatus;
  customsStatus: ApplyStatus;
  freightStatus: ApplyStatus;
  costingStatus: CostingState;

  /** Import charges, entered in the shipment's currency. */
  freightAmount: number;
  customsAmount: number;
  otherCharges: number;
  salesTaxAmount: number;

  lines: ShipmentLine[];

  /**
   * Optional so every shipment created before receiving could be finalised
   * still loads. Absent reads as 'Pending'.
   */
  receivingStatus?: ReceivingStatus;
  receivingFinalisedAt?: string;
  receivingFinalisedBy?: string;

  /** Proforma, bill of lading, customs paperwork, delivery photos. */
  attachments?: ShipmentAttachment[];

  /**
   * Individual import charge payments.
   *
   * Optional, and absent on every shipment created before charges became a
   * list. The costing engine sums this when it exists and falls back to the
   * four amounts above when it does not, so nothing already entered changes.
   */
  charges?: ShipmentCharge[];

  /**
   * What has been paid to the supplier for the goods.
   *
   * Denormalised for reading: the payment picker needs a remaining balance for
   * every eligible shipment, and a query per shipment on every form open is too
   * slow. Rebuildable from the transactions carrying this shipment's id.
   */
  /**
   * Charges that arrived after every unit had already been stocked in.
   *
   * There is no line left to carry them — the units are gone, some of them
   * sold — so they sit here and appear on the costing sheet as their own row,
   * marked. Without it the shipment stops balancing: money was spent and the
   * sheet has nowhere to show it.
   *
   * These do not reach inventory. A product holding value with no units under
   * it would report stock that does not exist.
   */
  unallocatedCharges?: number;

  supplierPaidAmount?: number;

  /**
   * Which charge kinds have been declared finished.
   *
   * Customs, freight, tax and other are paid as often as they are billed — a
   * clearing agent invoices duty, then storage weeks later, then a handling fee.
   * Nothing in the numbers can tell you the last one has arrived, so it is
   * declared: someone presses a button on the shipment saying no more customs
   * is coming.
   *
   * Per kind rather than one flag, because they close at different times. Duty
   * settles on clearance; freight often waits for the forwarder's final
   * invoice.
   *
   * The Transactions picker lists a shipment under a kind until that kind is
   * closed. Costing cannot be finalised until all four are.
   */
  chargeClosure?: Partial<Record<ChargeKind, { closedAt: string; closedBy?: string }>>;

  /**
   * Individual payments to the supplier for the goods.
   *
   * Separate from `charges` because this money settles the purchase and goes to
   * the supplier, while charges go to the clearing agent and the government.
   * Mixing them would make the landed cost include money the supplier was paid
   * for duty they never handled.
   */
  supplierPayments?: ShipmentSupplierPayment[];

  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export type CreateShipmentDTO = Omit<Shipment, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateShipmentDTO = Partial<Omit<Shipment, 'id' | 'createdAt'>>;

export interface ShipmentFilters {
  search: string;
  brand: string;
  status: string;
  costing: string;
}

export interface ShipmentSummary {
  total: number;
  inTransit: number;
  arrived: number;
  pendingCustoms: number;
  pendingFreight: number;
  pendingCosting: number;
  partiallyReceived: number;
  landedValue: number;
}