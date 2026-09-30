// Inventory Module - Public API

// ── Models ──────────────────────────────────────────────────
export * from './models/types';
export { InventoryService } from './models/inventoryService';
export * from './models/costingCalculator';
export { InventoryFirebaseService, TransferFirebaseService, BrandModelFirebaseService } from './models/InventoryFirebaseService';

// ── ViewModels ───────────────────────────────────────────────
export { useInventoryAddExistingViewModel } from './viewModels/useInventoryAddExistingViewModel';
export { useInventoryDashboardViewModel } from './viewModels/useInventoryDashboardViewModel';
export { useInventoryListViewModel } from './viewModels/useInventoryListViewModel';
export { useInventoryTypeSelectionViewModel } from './viewModels/useInventoryTypeSelectionViewModel';
export { useInventoryCostingOptionViewModel } from './viewModels/useInventoryCostingOptionViewModel';
export { useInventoryCostingDetailsViewModel } from './viewModels/useInventoryCostingDetailsViewModel';
export { useInventoryProductDetailsViewModel } from './viewModels/useInventoryProductDetailsViewModel';
export { useInventoryPaymentViewModel } from './viewModels/useInventoryPaymentViewModel';
export { useCreateInventoryViewModel } from './viewModels/useCreateInventoryViewModel';
export { useProductTransferViewModel } from './viewModels/useProductTransferViewModel';
export { useProductTransferCreateViewModel } from './viewModels/useProductTransferCreateViewModel';
export { useInventoryMultiModelViewModel } from './viewModels/useInventoryMultimodelViewModel';
export { useDeletedInventoryViewModel } from './viewModels/useDeletedInventoryViewModel';
export { useInventoryReturnViewModel } from './viewModels/useInventoryReturnViewModel';
export { useDamagedInventoryViewModel } from './viewModels/useDamagedInventoryViewModel';
export { useInventoryReportViewModel } from './viewModels/useInventoryReportViewModel';
export { useInventoryPayablesViewModel } from './viewModels/useInventoryPayablesViewModel';

// ── Components ───────────────────────────────────────────────
export { CostingGlobalInputs } from './components/CostingGlobalInputs';
export { CostingTable } from './components/CostingTable';
export { BrandSummary } from './components/BrandSummary';
export { BrandModelSelector } from './components/BrandModelSelector';
export { BrandModelDropdown } from './components/BrandModelDropdown';
export { MultiModelInventoryTable } from './components/MultiModelInventoryTable';
export { AddCostingDialog } from './components/AddCostingDialog';

// ── Views ────────────────────────────────────────────────────
export { InventoryAddExistingView } from './views/InventoryAddExistingView';
export { InventoryDashboardView } from './views/InventoryDashboardView';
export { InventoryListView } from './views/InventoryListView';
export { InventoryTypeSelectionView } from './views/InventoryTypeSelectionView';
export { InventoryCostingOptionView } from './views/InventoryCostingOptionView';
export { InventoryCostingDetailsView } from './views/InventoryCostingDetailsView';
export { InventoryProductDetailsView } from './views/InventoryProductDetailsView';
export { InventoryPaymentView } from './views/InventoryPaymentView';
export { CreateInventoryView } from './views/CreateInventoryView';
export { ProductTransferView } from './views/ProductTransferView';
export { ProductTransferCreateView } from './views/ProductTransferCreateView';
export { DeletedInventoryView } from './views/DeletedInventoryView';
export { InventoryReturnView } from './views/InventoryReturnView';
export { DamagedInventoryView } from './views/DamagedInventoryView';
export { InventoryReportView } from './views/InventoryReportView';
export { InventoryPayablesView } from './views/InventoryPayablesView';

// ── Wrappers ─────────────────────────────────────────────────
export { InventoryAddExistingWrapper } from './views/InventoryAddExistingWrapper';
export { InventoryDashboardWrapper } from './views/InventoryDashboardWrapper';
export { InventoryListWrapper } from './views/InventoryListWrapper';
export { InventoryTypeSelectionWrapper } from './views/InventoryTypeSelectionWrapper';
export { InventoryCostingOptionWrapper } from './views/InventoryCostingOptionWrapper';
export { InventoryCostingDetailsWrapper } from './views/InventoryCostingDetailsWrapper';
export { InventoryProductDetailsWrapper } from './views/InventoryProductDetailsWrapper';
export { InventoryPaymentWrapper } from './views/InventoryPaymentWrapper';
export { DeletedInventoryWrapper } from './views/DeletedInventoryWrapper';
export { ProductTransferWrapper } from './views/ProductTransferWrapper';
export { ProductTransferCreateWrapper } from './views/ProductTransferCreateWrapper';
export { InventoryEditWrapper } from './views/InventoryEditWrapper';
export { InventoryMultiModelWrapper } from './views/InventoryMultimodelWrapper';
export { InventoryReturnWrapper } from './views/InventoryReturnWrapper';
export { DamagedInventoryWrapper } from './views/DamagedInventoryWrapper';
export { InventoryReportWrapper } from './views/InventoryReportWrapper';
export { InventoryPayablesWrapper } from './views/InventoryPayablesWrapper';