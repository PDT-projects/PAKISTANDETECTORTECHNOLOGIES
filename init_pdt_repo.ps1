# Run this INSIDE the new PDT-System folder.
# Writes a clean .gitignore (fixes the old unresolved merge-conflict mess)
# and starts a brand-new, independent git history -- no link to Bullion's repo.

$gitignore = @'
node_modules/
functions/node_modules/

# Environment variables -- never commit real keys
.env
.env.*
!.env.example

# Logs
logs/
*.log

# Firebase
.firebase/

# Build output
build/
dist/

# IDE
.vscode/
.idea/

# Firebase service account / secrets -- never commit
scripts/serviceAccountKey.json
scripts/backups/

# Archives
*.rar
*.zip

# Session working files (temporary scripts/dumps from development chats)
fix_*.ps1
*_dump.txt
_backup_*/
'@

Set-Content -Path ".gitignore" -Value $gitignore -Encoding utf8
Write-Host "Clean .gitignore written."

git init
git add .
git commit -m "Initial commit: Pakistan Detector Technologies deployment"

Write-Host ""
Write-Host "Done. Checking that no .env file got committed:"
git ls-files | Select-String -Pattern "\.env"
Write-Host "(if the line above is empty, you're safe -- no env file was committed)"
