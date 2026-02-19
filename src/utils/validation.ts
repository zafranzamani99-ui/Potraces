/**
 * Input Validation Utilities
 * Comprehensive validation functions for user inputs
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate amount/price input
 * @param value Input value
 * @param min Minimum allowed value (default: 0.01)
 * @param max Maximum allowed value (default: 1000000)
 * @returns Validation result
 */
export const validateAmount = (
  value: string | number,
  min: number = 0.01,
  max: number = 1000000
): ValidationResult => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return { isValid: false, error: 'Please enter a valid number' };
  }

  if (numValue < min) {
    return { isValid: false, error: `Amount must be at least ${min}` };
  }

  if (numValue > max) {
    return { isValid: false, error: `Amount cannot exceed ${max.toLocaleString()}` };
  }

  if (!isFinite(numValue)) {
    return { isValid: false, error: 'Please enter a valid amount' };
  }

  return { isValid: true };
};

/**
 * Validate positive integer (for quantities, stock)
 * @param value Input value
 * @param max Maximum allowed value
 * @returns Validation result
 */
export const validatePositiveInteger = (
  value: string | number,
  max: number = 100000
): ValidationResult => {
  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

  if (isNaN(numValue)) {
    return { isValid: false, error: 'Please enter a valid number' };
  }

  if (numValue < 0) {
    return { isValid: false, error: 'Value cannot be negative' };
  }

  if (numValue > max) {
    return { isValid: false, error: `Value cannot exceed ${max.toLocaleString()}` };
  }

  if (!Number.isInteger(numValue)) {
    return { isValid: false, error: 'Please enter a whole number' };
  }

  return { isValid: true };
};

/**
 * Validate email address
 * @param email Email string
 * @returns Validation result
 */
export const validateEmail = (email: string): ValidationResult => {
  const trimmed = email.trim();

  if (!trimmed) {
    return { isValid: false, error: 'Email is required' };
  }

  // RFC 5322 simplified regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }

  if (trimmed.length > 254) {
    return { isValid: false, error: 'Email is too long' };
  }

  return { isValid: true };
};

/**
 * Validate phone number (Malaysian format)
 * @param phone Phone number string
 * @returns Validation result
 */
export const validatePhone = (phone: string): ValidationResult => {
  const trimmed = phone.trim();

  if (!trimmed) {
    return { isValid: false, error: 'Phone number is required' };
  }

  // Remove common separators
  const cleaned = trimmed.replace(/[\s\-\(\)]/g, '');

  // Malaysian phone formats:
  // Mobile: 01X-XXXXXXX or +601X-XXXXXXX
  // Landline: 0X-XXXXXXX or +60X-XXXXXXX
  const mobileRegex = /^(\+?60)?1[0-9]{8,9}$/;
  const landlineRegex = /^(\+?60)?[2-9][0-9]{7,8}$/;

  if (!mobileRegex.test(cleaned) && !landlineRegex.test(cleaned)) {
    return {
      isValid: false,
      error: 'Please enter a valid Malaysian phone number',
    };
  }

  return { isValid: true };
};

/**
 * Validate text input (required non-empty string)
 * @param text Input text
 * @param fieldName Field name for error message
 * @param minLength Minimum length
 * @param maxLength Maximum length
 * @returns Validation result
 */
export const validateRequired = (
  text: string,
  fieldName: string = 'This field',
  minLength: number = 1,
  maxLength: number = 500
): ValidationResult => {
  const trimmed = text.trim();

  if (!trimmed) {
    return { isValid: false, error: `${fieldName} is required` };
  }

  if (trimmed.length < minLength) {
    return {
      isValid: false,
      error: `${fieldName} must be at least ${minLength} characters`,
    };
  }

  if (trimmed.length > maxLength) {
    return {
      isValid: false,
      error: `${fieldName} cannot exceed ${maxLength} characters`,
    };
  }

  return { isValid: true };
};

/**
 * Validate percentage (0-100)
 * @param value Input value
 * @returns Validation result
 */
export const validatePercentage = (
  value: string | number
): ValidationResult => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return { isValid: false, error: 'Please enter a valid percentage' };
  }

  if (numValue < 0 || numValue > 100) {
    return { isValid: false, error: 'Percentage must be between 0 and 100' };
  }

  return { isValid: true };
};

/**
 * Validate date (not in future, not too far in past)
 * @param date Date object
 * @param maxPastYears Maximum years in the past allowed
 * @returns Validation result
 */
export const validateDate = (
  date: Date,
  maxPastYears: number = 10
): ValidationResult => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return { isValid: false, error: 'Please enter a valid date' };
  }

  const now = new Date();
  const maxPast = new Date();
  maxPast.setFullYear(maxPast.getFullYear() - maxPastYears);

  if (date > now) {
    return { isValid: false, error: 'Date cannot be in the future' };
  }

  if (date < maxPast) {
    return {
      isValid: false,
      error: `Date cannot be more than ${maxPastYears} years ago`,
    };
  }

  return { isValid: true };
};

/**
 * Sanitize text input (prevent XSS)
 * @param text Input text
 * @returns Sanitized text
 */
export const sanitizeText = (text: string): string => {
  return text
    .trim()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};
