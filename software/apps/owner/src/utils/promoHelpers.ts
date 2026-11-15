// Promo Helper Utilities - Validation, formatting, and UI helpers
import type {
  Promo,
  PromoFormData,
  PromoValidationErrors,
  PromoStatus,
  PromoType,
} from '../types/promo';
import { isPromoCodeUnique, derivePromoStatus } from '../services/promoStorage';

// Format currency amount
export function formatCurrency(amount: number, currency: string = 'INR'): string {
  if (currency === 'INR') {
    return `₹${amount.toLocaleString('en-IN')}`;
  }
  return `${currency} ${amount.toLocaleString()}`;
}

// Format discount display
export function formatDiscount(type: PromoType, value: number, currency: string = 'INR'): string {
  if (type === 'PERCENT') {
    return `${value}% off`;
  }
  return `${formatCurrency(value, currency)} off`;
}

// Format date for display
export function formatPromoDate(isoString: string, includeTime: boolean = false): string {
  const date = new Date(isoString);
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.hour12 = true;
  }

  return date.toLocaleDateString('en-IN', options);
}

// Format validity range
export function formatValidityRange(startAt: string, endAt: string): string {
  const startDate = formatPromoDate(startAt);
  const endDate = formatPromoDate(endAt);
  return `Valid: ${startDate} – ${endDate}`;
}

// Format relative time
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;

  return formatPromoDate(isoString);
}

// Get status display info
export interface StatusDisplayInfo {
  label: string;
  color: 'success' | 'warning' | 'danger' | 'neutral' | 'muted';
  icon: string;
}

export function getStatusDisplayInfo(status: PromoStatus): StatusDisplayInfo {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', color: 'success', icon: 'checkmark-circle' };
    case 'SCHEDULED':
      return { label: 'Scheduled', color: 'warning', icon: 'time' };
    case 'EXPIRED':
      return { label: 'Expired', color: 'muted', icon: 'close-circle' };
    case 'DRAFT':
      return { label: 'Draft', color: 'neutral', icon: 'document' };
    case 'DISABLED':
      return { label: 'Disabled', color: 'muted', icon: 'pause-circle' };
    default:
      return { label: 'Unknown', color: 'neutral', icon: 'help-circle' };
  }
}

// Validate promo name
export function validatePromoName(name: string): string | undefined {
  if (!name.trim()) return 'Promo name is required';
  if (name.trim().length < 3) return 'Name must be at least 3 characters';
  if (name.trim().length > 40) return 'Name must be at most 40 characters';
  return undefined;
}

// Validate promo code
export function validatePromoCode(code: string): string | undefined {
  if (!code.trim()) return 'Promo code is required';
  const cleanCode = code.trim().toUpperCase();
  if (cleanCode.length < 4) return 'Code must be at least 4 characters';
  if (cleanCode.length > 16) return 'Code must be at most 16 characters';
  if (!/^[A-Z0-9]+$/.test(cleanCode)) return 'Only letters and numbers allowed';
  return undefined;
}

// Validate percent value
export function validatePercentValue(value: string): string | undefined {
  if (!value.trim()) return 'Discount value is required';
  const num = parseFloat(value);
  if (isNaN(num)) return 'Invalid number';
  if (num < 1) return 'Minimum discount is 1%';
  if (num > 90) return 'Maximum discount is 90%';
  return undefined;
}

// Validate flat value
export function validateFlatValue(value: string): string | undefined {
  if (!value.trim()) return 'Discount value is required';
  const num = parseFloat(value);
  if (isNaN(num)) return 'Invalid number';
  if (num < 1) return 'Minimum discount is ₹1';
  return undefined;
}

// Validate optional number (min booking amount, max discount, etc.)
export function validateOptionalNumber(value: string, minValue: number = 0): string | undefined {
  if (!value.trim()) return undefined; // Optional
  const num = parseFloat(value);
  if (isNaN(num)) return 'Invalid number';
  if (num < minValue) return `Minimum value is ${minValue}`;
  return undefined;
}

// Validate usage limits
export function validateUsageLimits(
  totalLimit: string,
  perUserLimit: string
): { totalLimit?: string; perUserLimit?: string } {
  const errors: { totalLimit?: string; perUserLimit?: string } = {};

  if (totalLimit.trim()) {
    const total = parseInt(totalLimit, 10);
    if (isNaN(total) || !Number.isInteger(total)) {
      errors.totalLimit = 'Must be a whole number';
    } else if (total < 1) {
      errors.totalLimit = 'Minimum limit is 1';
    }
  }

  if (perUserLimit.trim()) {
    const perUser = parseInt(perUserLimit, 10);
    if (isNaN(perUser) || !Number.isInteger(perUser)) {
      errors.perUserLimit = 'Must be a whole number';
    } else if (perUser < 1) {
      errors.perUserLimit = 'Minimum limit is 1';
    } else if (totalLimit.trim()) {
      const total = parseInt(totalLimit, 10);
      if (!isNaN(total) && perUser > total) {
        errors.perUserLimit = 'Cannot exceed total limit';
      }
    }
  }

  return errors;
}

// Validate date range
export function validateDateRange(
  startAt: Date,
  endAt: Date
): { startAt?: string; endAt?: string } {
  const errors: { startAt?: string; endAt?: string } = {};
  const now = new Date();

  if (endAt <= startAt) {
    errors.endAt = 'End date must be after start date';
  }

  return errors;
}

// Full form validation
export async function validatePromoForm(
  formData: PromoFormData,
  existingPromoId?: string
): Promise<PromoValidationErrors> {
  const errors: PromoValidationErrors = {};

  // Name
  const nameError = validatePromoName(formData.name);
  if (nameError) errors.name = nameError;

  // Code
  const codeError = validatePromoCode(formData.code);
  if (codeError) {
    errors.code = codeError;
  } else {
    // Check uniqueness
    const isUnique = await isPromoCodeUnique(formData.code, existingPromoId);
    if (!isUnique) {
      errors.code = 'This code is already in use';
    }
  }

  // Value
  if (formData.type === 'PERCENT') {
    const valueError = validatePercentValue(formData.value);
    if (valueError) errors.value = valueError;
  } else {
    const valueError = validateFlatValue(formData.value);
    if (valueError) errors.value = valueError;
  }

  // Max discount amount (only for percent)
  if (formData.type === 'PERCENT' && formData.maxDiscountAmount.trim()) {
    const maxDiscountError = validateOptionalNumber(formData.maxDiscountAmount, 1);
    if (maxDiscountError) errors.maxDiscountAmount = maxDiscountError;
  }

  // Min booking amount
  if (formData.minBookingAmount.trim()) {
    const minBookingError = validateOptionalNumber(formData.minBookingAmount, 0);
    if (minBookingError) errors.minBookingAmount = minBookingError;
  }

  // Usage limits
  const usageErrors = validateUsageLimits(formData.totalLimit, formData.perUserLimit);
  if (usageErrors.totalLimit) errors.totalLimit = usageErrors.totalLimit;
  if (usageErrors.perUserLimit) errors.perUserLimit = usageErrors.perUserLimit;

  // Date range
  const dateErrors = validateDateRange(formData.startAt, formData.endAt);
  if (dateErrors.startAt) errors.startAt = dateErrors.startAt;
  if (dateErrors.endAt) errors.endAt = dateErrors.endAt;

  // Applicable listings
  if (!formData.applyToAllListings && formData.applicableListingIds.length === 0) {
    errors.applicableListingIds = 'Select at least 1 listing';
  }

  return errors;
}

// Check if form has required fields
export function isFormComplete(formData: PromoFormData): boolean {
  if (!formData.name.trim()) return false;
  if (!formData.code.trim()) return false;
  if (!formData.value.trim()) return false;
  if (!formData.applyToAllListings && formData.applicableListingIds.length === 0) return false;
  return true;
}

// Check if form is valid (no errors)
export function isFormValid(errors: PromoValidationErrors): boolean {
  return Object.keys(errors).length === 0;
}

// Convert form data to Promo object
export function formDataToPromo(formData: PromoFormData, existingPromo?: Promo): Omit<Promo, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: formData.name.trim(),
    code: formData.code.trim().toUpperCase().replace(/\s/g, ''),
    type: formData.type,
    value: parseFloat(formData.value) || 0,
    currency: formData.currency,
    minBookingAmount: formData.minBookingAmount.trim()
      ? parseFloat(formData.minBookingAmount)
      : undefined,
    maxDiscountAmount: formData.type === 'PERCENT' && formData.maxDiscountAmount.trim()
      ? parseFloat(formData.maxDiscountAmount)
      : undefined,
    startAt: formData.startAt.toISOString(),
    endAt: formData.endAt.toISOString(),
    enabled: formData.enabled,
    isDraft: !isFormComplete(formData),
    usage: {
      totalLimit: formData.totalLimit.trim()
        ? parseInt(formData.totalLimit, 10)
        : undefined,
      perUserLimit: formData.perUserLimit.trim()
        ? parseInt(formData.perUserLimit, 10)
        : undefined,
      usedCount: existingPromo?.usage.usedCount || 0,
    },
    applyToAllListings: formData.applyToAllListings,
    applicableListingIds: formData.applyToAllListings ? [] : formData.applicableListingIds,
    notes: formData.notes.trim() || undefined,
  };
}

// Convert Promo to form data
export function promoToFormData(promo: Promo): PromoFormData {
  return {
    name: promo.name,
    code: promo.code,
    type: promo.type,
    value: promo.value.toString(),
    currency: promo.currency,
    minBookingAmount: promo.minBookingAmount?.toString() || '',
    maxDiscountAmount: promo.maxDiscountAmount?.toString() || '',
    startAt: new Date(promo.startAt),
    endAt: new Date(promo.endAt),
    enabled: promo.enabled,
    totalLimit: promo.usage.totalLimit?.toString() || '',
    perUserLimit: promo.usage.perUserLimit?.toString() || '',
    applyToAllListings: promo.applyToAllListings,
    applicableListingIds: promo.applicableListingIds,
    notes: promo.notes || '',
  };
}

// Get initial form data for new promo
export function getInitialFormData(): PromoFormData {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 30);

  return {
    name: '',
    code: '',
    type: 'PERCENT',
    value: '',
    currency: 'INR',
    minBookingAmount: '',
    maxDiscountAmount: '',
    startAt: now,
    endAt: endDate,
    enabled: true,
    totalLimit: '',
    perUserLimit: '',
    applyToAllListings: true,
    applicableListingIds: [],
    notes: '',
  };
}

// Quick date preset helpers
export function getQuickDatePreset(preset: 'today' | 'tomorrow' | 'weekend' | 'next7days'): { startAt: Date; endAt: Date } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today': {
      const endOfDay = new Date(startOfDay);
      endOfDay.setHours(23, 59, 59);
      return { startAt: now, endAt: endOfDay };
    }
    case 'tomorrow': {
      const tomorrow = new Date(startOfDay);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endOfTomorrow = new Date(tomorrow);
      endOfTomorrow.setHours(23, 59, 59);
      return { startAt: tomorrow, endAt: endOfTomorrow };
    }
    case 'weekend': {
      const dayOfWeek = now.getDay();
      const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
      const saturday = new Date(startOfDay);
      saturday.setDate(saturday.getDate() + daysUntilSaturday);
      const sunday = new Date(saturday);
      sunday.setDate(sunday.getDate() + 1);
      sunday.setHours(23, 59, 59);
      return { startAt: saturday, endAt: sunday };
    }
    case 'next7days': {
      const endDate = new Date(startOfDay);
      endDate.setDate(endDate.getDate() + 7);
      endDate.setHours(23, 59, 59);
      return { startAt: now, endAt: endDate };
    }
    default:
      return { startAt: now, endAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) };
  }
}

// Get usage display text
export function getUsageDisplay(usage: Promo['usage']): string {
  const parts: string[] = [];

  if (usage.totalLimit) {
    parts.push(`${usage.usedCount}/${usage.totalLimit} used`);
  } else if (usage.usedCount > 0) {
    parts.push(`${usage.usedCount} used`);
  }

  if (usage.perUserLimit) {
    parts.push(`${usage.perUserLimit}/user`);
  }

  return parts.length > 0 ? parts.join(' • ') : 'Unlimited';
}
