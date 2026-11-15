export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s-()]{10,}$/;
  return phoneRegex.test(phone);
}

export function isValidPassword(password: string): boolean {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
}

export function isValidOtp(otp: string): boolean {
  return /^\d{6}$/.test(otp);
}

export function isNotEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function isValidPrice(price: string | number): boolean {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return !isNaN(numPrice) && numPrice > 0;
}

export function isValidVehiclePlate(plate: string): boolean {
  // Basic validation - alphanumeric, 4-10 characters
  const plateRegex = /^[A-Z0-9-]{4,10}$/i;
  return plateRegex.test(plate);
}

export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

export function validateEmail(email: string): ValidationResult {
  if (!isNotEmpty(email)) {
    return { isValid: false, error: 'Email is required' };
  }
  if (!isValidEmail(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }
  return { isValid: true };
}

export function validatePhone(phone: string): ValidationResult {
  if (!isNotEmpty(phone)) {
    return { isValid: false, error: 'Phone number is required' };
  }
  if (!isValidPhone(phone)) {
    return { isValid: false, error: 'Invalid phone number' };
  }
  return { isValid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (!isNotEmpty(password)) {
    return { isValid: false, error: 'Password is required' };
  }
  if (!isValidPassword(password)) {
    return {
      isValid: false,
      error: 'Password must be at least 8 characters with uppercase, lowercase, and number',
    };
  }
  return { isValid: true };
}
