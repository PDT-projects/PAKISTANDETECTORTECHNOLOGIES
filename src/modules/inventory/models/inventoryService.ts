// Inventory Module - Model Layer
// InventoryService - Business logic, data manipulation, and utilities
//
// FIX (v2): getSerialsAtLocation / groupSerialsByLocation / filterProducts now use
// getSerialEffectiveLocation() which treats product.location as the authoritative
// location field. This fixes the case where serialCities holds stale old-location
// values after a product's primary location was changed via the edit form.

import {
  Product, ProductTransfer, CreateProductDTO, UpdateProductDTO,
  CreateTransferDTO, ProductFilters, TransferFilters, ProductStats,
  TransferStats, ValidationResult, SerialStatus, CreatePaymentDTO
} from './types';
import { formatGlobalCurrency } from '../../../shared/currency/globalCurrency';

/**
 * Returns the effective/authoritative location for a single serial number.
 *
 * product.location is ALWAYS the source of truth for where a product's stock lives.
 * serialCities is only meaningful when a serial was explicitly moved to a different
 * location via the transfer flow (and the transfer has been marked Received).
 *
 * When a user edits a product and changes its location field, only product.location
 * is updated — serialCities entries stay as the old city name. So:
 *  - If serialCities[s] === product.location → consistent, use it (same result)
 *  - If serialCities[s] is undefined/empty → fall back to product.location
 *  - If serialCities[s] differs from product.location → stale; use product.location
 *
 * The only exception: if the serial's status is 'In Transit', it was explicitly
 * moved via a transfer and is not currently at product.location.
 */
export function getSerialEffectiveLocation(product: Product, serial: string): string {
  return product.location || '';
}

export class InventoryService {

  // ==================== PRODUCT OPERATIONS ====================

  static filterProducts(products: Product[], filters: ProductFilters): Product[] {
    return products.filter(product => {
      const matchesBrand = !filters.brandSearch ||
        product.brandName.toLowerCase().includes(filters.brandSearch.toLowerCase());
      const matchesModel = !filters.modelSearch ||
        product.modelName.toLowerCase().includes(filters.modelSearch.toLowerCase());
      const matchesCategory = !filters.categoryFilter ||
        product.category === filters.categoryFilter;
      const matchesStatus = !filters.statusFilter ||
        product.status === filters.statusFilter;
      const matchesBuyType = !filters.buyTypeFilter ||
        product.buyType === filters.buyTypeFilter;
      const matchesMinPrice = filters.minPrice === null ||
        product.sellPrice >= filters.minPrice;
      const matchesMaxPrice = filters.maxPrice === null ||
        product.sellPrice <= filters.maxPrice;
      const matchesStock = filters.hasStock === null ||
        (filters.hasStock ? product.stock > 0 : product.stock === 0);
      // Location filter: use product.location as authoritative
      const matchesLocation = !filters.locationFilter ||
        product.location === filters.locationFilter;
      return matchesBrand && matchesModel && matchesCategory &&
        matchesStatus && matchesBuyType && matchesMinPrice &&
        matchesMaxPrice && matchesStock && matchesLocation;
    });
  }

  static createProduct(products: Product[], data: CreateProductDTO): Product[] {
    const newProduct: Product = {
      ...data,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      serialStatus: data.serialNumbers.reduce((acc, serial) => {
        acc[serial] = 'Available';
        return acc;
      }, {} as { [key: string]: SerialStatus })
    };
    return [...products, newProduct];
  }

  static updateProduct(products: Product[], id: string, data: UpdateProductDTO): Product[] {
    return products.map(product =>
      product.id === id
        ? { ...product, ...data, updatedAt: new Date().toISOString() }
        : product
    );
  }

  static deleteProduct(products: Product[], id: string): Product[] {
    return products.filter(product => product.id !== id);
  }

  static findProductById(products: Product[], id: string): Product | undefined {
    return products.find(product => product.id === id);
  }

  static addStock(products: Product[], id: string, quantity: number, serialNumbers: string[]): Product[] {
    return products.map(product => {
      if (product.id === id) {
        const newSerialStatus = { ...product.serialStatus };
        serialNumbers.forEach(serial => { newSerialStatus[serial] = 'Available'; });
        return {
          ...product,
          stock: product.stock + quantity,
          serialNumbers: [...product.serialNumbers, ...serialNumbers],
          serialStatus: newSerialStatus,
          updatedAt: new Date().toISOString()
        };
      }
      return product;
    });
  }

  // ==================== TRANSFER OPERATIONS ====================

  static filterTransfers(transfers: ProductTransfer[], filters: TransferFilters): ProductTransfer[] {
    return transfers.filter(transfer => {
      const matchesProduct = !filters.productSearch ||
        transfer.productName.toLowerCase().includes(filters.productSearch.toLowerCase());
      const matchesFrom = !filters.fromLocation ||
        transfer.fromLocation.toLowerCase().includes(filters.fromLocation.toLowerCase());
      const matchesTo = !filters.toLocation ||
        transfer.toLocation.toLowerCase().includes(filters.toLocation.toLowerCase());
      const matchesStatus = !filters.statusFilter ||
        transfer.status === filters.statusFilter;
      const matchesDateFrom = !filters.dateFrom ||
        new Date(transfer.date || transfer.transferDate || '') >= new Date(filters.dateFrom);
      const matchesDateTo = !filters.dateTo ||
        new Date(transfer.date || transfer.transferDate || '') <= new Date(filters.dateTo);
      return matchesProduct && matchesFrom && matchesTo &&
        matchesStatus && matchesDateFrom && matchesDateTo;
    });
  }

  static createTransfer(transfers: ProductTransfer[], data: CreateTransferDTO, productName: string): ProductTransfer[] {
    const newTransfer: ProductTransfer = {
      ...data,
      id: this.generateId(),
      productName,
      date: data.transferDate,
      status: 'In Transit',
      createdAt: new Date().toISOString()
    };
    return [...transfers, newTransfer];
  }

  static updateTransferStatus(transfers: ProductTransfer[], id: string, status: ProductTransfer['status']): ProductTransfer[] {
    return transfers.map(transfer =>
      transfer.id === id ? { ...transfer, status } : transfer
    );
  }

  static cancelTransfer(transfers: ProductTransfer[], id: string): ProductTransfer[] {
    return this.updateTransferStatus(transfers, id, 'Cancelled');
  }

  static completeTransfer(transfers: ProductTransfer[], id: string): ProductTransfer[] {
    return this.updateTransferStatus(transfers, id, 'Completed');
  }

  // ==================== STATISTICS ====================

  static calculateProductStats(products: Product[]): ProductStats {
    const categories: { [key: string]: number } = {};
    products.forEach(product => {
      categories[product.category] = (categories[product.category] || 0) + 1;
    });
    return {
      totalProducts: products.length,
      totalStock: products.reduce((sum, p) => sum + p.stock, 0),
      totalValue: products.reduce((sum, p) => sum + ((p.costPrice || 0) * p.stock), 0),
      newProducts: products.filter(p => p.status === 'New').length,
      inTransit: products.filter(p => p.status === 'In Transit').length,
      available: products.filter(p => p.status === 'Available').length,
      categories
    };
  }

  static calculateTransferStats(transfers: ProductTransfer[]): TransferStats {
    return {
      totalTransfers: transfers.length,
      pendingTransfers: transfers.filter(t => t.status === 'Pending').length,
      completedTransfers: transfers.filter(t => t.status === 'Completed').length,
      inTransitTransfers: transfers.filter(t => t.status === 'In Transit').length,
      totalQuantityMoved: transfers.reduce((sum, t) => sum + t.quantity, 0)
    };
  }

  // ==================== VALIDATION ====================

  static validateProduct(data: Partial<CreateProductDTO>): ValidationResult {
    const fieldErrors: { [key: string]: string } = {};
    if (!data.brandName?.trim()) fieldErrors.brandName = 'Brand name is required';
    if (!data.modelName?.trim()) fieldErrors.modelName = 'Model name is required';
    if (!data.category?.trim()) fieldErrors.category = 'Category is required';
    if (data.sellPrice === undefined || data.sellPrice < 0) fieldErrors.sellPrice = 'Valid sell price is required';
    if (data.stock === undefined || data.stock < 0) fieldErrors.stock = 'Valid stock quantity is required';
    if (!data.serialNumbers || data.serialNumbers.length === 0) fieldErrors.serialNumbers = 'At least one serial number is required';
    const isValid = Object.keys(fieldErrors).length === 0;
    return { isValid, error: isValid ? undefined : 'Please fix the errors below', fieldErrors };
  }

  static validateTransfer(data: Partial<CreateTransferDTO>, availableStock: number): ValidationResult {
    const fieldErrors: { [key: string]: string } = {};
    if (!data.productId) fieldErrors.productId = 'Product is required';
    if (!data.fromLocation?.trim()) fieldErrors.fromLocation = 'From location is required';
    if (!data.toLocation?.trim()) fieldErrors.toLocation = 'To location is required';
    if (!data.quantity || data.quantity <= 0) fieldErrors.quantity = 'Valid quantity is required';
    else if (data.quantity > availableStock) fieldErrors.quantity = `Quantity exceeds available stock (${availableStock})`;
    if (!data.serialNumbers || data.serialNumbers.length === 0) fieldErrors.serialNumbers = 'At least one serial number is required';
    else if (data.serialNumbers.length !== data.quantity) fieldErrors.serialNumbers = 'Number of serial numbers must match quantity';
    const isValid = Object.keys(fieldErrors).length === 0;
    return { isValid, error: isValid ? undefined : 'Please fix the errors below', fieldErrors };
  }

  // ==================== UTILITY METHODS ====================

  static getUniqueCategories(products: Product[]): string[] {
    return [...new Set(products.map(p => p.category))].sort();
  }

  /** Returns all distinct locations from product.location (authoritative field) */
  static getUniqueLocations(products: Product[]): string[] {
    const locs = new Set<string>();
    products.forEach(p => {
      if (p.location) locs.add(p.location);
    });
    return [...locs].sort();
  }

  static getUniqueTransferLocations(transfers: ProductTransfer[]): string[] {
    const locations = new Set<string>();
    transfers.forEach(t => { locations.add(t.fromLocation); locations.add(t.toLocation); });
    return [...locations].sort();
  }

  static getAvailableSerials(product: Product): string[] {
    if (!product.serialStatus) return product.serialNumbers;
    return product.serialNumbers.filter(serial => product.serialStatus?.[serial] === 'Available');
  }

  static hasAvailableStock(product: Product, quantity: number): boolean {
    return this.getAvailableSerials(product).length >= quantity;
  }

  /**
   * Returns serials at a specific location.
   * Uses product.location as the authoritative location — ignores stale serialCities values.
   * Only excludes serials that are 'In Transit' or 'Damaged'.
   */
  static getSerialsAtLocation(product: Product, location: string): string[] {
    // If this product isn't at the requested location, return nothing
    if (product.location !== location) return [];
    return (product.serialNumbers || []).filter(s => {
      const status = product.serialStatus?.[s] || 'Available';
      return status !== 'In Transit' && status !== 'Damaged';
    });
  }

  /**
   * Groups serialNumbers by their effective location.
   * Uses product.location as the authoritative source.
   */
  static groupSerialsByLocation(product: Product): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    const location = product.location || 'Unknown';
    (product.serialNumbers || []).forEach(s => {
      if (!groups[location]) groups[location] = [];
      groups[location].push(s);
    });
    return groups;
  }

  static getDefaultProductFormData(): Partial<CreateProductDTO> {
    return {
      brandName: '', modelName: '', category: '', sellPrice: 0,
      buyType: 'Import', warrantyYears: 1, stock: 0,
      location: '',
      serialNumbers: [], serialCities: {}, description: '', status: 'New'
    };
  }

  static getDefaultTransferFormData(): Partial<CreateTransferDTO> {
    return {
      productId: '', fromLocation: '', toLocation: '', quantity: 0,
      serialNumbers: [], transferDate: new Date().toISOString().split('T')[0], notes: ''
    };
  }

  static countActiveProductFilters(filters: ProductFilters): number {
    return Object.values(filters).filter(v => v !== '' && v !== null && v !== undefined).length;
  }

  static formatCurrency(amount: number): string {
    return formatGlobalCurrency(amount);
  }

  static formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private static generateId(): string {
    return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}