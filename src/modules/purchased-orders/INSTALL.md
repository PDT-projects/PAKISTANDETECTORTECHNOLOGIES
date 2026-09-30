# Purchased Orders — install

## 1. File placement

Downloads land flat. Each file belongs in a folder:

```
src\modules\purchased-orders\
    index.ts
    models\types.ts
    models\purchasedOrderService.ts
    models\purchasedOrderFirebaseService.ts
    models\seedDemoShipments.ts
    viewModels\usePurchasedOrdersViewModel.ts
    views\PurchasedOrdersView.tsx
    views\ShipmentCreateView.tsx
    views\ShipmentDetailsView.tsx
```

If they land flat, run this from the project root:

```powershell
$p = "src\modules\purchased-orders"
New-Item -ItemType Directory -Force -Path "$p\models","$p\viewModels","$p\views" | Out-Null
Move-Item "$p\types.ts","$p\purchasedOrderService.ts","$p\purchasedOrderFirebaseService.ts","$p\seedDemoShipments.ts" "$p\models\" -Force
Move-Item "$p\usePurchasedOrdersViewModel.ts" "$p\viewModels\" -Force
Move-Item "$p\PurchasedOrdersView.tsx","$p\ShipmentCreateView.tsx","$p\ShipmentDetailsView.tsx" "$p\views\" -Force
Get-ChildItem $p -Recurse -File | ForEach-Object { $_.FullName.Replace((Get-Location).Path + "\$p\","") }
```

## 2. Firestore rule

Add inside `match /databases/{database}/documents {`:

```
    match /purchasedOrders/{docId} {
      allow read, write: if isAuth();
    }
```

```
firebase deploy --only firestore:rules
```

This matches the permission level every other collection in the project uses
(authenticated only, no role check). It is not a recommendation — it is what the
rest of the app does, and diverging here would break the demo.

## 3. Build

```powershell
npx tsc --noEmit --jsx react-jsx --esModuleInterop --skipLibCheck --target es2020 --moduleResolution bundler --module esnext (Get-ChildItem "src\modules\purchased-orders" -Recurse -Include *.ts,*.tsx | ForEach-Object FullName)
npm run build
Get-ChildItem build\assets\index-*.js | Select-Object Name, LastWriteTime
npx firebase deploy --only hosting --project bullionelectronicssoftware
```

The bundle name must change. If it does not, the build did not run and the
deploy will ship the previous code.

## 4. Demo data

Open `/purchased-orders`. While the list is empty a **Load demo data** button
sits next to Create Shipment. It writes three shipments and skips any number
that already exists, so pressing it twice is harmless.

| Shipment | Source | State |
|---|---|---|
| SHP-NOKTA-26-001 | NOKTA COSTING sheet — 12 models, 175 units | Arrived, cleared, costing open |
| SHP-GARRETT-26-002 | GARRETT COSTING sheet — 4 models, 45 units | Costed, 28 of 45 received |
| SHP-FISHER-26-003 | Proforma 481224, First Texas — 9 lines, 123 units | In transit, charges not yet known |

Verified through the costing engine:

```
NOKTA     net USD 32,880.00  = AED 120,669.60   landed AED 136,150.17   reconciles
GARRETT   net USD  9,541.95  = AED  35,018.96   landed AED  38,784.49   reconciles
FISHER    net USD 19,076.00  = AED  70,008.92   landed AED  70,008.92   reconciles
```

The costing sheets were kept in PKR at 300 PKR per USD. Charges here carry the
same economics in the supplier's own currency — Nokta customs of PKR 766,025 is
USD 2,553.42 — converted to AED at each shipment's frozen rate.

## 5. Demo path

1. `/purchased-orders` → **Load demo data**. NOKTA sorts to the top: it is in
   the warehouse and sellable, but its cost is not finalised, so every sale
   from it books an unreliable margin.
2. Switch **View in** to PKR or USD. Storage and calculation stay AED; only the
   reading changes, and a banner says so.
3. Open SHP-NOKTA-26-001.
4. Hover any figure in the costing sheet — the arithmetic behind it appears.
5. Change Customs to 3000. The sheet recalculates as you type; nothing is
   written until Save.
6. Read the green closure banner: the line landed totals sum to the shipment
   total. Finalise costing stays disabled while that check fails.
7. Enter received quantities. Remaining updates, and received cannot exceed
   ordered.
8. Save.

## Not yet connected

Receiving records what arrived. It does not create inventory — stock is still
entered from the Inventory module, which tracks units by serial number. Wiring
the two together needs three answers first:

1. Are serial numbers known at import time, or scanned at the warehouse?
2. Does inventory rise on arrival, or on warehouse receipt?
3. Does the landed unit cost become the product's cost price, or sit beside it?
