import express from "express";
import cors from "cors";
import crypto from "crypto";
import { pool, ensureSchema } from "./db.js";
import { renderPortalPage } from "./portalHtml.js";
import { verifyCisStatus } from "./cisVerification.js";

const app = express();
app.use(cors());
app.use(express.json());
function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

// --- Normalization helpers -------------------------------------------------
// Used both to reduce duplicate profiles on creation and to make
// /profiles/search resilient to formatting differences (spacing,
// capitalisation, punctuation) across contractors' own records.
function normalizeEmail(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s || null;
}
function normalizePhoneDigits(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return s.replace(/[^0-9+]/g, "");
}
function normalizeUtr(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toUpperCase().replace(/s+/g, "") : "";
  return s || null;
}

async function requireContractor(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.header("x-api-key");
  if (!key) return res.status(401).json({ error: "Missing x-api-key header" });
  const { rows } = await pool.query("SELECT * FROM contractors WHERE api_key = $1", [key]);
  if (!rows[0]) return res.status(401).json({ error: "Invalid API key" });
  (req as any).contractor = rows[0];
  next();
}

async function getLink(profileId: string, contractorId: string) {
  const { rows } = await pool.query(
    "SELECT * FROM profile_links WHERE profile_id = $1 AND contractor_id = $2",
    [profileId, contractorId]
  );
  return rows[0];
}

// A contractor can see a profile's full record once they are the one who
// originally invited it ('invited') or the subcontractor has explicitly
// approved a link request from them ('linked'). 'pending_consent' and
// 'declined' are deliberately excluded.
const AUTHORIZED_VIEW_STATUSES = ["invited", "linked"];

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.post("/admin/contractors", async (req, res) => {
  if (req.header("x-admin-secret") !== process.env.NETWORK_ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { name } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });
  const contractorId = id("contractor");
  const apiKey = id("key");
  await pool.query("INSERT INTO contractors (id, name, api_key) VALUES ($1, $2, $3)", [contractorId, name.trim(), apiKey]);
  res.status(201).json({ id: contractorId, name: name.trim(), apiKey });
});

app.post("/profiles", requireContractor, async (req, res) => {
  const { companyName, contactName, email, phone, utrNumber, localSubcontractorId } = req.body ?? {};
  if (!companyName?.trim()) return res.status(400).json({ error: "companyName is required" });
  if (!localSubcontractorId) return res.status(400).json({ error: "localSubcontractorId is required" });
  const contractor = (req as any).contractor;

  const normalizedUtr = normalizeUtr(utrNumber);
  if (normalizedUtr) {
    const dup = await pool.query(
      "SELECT id, company_name FROM profiles WHERE utr_number IS NOT NULL AND upper(regexp_replace(utr_number, '\\s+', '', 'g')) = $1",
      [normalizedUtr]
    );
    if (dup.rows[0]) {
      return res.status(409).json({
        error: "A profile with this UTR already exists. Use GET /profiles/search to find it, then POST /profiles/:profileId/link instead of creating a duplicate.",
        existingProfileId: dup.rows[0].id,
      });
    }
  }

  const profileId = id("profile");
  const claimToken = crypto.randomBytes(24).toString("base64url");
  await pool.query(
    "INSERT INTO profiles (id, claim_token, company_name, contact_name, email, phone, utr_number) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [profileId, claimToken, companyName.trim(), contactName ?? null, email ?? null, phone ?? null, utrNumber ?? null]
  );
  await pool.query(
    "INSERT INTO profile_links (id, profile_id, contractor_id, local_subcontractor_id, status) VALUES ($1, $2, $3, $4, 'invited')",
    [id("link"), profileId, contractor.id, localSubcontractorId]
  );
  res.status(201).json({ id: profileId, claimToken });
});

app.get("/profiles/search", requireContractor, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 3) return res.json([]);
  const like = "%" + q + "%";
  const emailQ = normalizeEmail(q);
  const phoneDigits = normalizePhoneDigits(q);
  const utrQ = normalizeUtr(q);
  // Search results intentionally return a summary only (no contact details,
  // insurance, or certifications) - a contractor must send a link request
  // and have the subcontractor approve it before seeing the full profile.
  const { rows } = await pool.query(
    `SELECT id, company_name, cis_status, cis_verified_at, updated_at FROM profiles
     WHERE company_name ILIKE $1
        OR ($2::text IS NOT NULL AND lower(email) = $2)
        OR ($3::text <> '' AND regexp_replace(phone, '[^0-9+]', '', 'g') = $3)
        OR ($4::text IS NOT NULL AND upper(regexp_replace(utr_number, '\\s+', '', 'g')) = $4)
     LIMIT 10`,
    [like, emailQ, phoneDigits, utrQ]
  );
  res.json(rows.map(toProfileSummaryJson));
});

app.post("/profiles/:profileId/link", requireContractor, async (req, res) => {
  const { localSubcontractorId } = req.body ?? {};
  if (!localSubcontractorId) return res.status(400).json({ error: "localSubcontractorId is required" });
  const contractor = (req as any).contractor;
  const { rows } = await pool.query("SELECT * FROM profiles WHERE id = $1", [req.params.profileId]);
  if (!rows[0]) return res.status(404).json({ error: "Profile not found" });

  const existingLink = await getLink(req.params.profileId, contractor.id);
  if (existingLink && AUTHORIZED_VIEW_STATUSES.includes(existingLink.status)) {
    // Already an authorized link (e.g. this contractor originally invited
    // this subcontractor) - just update the local id, no new approval needed.
    await pool.query("UPDATE profile_links SET local_subcontractor_id = $1 WHERE id = $2", [localSubcontractorId, existingLink.id]);
    return res.json(toProfileJson(rows[0]));
  }

  // Linking to a profile found via search requires the subcontractor's
  // explicit consent before this contractor can view the full record - see
  // GET/POST /profiles/by-token/:token/link-requests.
  await pool.query(
    `INSERT INTO profile_links (id, profile_id, contractor_id, local_subcontractor_id, status)
     VALUES ($1, $2, $3, $4, 'pending_consent')
     ON CONFLICT (profile_id, contractor_id) DO UPDATE SET local_subcontractor_id = EXCLUDED.local_subcontractor_id, status = 'pending_consent'`,
    [id("link"), req.params.profileId, contractor.id, localSubcontractorId]
  );
  res.status(202).json({
    id: rows[0].id,
    status: "pending_consent",
    message: "Link request sent. The subcontractor must approve this request from their profile portal before you can view their full profile.",
  });
});

app.get("/profiles/:profileId", requireContractor, async (req, res) => {
  const contractor = (req as any).contractor;
  const { rows } = await pool.query("SELECT * FROM profiles WHERE id = $1", [req.params.profileId]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const link = await getLink(req.params.profileId, contractor.id);
  if (!link || !AUTHORIZED_VIEW_STATUSES.includes(link.status)) {
    return res.status(403).json({
      error: "Not authorized to view this profile yet. The subcontractor must approve your link request first.",
      status: link?.status ?? "not_linked",
    });
  }
  res.json(toProfileJson(rows[0]));
});

app.post("/profiles/:profileId/verify-cis", requireContractor, async (req, res) => {
  const contractor = (req as any).contractor;
  const link = await getLink(req.params.profileId, contractor.id);
  if (!link || !AUTHORIZED_VIEW_STATUSES.includes(link.status)) {
    return res.status(403).json({ error: "Not authorized to verify this profile." });
  }
  const { rows } = await pool.query("SELECT * FROM profiles WHERE id = $1", [req.params.profileId]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  // NOTE: verifyCisStatus() is currently a stub - see cisVerification.ts.
  // It does not call HMRC and always reports "unverified" until a real
  // integration is wired up. This endpoint exists so the trigger/audit
  // trail (cis_verified_at, cis_verification_ref) is in place ahead of that.
  try {
    const result = await verifyCisStatus(rows[0].utr_number);
    const { rows: updated } = await pool.query(
      "UPDATE profiles SET cis_status = $1, cis_verified_at = $2, cis_verification_ref = $3, updated_at = now() WHERE id = $4 RETURNING *",
      [result.status, result.checkedAt, result.reference, req.params.profileId]
    );
    res.json(toProfileJson(updated[0]));
  } catch (err: any) {
    res.status(400).json({ error: err.message || "CIS verification failed" });
  }
});

app.get("/profiles/by-token/:token", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM profiles WHERE claim_token = $1", [req.params.token]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(toProfileJson(rows[0]));
});

app.get("/profiles/by-token/:token/link-requests", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM profiles WHERE claim_token = $1", [req.params.token]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const { rows: links } = await pool.query(
    `SELECT pl.id, pl.status, pl.invited_at, c.name AS contractor_name
     FROM profile_links pl JOIN contractors c ON c.id = pl.contractor_id
     WHERE pl.profile_id = $1 AND pl.status = 'pending_consent'
     ORDER BY pl.invited_at ASC`,
    [rows[0].id]
  );
  res.json(links.map((l: any) => ({ id: l.id, contractorName: l.contractor_name, requestedAt: l.invited_at })));
});

app.post("/profiles/by-token/:token/link-requests/:linkId/respond", async (req, res) => {
  const { approve } = req.body ?? {};
  if (typeof approve !== "boolean") return res.status(400).json({ error: "approve (boolean) is required" });
  const { rows } = await pool.query("SELECT * FROM profiles WHERE claim_token = $1", [req.params.token]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const newStatus = approve ? "linked" : "declined";
  const { rows: updated } = await pool.query(
    `UPDATE profile_links SET status = $1, linked_at = CASE WHEN $1 = 'linked' THEN now() ELSE linked_at END
     WHERE id = $2 AND profile_id = $3 AND status = 'pending_consent' RETURNING id, status`,
    [newStatus, req.params.linkId, rows[0].id]
  );
  if (!updated[0]) return res.status(404).json({ error: "Link request not found or already resolved" });
  res.json(updated[0]);
});

app.patch("/profiles/by-token/:token", async (req, res) => {
  const editable = ["companyName","contactName","email","phone","utrNumber","insuranceProvider","insurancePolicyNumber","publicLiabilityExpiry","cscsCardNumber","cscsCardExpiry","nrswaCardNumber","nrswaExpiry"];
  const columns: Record<string, string> = {
    companyName: "company_name", contactName: "contact_name", email: "email", phone: "phone",
    utrNumber: "utr_number", insuranceProvider: "insurance_provider", insurancePolicyNumber: "insurance_policy_number",
    publicLiabilityExpiry: "public_liability_expiry", cscsCardNumber: "cscs_card_number", cscsCardExpiry: "cscs_card_expiry",
    nrswaCardNumber: "nrswa_card_number", nrswaExpiry: "nrswa_expiry",
  };
  const sets: string[] = [];
  const values: any[] = [];
  for (const key of editable) {
    if (key in (req.body ?? {})) {
      values.push((req.body as any)[key]);
      sets.push(columns[key] + " = $" + values.length);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
  values.push(req.params.token);
  const sql = "UPDATE profiles SET " + sets.join(", ") + ", claimed_at = COALESCE(claimed_at, now()), updated_at = now() WHERE claim_token = $" + values.length + " RETURNING *";
  const { rows } = await pool.query(sql, values);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(toProfileJson(rows[0]));
});

app.get("/portal/:token", (_req, res) => {
  res.type("html").send(renderPortalPage());
});

function toProfileSummaryJson(row: any) {
  return {
    id: row.id,
    companyName: row.company_name,
    cisStatus: row.cis_status,
    cisVerifiedAt: row.cis_verified_at ?? null,
    updatedAt: row.updated_at,
  };
}

function toProfileJson(row: any) {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    utrNumber: row.utr_number,
    cisStatus: row.cis_status,
    cisVerifiedAt: row.cis_verified_at ?? null,
    cisVerificationRef: row.cis_verification_ref ?? null,
    insuranceProvider: row.insurance_provider,
    insurancePolicyNumber: row.insurance_policy_number,
    publicLiabilityExpiry: row.public_liability_expiry,
    cscsCardNumber: row.cscs_card_number,
    cscsCardExpiry: row.cscs_card_expiry,
    nrswaCardNumber: row.nrswa_card_number,
    nrswaExpiry: row.nrswa_expiry,
    plantTickets: row.plant_tickets,
    claimedAt: row.claimed_at,
    updatedAt: row.updated_at,
  };
}

const port = Number(process.env.PORT ?? 4001);
ensureSchema()
  .then(() => {
    app.listen(port, () => console.log("network-api listening on :" + port));
  })
  .catch((err) => {
    console.error("Failed to initialize network-api schema", err);
    process.exit(1);
  });
