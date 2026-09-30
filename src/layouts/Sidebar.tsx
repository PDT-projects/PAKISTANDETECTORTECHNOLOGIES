import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,LayoutDashboard, ChevronDown, ChevronRight, Package, FileText,  BarChart2, ArrowLeftRight, FilePlus, List,
  ShieldCheck, Ship,
} from 'lucide-react';

import { useAuth } from '../providers/context/AuthContext';
import { useUserPermissions } from '../modules/user-management/hooks/useUserPermissions';
import type { Screen } from '../modules/user-management/models/userService';

// Same switch used by the invoice/GRN PDFs: which deployment is this build for?
const USE_DETECTOR_THEME = import.meta.env.VITE_INVOICE_TEMPLATE === 'detector';
const SIDEBAR_COMPANY_NAME = USE_DETECTOR_THEME ? 'PDT' : 'Bullion Electronics';
const SIDEBAR_COMPANY_INITIAL = USE_DETECTOR_THEME ? 'P' : 'B';

const SCREEN_PERMISSIONS: Record<string, Screen> = {
  'dashboard': 'Dashboard',
  'inventory-entry': 'Inventory Dashboard',
  'purchased-orders': 'Inventory Dashboard',
  'invoices': 'Invoices List',
  'dummy-invoices': 'Dummy Invoices',
  'transactions-list': 'Transaction List',
  'employees': 'Employees List',
  'loans': 'Loans Dashboard',
  'bills': 'Bills List',
  'payable-futuristic': 'Payable to Futuristic',
  'user-management': 'User Management',
};

// Two shapes live in this list: a flat link, and a parent that owns children.
// Without an explicit union TypeScript infers one shape with `children`
// optional, and the `'children' in item` check below cannot narrow it â€” so
// `item.children` reads as possibly undefined.
interface MenuLeaf {
  id: string;
  name: string;
  icon: LucideIcon;
  path: string;
}

interface MenuParent {
  id: string;
  name: string;
  icon: LucideIcon;
  children: MenuLeaf[];
}

type MenuItem = MenuLeaf | MenuParent;

const menuItems: MenuItem[] = [
  { id: 'transactions-list', name: 'Transactions', icon: ArrowLeftRight, path: '/transactions' },  { id: 'inventory-entry', name: 'Inventory', icon: Package, path: '/inventory' },
  { id: 'purchased-orders', name: 'Purchased Orders', icon: Ship, path: '/purchased-orders' },
  {
    id: 'invoices', name: 'Invoices', icon: FileText,
    children: [
      { id: 'invoices', name: 'All Invoices', icon: List, path: '/invoices' },
      // Sidebar link text only â€” display label changed to "Fictitious Invoices".
      // The 'dummy-invoices' id/path and SCREEN_PERMISSIONS['dummy-invoices']
      // permission key (still 'Dummy Invoices', see above) are left unchanged
      // so existing role permissions and routing keep working.
      { id: 'dummy-invoices', name: 'Fictitious Invoices', icon: FilePlus, path: '/invoices/dummy' },
    ],
  },
  { id: 'user-management', name: 'User Management', icon: ShieldCheck, path: '/user-management' },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState<string[]>([]);
  const { role, permissions } = useAuth();
  const { hasAnyReportPermission } = useUserPermissions();

  const canSee = (id: string) => {
    if (role === 'super_admin') return true;
    if (id === 'user-management') return false;
    const requiredScreen = SCREEN_PERMISSIONS[id];
    if (!requiredScreen) return true;
    return permissions.includes(requiredScreen);
  };

  const toggle = (id: string) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const linkClass = 'w-full flex items-center gap-4 px-3 py-2.5 rounded-xl transition-all mb-0.5 font-bold text-sm';
  const linkStyle = ({ isActive }: any) => isActive
    ? { background: '#0f172a', color: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }
    : { color: '#6b7280' };

  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative h-full flex-shrink-0"
      style={{ width: 56 }}
    >
      <div
        className="bg-white border-r border-gray-100 flex flex-col h-full absolute top-0 left-0 overflow-hidden"
        style={{
          width: hovered ? 256 : 56,
          transition: 'width .18s ease',
          zIndex: 40,
          boxShadow: hovered ? '4px 0 20px rgba(15,23,42,0.10)' : 'none',
        }}
      >
      <div className="p-4 border-b border-gray-100 whitespace-nowrap">
        <NavLink to="/dashboard" className="font-bold text-xl text-slate-800 tracking-tight">
          {hovered ? SIDEBAR_COMPANY_NAME : SIDEBAR_COMPANY_INITIAL}
        </NavLink>
      </div>

      <nav
        className="flex-1 py-3 overflow-y-auto overflow-x-hidden"
        style={{ paddingLeft: hovered ? 12 : 8, paddingRight: hovered ? 12 : 8, transition: 'padding .18s ease' }}
      >
        {/* Dashboard */}
        {canSee('dashboard') && (
          <NavLink to="/dashboard" end className={linkClass} style={linkStyle}>
            <LayoutDashboard size={17} style={{ flexShrink: 0 }} />
            <span style={{ opacity: hovered ? 1 : 0, transition: 'opacity .12s', whiteSpace: 'nowrap' }}>Dashboard</span>
          </NavLink>
        )}

        {/* Reports */}
        {(role === 'super_admin' || hasAnyReportPermission) && (
          <NavLink to="/reports" className={linkClass} style={linkStyle}>
            <BarChart2 size={17} style={{ flexShrink: 0 }} />
            <span style={{ opacity: hovered ? 1 : 0, transition: 'opacity .12s', whiteSpace: 'nowrap' }}>Reports</span>
          </NavLink>
        )}

        <div className="my-2 mx-1 border-t border-gray-100" />

        {menuItems.map(item => {
          const Icon = item.icon;

          // â”€â”€ Flat item (no children) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          if (!('children' in item)) {
            if (!canSee(item.id)) return null;
            return (
              <NavLink key={item.id} to={item.path} className={linkClass} style={linkStyle}>
                <Icon size={17} style={{ flexShrink: 0 }} />
                <span style={{ opacity: hovered ? 1 : 0, transition: 'opacity .12s', whiteSpace: 'nowrap' }}>{item.name}</span>
              </NavLink>
            );
          }

          // â”€â”€ Dropdown item â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          const visibleChildren = item.children.filter(c => canSee(c.id));
          if (visibleChildren.length === 0) return null;
          const isOpen = expanded.includes(item.id);

          return (
            <div key={item.id} className="mb-0.5">
              <button
                onClick={() => toggle(item.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-all"
              >
                <div className="flex items-center gap-4">
                  <Icon size={17} style={{ flexShrink: 0 }} />
                  <span className="font-bold text-sm" style={{ opacity: hovered ? 1 : 0, transition: 'opacity .12s', whiteSpace: 'nowrap' }}>{item.name}</span>
                </div>
                {hovered && isOpen
                  ? <ChevronDown size={14} className="text-gray-400" />
                  : <ChevronRight size={14} className="text-gray-400" />}
              </button>

              {hovered && isOpen && (
                <div className="mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-3 ml-[22px]">
                  {visibleChildren.map(c => (
                    <NavLink
                      key={c.id} to={c.path}
                      className="w-full flex items-center gap-4 px-3 py-2 rounded-lg transition-all text-sm font-medium"
                      style={linkStyle}
                    >
                      <c.icon size={14} style={{ flexShrink: 0 }} />
                      <span style={{ opacity: hovered ? 1 : 0, transition: 'opacity .12s', whiteSpace: 'nowrap' }}>{c.name}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      </div>
    </div>
  );
}