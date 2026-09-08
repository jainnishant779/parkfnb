/**
 * Deep transforms object keys between camelCase and snake_case.
 * Used by API interceptors so service code works in camelCase natively
 * while the backend uses snake_case.
 */

const toSnakeCaseKey = (key: string): string =>
  key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);

const toCamelCaseKey = (key: string): string => {
  // MongoDB uses _id — map it to 'id' so interfaces can use the conventional 'id' field
  if (key === '_id') return 'id';
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
};

type AnyObject = Record<string, any>;

const transformKeys = (obj: any, transformFn: (key: string) => string): any => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => transformKeys(item, transformFn));
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result: AnyObject = {};
    for (const key of Object.keys(obj)) {
      result[transformFn(key)] = transformKeys(obj[key], transformFn);
    }
    return result;
  }
  return obj;
};

export const toSnakeCase = (obj: any): any => transformKeys(obj, toSnakeCaseKey);
export const toCamelCase = (obj: any): any => transformKeys(obj, toCamelCaseKey);
