import { Router } from "express";
import crypto from "crypto";
import * as quickbooks from "../lib/quickbooks.js";
import { requireRole } from "../lib/auth.js";

const router = Router();

const oauthStates = new Map<string, number>();

function cleanStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, t] of oauthStates) if (t < cutoff) oauthStates.delete(k);
}

router.get("/quickbooks/status", requireRole("admin"), async (_req, res) => {
  try {
    const conn = await quickbooks.getConnection();
    if (!conn) return res.json({ connected: false });
    return res.json({
      connected: true,
      companyName: conn.companyName,
      connectedAt: conn.connectedAt,
      updatedAt: conn.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

router.get("/quickbooks/auth", requireRole("admin"), (req, res) => {
  try {
    cleanStates();
    const state = crypto.randomBytes(16).toString("hex");
    oauthStates.set(state, Date.now());
    res.redirect(quickbooks.buildAuthUrl(state));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Configuration error";
    res
      .status(500)
      .send(
        `QuickBooks not configured: ${msg}. Please set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, and QUICKBOOKS_REDIRECT_URI.`,
      );
  }
});

router.get("/quickbooks/callback", async (req, res) => {
  const { code, state, error, realmId } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(
      `/settings?quickbooks=error&msg=${encodeURIComponent(error)}`,
    );
  }
  if (!state || !oauthStates.has(state)) {
    return res
      .status(400)
      .send("Invalid OAuth state — please try connecting again.");
  }
  oauthStates.delete(state);

  try {
    if (!realmId) throw new Error("No QuickBooks company (realmId) returned.");
    const tokens = await quickbooks.exchangeCode(code);
    const companyName = await quickbooks.fetchCompanyName(
      tokens.access_token,
      realmId,
    );
    await quickbooks.storeConnection(tokens, realmId, companyName);

    res.redirect("/settings?quickbooks=connected");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/settings?quickbooks=error&msg=${encodeURIComponent(msg)}`);
  }
});

router.delete(
  "/quickbooks/disconnect",
  requireRole("admin"),
  async (_req, res) => {
    try {
      await quickbooks.disconnect();
      res.json({ disconnected: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

router.post(
  "/quickbooks/sync/contacts",
  requireRole("admin"),
  async (_req, res) => {
    try {
      const results = await quickbooks.syncAllContacts();
      const synced = results.filter((r) => !("error" in r)).length;
      const errors = results.filter(
        (r): r is { error: string; clientId: string } => "error" in r,
      );
      res.json({ synced, failed: errors.length, errors });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

router.post(
  "/quickbooks/sync/invoices",
  requireRole("admin"),
  async (_req, res) => {
    try {
      const results = await quickbooks.syncAllInvoices();
      const synced = results.filter((r) => !("error" in r)).length;
      const errors = results.filter(
        (r): r is { error: string; invoiceId: string } => "error" in r,
      );
      res.json({ synced, failed: errors.length, errors });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

router.post(
  "/quickbooks/sync/quotes",
  requireRole("admin"),
  async (_req, res) => {
    try {
      const results = await quickbooks.syncAllQuotes();
      const synced = results.filter((r) => !("error" in r)).length;
      const errors = results.filter(
        (r): r is { error: string; quoteId: string } => "error" in r,
      );
      res.json({ synced, failed: errors.length, errors });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

router.post(
  "/quickbooks/pull/payments",
  requireRole("admin"),
  async (_req, res) => {
    try {
      const result = await quickbooks.pullPayments();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

export default router;
