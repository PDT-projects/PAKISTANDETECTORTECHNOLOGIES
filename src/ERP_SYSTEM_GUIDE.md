# ERP System - User Guide

## Overview
This is a comprehensive ERP (Enterprise Resource Planning) system built for Pakistan Detectors Technologies with multiple branches (Islamabad/Head Office, Karachi, Lahore, Bullion RND/SITE office).

## Modules

### 1. Dashboard
- **Cash Inflow Card**: Shows total cash received
- **Cash Outflow Card**: Shows total cash spent
- **Cash Balance**: Current cash in hand
- **Total Bank Balance**: Sum of all bank accounts
- **Overall Balance**: Total assets (cash + bank)
- **Charts**: 
  - Line chart showing cashflow trends over time
  - Bar chart comparing inflow vs outflow
- **Recent Transactions Table**: Latest 8 transactions

### 2. Employees
- View all employees with details (name, position, salary, phone, email, join date, status)
- **Add Employee**: Create new employee records
- **Edit Employee**: Update employee information
- **View Employee**: See detailed employee profile
- **Delete Employee**: Remove employee from system
- Status tracking (Active/Inactive)

### 3. Products
- Manage product inventory
- **Add Product**: Create new product with SKU, name, category, price, stock
- **Edit Product**: Update product details
- **View Product**: See full product information
- **Delete Product**: Remove product from catalog
- Stock level indicators (green: >10, yellow: 1-10, red: 0)

### 4. Transactions
- **Single Transaction**: Add one transaction at a time
- **Multiple Transactions**: Add multiple transactions in batch
- **Fields**:
  - Company: Select from 4 branches
  - Date: Transaction date
  - Main Category: Cash Inflow / Cash Outflow / Loans & Advances
  - Sub Category: Auto-populated based on main category
  - Amount: Transaction amount
  - Mode: Cash / Bank / Cheque
  - Bank Name: Required for Bank/Cheque mode
  - Note: Transaction description
- **Edit/View/Delete**: Full CRUD operations

### 5. Loans & Advances
- Track loans given to or received from employees
- **Summary Cards**: Total Payable and Total Receivable
- **Fields**:
  - Employee: Dropdown from employee list
  - Loan Amount: Total loan amount
  - Paid: Amount paid so far
  - Remaining: Auto-calculated (Loan Amount - Paid)
  - Type: Payable / Receivable
  - Loan Type: Official / Personal / Other
  - Status: Auto-calculated (Full/Partial based on payment)
- **Edit/View/Delete**: Full CRUD operations

### 6. Banks
- Manage multiple bank accounts
- **Summary**: Total bank balance across all accounts
- **Bank Cards**: Visual representation of each bank
- **Add Bank**: Create new bank account with name, account number, initial balance
- **Transfer Between Banks**: Move money between accounts
- **Edit/Delete**: Update or remove bank accounts

## Categories Structure

### Cash Inflow Categories:
- Product sale received
- Payment received: Customers
- Payment received: Company
- Payment received: TCS/DHL/LCS
- Commission received
- Loan received: From Employee
- Loan received: From Company
- Other

### Cash Outflow Categories:

**Salary/Employee Related:**
- Employee salary
- Advance salary
- Commission paid: Employee
- Commission paid: Dealer
- Loan paid to employee

**Office Expenses:**
- Office Rent
- Electricity
- Gas
- Water
- Internet
- Ptcl
- Petrol expense
- Kitchen Expense
- Grocery Expense
- Stationery Expense
- Marketing/SEO/VPN
- Courier
- Bykea/delivery
- Parcel received Payment

**Other Payments:**
- Payment to company
- Payment to person
- Purchase
- Repair payment
- Cylinder payment
- Medical/hospital bill
- Personal expense/ Non business
- Other payment

### Loans & Advances Categories:
- Loan given
- Loan received
- Official Loan
- Personal loan
- Other loan

## Data Flow Logic

1. **Cash Transactions (Mode: Cash)**:
   - Cash Inflow → Increases Cash Balance
   - Cash Outflow → Decreases Cash Balance

2. **Bank Transactions (Mode: Bank/Cheque)**:
   - Inflow → Increases selected bank balance
   - Outflow → Decreases selected bank balance

3. **Balance Calculations**:
   - Cash Balance = Total Cash Inflow - Total Cash Outflow
   - Total Bank Balance = Sum of all bank account balances
   - Overall Balance = Cash Balance + Total Bank Balance

## Features

- ✅ Fully functional CRUD operations for all modules
- ✅ Real-time balance calculations
- ✅ Multi-branch support
- ✅ Comprehensive transaction categorization
- ✅ Employee-linked loan management
- ✅ Inter-bank transfer functionality
- ✅ Toast notifications for user actions
- ✅ Responsive design
- ✅ Clean, modern UI with iOS-inspired aesthetics
- ✅ Data persistence (in-memory, local state)

## Color Palette

- Primary Blue: `#4f46e5`
- Success Green: `#10b981`
- Error Red: `#ef4444`
- Background: `#f0f2f5`

## Note on Data Persistence

This is a **temporary/demo version** with in-memory state management. All data is stored locally in the browser session and will be reset on page reload. For production use with permanent data storage, consider connecting to a backend service like Supabase.
