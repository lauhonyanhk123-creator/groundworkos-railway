import type { Request, RequestHandler } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { type Role, ROLE_RANK, resolveRole } from "@workspace/shared-role";

export type { Role };

export async function getUserRole(req: Request): Promise<Role> {
  const cached = (req as any)._role as Role | undefined;
  if (cached) return cached;

  const auth = getAuth(req);
  const userId: string | undefined =
    (req as any).userId ?? (auth as any)?.userId;
  // Users with no explicit role default to admin, so brand-new signups have
  // full access out of the box. An explicitly-set role always takes precedence.
  let role: Role = "admin";
  if (userId) {
    // A Clerk lookup failure is intentionally NOT swallowed here. Falling back
    // to "admin" on error would let an explicitly-demoted manager/foreman
    // silently gain admin during a transient Clerk outage (fail-open privilege
    // escalation). Let it throw so requireRole can fail closed with a 503.
    const user = await clerkClient.users.getUser(userId);
    role = resolveRole(user.publicMetadata?.role);
  }
  (req as any)._role = role;
  return role;
}

/**
 * Express middleware factory: rejects the request with 403 unless the
 * caller's role is at least `minRole` (admin > manager > foreman).
 *
 * Generic over the route's param/body/query types so TypeScript unifies it
 * with the concrete handler it's paired with in `router.METHOD(path, requireRole(...), handler)`
 * instead of falling back to a broader default `ParamsDictionary`.
 */
export function requireRole<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
>(minRole: Role): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return async (req, res, next) => {
    let role: Role;
    try {
      role = await getUserRole(req as unknown as Request);
    } catch {
      // Fail closed: if the caller's role can't be verified (e.g. a Clerk
      // outage), deny the request rather than assuming the default admin role.
      (res.status(503) as any).json({
        error: "Unable to verify permissions, please try again",
      });
      return;
    }
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      (res.status(403) as any).json({
        error: `Forbidden: ${minRole} role required`,
      });
      return;
    }
    next();
  };
}
