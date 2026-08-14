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
- Optional: a custom domain, if you don't want to use the *.up.railway.app
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

- Build: pnpm install --frozen-lockfile && pnpm run build (builds every
workspace package, including both the API server and the frontend).
- Start: node artifacts/api-server/dist/index.mjs
- Health check: /api/healthz

You shouldn't need to change these in the Railway dashboard, but they're
visible under the service's Settings tab if you want to confirm.

## Step 3 — Set environment variables

Open the app service's Variables tab and add:

Database (reference the Postgres plugin's variable instead of retyping it):
- DATABASE_URL — reference ${{Postgres.DATABASE_URL}}

Auth (from dashboard.clerk.com):
- CLERK_STANDALONE=true
- CLERK_PUBLISHABLE_KEY=pk_live_...
- CLERK_SECRET_KEY=sk_live_...
- VITE_CLERK_PUBLISHABLE_KEY=pk_live_... (same key, needed at build time)

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
- RESEND_API_KEY for quote/invoice emails
- XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_REDIRECT_URI (and the
equivalent QUICKBOOKS_, SAGE_, FREEAGENT_ variables) for accounting
integrations — redirect URIs must point at your Railway domain, e.g.
https://your-app.up.railway.app/api/xero/callback

Railway automatically provides PORT at both build and run time, so you do
not need to set it yourself.

## Step 4 — Deploy and run migrations

1. Trigger a deploy (pushing to your connected branch does this
automatically).
2. Once it's live, run the database migration once using Railway's CLI or
the service's one-off command runner:
railway run pnpm --filter @workspace/db run push
(use push-force instead of push if this is a brand-new, empty database and
you want to skip confirmation prompts).

## Step 5 — First login and admin user

1. Visit your Railway domain and sign up through the app.
2. In the Clerk dashboard, go to Users, open your account, and set Public
metadata to { "role": "admin" }.
3. Sign out and back in — the full sidebar should now be visible.

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
- Uploads fail: check the S3_* variables and review the service's deploy
logs.
- OAuth connect (Xero/QuickBooks/Sage/FreeAgent) fails at the callback step:
confirm the redirect URI registered with the provider exactly matches
your Railway domain.
