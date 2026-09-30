// Invoice Module - Form Wrapper
import React from 'react';
import { useInvoiceFormViewModel } from '../viewModels/useInvoiceFormViewModel';
import { InvoiceFormView } from './InvoiceFormView';

export function InvoiceFormWrapper() {
  const vm = useInvoiceFormViewModel();
  return (
    <InvoiceFormView
      formData={vm.formData}
      selectedProducts={vm.selectedProducts}
      customerSuggestions={vm.customerSuggestions}
      showSuggestions={vm.showSuggestions}
      isEditing={vm.isEditing}
      isLoading={vm.isLoading}
      isSaving={vm.isSaving}
      pdfGenerating={vm.pdfGenerating}
      isDownloadingPdf={vm.isDownloadingPdf}
      savedCountries={vm.savedCountries}
      savedCitiesForCountry={vm.savedCitiesForCountry}
      handleAddCountryCity={vm.handleAddCountryCity}
      salespersonLocations={vm.salespersonLocations}
      deliveryStatuses={vm.deliveryStatuses}
      collectionMethods={vm.collectionMethods}
      availableProducts={vm.availableProducts}
      productsLoading={vm.productsLoading}
      activeEmployees={vm.activeEmployees}
      banks={vm.banks}
      savedSalespersons={vm.savedSalespersons}
      handleAddSalesperson={vm.handleAddSalesperson}
      setFormData={vm.setFormData}
      handleCustomerSearch={vm.handleCustomerSearch}
      handleCustomerSelect={vm.handleCustomerSelect}
      addProduct={vm.addProduct}
      removeProduct={vm.removeProduct}
      updateProduct={vm.updateProduct}
      updateSerial={vm.updateSerial}
      getAvailableSerialsForProduct={vm.getAvailableSerialsForProduct}
      handleSave={vm.handleSave}
      handleCancel={vm.handleCancel}
      handleDownloadPdf={vm.handleDownloadPdf}
      calculateTotal={vm.calculateTotal}
      formatCurrency={vm.formatCurrency}
      invoiceCompany={vm.invoiceCompany}
      setInvoiceCompany={vm.setInvoiceCompany}
      branches={vm.branches}
      handleAddBranch={vm.handleAddBranch}
      salespersonLocationsList={vm.salespersonLocationsList}
      handleAddSalespersonLocation={vm.handleAddSalespersonLocation}
      selectedCurrencies={vm.selectedCurrencies}
      toggleCurrency={vm.toggleCurrency}
      currencyRates={vm.currencyRates}
    />
  );
}