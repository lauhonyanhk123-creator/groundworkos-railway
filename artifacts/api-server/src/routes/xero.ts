import { Router } from "express";
import crypto from "crypto";
import * as xero from "../lib/xero.js";
import { requireRole } from "../lib/auth.js";

const router = Router();

// Simple in-memory state store (per-process, sufficient for OAuth CSRF protection)
const oauthStates = new Map<string, number>();

function cleanStates() {
  const cutoff = Date.now() - 10 * 60 * 1000; // 10 min
  for (const [k, t] of oauthStates) if (t < cutoff) oauthStates.delete(k);
}

// ─── Status ──────────────────────────────────────────────────────────────────

router.get("/xero/status", requireRole("admin"), async (_req, res) => {
  try {
    const conn = await xero.getConnection();
    if (!conn) return res.json({ connected: false });
    return res.json({
      connected: true,
      tenantName: conn.tenantName,
      connectedAt: conn.connectedAt,
      updatedAt: conn.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ─── OAuth ───────────────────────────────────────────────────────────────────

router.get("/xero/auth", requireRole("admin"), (req, res) => {
  try {
    cleanStates();
    const state = crypto.randomBytes(16).toString("hex");
    oauthStates.set(state, Date.now());
    res.redirect(xero.buildAuthUrl(state));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Configuration error";
    res
      .status(500)
      .send(
        `Xero not configured: ${msg}. Please set XERO_CLIENT_ID, XERO_CLIENT_SECRET, and XERO_REDIRECT_URI.`,
      );
  }
});

router.get("/xero/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(
      `/settings?xero=error&msg=${encodeURIComponent(error)}`,
    );
  }
  if (!state || !oauthStates.has(state)) {
    return res
      .status(400)
      .send("Invalid OAuth state — please try connecting again.");
  }
  oauthStates.delete(state);

  try {
    const tokens = await xero.exchangeCode(code);
    const tenants = await xero.fetchTenants(tokens.access_token);
    if (!tenants.length)
      throw new Error("No Xero organisations found for this account.");

    // Use first org; multi-tenant selection could be added here
    const { tenantId, tenantName } = tenants[0];
    await xero.storeConnection(tokens, tenantId, tenantName);

    res.redirect("/settings?xero=connected");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/settings?xero=error&msg=${encodeURIComponent(msg)}`);
  }
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

router.delete("/xero/disconnect", requireRole("admin"), async (_req, res) => {
  try {
    await xero.disconnect();
    res.json({ disconnected: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Sync endpoints ───────────────────────────────────────────────────────────

router.post("/xero/sync/contacts", requireRole("admin"), async (_req, res) => {
  try {
    const results = await xero.syncAllContacts();
    const synced = results.filter((r) => !("error" in r)).length;
    const errors = results.filter(
      (r): r is { error: string; clientId: string } => "error" in r,
    );
    res.json({ synced, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/xero/sync/invoices", requireRole("admin"), async (_req, res) => {
  try {
    const results = await xero.syncAllInvoices();
    const synced = results.filter((r) => !("error" in r)).length;
    const errors = results.filter(
      (r): r is { error: string; invoiceId: string } => "error" in r,
    );
    res.json({ synced, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/xero/sync/quotes", requireRole("admin"), async (_req, res) => {
  try {
    const results = await xero.syncAllQuotes();
    const synced = results.filter((r) => !("error" in r)).length;
    const errors = results.filter(
      (r): r is { error: string; quoteId: string } => "error" in r,
    );
    res.json({ synced, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/xero/pull/payments", requireRole("admin"), async (_req, res) => {
  try {
    const result = await xero.pullPayments();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
