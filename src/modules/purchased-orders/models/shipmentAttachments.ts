// Shipment attachments — upload, list, remove
//
// The proforma, the bill of lading, the customs paperwork and the delivery
// photos all exist as files and, until now, had nowhere to live. Someone
// checking a delivery against its proforma had to find it in email.
//
// Files go to Firebase Storage under `shipments/{shipmentId}/`, and the
// metadata row goes on the shipment document. The storage path is kept on the
// row so deleting the row can delete the file — without it the bucket fills
// with orphans nobody can identify.

import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage';

// Same pattern the inventory service uses — the app is already initialised by
// the time any module imports this, so getStorage() picks up the default.
const storage = getStorage();
import { ShipmentAttachment, AttachmentKind } from './types';
import { PurchasedOrderFirebaseService } from './purchasedOrderFirebaseService';

/**
 * What a shipment attachment is allowed to be.
 *
 * Wider than the inventory image rule because the useful documents here are
 * scans and spreadsheets, not photographs. A bill of lading arrives as a PDF
 * far more often than as a JPEG.
 */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string[]> = {
  'application/pdf':  ['pdf'],
  'image/jpeg':       ['jpg', 'jpeg'],
  'image/png':        ['png'],
  'image/webp':       ['webp'],
  'image/heic':       ['heic'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-excel': ['xls'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'text/csv':         ['csv'],
};

/**
 * 15 MB.
 *
 * Inventory images cap at 5, which is right for a photograph. A scanned
 * multi-page bill of lading routinely exceeds it, and rejecting the document
 * someone actually needs to attach would send them back to email.
 */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export function validateAttachment(file: File): { ok: true } | { ok: false; reason: string } {
  if (!file) return { ok: false, reason: 'No file selected' };

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 15 MB.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: `${file.name} is empty` };
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const allowedForType = ALLOWED_ATTACHMENT_TYPES[file.type];

  // The MIME type is checked first, and the extension is the fallback. Browsers
  // report an empty type for some files — .heic from an iPhone is the common
  // one — so refusing on type alone would block a valid photo.
  if (allowedForType) {
    if (!allowedForType.includes(ext)) {
      return { ok: false, reason: `${file.name} has a .${ext} extension that does not match its content` };
    }
    return { ok: true };
  }

  const everyExt = Object.values(ALLOWED_ATTACHMENT_TYPES).flat();
  if (!everyExt.includes(ext)) {
    return { ok: false, reason: `.${ext} files cannot be attached. Use PDF, an image, Excel or Word.` };
  }
  return { ok: true };
}

/** A human-readable size, for the list. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** True when the file can be shown inline rather than only downloaded. */
export const isImage = (a: ShipmentAttachment): boolean =>
  a.contentType.startsWith('image/');

export async function uploadAttachment(
  shipmentId: string,
  file: File,
  kind: AttachmentKind,
  uploadedBy?: string,
): Promise<ShipmentAttachment> {
  const check = validateAttachment(file);
  if (check.ok === false) throw new Error(check.reason);

  const ext  = (file.name.split('.').pop() || 'bin').toLowerCase();
  const safe = file.name.replace(/[^\w.\-]/g, '_').slice(0, 80);
  const path = `shipments/${shipmentId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
  const fileRef = storageRef(storage, path);

  // A hung upload with no timeout looks like a frozen screen. Thirty seconds is
  // the same limit the inventory images use, and the message names the usual
  // cause rather than saying "failed".
  const timeoutMs = 60_000;
  const url = await Promise.race([
    uploadBytes(fileRef, file, { contentType: file.type || `application/${ext}` })
      .then(() => getDownloadURL(fileRef)),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(
        `Upload timed out after ${timeoutMs / 1000}s — check the Firebase Storage rules and CORS configuration.`,
      )), timeoutMs)),
  ]);

  const row: ShipmentAttachment = {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    url,
    storagePath: path,
    sizeBytes: file.size,
    contentType: file.type || `application/${ext}`,
    kind,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
  };

  const current = await PurchasedOrderFirebaseService.fetchById(shipmentId);
  if (!current) throw new Error('Shipment not found');
  await PurchasedOrderFirebaseService.saveAttachments(
    shipmentId, [...(current.attachments || []), row],
  );

  return row;
}

export async function removeAttachment(shipmentId: string, attachmentId: string): Promise<void> {
  const current = await PurchasedOrderFirebaseService.fetchById(shipmentId);
  if (!current) throw new Error('Shipment not found');

  const gone = (current.attachments || []).find(a => a.id === attachmentId);
  if (!gone) return;

  // The document row goes first. If the storage delete fails the file is
  // orphaned, which is untidy; if the order were reversed a failed row update
  // would leave a row pointing at a file that no longer exists, which breaks
  // the screen.
  await PurchasedOrderFirebaseService.saveAttachments(
    shipmentId, (current.attachments || []).filter(a => a.id !== attachmentId),
  );

  try {
    await deleteObject(storageRef(storage, gone.storagePath));
  } catch {
    // Already gone, or the rules refuse it. The row is what the screen reads,
    // and it is already removed.
  }
}
