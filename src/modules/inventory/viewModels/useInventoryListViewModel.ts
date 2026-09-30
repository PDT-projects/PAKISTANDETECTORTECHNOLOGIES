// Inventory Module - ViewModel Layer
// useInventoryListViewModel - Fetches products from Firestore
// FIX: Added onDelete handler that removes the item from local allProducts state
//      so it disappears from the list immediately after soft-delete without a reload.
// Change: adds locationFilter support + exposes uniqueLocations for the filter dropdown

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Product, ProductFilters } from '../models/types';
import { InventoryService } from '../models/inventoryService';
import { InventoryFirebaseService } from '../models/InventoryFirebaseService';
import { toast } from 'sonner';

interface UseInventoryListViewModelReturn {
  products: Product[];
  allProducts: Product[];
  categories: string[];
  uniqueLocations: string[];
  filters: ProductFilters;
  showFilters: boolean;
  activeFilterCount: number;
  viewProduct: Product | null;
  isLoading: boolean;
  stats: {
    totalProducts: number;
    totalStock: number;
    totalValue: number;
    newProducts: number;
    inTransit: number;
    available: number;
  };
  setFilter: (key: keyof ProductFilters, value: any) => void;
  clearFilters: () => void;
  toggleFilters: () => void;
  setViewProduct: (product: Product | null) => void;
  onAddNew: () => void;
  onAddToExisting: () => void;
  onTransfer: (id: string) => void;
  onReceiveProduct?: (id: string) => void;
  onDelete: (id: string) => void; // ← FIX: now exposed so View can trigger local removal
}

const DEFAULT_FILTERS: ProductFilters = {
  brandSearch:    '',
  modelSearch:    '',
  categoryFilter: '',
  statusFilter:   '',
  buyTypeFilter:  '',
  locationFilter: '',
  minPrice:       null,
  maxPrice:       null,
  hasStock:       null,
};

export function useInventoryListViewModel(
  inventoryType: 'in-stock' | 'on-order' = 'in-stock'
): UseInventoryListViewModelReturn {
  const navigate = useNavigate();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [filters, setFilters]         = useState<ProductFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      try {
        const fetched = await InventoryFirebaseService.fetchProductsByType(inventoryType);
        setAllProducts(fetched);
        console.log(`✅ Loaded ${fetched.length} ${inventoryType} products`);
      } catch (error) {
        console.error('Error loading products:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadProducts();
  }, [inventoryType]);

  const products          = useMemo(() => InventoryService.filterProducts(allProducts, filters), [allProducts, filters]);
  const categories        = useMemo(() => InventoryService.getUniqueCategories(allProducts), [allProducts]);
  const uniqueLocations   = useMemo(() => InventoryService.getUniqueLocations(allProducts), [allProducts]);
  const stats             = useMemo(() => InventoryService.calculateProductStats(products), [products]);
  const activeFilterCount = useMemo(() => InventoryService.countActiveProductFilters(filters), [filters]);

  const setFilter     = useCallback((key: keyof ProductFilters, value: any) =>
    setFilters(prev => ({ ...prev, [key]: value })), []);
  const clearFilters  = useCallback(() => setFilters(DEFAULT_FILTERS), []);
  const toggleFilters = useCallback(() => setShowFilters(prev => !prev), []);
  const onAddNew      = useCallback(() => navigate('/inventory/create-new'), [navigate]);
  const onAddToExisting = useCallback(() => navigate('/inventory/add-existing'), [navigate]);
  const onTransfer    = useCallback((id: string) => navigate(`/product-transfer?productId=${id}`), [navigate]);

  // FIX: onDelete removes the product from local state immediately so the UI
  // reflects the soft-delete without requiring a page refresh.
  const onDelete = useCallback((id: string) => {
    setAllProducts(prev => prev.filter(p => p.id !== id));
    toast.success('Item moved to Deleted Inventory');
  }, []);

  const onReceiveProduct = useCallback(async (id: string) => {
    try {
      await InventoryFirebaseService.receiveProduct(id);
      setAllProducts(prev => prev.filter(p => p.id !== id));
      toast.success('Product moved to stock successfully');
    } catch (error) {
      console.error('Error receiving product:', error);
      toast.error('Failed to move product to stock');
    }
  }, []);

  return {
    products, allProducts, categories, uniqueLocations,
    filters, showFilters, activeFilterCount,
    viewProduct, isLoading,
    stats: {
      totalProducts: stats.totalProducts,
      totalStock:    stats.totalStock,
      totalValue:    stats.totalValue,
      newProducts:   stats.newProducts,
      inTransit:     stats.inTransit,
      available:     stats.available,
    },
    setFilter, clearFilters, toggleFilters, setViewProduct,
    onAddNew, onAddToExisting, onTransfer,
    onReceiveProduct: inventoryType === 'on-order' ? onReceiveProduct : undefined,
    onDelete, // ← FIX: now returned
  };
}