import { Router } from "express";
import { clerkClient } from "@clerk/express";
import {
  isRole,
  isUnsetOrAdmin,
  hasExplicitNonAdminRole,
} from "@workspace/shared-role";

const router = Router();

// --- Shared helpers ---

/** Reads the authenticated Clerk user id off the request, or null if signed out. */
function getUserId(req: any): string | null {
  return req.userId ?? req.auth?.userId ?? null;
}

/**
 * True if the workspace already has an effective admin.
 *
 * Role resolution across the app treats a user with NO explicit role as an
 * admin (see getUserRole in lib/auth.ts and requireAdmin below), so brand-new
 * signups have full access by default. This check MUST use the same semantics:
 * a user counts as an admin when their role is explicitly "admin" OR when no
 * role is set at all. Counting only the explicit "admin" string would report
 * "no admin exists" in normal operation (default-admins never carry the
 * explicit string), which would wrongly re-open the self-promotion bootstrap
 * flow to demoted managers/foremen. Bootstrap should only unlock in a genuine
 * lockout - i.e. every user has been explicitly demoted to manager/foreman.
 */
export async function adminExists(): Promise<boolean> {
  const response = await clerkClient.users.getUserList({ limit: 500 });
  return response.data.some((u) => isUnsetOrAdmin(u.publicMetadata?.role));
}

/**
 * Guards a route to admins only. Responds with 401/403 and returns false if
 * the caller isn't an admin, so the route handler can `if (!(await
 * requireAdmin(req, res))) return;` and stop early.
 */
async function requireAdmin(req: any, res: any): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const user = await clerkClient.users.getUser(userId);
  // Users with no explicit role default to admin; only an explicitly-set
  // non-admin role is rejected here.
  const claimedRole = user.publicMetadata?.role as string | undefined;
  if (hasExplicitNonAdminRole(claimedRole)) {
    res.status(403).json({ error: "Forbidden: admin role required" });
    return false;
  }
  return true;
}

// --- User management (admin only) ---

router.get("/admin/users", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const response = await clerkClient.users.getUserList({ limit: 100 });
    const users = response.data.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.emailAddresses[0]?.emailAddress ?? null,
      role: (u.publicMetadata?.role as string) ?? "admin",
      imageUrl: u.imageUrl,
      createdAt: new Date(u.createdAt).toISOString(),
      lastSignInAt: u.lastSignInAt
        ? new Date(u.lastSignInAt).toISOString()
        : null,
    }));
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to fetch users" });
  }
});

router.patch("/admin/users/:id/role", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { role } = req.body;
  if (!isRole(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  try {
    await clerkClient.users.updateUserMetadata(req.params.id, {
      publicMetadata: { role },
    });
    return res.json({ ok: true });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err.message ?? "Failed to update role" });
  }
});

// --- First-time admin bootstrap ---
//
// A brand-new deployment starts with zero admins, so the "admin only" guard
// above would lock everyone out of user management forever - nobody could
// ever grant the first admin role. These two endpoints solve that one-time
// bootstrap problem: any signed-in user may check whether an admin exists
// yet, and may promote *themselves* to admin, but only while the workspace
// still has none. Once an admin exists, bootstrap permanently stops working
// and role changes must go through the admin-only endpoint above.

router.get("/admin/bootstrap-status", async (req, res) => {
  if (!getUserId(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    return res.json({ adminExists: await adminExists() });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err.message ?? "Failed to check admin status" });
  }
});

router.post("/admin/bootstrap", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    if (await adminExists()) {
      return res.status(409).json({
        error:
          "An admin already exists. Ask them to promote you from Settings > Users.",
      });
    }
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: { role: "admin" },
    });
    return res.json({ ok: true });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err.message ?? "Failed to bootstrap admin" });
  }
});

export default router;
