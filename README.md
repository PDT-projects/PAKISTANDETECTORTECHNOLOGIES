# Attachments and the costing sheet export

Six files. Typecheck and build clean.

---

## First — install xlsx

```powershell
cd "C:\Users\NOOR UL IEMAN\OneDrive\Desktop\accounts_bullion_oor\Bullion-System-main"
npm i xlsx
```

`jspdf` and `jspdf-autotable` were already there.

---

## Files

| File | Where |
|---|---|
| **`shipmentAttachments.ts`** | `src\modules\purchased-orders\models\` — **new** |
| **`costingExcel.ts`** | `src\modules\purchased-orders\models\` — **new** |
| `ShipmentDetailsView.tsx` | `src\modules\purchased-orders\views\` |
| `index.ts` | `src\modules\purchased-orders\` |
| **`storage.rules`** | project root — **new** |
| `firebase.json` | project root |

```powershell
$b = "..\po-backup-$(Get-Date -Format 'MMdd-HHmm')"
New-Item -ItemType Directory -Force -Path $b | Out-Null
Copy-Item -Recurse "src\modules\purchased-orders\*" $b -Force
Copy-Item "firebase.json" $b -Force
```

```powershell
$moves = @{
  'shipmentAttachments.ts'  = 'src\modules\purchased-orders\models\shipmentAttachments.ts'
  'costingExcel.ts'         = 'src\modules\purchased-orders\models\costingExcel.ts'
  'ShipmentDetailsView.tsx' = 'src\modules\purchased-orders\views\ShipmentDetailsView.tsx'
  'index.ts'                = 'src\modules\purchased-orders\index.ts'
  'storage.rules'           = 'storage.rules'
  'firebase.json'           = 'firebase.json'
}
foreach ($name in $moves.Keys) {
  $base = [IO.Path]::GetFileNameWithoutExtension($name)
  $ext  = [IO.Path]::GetExtension($name)
  $src = Get-ChildItem . -File |
         Where-Object { $_.Name -eq $name -or $_.Name -match "^$([regex]::Escape($base)) \(\d+\)$([regex]::Escape($ext))$" } |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($src -and $src.FullName -ne (Join-Path (Get-Location) $moves[$name])) {
    Move-Item $src.FullName $moves[$name] -Force
    Write-Host "moved : $($src.Name)"
  } elseif (-not $src) {
    Write-Host "MILI NAHI : $name"
  }
}
```

```powershell
npm run typecheck
npm run build
```

---

## Deploy the Storage rules

`storage.rules` did not exist. Firebase was falling back to whatever was
configured in the console, which nobody has looked at.

```powershell
npx firebase deploy --only storage --project bullionelectronicssoftware
```

The file covers four paths:

| Path | Read | Write |
|---|---|---|
| `inventory-images/` | signed in | signed in, under 5 MB, images only |
| `shipments/` | signed in | signed in, under 15 MB |
| `invoices/pdfs/` | **anyone** | signed in |
| everything else | closed | closed |

**15 MB for shipments, not 5.** A scanned multi-page bill of lading routinely
exceeds 5 MB, and refusing the document someone actually needs to attach sends
them back to email — which is the problem attachments exist to solve.

**Content type is not restricted on the shipment path.** The useful set is wide
— PDF, images, Excel, Word — and browsers report an empty type for some of them,
notably `.heic` from an iPhone. The client checks type and extension together;
the rule holds the size and the login.

`invoices/pdfs/` is public because WhatsApp fetches the file itself and has no
credentials. That is the business decision from earlier, written down.

---

## Attachments

```
📎 Documents  3                    [ Proforma ▾ ]  [ ⬆ Attach ]

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  [ photo ]   │ │     PDF      │ │     XLSX     │
│              │ │              │ │              │
│ PHOTO        │ │ BILL OF LA…  │ │ CUSTOMS      │
│ delivery.jpg │ │ bl-4812.pdf  │ │ duty.xlsx    │
│ 2.1 MB  ⬇ 🗑 │ │ 840 KB  ⬇ 🗑 │ │ 46 KB   ⬇ 🗑 │
└──────────────┘ └──────────────┘ └──────────────┘
```

Six kinds: Proforma, Commercial invoice, Bill of lading, Customs, Photo, Other.

**The kind is chosen before the file dialog opens**, so the upload knows what it
is without a second prompt afterwards.

**Images preview; everything else shows its extension on a tile.** A thumbnail
is how someone spots the right delivery photo without opening four of them.

**Multiple files at once**, uploaded one at a time rather than in parallel —
each writes the shipment document, and concurrent writes would overwrite each
other's list.

### Removing

The document row goes first, then the file. If the storage delete fails the file
is orphaned, which is untidy. Reversed, a failed row update would leave a row
pointing at a file that no longer exists, which breaks the screen.

### What is checked

```
Size          15 MB
Empty file    refused
MIME type     checked first
Extension     the fallback, and cross-checked against the type
```

A `.pdf` named file whose content says `image/jpeg` is refused — the mismatch is
the signal.

---

## Costing sheet to Excel

```
🧾 Costing sheet                          [ ⬇ Export to Excel ]
```

Downloads `Costing-SHP-NOKTA-2609-001.xlsx`.

### With live formulas, not values

```
G14   =IF(SUM($F$14:$F$38)=0,0,F14/SUM($F$14:$F$38))     share
H14   =B9*G14                                            customs share
K14   =F14+H14+I14+J14                                   landed total
L14   =IF(C14=0,0,K14/C14)                               landed per unit
N14   =L14*M14                                           value received
```

The spreadsheet this screen replaced let an accountant click a cell and read how
the number was reached. Exporting computed values loses exactly what made it
trusted — you get a grid nobody can check.

Change a charge in the header block and every line recalculates in Excel.

### The closure check comes with it

```
Closure check   =IF(ABS(K39-(F39+H39+I39+J39))<0.02,"BALANCED","OUT BY "&TEXT(...))
```

The same assertion the screen makes, as a live formula. It is what tells someone
opening the file next year whether the arithmetic still holds after they have
edited something.

### Columns

```
Product · Model · Qty · Unit price · Disc % · Net · Share %
Customs · Freight · Other · Landed total · Landed / unit
Received · Value received
```

Plus the header block with supplier, dates, status and the four charge totals.

---

## Test

```powershell
npm run dev
```

### Attachments

| # | Steps | Expect |
|---|---|---|
| 1 | Open a shipment, scroll to **Documents** | Kind dropdown and Attach button |
| 2 | Pick **Proforma**, attach a PDF | Tile appears reading PROFORMA |
| 3 | Pick **Photo**, attach a JPEG | **Thumbnail** shows |
| 4 | Click the thumbnail | Opens in a new tab |
| 5 | The ⬇ icon | Downloads with its original name |
| 6 | Attach three files at once | All three appear |
| 7 | Attach a 20 MB file | "…is 20.0 MB. The limit is 15 MB." |
| 8 | Attach a `.exe` | ".exe files cannot be attached" |
| 9 | 🗑 on an attachment | Removed |
| 10 | Reload the page | Attachments still there |

### Excel

| # | Steps | Expect |
|---|---|---|
| 11 | **Export to Excel** | Downloads `Costing-SHP-….xlsx` |
| 12 | Open it, click a Share cell | **A formula**, not a number |
| 13 | Change the Customs total in B9 | **Every line recalculates** |
| 14 | The closure check row | Reads BALANCED |
| 15 | Compare the landed total to the screen | Same figure |

Tests 12 and 13 are the point. If they show plain numbers, the export is
worthless for checking.

Test 7 needs the Storage rules deployed — without them the write is refused by
whatever the console has, and the message will be different.

---

## Commit

```powershell
git add src/modules/purchased-orders/ storage.rules firebase.json package.json package-lock.json
git commit -m "feat(purchased-orders): document attachments and a costing sheet Excel export

The proforma, the bill of lading, the customs paperwork and the delivery photos
all existed as files with nowhere to live, so someone checking a delivery
against its proforma had to find it in email. They now attach to the shipment,
with six kinds, image thumbnails and per-file download.

The kind is chosen before the file dialog opens, so the upload knows what it is
without a second prompt. Files upload one at a time rather than in parallel:
each writes the shipment document, and concurrent writes would overwrite each
other's list. Removal deletes the row before the file, because an orphaned file
is untidy while a row pointing at a missing file breaks the screen.

storage.rules did not exist — Firebase was falling back to whatever the console
had. It now covers inventory images at 5 MB, shipment documents at 15 MB, public
read on invoice PDFs because WhatsApp fetches them without credentials, and a
closed default. Fifteen rather than five because a scanned multi-page bill of
lading routinely exceeds it, and refusing the document someone needs to attach
sends them back to email.

The costing sheet exports with live Excel formulas rather than computed values.
The spreadsheet this screen replaced let an accountant click a cell and read how
a number was reached; exporting values loses exactly that. The closure check
goes with it as a formula, so a file opened next year still says whether the
arithmetic holds."
git push origin HEAD
```

---

## All six tasks are done

```
Task 1  ✅  Charges as a list — data layer
Task 2  ✅  Shipment UI — charges panel, costing lock
Task 3  ✅  Shipment UI — supplier payments
Task 4  ✅  Transactions — sub-categories and picker
Task 5  ✅  Deletion handling and reversal
Task 6  ✅  Attachments and the Excel export
```

---

## One thing that could go further

You asked whether the attachments could be **pinned into** the goods received
note, so opening the PDF gives you everything at once.

Half of it is straightforward: **image** attachments can be appended to the GRN
as extra pages, which jsPDF already does. Photos of the delivery would then
travel with the note.

**PDF attachments cannot be merged** without `pdf-lib`, another dependency and
about three hours. A bill of lading would stay a separate file.

Say if the image half is worth having on its own — it is about an hour.
