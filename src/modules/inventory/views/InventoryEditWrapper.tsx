import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCreateInventoryViewModel } from '../viewModels/useCreateInventoryViewModel';
import { CreateInventoryView } from './CreateInventoryView';
import type { ProductFormData, BuyType } from '../models/types';
import { InventoryFirebaseService } from '../models/InventoryFirebaseService';

export const InventoryEditWrapper: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const viewModel = useCreateInventoryViewModel();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      toast.error('No product ID provided');
      navigate('/inventory');
      return;
    }

    const loadProduct = async () => {
      try {
        setIsLoading(true);
        const product = await InventoryFirebaseService.fetchProductById(id!);
        console.log('🔍 Raw product from Firebase:', product);
        if (!product) {
          setError('Product not found');
          toast.error('Product not found');
          navigate('/inventory');
          return;
        }

        // Load into form - pick only ProductFormData fields
        const formData: ProductFormData = {
          brandId: product.brandId || '',
          brandName: product.brandName || '',
          modelId: product.modelId || '', 
          modelName: product.modelName || '',
          category: product.category || '',
          costPrice: product.costPrice ?? 0,
          sellPrice: product.sellPrice ?? 0,
          // Was hardcoded to 'Import', which silently flipped every Export
          // product back to Import the moment anyone opened it for editing.
          buyType: (product.buyType || 'Import') as BuyType,
          warrantyYears: Number(product.warrantyYears) || 0,
          stock: Number(product.stock) || 0,
          // location was missing from this mapping entirely, so editing a
          // product wiped its stocking location on save.
          location: product.location || '',
          description: product.description || '',
          costingOption: product.costingOption,
          costing: product.costing,
          paymentMethod: undefined,
          paidAmount: undefined,
          serialNumbers: product.serialNumbers || [],
          serialCities: product.serialCities || {},
          isDamaged: product.isDamaged ?? false,
          status: product.status || 'New',
          currentStep: 'details' as const,
        };
        console.log('📝 FormData before load:', formData);
        viewModel.loadFromExisting(formData, id!);
        console.log('✏️ Loaded product for editing:', id, formData.brandName, {
          costPrice: formData.costPrice,
          warrantyYears: formData.warrantyYears
        });
      } catch (err) {
        console.error('Failed to load product:', err);
        setError('Failed to load product');
        toast.error('Failed to load product');
      } finally {
        setIsLoading(false);
      }
    };

    loadProduct();
  }, []); // Empty deps - only run once

  const handleCancel = () => {
    navigate('/inventory');
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p>Loading product details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-red-900 mb-2">Error</h2>
          <p className="text-red-800 mb-4">{error}</p>
          <button 
            onClick={() => navigate('/inventory')}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Back to Inventory
          </button>
        </div>
      </div>
    );
  }

  return (
    <CreateInventoryView
      formData={viewModel.formData}
      currentStep={viewModel.currentStep}
      validation={viewModel.validation}
      isSubmitting={viewModel.isSubmitting}
      isEditMode={true}
      editingId={id || null}
      serialInput={viewModel.serialInput}
      serialCity={viewModel.serialCity}
      setField={viewModel.setField}
      setCurrentStep={viewModel.setCurrentStep}
      setSerialInput={viewModel.setSerialInput}
      setSerialCity={viewModel.setSerialCity}
      addSerialNumber={viewModel.addSerialNumber}
      removeSerialNumber={viewModel.removeSerialNumber}
      goToNextStep={viewModel.goToNextStep}
      goToPreviousStep={viewModel.goToPreviousStep}
      handleSubmit={viewModel.handleSubmit}
      handleCancel={handleCancel}
      selectedImages={viewModel.selectedImages}
      addImages={viewModel.addImages}
      removeImage={viewModel.removeImage}
      removeExistingImage={viewModel.removeExistingImage}
            source={viewModel.source}
      setSource={viewModel.setSource}
      shipments={viewModel.shipments}
      shipmentsLoading={viewModel.shipmentsLoading}
      selectedShipmentId={viewModel.selectedShipmentId}
      setSelectedShipmentId={viewModel.setSelectedShipmentId}
      shipmentLines={viewModel.shipmentLines}
      selectedLineId={viewModel.selectedLineId}
      setSelectedLineId={viewModel.setSelectedLineId}
      selectedLine={viewModel.selectedLine}
      marginPercent={viewModel.marginPercent}
      setMarginPercent={viewModel.setMarginPercent}
    />
  );
};