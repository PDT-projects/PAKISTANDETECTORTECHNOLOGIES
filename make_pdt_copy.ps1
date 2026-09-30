# Creates a clean copy of the current project for the new, isolated PDT repo.
# Leaves the current folder (Bullion's git repo) completely untouched.

$dest = "C:\Users\NOOR UL IEMAN\OneDrive\Desktop\PDT-System"

if (Test-Path $dest) {
    Write-Host "Folder already exists: $dest"
    Write-Host "Delete it first or pick a different name, then re-run this script."
    exit
}

Write-Host "Copying to $dest ..."
robocopy "." $dest /E /XD .git node_modules build .firebase .vscode "functions\node_modules" | Out-Null

# Remove session junk / debug leftovers that robocopy brought along.
# (.env.local and .env.production.local are kept -- needed for local builds --
# but they will NOT be committed to git, confirmed in the next step.)
$junk = @(
  "firestore-debug.log", "firestore.rules.backup",
  "theirs.txt", "test-vars.json", "tmpInvoiceDebug.mjs", "apply_fixes.sh",
  "useInvoiceFormViewModel.ts", "cors.json",
  "GRN_dump.txt","InvoicePDF_dump.txt","InvoicePdfService_dump.txt",
  "InvoiceService_dump2.txt","InvoiceService_dump3.txt","InvoiceTypes_dump.txt",
  "Login_dump.txt","Login_full_dump.txt","login_panel_dump.txt","RegisterPage_dump.txt","Sidebar_dump.txt",
  "fix_bullet.ps1","fix_grn.ps1","fix_image_col.ps1","fix_invoice.ps1","fix_product_images.ps1","fix_sidebar.ps1","fix_stamp.ps1"
)

$removed = 0
foreach ($f in $junk) {
    $p = Join-Path $dest $f
    if (Test-Path $p) {
        Remove-Item $p -Force
        $removed++
    }
}

Write-Host ""
Write-Host "Copy done."
Write-Host "Junk files removed from the copy: $removed"
Write-Host "New clean PDT folder: $dest"
Write-Host ""
Write-Host "Note: robocopy sometimes prints a summary table above that looks like an error -- that's normal, it isn't one."
