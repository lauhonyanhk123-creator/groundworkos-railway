import { Router } from "express";
import { db, subcontractorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

const NETWORK_API_URL = process.env.NETWORK_API_URL;
const NETWORK_API_KEY = process.env.NETWORK_API_KEY;

function networkConfigured(): boolean {
  return Boolean(NETWORK_API_URL && NETWORK_API_KEY);
  }

async function networkFetch(path: string, init: RequestInit = {}): Promise<any> {
  if (!networkConfigured()) {
    throw new Error("GroundworkOS Network is not configured (set NETWORK_API_URL and NETWORK_API_KEY)");
    }
  const res = await fetch(NETWORK_API_URL + path, {
    ...init,
    headers: { "Content-Type": "application/json", "x-api-key": NETWORK_API_KEY as string, ...(init.headers ?? {}) },
    });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || ("Network request failed (" + res.status + ")"));
  return body;
  }

router.get("/network/status", requireRole("manager"), async (_req, res) => {
  res.json({ configured: networkConfigured() });
  });

router.post("/subcontractors/:id/network/invite", requireRole("manager"), async (req, res) => {
  const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, req.params.id));
  if (!sub) return res.status(404).json({ error: "Not found" });
  try {
    const result = await networkFetch("/profiles", {
      method: "POST",
      body: JSON.stringify({
        companyName: sub.companyName,
        contactName: sub.contactName,
        email: sub.email,
        phone: sub.phone,
        utrNumber: sub.utrNumber,
        localSubcontractorId: sub.id,
        }),
      });
    await db.update(subcontractorsTable)
    .set({ networkProfileId: result.id, networkInviteToken: result.claimToken, networkStatus: "invited" })
    .where(eq(subcontractorsTable.id, sub.id));
    res.status(201).json({ networkProfileId: result.id, claimToken: result.claimToken });
    } catch (err: any) {
    res.status(502).json({ error: err.message });
    }
  });

router.get("/subcontractors/:id/network/search", requireRole("manager"), async (req, res) => {
  const q = String(req.query.q ?? "");
  try {
    const results = await networkFetch("/profiles/search?q=" + encodeURIComponent(q));
    res.json(results);
    } catch (err: any) {
    res.status(502).json({ error: err.message });
    }
  });

router.post("/subcontractors/:id/network/link", requireRole("manager"), async (req, res) => {
  const { networkProfileId } = req.body ?? {};
  if (!networkProfileId) return res.status(400).json({ error: "networkProfileId is required" });
  const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, req.params.id));
  if (!sub) return res.status(404).json({ error: "Not found" });
  try {
    const profile = await networkFetch("/profiles/" + networkProfileId + "/link", {
      method: "POST",
      body: JSON.stringify({ localSubcontractorId: sub.id }),
      });
    await db.update(subcontractorsTable)
    .set({ networkProfileId: profile.id, networkStatus: "linked" })
    .where(eq(subcontractorsTable.id, sub.id));
    res.json(profile);
    } catch (err: any) {
    res.status(502).json({ error: err.message });
    }
  });

router.get("/subcontractors/:id/network", requireRole("manager"), async (req, res) => {
  const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, req.params.id));
  if (!sub) return res.status(404).json({ error: "Not found" });
  if (!sub.networkProfileId) return res.json({ networkStatus: sub.networkStatus, profile: null });
  try {
    const profile = await networkFetch("/profiles/" + sub.networkProfileId);
    res.json({ networkStatus: sub.networkStatus, profile });
    } catch (err: any) {
    res.status(502).json({ error: err.message });
    }
  });

export default router;
