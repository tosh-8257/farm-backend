/**
 * Operational permissions for supplier, cargo, and partner work.
 * These are grants on a user, not a new customer account type.
 * Personal, Merchant, and Business remain the only customer surfaces.
 */
export const OPERATIONAL_PERMISSIONS = [
  'catalog:read',
  'supplier:apply',
  'supplier:manage_own',
  'supplier:orders',
  'supplier:admin',
  'listings:manage',
  'orders:sell',
  'orders:buy',
  'cargo:book',
  'cargo:admin',
  'partner:apply',
  'partner:jobs',
  'partner:admin',
  'commerce:settle',
] as const;

export type OperationalPermission = (typeof OPERATIONAL_PERMISSIONS)[number];

export function isOperationalPermission(
  value: string,
): value is OperationalPermission {
  return (OPERATIONAL_PERMISSIONS as readonly string[]).includes(value);
}
