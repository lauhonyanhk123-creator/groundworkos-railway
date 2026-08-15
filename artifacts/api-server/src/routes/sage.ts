import { Router } from "express";
import crypto from "crypto";
import * as sage from "../lib/sage.js";
import { requireRole } from "../lib/auth.js";

const router = Router();

const oauthStates = new Map<string, number>();

function cleanStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, t] of oauthStates) if (t < cutoff) oauthStates.delete(k);
}

router.get("/sage/status", requireRole("admin"), async (_req, res) => {
  try {
    const conn = await sage.getConnection();
    if (!conn) return res.json({ connected: false });
    return res.json({
      connected: true,
      businessName: conn.businessName,
      connectedAt: conn.connectedAt,
      updatedAt: conn.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

router.get("/sage/auth", requireRole("admin"), (req, res) => {
  try {
    cleanStates();
    const state = crypto.randomBytes(16).toString("hex");
    oauthStates.set(state, Date.now());
    res.redirect(sage.buildAuthUrl(state));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Configuration error";
    res
      .status(500)
      .send(
        `Sage not configured: ${msg}. Please set SAGE_CLIENT_ID, SAGE_CLIENT_SECRET, and SAGE_REDIRECT_URI.`,
      );
  }
});

router.get("/sage/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(
      `/settings?sage=error&msg=${encodeURIComponent(error)}`,
    );
  }
  if (!state || !oauthStates.has(state)) {
    return res
      .status(400)
      .send("Invalid OAuth state — please try connecting again.");
  }
  oauthStates.delete(state);

  try {
    const tokens = await sage.exchangeCode(code);
    const { businessId, businessName } = await sage.fetchBusiness(
      tokens.access_token,
    );
    await sage.storeConnection(tokens, businessId, businessName);

    res.redirect("/settings?sage=connected");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/settings?sage=error&msg=${encodeURIComponent(msg)}`);
  }
});

router.delete("/sage/disconnect", requireRole("admin"), async (_req, res) => {
  try {
    await sage.disconnect();
    res.json({ disconnected: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/sage/sync/contacts", requireRole("admin"), async (_req, res) => {
  try {
    const results = await sage.syncAllContacts();
    const synced = results.filter((r) => !("error" in r)).length;
    const errors = results.filter(
      (r): r is { error: string; clientId: string } => "error" in r,
    );
    res.json({ synced, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/sage/sync/invoices", requireRole("admin"), async (_req, res) => {
  try {
    const results = await sage.syncAllInvoices();
    const synced = results.filter((r) => !("error" in r)).length;
    const errors = results.filter(
      (r): r is { error: string; invoiceId: string } => "error" in r,
    );
    res.json({ synced, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/sage/sync/quotes", requireRole("admin"), async (_req, res) => {
  try {
    const results = await sage.syncAllQuotes();
    const synced = results.filter((r) => !("error" in r)).length;
    const errors = results.filter(
      (r): r is { error: string; quoteId: string } => "error" in r,
    );
    res.json({ synced, failed: errors.length, errors });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/sage/pull/payments", requireRole("admin"), async (_req, res) => {
  try {
    const result = await sage.pullPayments();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
