// Purchased Orders (Import Shipments) — public surface

export { PurchasedOrdersView }  from './views/PurchasedOrdersView';
export { ShipmentDetailsView }  from './views/ShipmentDetailsView';
export { ShipmentCreateView }   from './views/ShipmentCreateView';

export { usePurchasedOrdersViewModel } from './viewModels/usePurchasedOrdersViewModel';

export { PurchasedOrderFirebaseService } from './models/purchasedOrderFirebaseService';
export { seedDemoShipments, buildDemoShipments } from './models/seedDemoShipments';

export {
  calculateShipmentCosting, shipmentPriority, shipmentWorkflow,
  validateShipment, summariseShipments, filterShipments,
  money, moneyRaw, convertForDisplay,
  DISPLAY_RATES, round2, emptyLine, fmtAed,

  canFinaliseReceiving, isReceivingLocked, receivingProgress,

  chargeTotals, supplierPayable, supplierRemaining,

  // Per-kind charge closure. Customs, freight, tax and other are billed as
  // often as the agent invoices them, so each one is declared finished rather
  // than inferred — and the Transactions picker reads these.
  isChargeKindClosed, openChargeKinds, canFinaliseCosting, shipmentTimeline,
    // Stock-in cost layers. Each stock-in freezes the landed cost of the day;
  // charges paid afterwards raise the cost of whatever is still on the shipment.
  stockedQuantity, stockedValue, remainingToStock,
  remainingLandedUnitCost, unallocatedCharge, canStockIn,
} from './models/purchasedOrderService';

export { buildGoodsReceivedPdf, downloadGoodsReceivedPdf } from './models/goodsReceivedPdf';
export { buildCostingWorkbook, downloadCostingExcel } from './models/costingExcel';

export {
  uploadAttachment, removeAttachment, validateAttachment,
  formatBytes, isImage, MAX_ATTACHMENT_BYTES, ALLOWED_ATTACHMENT_TYPES,
} from './models/shipmentAttachments';

export type {
  Shipment, ShipmentLine, CostedLine, ShipmentCosting,
  CreateShipmentDTO, UpdateShipmentDTO, ShipmentFilters, ShipmentSummary,
  ShipmentCurrency, DisplayCurrency, UnitOfMeasure, ShipmentStatus,
  ReceivingStatus, ShipmentAttachment, AttachmentKind,
  ShipmentCharge, ChargeKind, ShipmentSupplierPayment,  StockBatch,
} from './models/types';

export type { ShipmentTimelineEntry } from './models/purchasedOrderService';

export { ATTACHMENT_KINDS, CHARGE_KINDS } from './models/types';