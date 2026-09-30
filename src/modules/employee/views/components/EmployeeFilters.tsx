// Employee Module - View Layer
// EmployeeFilters Component - Filter UI for employee list

import { EmployeeFilters as EmployeeFiltersType } from '../../models/types';

interface EmployeeFiltersProps {
  filters: EmployeeFiltersType;
  uniquePositions: string[];
  onFilterChange: (key: keyof EmployeeFiltersType, value: any) => void;
  onClearFilters: () => void;
}

export function EmployeeFilters({ filters, uniquePositions, onFilterChange, onClearFilters }: EmployeeFiltersProps) {
  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search by Name</label>
          <input type="text" value={filters.nameSearch} onChange={e => onFilterChange('nameSearch', e.target.value)} placeholder="Enter name..." className={inp} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Position</label>
          <select value={filters.positionFilter} onChange={e => onFilterChange('positionFilter', e.target.value)} className={inp}>
            <option value="">All Positions</option>
            {uniquePositions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min Salary (PKR)</label>
          <input type="number" value={filters.minSalary || ''} onChange={e => onFilterChange('minSalary', e.target.value ? Number(e.target.value) : null)} placeholder="0" className={inp} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary (PKR)</label>
          <input type="number" value={filters.maxSalary || ''} onChange={e => onFilterChange('maxSalary', e.target.value ? Number(e.target.value) : null)} placeholder="No limit" className={inp} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search by Phone</label>
          <input type="text" value={filters.phoneSearch} onChange={e => onFilterChange('phoneSearch', e.target.value)} placeholder="Enter phone..." className={inp} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search by Email</label>
          <input type="text" value={filters.emailSearch} onChange={e => onFilterChange('emailSearch', e.target.value)} placeholder="Enter email..." className={inp} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Status</label>
          <select value={filters.statusFilter} onChange={e => onFilterChange('statusFilter', e.target.value)} className={inp}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={onClearFilters} className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors text-sm">
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  );
}