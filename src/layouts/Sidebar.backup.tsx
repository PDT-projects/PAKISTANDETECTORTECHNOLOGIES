// BACKUP of src/layouts/Sidebar.tsx before spacing fix
// Created by BLACKBOXAI

// Sidebar.tsx — updated
// Changes:
//   - "Reports" sidebar link added directly below Dashboard
//   - Only visible when user has at least one report permission
//   - Uses hasAnyReportPermission from useUserPermissions
//   - UPDATED: Added "Bank Activity" link under Banking section

import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  Users,
  Package,
  Banknote,
  Building2,
  FileText,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  PlusCircle,
  Clock,
  FileTextIcon,
  DollarSign,
  ArrowRightLeft,
  HandCoins,
  Percent,
  Calculator,
  UserCheck,
  HardDrive,
  BarChart2,
  Activity,
} from 'lucide-react';

import { useAuth } from '../providers/context/AuthContext';
import { useUserPermissions } from '../modules/user-management/hooks/useUserPermissions';

// Map each screen name to its permission key (must match EXACT Screen type in userService.ts)
const SCREEN_PERMISSIONS: Record<string, Screen> = {
  'dashboard':         'Dashboard',
  'reports':           'Sales Report',             // Reports link shown if any report permission exists
  'add-transaction':   'Add Transaction',
  'pending-payment':   'Pending Payments',
  'bills':             'Bills List',
  'salary':            'Salary Dashboard',
  'banking-overview':  'Banking Dashboard',
  'bank-accounts':     'Bank Accounts List',
  'transfers':         'Bank Transfers List',
  'cash-in-hand':      'Cash List',
  'bank-activity':     'Bank Activity Report',     // ← NEW
  'budgets':           'Budgets List',
  'employees':         'Employees List',

  'inventory-entry':          'Inventory Dashboard',
  'invoices':                 'Invoices List',
  'all-loans':                'Loans Dashboard',
  'payable':                  'Loans Payable',
  'receivable':               'Loans Receivable',
  'commission-overview':      'Commission Slabs',
  'commission-slabs':         'Commission Slabs',
  'commission-calculate':     'Commission Calculation',
  'commission-reports':       'Commission Reports',
  'user-management':          'User Management',
  'assets-management':        'Assets Management',
} as const;

import type { Screen } from '../modules/user-management/models/userService';

export function Sidebar() {
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'finance', 'operations', 'transaction', 'banking', 'loans', 'commission'
  ]);

  const { role, permissions } = useAuth();
  const { hasAnyReportPermission, hasPermission } = useUserPermissions();
  const location = useLocation();

  const canSee = (id: string): boolean => {
    if (role === 'super_admin') return true;
    const requiredScreen = SCREEN_PERMISSIONS[id];
    if (!requiredScreen) return true;
    return permissions.includes(requiredScreen);
  };

  const sectionHasVisibleChildren = (children: any[]): boolean => {
    return children.some((child) => {
      if (child.children) return sectionHasVisibleChildren(child.children);
      return canSee(child.id) || !SCREEN_PERMISSIONS[child.id];
    });
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const menuItems = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: LayoutDashboard,
      path: '/dashboard',
    },
    {
      id: 'finance',
      name: 'Finance',
      icon: Wallet,
      children: [
        {
          id: 'transaction',
          name: 'Transaction',
          icon: ArrowLeftRight,
          children: [
            { id: 'add-transaction', name: ' Transaction', icon: PlusCircle,   path: '/transactions' },
            { id: 'pending-payment', name: ' Pending Payment', icon: Clock,        path: '/transactions/pending' },
            { id: 'bills',           name: ' Bills',           icon: FileTextIcon, path: '/bills' },
            { id: 'salary',          name: ' Salary',          icon: DollarSign,   path: '/salary' },
          ],
        },
        {
          id: 'banking',
          name: 'Banking',
          icon: Building2,
          children: [
            { id: 'banking-overview', name: 'Overview',          icon: FileText,      path: '/banking' },
            { id: 'bank-accounts',    name: 'Bank Accounts',     icon: Building2,     path: '/banking/banks' },
            { id: 'transfers',        name: 'Bank Transfers',    icon: ArrowRightLeft, path: '/banking/transfers' },
            { id: 'cash-in-hand',     name: 'Cash in Hand',      icon: Wallet,        path: '/banking/cash' },
            // ── NEW: Bank Activity inside Banking section ──
            { id: 'bank-activity',    name: 'Activity Report',   icon: Activity,      path: '/banking/activity' },
          ],
        },
        { id: 'budgets', name: 'Budgets', icon: Banknote, path: '/budgets' },
      ],
    },
    {
      id: 'operations',
      name: 'Operations',
      icon: Package,
      children: [
        { id: 'employees Ascent of sidebar </div>
        { id: 'employees',       name: 'Employees',         icon: Users,      path: '/employees' },
        { id: 'inventory-entry', name: 'Inventory',         icon: Package,    path: '/inventory' },
        { id: 'invoices',        name: 'Invoices',          icon: FileText,   path: '/invoices' },
        { id: 'assets-management', name: 'Assets Management', icon: HardDrive, path: '/assets-management' },
      ],
    },
    {
      id: 'loans',
      name: 'Loans',
      icon: HandCoins,
      children: [
        { id: 'all-loans',  name: 'All Loans',  icon: FileText,    path: '/loans' },
        { id: 'payable',    name: 'Payable',    icon: TrendingDown, path: '/loans/payable' },
        { id: 'receivable', name: 'Receivable', icon: TrendingUp,  path: '/loans/receivable' },
      ],
    },
    {
      id: 'commission',
      name: 'Commission',
      icon: Percent,
      children: [
        { id: 'commission-overview',  name: 'Overview',             icon: FileText,  path: '/commission' },
        { id: 'commission-slabs',     name: 'Commission Slabs',     icon: Percent,   path: '/commission/slabs' },
        { id: 'commission-calculate', name: 'Calculate Commission', icon: Calculator, path: '/commission/calculate' },
        { id: 'commission-reports',   name: 'Commission Reports',   icon: TrendingUp, path: '/commission/reports' },
      ],
    },
    {
      id: 'user-management',
      name: 'User Management',
      icon: UserCheck,
      path: '/user-management',
      superAdminOnly: true,
    },
  ];

  const renderNestedChildren = (children: any[]) => {
    const visibleChildren = children.filter(c => canSee(c.id));
    if (visibleChildren.length === 0) return null;

    return visibleChildren.map((nestedChild) => (
      <NavLink
        key={nestedChild.id}
        to={nestedChild.path || '#'}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-sm font-medium"
        style={({ isActive }) => isActive
          ? { background: '#0f172a', color: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }
          : { color: '#6b7280' }
        }
      >
        {nestedChild.icon && <nestedChild.icon size={14} />}
        <span>{nestedChild.name}</span>
      </NavLink>
    ));
  };

  const renderChildren = (children: any[]) => {
    return children.map((child) => {
      const ChildIcon = child.icon;
      const hasNestedChildren = child.children && child.children.length > 0;

      if (hasNestedChildren) {
        if (!sectionHasVisibleChildren(child.children)) return null;

        return (
          <div key={child.id} className="mb-0.5">
            <button
              onClick={() => toggleSection(child.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 rounded-lg text-sm transition-all"
            >
              <div className="flex items-center gap-2.5">
                {ChildIcon && <ChildIcon size={15} />}
                <span className="font-medium">{child.name}</span>
              </div>
              {expandedSections.includes(child.id)
                ? <ChevronDown size={13} className="text-gray-400" />
                : <ChevronRight size={13} className="text-gray-400" />}
            </button>

            {expandedSections.includes(child.id) && (
              <div className="ml-2 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-3">
                {renderNestedChildren(child.children)}
              </div>
            )}
          </div>
        );
      }

      if (!canSee(child.id)) return null;

      return (
        <NavLink
          key={child.id}
          to={child.path || '#'}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-sm font-medium"
          style={({ isActive }) => isActive
            ? { background: '#0f172a', color: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }
            : { color: '#6b7280' }
          }
        >
          {ChildIcon && <ChildIcon size={15} />}
          <span>{child.name}</span>
        </NavLink>
      );
    });
  };

  return (
    <div className="w-64 bg-white border-r border-gray-100 flex flex-col h-full">
      <div className="p-6 border-b border-gray-100">
        <h1 className="font-bold text-xl text-slate-800 tracking-tight">Bullion Electronics</h1>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {/* ── Dashboard ── */}
        {(() => {
          const dashItem = menuItems[0];
          if (!canSee(dashItem.id)) return null;
          return (
            <NavLink
              key={dashItem.id}
              to={dashItem.path!}
              end
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mb-0.5 font-semibold text-sm"
              style={({ isActive }) => isActive
                ? { background: '#0f172a', color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
                : { color: '#374151' }
              }
            >
              <dashItem.icon size={17} />
              <span>{dashItem.name}</span>
            </NavLink>
          );
        })()}

        {/* ── Reports — right below Dashboard ── */}
        {(role === 'super_admin' || hasAnyReportPermission) && (
          <NavLink
            to="/reports"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mb-0.5 font-semibold text-sm"
            style={({ isActive }) => isActive
              ? { background: '#0f172a', color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
              : { color: '#374151' }
            }
          >
            <BarChart2 size={17} />
            <span>Reports</span>
          </NavLink>
        )}

        {/* ── Divider ── */}
        <div className="my-2 mx-1 border-t border-gray-100" />

        {/* ── Rest of menu items (skip Dashboard which is index 0) ── */}
        {menuItems.slice(1).map((item) => {
          const Icon = item.icon;
          const hasChildren = item.children && item.children.length > 0;

          if (item.superAdminOnly && role !== 'super_admin') return null;

          if (!hasChildren && item.path) {
            if (!canSee(item.id)) return null;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mb-0.5 font-semibold text-sm"
                style={({ isActive }) => isActive
                  ? { background: '#0f172a', color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
                  : { color: '#374151' }
                }
              >
                {Icon && <Icon size={17} />}
                <span>{item.name}</span>
              </NavLink>
            );
          }

          if (hasChildren && !sectionHasVisibleChildren(item.children!)) return null;

          return (
            <div key={item.id} className="mb-0.5">
              <button
                onClick={() => toggleSection(item.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-all"
              >
                <div className="flex items-center gap-3">
                  {Icon && <Icon size={17} />}
                  <span className="font-semibold text-sm">{item.name}</span>
                </div>
                {expandedSections.includes(item.id)
                  ? <ChevronDown size={14} className="text-gray-400" />
                  : <ChevronRight size={14} className="text-gray-400" />}
              </button>

              {expandedSections.includes(item.id) && (
                <div className="mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-3 ml-[22px]">
                  {renderChildren(item.children!)}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

