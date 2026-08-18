import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { isRole, resolveRole } from "@workspace/shared-role";

const router = Router();

// --- Shared helpers ---

/** Reads the authenticated Clerk user id off the request, or null if signed out. */
function getUserId(req: any): string | null {
  return req.userId ?? req.auth?.userId ?? null;
}

/**
 * True if the workspace already has an effective admin.
 *
 * Role resolution across the app treats a user with NO explicit role as a
 * foreman (see getUserRole in lib/auth.ts), so a brand-new signup is never
 * counted as an admin here. Only a user with an explicit "admin" role in
 * Clerk publicMetadata counts. This is what lets the bootstrap flow below
 * unlock exactly once, on a genuinely admin-less workspace, and stay locked
 * afterwards.
 */
export async function adminExists(): Promise<boolean> {
  const response = await clerkClient.users.getUserList({ limit: 500 });
  return response.data.some(
    (u) => resolveRole(u.publicMetadata?.role) === "admin",
  );
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
  // Users with no explicit role default to foreman; only an explicit
  // "admin" role passes here.
  if (resolveRole(user.publicMetadata?.role) !== "admin") {
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
      role: resolveRole(u.publicMetadata?.role),
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

// --- Invitations (admin only) ---
//
// GroundworkOS is a single-company, invite-only instance (see Clerk
// Dashboard -> Restrictions, where public sign-up is disabled). This is the
// in-app way for an admin to actually invite a teammate instead of using the
// Clerk Dashboard directly. The invited role is stamped into the
// invitation's publicMetadata, which Clerk copies onto the user's own
// publicMetadata once they accept and sign up - so a newly-invited teammate
// already has the right role from their very first sign-in.

router.get("/admin/invitations", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const response = await clerkClient.invitations.getInvitationList({
      status: "pending",
      orderBy: "-created_at",
    });
    const invitations = response.data.map((inv) => ({
      id: inv.id,
      email: inv.emailAddress,
      role: resolveRole((inv.publicMetadata as Record<string, unknown> | null)?.role),
      createdAt: new Date(inv.createdAt).toISOString(),
    }));
    res.json(invitations);
  } catch (err: any) {
    res
      .status(500)
      .json({ error: err.message ?? "Failed to fetch invitations" });
  }
});

router.post("/admin/invitations", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { email, role } = req.body;
  if (typeof email !== "string" || !email.includes("@")) {
    return res
      .status(400)
      .json({ error: "A valid email address is required" });
  }
  if (!isRole(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  try {
    await clerkClient.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role },
      notify: true,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err.message ?? "Failed to send invitation" });
  }
});

router.delete("/admin/invitations/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    await clerkClient.invitations.revokeInvitation(req.params.id);
    return res.json({ ok: true });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err.message ?? "Failed to revoke invitation" });
  }
});

// --- First-time admin bootstrap ---
//
// Unset roles now default to foreman (the lowest privilege), so nobody -
// including the very first person to sign up - ever gets admin just by
// being unset. That means a brand-new deployment starts with zero admins,
// and the "admin only" guard above would lock everyone out of user
// management forever with no way to ever grant the first admin role.
// These two endpoints are the documented, explicit path around that:
// any signed-in user may check whether an admin exists yet
// (GET /admin/bootstrap-status), and may promote *themselves* to admin by
// writing an explicit publicMetadata.role = "admin" (POST /admin/bootstrap),
// but only while the workspace still has none. Once any user has an
// explicit "admin" role, bootstrap permanently stops working (adminExists()
// above returns true) and role changes must go through the admin-only
// endpoint above. This is a one-time, explicit self-promotion - it does not
// rely on, or interact with, the unset-role default in any way.

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
