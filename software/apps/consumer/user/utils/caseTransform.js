/**
 * Deep transforms object keys between camelCase and snake_case.
 * Used by the API client so all service code works in camelCase natively
 * while the backend uses snake_case.
 *
 * Also maps MongoDB '_id' → 'id' for convenience.
 */

const toSnakeCaseKey = (key) =>
  key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);

const toCamelCaseKey = (key) => {
  if (key === '_id') return 'id';
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
};

const transformKeys = (obj, transformFn) => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => transformKeys(item, transformFn));
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[transformFn(key)] = transformKeys(obj[key], transformFn);
    }
    return result;
  }
  return obj;
};

export const toSnakeCase = (obj) => transformKeys(obj, toSnakeCaseKey);
export const toCamelCase = (obj) => transformKeys(obj, toCamelCaseKey);
