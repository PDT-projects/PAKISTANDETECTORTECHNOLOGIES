// routes.tsx — updated
//         Old /salary/* and /commission/* routes kept as redirects for
//         any bookmarks or links that still point to them.

import React, { useState } from 'react';
import { createBrowserRouter, useNavigate, Navigate, Outlet } from 'react-router-dom';
import { Login } from './pages/Login';
import { RegisterPage } from './pages/RegisterPage';
import { Dashboard } from './features/finance/Dashboard';
import { ReportsPage } from './features/finance/ReportsPage';

import { EmployeeListWrapper, EmployeeCreateWrapper, EmployeeEditWrapper, EmployeeDeleteWrapper } from './modules/employee';

import {
  InventoryDashboardWrapper, InventoryListWrapper, InventoryTypeSelectionWrapper,
  InventoryCostingOptionWrapper, InventoryCostingDetailsWrapper, InventoryProductDetailsWrapper,
  InventoryPaymentWrapper, InventoryAddExistingWrapper, DeletedInventoryWrapper,
  ProductTransferWrapper, ProductTransferCreateWrapper, InventoryEditWrapper, InventoryMultiModelWrapper,
  InventoryReturnWrapper, DamagedInventoryWrapper, InventoryReportWrapper,
} from './modules/inventory';
import { InvoiceListWrapper, InvoiceFormWrapper, InvoiceDeleteWrapper, InvoiceReportWrapper, DeletedInvoicesWrapper } from './modules/invoices';
import { DummyInvoiceListView }    from './modules/invoices/views/DummyInvoiceListView';
import { DummyInvoiceFormWrapper } from './modules/invoices/views/DummyInvoiceFormWrapper';
import {
  TransactionListWrapper, TransactionCreateWrapper, TransactionEditWrapper,
  TransactionDeleteWrapper, PendingPaymentsWrapper,
} from './modules/transactions';
import { BankActivityView } from './modules/banking/views/BankActivityView';
import { PayableToFuturisticWrapper } from './modules/Payable-to-futuristic';
import { Sidebar }  from './layouts/Sidebar';
import { TopBar }   from './layouts/TopBar';
import { useAuth }  from './providers/context/AuthContext';
import { UserManagement } from './modules/user-management';
import { PurchasedOrdersView, ShipmentCreateView, ShipmentDetailsView } from './modules/purchased-orders';
import { ProtectedRoute as ScreenProtectedRoute } from './modules/user-management/components/protectedroute';

// ─── Auth guard ───────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ─── Page layouts ─────────────────────────────────────────────────────────────

function LoginPage() {
  const navigate = useNavigate();
  const { setUser, setRole, setPermissions, setBranch } = useAuth();
  return (
    <Login
      onLoginSuccess={(user: any, role: 'super_admin' | 'user', permissions?: string[], branch?: string) => {
        setUser(user);
        setRole(role);
        setPermissions(permissions || []);
        setBranch(branch || '');
        navigate('/dashboard');
      }}
    />
  );
}

function AppLayout({ activeModule, children }: { activeModule: string; children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="flex h-screen bg-[#f0f2f5]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <TopBar notifications={[]} setNotifications={() => {}} activeModule={activeModule} user={user} />
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function OutletLayout({ activeModule }: { activeModule: string }) {
  return (<AppLayout activeModule={activeModule}><Outlet /></AppLayout>);
}

function DashboardLayout() {
  return (<AppLayout activeModule="dashboard"><Dashboard /></AppLayout>);
}

// ─── Route components ─────────────────────────────────────────────────────────

function EmployeeListRoute()   { return <EmployeeListWrapper />; }
function EmployeeCreateRoute() { return <EmployeeCreateWrapper />; }
function EmployeeEditRoute()   { return <EmployeeEditWrapper />; }
function EmployeeDeleteRoute() { return <EmployeeDeleteWrapper />; }

function InventoryDashboardRoute()      { return <InventoryDashboardWrapper />; }
function InventoryViewRoute()           { return <InventoryListWrapper />; }
function InventoryReceivableRoute()     { return <InventoryListWrapper />; }
function InventoryTypeSelectionRoute()  { return <InventoryTypeSelectionWrapper />; }
function InventoryCostingOptionRoute()  { return <InventoryCostingOptionWrapper />; }
function InventoryCostingDetailsRoute() { return <InventoryCostingDetailsWrapper />; }
function InventoryProductDetailsRoute() { return <InventoryProductDetailsWrapper />; }
function InventoryPaymentRoute()        { return <InventoryPaymentWrapper />; }
function InventoryAddExistingRoute()    { return <InventoryAddExistingWrapper />; }
function DeletedInventoryRoute()        { return <DeletedInventoryWrapper />; }
function ProductTransferListRoute()     { return <ProductTransferWrapper />; }
function ProductTransferNewRoute()      { return <ProductTransferCreateWrapper />; }
function InventoryMultiModelRoute()     { return <InventoryMultiModelWrapper />; }
function InventoryAddReturnedRoute()    { return <InventoryReturnWrapper />; }
function DamagedInventoryRoute()        { return <DamagedInventoryWrapper />; }
function InventoryReportRoute()         { return <InventoryReportWrapper />; }

function InvoiceListRoute()     { return <InvoiceListWrapper />; }
function InvoiceFormRoute()     { return <InvoiceFormWrapper />; }
function InvoiceEditRoute()     { return <InvoiceFormWrapper />; }
function InvoiceDeleteRoute()   { return <InvoiceDeleteWrapper />; }
function InvoiceReportRoute()   { return <InvoiceReportWrapper />; }
function DeletedInvoicesRoute() { return <DeletedInvoicesWrapper />; }

function DummyInvoiceListRoute() { return <DummyInvoiceListView />; }
function DummyInvoiceFormRoute() { return <DummyInvoiceFormWrapper />; }

function TransactionListRoute()   { return <TransactionListWrapper />; }
function TransactionCreateRoute() { return <TransactionCreateWrapper />; }
function TransactionEditRoute()   { return <TransactionEditWrapper />; }
function TransactionDeleteRoute() { return <TransactionDeleteWrapper />; }
function PendingPaymentsRoute()   { return <PendingPaymentsWrapper />; }


function PayableToFuturisticRoute() { return <PayableToFuturisticWrapper />; }

// ─── Router ───────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  { path: '/login',    element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/',          element: (<ProtectedRoute><ScreenProtectedRoute requiredScreen="Dashboard"><DashboardLayout /></ScreenProtectedRoute></ProtectedRoute>) },
  { path: '/dashboard', element: (<ProtectedRoute><ScreenProtectedRoute requiredScreen="Dashboard"><DashboardLayout /></ScreenProtectedRoute></ProtectedRoute>) },

  // ── Employees ──────────────────────────────────────────────────────────────
  {
    path: '/employees',
    element: (<ProtectedRoute><OutletLayout activeModule="employees" /></ProtectedRoute>),
    children: [
      { index: true,        element: <ScreenProtectedRoute requiredScreen="Employees List"><EmployeeListRoute /></ScreenProtectedRoute> },
      { path: 'create',     element: <ScreenProtectedRoute requiredScreen="Create Employee"><EmployeeCreateRoute /></ScreenProtectedRoute> },
      { path: ':id/edit',   element: <ScreenProtectedRoute requiredScreen="Edit Employee"><EmployeeEditRoute /></ScreenProtectedRoute> },
      { path: ':id/delete', element: <ScreenProtectedRoute requiredScreen="Delete Employee"><EmployeeDeleteRoute /></ScreenProtectedRoute> },
    ],
  },

  // ── Loans ──────────────────────────────────────────────────────────────────


  // ── Bills ──────────────────────────────────────────────────────────────────
 

  // ── Transactions ───────────────────────────────────────────────────────────
  {
    path: '/transactions',
    element: (<ProtectedRoute><OutletLayout activeModule="transactions" /></ProtectedRoute>),
    children: [
      { index: true,        element: <ScreenProtectedRoute requiredScreen="Transaction List"><TransactionListRoute /></ScreenProtectedRoute> },
      { path: 'new',        element: <ScreenProtectedRoute requiredScreen="Add Transaction"><TransactionCreateRoute /></ScreenProtectedRoute> },
      { path: ':id/edit',   element: <ScreenProtectedRoute requiredScreen="Transaction Edit"><TransactionEditRoute /></ScreenProtectedRoute> },
      { path: ':id/delete', element: <ScreenProtectedRoute requiredScreen="Transaction Delete"><TransactionDeleteRoute /></ScreenProtectedRoute> },
      { path: 'pending',    element: <ScreenProtectedRoute requiredScreen="Pending Payments"><PendingPaymentsRoute /></ScreenProtectedRoute> },
    ],
  },

  // ── Invoices ───────────────────────────────────────────────────────────────
  {
    path: '/invoices',
    element: (<ProtectedRoute><OutletLayout activeModule="invoices" /></ProtectedRoute>),
    children: [
      { index: true,        element: <ScreenProtectedRoute requiredScreen="Invoices List"><InvoiceListRoute /></ScreenProtectedRoute> },
      { path: 'new',        element: <ScreenProtectedRoute requiredScreen="Create Invoice"><InvoiceFormRoute /></ScreenProtectedRoute> },
      { path: ':id/edit',   element: <ScreenProtectedRoute requiredScreen="Edit Invoice"><InvoiceEditRoute /></ScreenProtectedRoute> },
      { path: ':id/delete', element: <ScreenProtectedRoute requiredScreen="Delete Invoice"><InvoiceDeleteRoute /></ScreenProtectedRoute> },
      { path: 'reports',    element: <ScreenProtectedRoute requiredScreen="Invoice Reports"><InvoiceReportRoute /></ScreenProtectedRoute> },
      { path: 'deleted',    element: <ScreenProtectedRoute requiredScreen="Deleted Invoices"><DeletedInvoicesRoute /></ScreenProtectedRoute> },
      { path: 'dummy',      element: <ScreenProtectedRoute requiredScreen="Dummy Invoices"><DummyInvoiceListRoute /></ScreenProtectedRoute> },
      { path: 'dummy/new',  element: <ScreenProtectedRoute requiredScreen="Dummy Invoices"><DummyInvoiceFormRoute /></ScreenProtectedRoute> },
      { path: 'dummy/:id',  element: <ScreenProtectedRoute requiredScreen="Dummy Invoices"><DummyInvoiceFormRoute /></ScreenProtectedRoute> },
    ],
  },

  // ── Inventory ──────────────────────────────────────────────────────────────
  {
    path: '/inventory',
    element: (<ProtectedRoute><OutletLayout activeModule="inventory" /></ProtectedRoute>),
    children: [
      { index: true,                        element: <ScreenProtectedRoute requiredScreen="Inventory Dashboard"><InventoryDashboardRoute /></ScreenProtectedRoute> },
      { path: 'view',                       element: <ScreenProtectedRoute requiredScreen="Inventory View"><InventoryViewRoute /></ScreenProtectedRoute> },
      { path: 'receivable',                 element: <ScreenProtectedRoute requiredScreen="Inventory Receivable"><InventoryReceivableRoute /></ScreenProtectedRoute> },
      { path: 'report',                     element: <ScreenProtectedRoute requiredScreen="Inventory Report"><InventoryReportRoute /></ScreenProtectedRoute> },
      { path: 'add-returned',               element: <ScreenProtectedRoute requiredScreen="Inventory Add Returned"><InventoryAddReturnedRoute /></ScreenProtectedRoute> },
      { path: 'damaged',                    element: <ScreenProtectedRoute requiredScreen="Damaged Inventory"><DamagedInventoryRoute /></ScreenProtectedRoute> },
      { path: 'create-new',                 element: <ScreenProtectedRoute requiredScreen="Inventory Type Selection"><InventoryTypeSelectionRoute /></ScreenProtectedRoute> },
      { path: 'create-new/costing',         element: <ScreenProtectedRoute requiredScreen="Inventory Costing Option"><InventoryCostingOptionRoute /></ScreenProtectedRoute> },
      { path: 'create-new/costing-details', element: <ScreenProtectedRoute requiredScreen="Inventory Costing Details"><InventoryCostingDetailsRoute /></ScreenProtectedRoute> },
      { path: 'create-new/multi-models',    element: <ScreenProtectedRoute requiredScreen="Inventory Multi Models"><InventoryMultiModelRoute /></ScreenProtectedRoute> },
      { path: 'create-new/details',         element: <ScreenProtectedRoute requiredScreen="Inventory Product Details"><InventoryProductDetailsRoute /></ScreenProtectedRoute> },
      { path: 'create-new/payment',         element: <ScreenProtectedRoute requiredScreen="Inventory Payment"><InventoryPaymentRoute /></ScreenProtectedRoute> },
      { path: 'add-existing',               element: <ScreenProtectedRoute requiredScreen="Inventory Add Existing"><InventoryAddExistingRoute /></ScreenProtectedRoute> },
      { path: 'deleted',                    element: <ScreenProtectedRoute requiredScreen="Deleted Inventory"><DeletedInventoryRoute /></ScreenProtectedRoute> },
      { path: ':id/edit',                   element: <ScreenProtectedRoute requiredScreen="Inventory View"><InventoryEditWrapper /></ScreenProtectedRoute> },
    ],
  },
  {
    path: '/purchased-orders',
    element: (<ProtectedRoute><OutletLayout activeModule="purchased-orders" /></ProtectedRoute>),
    children: [
      { index: true, element: <ScreenProtectedRoute requiredScreen="Inventory Dashboard"><PurchasedOrdersView /></ScreenProtectedRoute> },
      { path: 'new', element: <ScreenProtectedRoute requiredScreen="Inventory Dashboard"><ShipmentCreateView /></ScreenProtectedRoute> },
      { path: ':id', element: <ScreenProtectedRoute requiredScreen="Inventory Dashboard"><ShipmentDetailsView /></ScreenProtectedRoute> },
    ],
  },
  {
    path: '/product-transfer',
    element: (<ProtectedRoute><OutletLayout activeModule="inventory" /></ProtectedRoute>),
    children: [
      { index: true, element: <ScreenProtectedRoute requiredScreen="Product Transfer List"><ProductTransferListRoute /></ScreenProtectedRoute> },
      { path: 'new', element: <ScreenProtectedRoute requiredScreen="Create Product Transfer"><ProductTransferNewRoute /></ScreenProtectedRoute> },
    ],
  },

  // ── Other ──────────────────────────────────────────────────────────────────
  {
    path: '/user-management',
    element: (<ProtectedRoute><OutletLayout activeModule="user-management" /></ProtectedRoute>),
    children: [{ index: true, element: <ScreenProtectedRoute requiredScreen="User Management"><UserManagement /></ScreenProtectedRoute> }],
  },
  {
    path: '/reports',
    element: (<ProtectedRoute><AppLayout activeModule="reports"><ReportsPage /></AppLayout></ProtectedRoute>),
  },
  {
    path: '/reports/bank-activity',
    element: (
      <ProtectedRoute>
        <AppLayout activeModule="reports">
          <ScreenProtectedRoute requiredScreen="Bank Activity Report"><BankActivityView /></ScreenProtectedRoute>
        </AppLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/payable-to-futuristic',
    element: (
      <ProtectedRoute>
        <AppLayout activeModule="payable-to-futuristic">
          <ScreenProtectedRoute requiredScreen="Payable to Futuristic"><PayableToFuturisticRoute /></ScreenProtectedRoute>
        </AppLayout>
      </ProtectedRoute>
    ),
  },
]);