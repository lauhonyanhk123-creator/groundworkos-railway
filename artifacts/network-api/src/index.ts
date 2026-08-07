import express from "express";
import cors from "cors";
import crypto from "crypto";
import { pool, ensureSchema } from "./db.js";
import { renderPortalPage } from "./portalHtml.js";

const app = express();
app.use(cors());
app.use(express.json());
function id(prefix: string): string {
return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}
async function requireContractor(req: express.Request, res: express.Response, next: express.NextFunction) {
const key = req.header("x-api-key");
if (!key) return res.status(401).json({ error: "Missing x-api-key header" });
const { rows } = await pool.query("SELECT * FROM contractors WHERE api_key = $1", [key]);
if (!rows[0]) return res.status(401).json({ error: "Invalid API key" });
(req as any).contractor = rows[0];
next();
}

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
const { rows } = await pool.query(
"SELECT id, company_name, contact_name, phone, email, utr_number, cis_status, updated_at FROM profiles WHERE company_name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1 OR utr_number ILIKE $1 LIMIT 10",
[like]
);
res.json(rows.map(toProfileJson));
});

app.post("/profiles/:profileId/link", requireContractor, async (req, res) => {
const { localSubcontractorId } = req.body ?? {};
if (!localSubcontractorId) return res.status(400).json({ error: "localSubcontractorId is required" });
const contractor = (req as any).contractor;
const { rows } = await pool.query("SELECT * FROM profiles WHERE id = $1", [req.params.profileId]);
if (!rows[0]) return res.status(404).json({ error: "Profile not found" });
await pool.query(
"INSERT INTO profile_links (id, profile_id, contractor_id, local_subcontractor_id, status, linked_at) VALUES ($1, $2, $3, $4, 'linked', now()) ON CONFLICT (profile_id, contractor_id) DO UPDATE SET local_subcontractor_id = EXCLUDED.local_subcontractor_id, status = 'linked', linked_at = now()",
[id("link"), req.params.profileId, contractor.id, localSubcontractorId]
);
res.json(toProfileJson(rows[0]));
});

app.get("/profiles/:profileId", requireContractor, async (req, res) => {
const { rows } = await pool.query("SELECT * FROM profiles WHERE id = $1", [req.params.profileId]);
if (!rows[0]) return res.status(404).json({ error: "Not found" });
res.json(toProfileJson(rows[0]));
});

app.get("/profiles/by-token/:token", async (req, res) => {
const { rows } = await pool.query("SELECT * FROM profiles WHERE claim_token = $1", [req.params.token]);
if (!rows[0]) return res.status(404).json({ error: "Not found" });
res.json(toProfileJson(rows[0]));
});

app.patch("/profiles/by-token/:token", async (req, res) => {
const editable = ["companyName","contactName","email","phone","utrNumber","insuranceProvider","insurancePolicyNumber","publicLiabilityExpiry","cscsCardNumber","cscsCardExpiry","nrswaCardNumber","nrswaExpiry"];
const columns = {
companyName: "company_name", contactName: "contact_name", email: "email", phone: "phone",
utrNumber: "utr_number", insuranceProvider: "insurance_provider", insurancePolicyNumber: "insurance_policy_number",
publicLiabilityExpiry: "public_liability_expiry", cscsCardNumber: "cscs_card_number", cscsCardExpiry: "cscs_card_expiry",
nrswaCardNumber: "nrswa_card_number", nrswaExpiry: "nrswa_expiry",
};
const sets = [];
const values = [];
for (const key of editable) {
if (key in (req.body ?? {})) {
values.push(req.body[key]);
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

function toProfileJson(row: any) {
return {
id: row.id,
companyName: row.company_name,
contactName: row.contact_name,
email: row.email,
phone: row.phone,
utrNumber: row.utr_number,
cisStatus: row.cis_status,
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
