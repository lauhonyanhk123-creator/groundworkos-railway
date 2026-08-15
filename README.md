# GroundworkOS

**The OS for UK groundwork contractors.**

Manage jobs, CIS compliance, quotes, invoices, plant, subcontractors, timesheets and more — built specifically for the way UK groundwork companies operate.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + Tailwind v4 + wouter |
| Backend | Express v5 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Clerk |
| Monorepo | pnpm workspaces |
| Email | Resend |

---

## Features

- **Jobs** — full lifecycle from enquiry to completion, with progress tracking and site details
- **Quotes** — line-item quotes with PDF export and client email sending
- **Invoices** — CIS-aware invoicing with PDF export and accounting sync (Xero, QuickBooks, Sage, FreeAgent)
- **Schedule** — crew and plant scheduling calendar
- **Clients & Subcontractors** — full contact management with CIS verification status
- **Documents** — compliance document tracking with expiry alerts (RAMS, insurance, permits)
- **Plant** — fleet management with MOT, service and LOLER exam tracking
- **Timesheets** — daily time logging per job and worker
- **Purchase Orders** — supplier PO management with PDF export
- **Reports** — revenue overview, job P&L, CIS300 submission export, rate book
- **CIS300 Export** — HMRC-formatted CSV per tax month, ready for submission
- **Audit Trail** — every create/update/delete recorded with full change history
- **Client Portal** — shareable quote approval links for clients
- **Accounting Integrations** — sync contacts, invoices and quotes, and pull payment status, with Xero, QuickBooks Online, Sage Accounting, or FreeAgent (self-service OAuth — the client connects with their own accounting login, no API keys required)
- **CSV Import** — bulk import clients and jobs from spreadsheet
- **Role-based access** — Admin / Manager / Foreman permission levels
- **Onboarding wizard** — guided company setup on first login

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database

### Environment Variables

Create a `.env` file in the project root (or set these as secrets in your host):

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/groundworkos

# Clerk Auth (get from dashboard.clerk.com)
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...

# App settings (required)
APP_URL=https://your-app.example.com
BASE_PATH=/
STATIC_DIR=artifacts/groundworkos/dist/public

# Object storage — S3-compatible (required). S3_BUCKET, S3_ACCESS_KEY_ID
# and S3_SECRET_ACCESS_KEY throw at boot if unset; S3_REGION and
# S3_ENDPOINT silently default to AWS us-east-1 if unset, which is wrong
# for most providers, so set all five explicitly. Use AWS S3, Cloudflare
# R2, Backblaze B2, Oracle Cloud Object Storage, MinIO, etc. — Railway
# has no built-in object storage.
S3_BUCKET=groundworkos-files
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
S3_ACCESS_KEY_ID=your-s3-access-key
S3_SECRET_ACCESS_KEY=your-s3-secret-key

# Email (optional — get from resend.com)
RESEND_API_KEY=re_...

# Xero (optional)
XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...
XERO_REDIRECT_URI=...

# QuickBooks Online (optional)
QUICKBOOKS_CLIENT_ID=...
QUICKBOOKS_CLIENT_SECRET=...
QUICKBOOKS_REDIRECT_URI=...

# Sage Accounting (optional)
SAGE_CLIENT_ID=...
SAGE_CLIENT_SECRET=...
SAGE_REDIRECT_URI=...

# FreeAgent (optional)
FREEAGENT_CLIENT_ID=...
FREEAGENT_CLIENT_SECRET=...
FREEAGENT_REDIRECT_URI=...
```

`DATABASE_URL`, the Clerk keys, `APP_URL`, `BASE_PATH`, `STATIC_DIR` and the five `S3_*` object storage variables are all required — the app will not build or boot correctly without them. Everything below the object storage block (email, Xero, QuickBooks, Sage, FreeAgent) is optional. See **[RAILWAY.md](./RAILWAY.md)** for how these map to Railway service variables, and each accounting integration is optional and independent — set only the credentials for the providers this client actually uses. Every provider uses self-service OAuth: the client logs in with their own accounting software account and authorises access, so you never need to obtain or hold their accounting API keys.

### Install & Run

```bash
# Install all dependencies
pnpm install

# Push the database schema (Drizzle)
pnpm --filter @workspace/db run push

# Start development (frontend + API, in parallel)
pnpm -r --parallel run dev
```

The frontend runs on port `5173` (or `$PORT` in production), the API server on `3001`.

---

## Project Structure

```
/
├── artifacts/
│   ├── groundworkos/        # React + Vite frontend
│   ├── api-server/          # Express API server
│   └── mockup-sandbox/      # UI mockup/design preview sandbox (not part of the deployed app)
├── lib/
│   ├── db/                  # Drizzle schema + migrations
│   ├── api-client-react/    # Typed API client (shared)
│   ├── api-spec/            # OpenAPI spec + codegen (orval)
│   ├── api-zod/             # Shared Zod schemas/types
│   └── object-storage-web/  # File upload utilities
└── pnpm-workspace.yaml
```

---

## User Roles

Roles are stored in Clerk `publicMetadata.role`. Set via the **Settings → Users** page (admin only) or directly in the Clerk dashboard.

| Role | Access |
|---|---|
| `admin` | Full access including Users, Audit Log, Deploy Guide |
| `manager` | All operational features: jobs, quotes, invoices, reports, settings |
| `foreman` | Dashboard, jobs, schedule, timesheets |

**First-time setup:** Set your own account to `admin` via the Clerk dashboard before logging in.

---

## First Login Checklist

1. Sign up via the app — you'll be assigned `foreman` role by default
2. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → Users → your account → Public metadata → set `{ "role": "admin" }`
3. Refresh the app — full sidebar now visible
4. Go to **Settings** and complete your company details (name, address, VAT number, bank details)
5. Invite any additional users and set their roles from **Settings → Users**
6. (Optional) Connect an accounting provider from **Settings → [Provider] Integration** (Xero, QuickBooks, Sage, or FreeAgent)
7. (Optional) Add `RESEND_API_KEY` secret to enable email sending for quotes and invoices

---

## Deployment

GroundworkOS is deployed on [Railway](https://railway.app) as a single service — the Express API server serves the built frontend directly (via `STATIC_DIR`), so no separate static host or reverse proxy is required.

See **[RAILWAY.md](./RAILWAY.md)** for the full step-by-step guide, covering the Railway project and PostgreSQL plugin setup, required environment variables (Clerk, database, object storage, app URL), the build and start commands already configured via `railway.json`, running database migrations with the Railway CLI, first login and setting the admin role, and custom domains and troubleshooting.

For self-hosting outside Railway (e.g. a VPS), see the in-app Deploy Guide (`/deploy`, admin only), which covers an Oracle Cloud + Nginx + PM2 setup instead.

---

## CIS Compliance

GroundworkOS is built around UK Construction Industry Scheme requirements:

- Subcontractor CIS status tracking (Gross / Net / Unmatched / Unverified)
- Automatic CIS deduction calculation on invoices
- Monthly CIS300 return export (HMRC-formatted CSV)
- Expiry tracking for CSCS cards, NRSWA certifications, public liability insurance

---

## Architecture & Development Notes

A few non-obvious design decisions and gotchas worth knowing before making changes:

**Roles & access control** — Roles live in Clerk `publicMetadata.role` and are read independently on the frontend (`hooks/useRole.ts`) and backend (`lib/auth.ts`, `admin.ts`); any change to role logic must be applied in all places at once, since a mismatch between frontend and backend checks has been a real bug source. A user with no role set defaults to admin — a deliberate choice for a trusted, single-company deployment, not an oversight. Any endpoint gated to admin (e.g. the audit trail) must have every consumer of that endpoint gated too, not just the page that owns it — the dashboard's "Recent Activity" panel reads the same audit endpoint as the full Audit Log page.

**API data shape** — The database and API layer use camelCase (Drizzle convention), while the frontend's `types.ts` uses snake_case throughout. The bridge between them lives in `artifacts/groundworkos/src/lib/apiTransforms.ts`, called from `artifacts/groundworkos/src/store/DataLoader.tsx`. Any new field added to the schema needs a matching entry in the transform layer or it won't reach the frontend.

**Data integrity rule** — Never persist a client-supplied id as a database primary key on create/edit endpoints; generate ids server-side instead. A shared default-form object that baked in a single client-generated id at module load time once caused every *second* record of a given type to silently fail to save (a primary-key collision on the second insert). Client-side temporary ids should only ever be used as React keys, never sent to the database as the row's identity.

**UI loading state** — Pages read from a shared app-wide store that starts empty; a single loading gate in the main layout (driven by the core list queries: clients/jobs/quotes/invoices) blocks rendering until the first load completes, so no page can flash a false "no results" state. If a new top-level dataset becomes something a page depends on for its first paint, add it to that gate's condition.

**TypeScript route typing** — Any Express middleware factory meant to sit in front of a typed route handler (e.g. a role-check middleware) should be generic over the route's param/body/query types (`RequestHandler<P, ResBody, ReqBody, ReqQuery>`), not hardcoded to the base `Request`/`Response` types — otherwise TypeScript silently widens `req.params` for every handler in that route's chain.

**Design tokens** — The UI's "Technical Survey" theme (warm concrete background, Survey Blue `#1b5e78` accent, Space Grotesk/Inter/JetBrains Mono type) is defined as CSS variables in `index.css`. Reuse those tokens for new UI work rather than hardcoding new colors.

---

## License

Private — not open source. All rights reserved.
