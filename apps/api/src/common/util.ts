import { Decimal } from 'decimal.js';

export const today = () => new Date().toLocaleDateString('en-CA');

export const money = (d: Decimal.Value) => new Decimal(d).toFixed(2);

const OMIT = new Set(['tenantId', 'createdAt', 'updatedAt', 'bankTransactionId']);

// Drops bookkeeping columns and nulls so rows match the optional-field contracts.
export function dto<T extends object>(row: T) {
  return Object.fromEntries(
    Object.entries(row).filter(([k, v]) => !OMIT.has(k) && v !== null && v !== undefined),
  );
}
