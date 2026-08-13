/**
 * Shared Role type, rank table, and role-resolution rules.
 *
 * Roles are stored in Clerk publicMetadata.role and are read independently
 * on the frontend (hooks/useRole.ts) and backend (lib/auth.ts, routes/admin.ts).
 * This module is the single source of truth for the Role type and the
 * "no explicit role defaults to admin" rule - any change here applies
 * everywhere it's imported, since a mismatch between frontend and backend
 * checks has been a real bug source.
 */

export type Role = "foreman" | "manager" | "admin";

/** Rank order so callers can compare roles, e.g. admin > manager > foreman. */
export const ROLE_RANK: Record<Role, number> = {
  foreman: 0,
  manager: 1,
  admin: 2,
};
/** True if `value` is one of the three valid Role strings. */
export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "manager" || value === "foreman";
}

/**
 * Resolves a raw, possibly-missing/unrecognized role value (e.g. read
 * straight off Clerk publicMetadata.role) to a concrete Role: a recognized
 * value is used as-is, anything else (missing, or unrecognized) resolves to
 * admin. This is the "no explicit role defaults to admin" rule - a
 * deliberate choice for a trusted, single-company deployment, not an
 * oversight - used to compute a user's effective role for access checks.
 */
export function resolveRole(claimed: unknown): Role {
  return isRole(claimed) ? claimed : "admin";
}

/**
 * True if `claimed` counts as an admin for boolean guard checks (e.g. the
 * bootstrap admin-existence check): an explicit "admin", or a role that is
 * completely unset. Unlike resolveRole(), an unrecognized/garbage value is
 * deliberately NOT treated as admin here.
 */
export function isUnsetOrAdmin(claimed: unknown): boolean {
  return claimed === undefined || claimed === "admin";
}

/**
 * True if `claimed` is an explicitly-set role other than admin - i.e. the
 * caller should be rejected from an admin-only action. A missing/falsy role
 * is not rejected, since it defaults to admin under the "no explicit role
 * defaults to admin" rule.
 */
export function hasExplicitNonAdminRole(claimed: unknown): boolean {
  return Boolean(claimed) && claimed !== "admin";
}
