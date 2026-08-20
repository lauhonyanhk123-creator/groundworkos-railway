# Deploying GroundworkOS on Railway

This guide covers deploying GroundworkOS as a single Railway service. The API
server (Express) also serves the built frontend directly, using the
STATIC_DIR support added in this branch — so you don't need a separate
static host or reverse proxy like the Nginx setup used for self-hosting on a
VPS.

## What you'll need

- A Railway account (railway.app) with billing set up (Railway is not free
  for always-on services).
- A Clerk account (clerk.com) for authentication — free to start.
- An S3-compatible object storage bucket for file uploads (RAMS PDFs,
  insurance certs, photos). Railway does not provide object storage itself,
  so use AWS S3, Cloudflare R2, Backblaze B2, or similar.
- Optional: a custom domain, if you don't want to use the \*.up.railway.app
  domain Railway assigns by default.

## Step 1 — Create the Railway project

1. In the Railway dashboard, create a New Project.
2. Choose "Deploy from GitHub repo" and select this repository. Grant
   Railway access if prompted.
3. In the same project, click "New" again and add a "PostgreSQL" database
   from Railway's plugin catalog. Railway will provision it and expose a
   DATABASE_URL reference variable you can link into the app service.

## Step 2 — Confirm build & start commands

The included railway.json already tells Railway how to build and run the
app:

- Build: pnpm install --frozen-lockfile --prod=false && pnpm run build
  (builds every workspace package, including both the API server and the
  frontend). --prod=false keeps devDependencies installed even if NODE_ENV
  is production, since the build tooling lives there.
- Start: pnpm --filter @workspace/db run migrate && node
  artifacts/api-server/dist/index.mjs — runs the database migrations before
  the server boots (see Step 4).
- Health check: /api/readyz — the readiness probe, which reports "ok" only
  once the app can reach the database. It gates the deploy on /api/readyz
  rather than the /api/healthz liveness probe so a deploy against an
  unreachable or unmigrated database fails the health check instead of
  passing on a static "ok".

You shouldn't need to change these in the Railway dashboard, but they're
visible under the service's Settings tab if you want to confirm.

## Step 3 — Set environment variables

Open the app service's Variables tab and add:

Database (reference the Postgres plugin's variable instead of retyping it):

- DATABASE_URL — reference ${{Postgres.DATABASE_URL}}

Auth (from dashboard.clerk.com) — sign-in is email-only; no Google or
other social/OAuth sign-in provider is configured:

- CLERK*PUBLISHABLE_KEY=pk_live*...
- CLERK*SECRET_KEY=sk_live*...
- VITE*CLERK_PUBLISHABLE_KEY=pk_live*... (same key, needed at build time)

App settings:

- APP_URL=https://your-app.up.railway.app (or your custom domain)
- BASE_PATH=/ (required at build time by the frontend's Vite config)
- STATIC_DIR=artifacts/groundworkos/dist/public (tells the API server to
  serve the built frontend itself)

File storage:

- S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
  from your chosen provider
- S3_FORCE_PATH_STYLE=true (or false, depending on your provider)

Optional:

- S3_PUBLIC_PREFIX — key prefix for public assets, defaults to `public/`
- LOG_LEVEL — trace|debug|info|warn|error, defaults to `info`
- CLERK_WEBHOOK_SIGNING_SECRET / SIGNUP_ALLOWED_EMAIL_DOMAINS — a
  server-side backstop for restricting sign-up by email domain, on top of
  Clerk Dashboard → Configure → Restrictions (the primary control)
- RESEND_API_KEY for quote/invoice emails
- XERO*CLIENT_ID / XERO_CLIENT_SECRET / XERO_REDIRECT_URI (and the
  equivalent QUICKBOOKS*, SAGE*, FREEAGENT* variables) for accounting
  integrations — redirect URIs must point at your Railway domain, e.g.
  https://your-app.up.railway.app/api/xero/callback

Railway automatically provides PORT at both build and run time, so you do
not need to set it yourself — but note the app will refuse to boot if PORT
is ever unset (there's no built-in default), which matters if you're
running it outside Railway's usual build/deploy flow.

Do NOT add NODE_ENV here. Railway sets NODE_ENV=production automatically at
runtime, and adding it as a build-time variable makes pnpm skip
devDependencies — where typescript, vite, esbuild and drizzle-kit live — so
the build fails with missing-dependency type errors. (NODE_ENV still does
its usual job at runtime: it controls log formatting and gates the local
demo-data seed script; you only set it by hand when self-hosting.)

## Step 4 — Deploy

1. Trigger a deploy (pushing to your connected branch does this
   automatically).
2. Migrations run automatically as part of the start command, before the
   server begins accepting traffic — you don't need to run them by hand.
   The start command (`pnpm --filter @workspace/db run migrate && node
artifacts/api-server/dist/index.mjs`) applies the versioned SQL migration
   files in lib/db/migrations against the connected database, recording
   which ones have already been applied, every time the container starts or
   restarts. Unlike `drizzle-kit push`, it never diffs against or drops live
   schema, and re-running it against an already-migrated database is a
   no-op, so it's safe to run on every boot — this database holds client CIS
   and invoice records. If a migration fails, the `&&` short-circuits and
   the server process never starts, so Railway's health check fails and the
   deploy is rejected instead of running against a half-migrated schema.

## Step 5 — First login and admin user

New accounts default to the `foreman` role (lowest privilege) — nobody gets
`admin` just by signing up, including the first user. Instead:

1. Visit your Railway domain and sign up through the app.
2. Go to **Settings → Users**. Since the workspace has no admin yet, you'll
   see a "Make me admin" button in place of the normal admin-only view.
3. Click it — this calls `POST /api/admin/bootstrap`, which sets your own
   Clerk `publicMetadata.role` to `admin`, but only while no admin exists
   yet. Once you're the admin, this bootstrap endpoint stops working for
   everyone else, and further role changes go through the same
   **Settings → Users** page.
4. Refresh — the full sidebar should now be visible.

Fallback: if you're ever locked out with no admin account at all (e.g.
restoring from a backup), you can set `{ "role": "admin" }` on an account's
Public metadata directly in the Clerk dashboard instead.

## Step 6 — Custom domain (optional)

In the service's Settings → Networking, add a custom domain and follow
Railway's instructions to add the CNAME record at your DNS provider.
Railway issues and renews HTTPS certificates automatically. If you add a
custom domain, update APP_URL and any OAuth redirect URIs to match.

## Updating the app later

Pushing new commits to the connected branch triggers an automatic rebuild
and redeploy — there's no separate server to SSH into or restart manually.

## Troubleshooting

- Build fails on the frontend step: check that BASE_PATH and
  VITE_CLERK_PUBLISHABLE_KEY are set as Variables, since the Vite config
  requires them even during the build step.
- App starts but shows a blank page: check that STATIC_DIR is set exactly
  to artifacts/groundworkos/dist/public and that the build actually produced
  that folder (check the build logs).
- Uploads fail: check the S3\_\* variables and review the service's deploy
  logs.
- OAuth connect (Xero/QuickBooks/Sage/FreeAgent) fails at the callback step:
  confirm the redirect URI registered with the provider exactly matches
  your Railway domain.
