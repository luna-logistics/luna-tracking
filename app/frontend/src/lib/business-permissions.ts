import type { BusinessRole } from '@/lib/businesses';

/**
 * Role → action capabilities. Mirrors (loosely) what the RLS policies
 * enforce at the DB layer. Anything sensitive re-checks server-side —
 * this map is UX only (hide/disable buttons, avoid unnecessary round-
 * trips). Never trust it as a security boundary.
 *
 * Actions are named "domain.verb" so we can grow the list without
 * reshuffling. Phase-3+ tables (shipments, quotes, invoices, ...) will
 * add their own actions here.
 */
export type BusinessAction =
  | 'business.update'          // edit business info (name, address, ...)
  | 'business.delete'
  | 'members.read'
  | 'members.invite'
  | 'members.update_role'
  | 'members.remove'
  | 'settings.billing'         // future: subscription / plan
  // Placeholders for later phases:
  | 'clients.read'
  | 'clients.write'
  | 'shipments.read'
  | 'shipments.write'
  | 'quotes.read'
  | 'quotes.write'
  | 'invoices.read'
  | 'invoices.write'
  | 'expenses.read'
  | 'expenses.write'
  | 'reports.read'
  ;

const R = {
  owner:      new Set<BusinessAction>([
    'business.update', 'business.delete',
    'members.read', 'members.invite', 'members.update_role', 'members.remove',
    'settings.billing',
    'clients.read', 'clients.write',
    'shipments.read', 'shipments.write',
    'quotes.read', 'quotes.write',
    'invoices.read', 'invoices.write',
    'expenses.read', 'expenses.write',
    'reports.read',
  ]),
  admin:      new Set<BusinessAction>([
    'business.update',
    'members.read', 'members.invite', 'members.update_role', 'members.remove',
    'clients.read', 'clients.write',
    'shipments.read', 'shipments.write',
    'quotes.read', 'quotes.write',
    'invoices.read', 'invoices.write',
    'expenses.read', 'expenses.write',
    'reports.read',
  ]),
  manager:    new Set<BusinessAction>([
    'members.read',
    'clients.read', 'clients.write',
    'shipments.read', 'shipments.write',
    'quotes.read', 'quotes.write',
    'invoices.read',
    'expenses.read',
    'reports.read',
  ]),
  accounting: new Set<BusinessAction>([
    'members.read',
    'clients.read',
    'shipments.read',
    'quotes.read',
    'invoices.read', 'invoices.write',
    'expenses.read', 'expenses.write',
    'reports.read',
  ]),
  operations: new Set<BusinessAction>([
    'members.read',
    'clients.read',
    'shipments.read', 'shipments.write',
    'quotes.read',
  ]),
  viewer:     new Set<BusinessAction>([
    'members.read',
    'clients.read',
    'shipments.read',
    'quotes.read',
    'invoices.read',
    'expenses.read',
    'reports.read',
  ]),
} as const satisfies Record<BusinessRole, Set<BusinessAction>>;

export function can(role: BusinessRole | null | undefined, action: BusinessAction): boolean {
  if (!role) return false;
  return R[role].has(action);
}
