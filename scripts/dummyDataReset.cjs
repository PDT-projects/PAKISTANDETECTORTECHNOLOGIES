/**
 * dummyDataReset.cjs
 * ─────────────────────────────────────────────────────────────────────────
 * Two-step tool:
 *   1) BACKUP — dumps every relevant Firestore collection (and the list of
 *      Firebase Auth users) to local JSON files before anything is touched.
 *   2) CLEAR  — deletes all documents from the "dummy data" collections,
 *      resetting the app to a blank state for testing. Master/config
 *      collections (like `companies`) are left untouched unless you add
 *      them yourself.
 *
 * Nothing in this script touches your app's source code or logic — it only
 * talks to Firestore/Auth directly, the same way the Firebase Console would.
 *
 * USAGE (run from the Bullion-System project root):
 *   node scripts/dummyDataReset.cjs backup
 *   node scripts/dummyDataReset.cjs clear --confirm
 *
 * The "clear" step REFUSES to run without --confirm, and refuses to run
 * unless a backup already exists in scripts/backups/.
 * ─────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');
// firebase-admin v12+ uses modular imports (same style as the client SDK) —
// the old `require('firebase-admin').credential.cert(...)` no longer works.
const { initializeApp, cert }        = require('firebase-admin/app');
const { getFirestore, FieldPath }    = require('firebase-admin/firestore');
const { getAuth }                    = require('firebase-admin/auth');

// ── Setup ────────────────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
const BACKUP_ROOT           = path.join(__dirname, 'backups');
const ADMIN_EMAIL_TO_KEEP   = 'bullion@gmail.com';

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('\n❌  serviceAccountKey.json not found at scripts/serviceAccountKey.json');
  console.error('    Download it from Firebase Console → Project Settings → Service Accounts');
  console.error('    → "Generate New Private Key", save it as scripts/serviceAccountKey.json\n');
  process.exit(1);
}

initializeApp({
  credential: cert(require(SERVICE_ACCOUNT_PATH)),
});
const db   = getFirestore();
const auth = getAuth();

// ── Collections that hold DUMMY / TEST data — these get wiped in "clear" ──
// (Master/reference data like `companies` is intentionally NOT in this list.)
const DUMMY_COLLECTIONS = [
  'transactions', 'deleted_transactions',
  'invoices', 'deleted_invoices', 'dummy_invoices', 'dummy_invoice_counters',
  'customers',
  'products', 'deleted_products', 'damaged_products', 'inv_counters',
  'brands', 'brandModels',
  'dynamicCategories',
  'bills', 'billBranches',
  'loans',
  'salaries', 'employees',
  'commissions', 'commission_slabs',
  'budgets',
  'assets',
  'banks', 'bank_transactions', 'bank_transfers', 'transfers',
  'bank_accounts', 'cash_accounts', 'cash_transactions', 'cashInHand',
  'purchasedOrders', 'againstInvoiceEntries',
  'payable_to_futuristic', 'inventory_payable_configs',
  'pendingInventoryPayments',
  'appNotifications',
  'salespersons',
  'registration_otps',
];

// `users` is handled specially below — every doc/account is deleted EXCEPT
// the one whose email matches ADMIN_EMAIL_TO_KEEP.
const USERS_COLLECTION = 'users';

// ── Helpers ──────────────────────────────────────────────────────────────
const timestamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

async function backupCollection(name, outDir) {
  const snap = await db.collection(name).get();
  const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(docs, null, 2));
  return docs.length;
}

async function backupAuthUsers(outDir) {
  const all = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    result.users.forEach(u => all.push({
      uid: u.uid, email: u.email, displayName: u.displayName, disabled: u.disabled,
    }));
    pageToken = result.pageToken;
  } while (pageToken);
  fs.writeFileSync(path.join(outDir, 'authUsers.json'), JSON.stringify(all, null, 2));
  return all.length;
}

async function deleteCollection(name, batchSize = 300) {
  const collRef = db.collection(name);
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await collRef.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    total += snap.size;
  }
  return total;
}

async function deleteUsersExcept(keepEmail) {
  const snap = await db.collection(USERS_COLLECTION).get();
  let deletedDocs = 0;
  for (const doc of snap.docs) {
    const email = (doc.data().email || '').toLowerCase();
    if (email === keepEmail.toLowerCase()) continue;
    await doc.ref.delete();
    deletedDocs++;
  }

  let deletedAuth = 0;
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const u of result.users) {
      if ((u.email || '').toLowerCase() === keepEmail.toLowerCase()) continue;
      await auth.deleteUser(u.uid);
      deletedAuth++;
    }
    pageToken = result.pageToken;
  } while (pageToken);

  return { deletedDocs, deletedAuth };
}

// ── Commands ─────────────────────────────────────────────────────────────
async function runBackup() {
  const outDir = path.join(BACKUP_ROOT, `backup-${timestamp()}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n📦  Backing up to: ${outDir}\n`);

  const allCollections = [...DUMMY_COLLECTIONS, USERS_COLLECTION, 'companies'];
  let totalDocs = 0;
  for (const name of allCollections) {
    try {
      const count = await backupCollection(name, outDir);
      totalDocs += count;
      console.log(`  ✓ ${name.padEnd(28)} ${count} docs`);
    } catch (err) {
      console.log(`  ⚠ ${name.padEnd(28)} skipped (${err.message})`);
    }
  }

  const authCount = await backupAuthUsers(outDir);
  console.log(`  ✓ ${'Firebase Auth users'.padEnd(28)} ${authCount} accounts`);

  console.log(`\n✅  Backup complete. ${totalDocs} Firestore docs + ${authCount} auth accounts saved.`);
  console.log(`    Location: ${outDir}\n`);
}

async function runClear() {
  if (!fs.existsSync(BACKUP_ROOT) || fs.readdirSync(BACKUP_ROOT).length === 0) {
    console.error('\n❌  No backup found in scripts/backups/. Run "backup" first — refusing to clear without one.\n');
    process.exit(1);
  }

  console.log('\n🧹  Clearing dummy data collections...\n');
  let totalDeleted = 0;
  for (const name of DUMMY_COLLECTIONS) {
    try {
      const count = await deleteCollection(name);
      totalDeleted += count;
      console.log(`  ✓ ${name.padEnd(28)} ${count} docs deleted`);
    } catch (err) {
      console.log(`  ⚠ ${name.padEnd(28)} skipped (${err.message})`);
    }
  }

  console.log(`\n👤  Clearing users (keeping: ${ADMIN_EMAIL_TO_KEEP})...`);
  const { deletedDocs, deletedAuth } = await deleteUsersExcept(ADMIN_EMAIL_TO_KEEP);
  console.log(`  ✓ users collection: ${deletedDocs} docs deleted`);
  console.log(`  ✓ Firebase Auth:    ${deletedAuth} accounts deleted`);

  console.log(`\n✅  Done. ${totalDeleted} dummy docs removed. "companies" collection left untouched.\n`);
}

// ── Entry point ──────────────────────────────────────────────────────────
const cmd = process.argv[2];
const confirmed = process.argv.includes('--confirm');

(async () => {
  if (cmd === 'backup') {
    await runBackup();
  } else if (cmd === 'clear') {
    if (!confirmed) {
      console.error('\n⚠️  Refusing to clear without --confirm flag.');
      console.error('    Run:  node scripts/dummyDataReset.cjs clear --confirm\n');
      process.exit(1);
    }
    await runClear();
  } else {
    console.log('\nUsage:');
    console.log('  node scripts/dummyDataReset.cjs backup');
    console.log('  node scripts/dummyDataReset.cjs clear --confirm\n');
  }
  process.exit(0);
})().catch(err => {
  console.error('\n❌  Error:', err);
  process.exit(1);
});