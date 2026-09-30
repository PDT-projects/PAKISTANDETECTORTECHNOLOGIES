/**
 * Centralized Validation Library & Input Sanitizers
 * Provides standardized validation rules and live input sanitizers across all forms.
 */

// ── REGEX PATTERNS ────────────────────────────────────────────────────────────

// Allows alphabetic characters (Latin + Arabic/Urdu unicode range), spaces, dots, dashes, apostrophes.
// Minimum 2 characters, cannot consist purely of numbers or special symbols.
export const NAME_REGEX = /^(?=.*[a-zA-Z\u0600-\u06FF])[a-zA-Z\u0600-\u06FF\s.'-]+$/;

// Standard international / national phone numbers: 7 to 16 digits, optional leading +
export const PHONE_REGEX = /^\+?[0-9]{7,16}$/;

// Standard email pattern
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// CNIC format: 12345-1234567-1 or general alphanumeric ID format
export const CNIC_REGEX = /^[0-9]{5}-[0-9]{7}-[0-9]{1}$/;
export const GENERAL_ID_REGEX = /^[a-zA-Z0-9-]{4,25}$/;

// ── SANITIZERS (For live keystroke filtering / onChange) ───────────────────────

/**
 * Strips digits and disallowed special characters from name fields on the fly.
 * Allows letters, spaces, dots, dashes, and apostrophes.
 */
export const sanitizeNameInput = (value: string): string => {
  return value.replace(/[^a-zA-Z\u0600-\u06FF\s.'-]/g, '');
};

/**
 * Strips non-digit characters from phone number fields on the fly.
 * Retains leading '+' and digits only.
 */
export const sanitizePhoneInput = (value: string): string => {
  let cleaned = value.replace(/[^0-9+]/g, '');
  // Allow '+' only at the very first character
  if (cleaned.indexOf('+') > 0) {
    cleaned = cleaned[0] === '+' ? '+' + cleaned.replace(/\+/g, '') : cleaned.replace(/\+/g, '');
  }
  return cleaned;
};

/**
 * Strips invalid numeric characters for positive float/decimal numbers.
 * Allows digits and at most one decimal point.
 */
export const sanitizeNumericInput = (value: string): string => {
  let cleaned = value.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[0] + '.' + parts.slice(1).join('');
  }
  return cleaned;
};

/**
 * Auto-formats Pakistani CNIC as XXXXX-XXXXXXX-X as the user types digits.
 */
export const sanitizeCNICInput = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
};

// ── VALIDATION FUNCTIONS (For onSubmit / Form validation) ─────────────────────

export interface ValidationFieldResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validates a Person / Entity / Customer name.
 * Disallows numbers, enforces minimum length.
 */
export const validateName = (name: string | undefined | null, fieldLabel = 'Name', isRequired = true): ValidationFieldResult => {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return isRequired
      ? { isValid: false, error: `${fieldLabel} is required` }
      : { isValid: true, error: null };
  }
  if (trimmed.length < 2) {
    return { isValid: false, error: `${fieldLabel} must be at least 2 characters` };
  }
  if (!NAME_REGEX.test(trimmed)) {
    return { isValid: false, error: `${fieldLabel} can only contain letters (no numbers allowed)` };
  }
  return { isValid: true, error: null };
};

/**
 * Validates a Phone number.
 */
export const validatePhone = (phone: string | undefined | null, fieldLabel = 'Phone number', isRequired = true): ValidationFieldResult => {
  const cleaned = (phone || '').replace(/[\s\-()]/g, '').trim();
  if (!cleaned) {
    return isRequired
      ? { isValid: false, error: `${fieldLabel} is required` }
      : { isValid: true, error: null };
  }
  if (!PHONE_REGEX.test(cleaned)) {
    return { isValid: false, error: `Enter a valid ${fieldLabel.toLowerCase()} (7-16 digits)` };
  }
  return { isValid: true, error: null };
};

/**
 * Validates a positive numeric amount / price / balance.
 */
export const validatePositiveAmount = (amount: any, fieldLabel = 'Amount', isRequired = true): ValidationFieldResult => {
  if (amount === '' || amount === undefined || amount === null) {
    return isRequired
      ? { isValid: false, error: `${fieldLabel} is required` }
      : { isValid: true, error: null };
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || isNaN(n)) {
    return { isValid: false, error: `${fieldLabel} must be a valid number` };
  }
  if (n <= 0) {
    return { isValid: false, error: `${fieldLabel} must be greater than 0` };
  }
  return { isValid: true, error: null };
};

/**
 * Validates non-negative amount (0 or positive).
 */
export const validateNonNegativeAmount = (amount: any, fieldLabel = 'Amount'): ValidationFieldResult => {
  if (amount === '' || amount === undefined || amount === null) {
    return { isValid: true, error: null };
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || isNaN(n)) {
    return { isValid: false, error: `${fieldLabel} must be a valid number` };
  }
  if (n < 0) {
    return { isValid: false, error: `${fieldLabel} cannot be negative` };
  }
  return { isValid: true, error: null };
};

/**
 * Validates Email address.
 */
export const validateEmail = (email: string | undefined | null, isRequired = true): ValidationFieldResult => {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    return isRequired
      ? { isValid: false, error: 'Email is required' }
      : { isValid: true, error: null };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }
  return { isValid: true, error: null };
};

/**
 * Validates CNIC or national ID.
 */
export const validateIdentityNumber = (id: string | undefined | null, isRequired = false): ValidationFieldResult => {
  const trimmed = (id || '').trim();
  if (!trimmed) {
    return isRequired
      ? { isValid: false, error: 'Identity number is required' }
      : { isValid: true, error: null };
  }
  if (CNIC_REGEX.test(trimmed) || GENERAL_ID_REGEX.test(trimmed)) {
    return { isValid: true, error: null };
  }
  return { isValid: false, error: 'Invalid identity format (e.g. 12345-1234567-1 or passport number)' };
};
