import { Router } from "express";
import crypto from "crypto";
import * as freeagent from "../lib/freeagent.js";
import { requireRole } from "../lib/auth.js";

const router = Router();

const oauthStates = new Map<string, number>();

function cleanStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, t] of oauthStates) if (t < cutoff) oauthStates.delete(k);
}

router.get("/freeagent/status", requireRole("admin"), async (_req, res) => {
  try {
    const conn = await freeagent.getConnection();
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

router.get("/freeagent/auth", requireRole("admin"), (req, res) => {
  try {
    cleanStates();
    const state = crypto.randomBytes(16).toString("hex");
    oauthStates.set(state, Date.now());
    res.redirect(freeagent.buildAuthUrl(state));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Configuration error";
    res
      .status(500)
      .send(
        `FreeAgent not configured: ${msg}. Please set FREEAGENT_CLIENT_ID, FREEAGENT_CLIENT_SECRET, and FREEAGENT_REDIRECT_URI.`,
      );
  }
});

router.get("/freeagent/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(
      `/settings?freeagent=error&msg=${encodeURIComponent(error)}`,
    );
  }
  if (!state || !oauthStates.has(state)) {
    return res
      .status(400)
      .send("Invalid OAuth state — please try connecting again.");
  }
  oauthStates.delete(state);

  try {
    const tokens = await freeagent.exchangeCode(code);
    const companyName = await freeagent.fetchCompanyName(tokens.access_token);
    await freeagent.storeConnection(tokens, companyName);

    res.redirect("/settings?freeagent=connected");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.redirect(`/settings?freeagent=error&msg=${encodeURIComponent(msg)}`);
  }
});

router.delete(
  "/freeagent/disconnect",
  requireRole("admin"),
  async (_req, res) => {
    try {
      await freeagent.disconnect();
      res.json({ disconnected: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

router.post(
  "/freeagent/sync/contacts",
  requireRole("admin"),
  async (_req, res) => {
    try {
      const results = await freeagent.syncAllContacts();
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
  "/freeagent/sync/invoices",
  requireRole("admin"),
  async (_req, res) => {
    try {
      const results = await freeagent.syncAllInvoices();
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
  "/freeagent/sync/quotes",
  requireRole("admin"),
  async (_req, res) => {
    try {
      const results = await freeagent.syncAllQuotes();
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
  "/freeagent/pull/payments",
  requireRole("admin"),
  async (_req, res) => {
    try {
      const result = await freeagent.pullPayments();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

export default router;
