/**
 * Form validation utilities for the consumer app.
 * Focuses on Indian phone number format.
 */

/**
 * Parse an Indian phone number from any format.
 * Accepts: 9876543210, +919876543210, 09876543210, 91-9876543210, etc.
 * Returns the clean 10-digit string if valid, or null if invalid.
 */
export const parseIndianPhone = (raw) => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  // Strip country code prefix (91 or 0) if present
  let ten;
  if (digits.length === 12 && digits.startsWith('91')) {
    ten = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    ten = digits.slice(1);
  } else if (digits.length === 10) {
    ten = digits;
  } else {
    return null;
  }
  // Valid Indian mobile: starts with 6-9
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
};

/**
 * Mask a 10-digit phone number for display: +91 98XXXXX765
 */
export const maskPhone = (digits) => {
  if (!digits || digits.length !== 10) return digits;
  return `+91 ${digits.slice(0, 2)}XXXXX${digits.slice(7)}`;
};
