/**
 * Deep transforms object keys between camelCase and snake_case.
 *
 * The backend stores and returns snake_case throughout. Both mobile apps do
 * this same conversion at their API boundary so feature code can stay in
 * camelCase; the admin panel follows the same convention for consistency.
 */

const toSnakeCaseKey = (key: string): string =>
  key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);

const toCamelCaseKey = (key: string): string => {
  // MongoDB uses _id — map it to 'id' so our interfaces use the conventional name.
  if (key === '_id') return 'id';
  return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
};

const transformKeys = (value: unknown, transformKey: (key: string) => string): unknown => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => transformKeys(item, transformKey));

  // Dates survive JSON as strings, but guard anyway so a Date handed to a
  // request body is not shredded into a plain object of its own properties.
  if (typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      result[transformKey(key)] = transformKeys(inner, transformKey);
    }
    return result;
  }

  return value;
};

export const toSnakeCase = <T = unknown>(value: unknown): T =>
  transformKeys(value, toSnakeCaseKey) as T;

export const toCamelCase = <T = unknown>(value: unknown): T =>
  transformKeys(value, toCamelCaseKey) as T;
