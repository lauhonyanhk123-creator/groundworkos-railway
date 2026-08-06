# Deploying GroundworkOS on an Oracle Cloud (Always Free) server

This guide takes you from nothing to a live, HTTPS GroundworkOS running on your
own Oracle Cloud server — the kind Oracle gives away for free forever ("Always
Free"). It is written to be followed top to bottom. You do **not** need to be a
developer, but you will be copying and pasting commands into a terminal.

> **What you'll end up with:** GroundworkOS running at your own web address
> (e.g. `https://app.yourcompany.co.uk`), with your own login system, your own
> database, and your own file storage — all on a server that costs nothing.

Nothing in this guide changes how the app runs on Replit. Replit keeps working
exactly as before; this is a completely separate place to run the same app.

---

## What you'll need before you start

1. **An Oracle Cloud account** — sign up at <https://www.oracle.com/cloud/free/>.
   The "Always Free" tier is enough. (A card may be required for identity
   verification; Always Free resources are not charged.)
2. **A domain name** you control (e.g. `yourcompany.co.uk`), so you can point a
   web address at the server. You can buy one from any registrar.
3. **A Clerk account** — free to start, at <https://clerk.com>. This runs the
   login/sign-up screens. (On Replit this was handled for you; when self-hosting
   you bring your own.)
4. About **60–90 minutes**.

Throughout this guide, replace anything in `CAPITALS` or `<angle brackets>` with
your own values.

---

## Step 1 — Create the server (VM)

1. Log into the Oracle Cloud Console.
2. Menu → **Compute → Instances → Create instance**.
3. Settings:
   - **Name:** `groundworkos`
   - **Image:** Ubuntu 22.04 (click *Change image* → Canonical Ubuntu).
   - **Shape:** choose an **Always Free-eligible** shape. Either:
     - `VM.Standard.E2.1.Micro` (x86, simplest), or
     - `VM.Standard.A1.Flex` (Arm; you can give it up to 4 CPUs / 24 GB RAM
       free — more comfortable).
   - **SSH keys:** choose *Generate a key pair for me* and **download both keys**.
     Keep the private key safe — it's how you log in.
4. Under **Networking**, make sure a public IP address is assigned (default).
5. Click **Create**. After a minute you'll see a **Public IP address** — note it
   down (e.g. `123.45.67.89`).

### Open the firewall (ports 80 and 443)

Oracle blocks web traffic by default. You must allow it in **two** places:

**a) In the Oracle Console (Security List):**
1. On the instance page, click the **Virtual Cloud Network** link → **Security
   Lists** → the default list.
2. **Add Ingress Rules** for:
   - Source `0.0.0.0/0`, protocol TCP, destination port **80**
   - Source `0.0.0.0/0`, protocol TCP, destination port **443**

**b) On the server itself** (you'll do this after logging in, in Step 2).

---

## Step 2 — Log into the server and prepare it

On your own computer, open a terminal and connect (use the private key you
downloaded):

```bash
ssh -i /path/to/your-private-key ubuntu@123.45.67.89
```

Once connected, open the server firewall for web traffic and install the basics:

```bash
# Allow web traffic through the server's own firewall
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Update the system
sudo apt update && sudo apt -y upgrade
```

Install Node.js 20, pnpm, PostgreSQL, Nginx, Git, and Certbot:

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm (this project uses pnpm, not npm)
sudo npm install -g pnpm

# Database, web server, tools
sudo apt install -y postgresql nginx git

# HTTPS certificate tool
sudo apt install -y certbot python3-certbot-nginx
```

---

## Step 3 — Set up the database

Create a database and a user for GroundworkOS:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER groundworkos WITH PASSWORD 'CHOOSE_A_STRONG_PASSWORD';
CREATE DATABASE groundworkos OWNER groundworkos;
SQL
```

Your database connection string will be:

```
postgresql://groundworkos:CHOOSE_A_STRONG_PASSWORD@localhost:5432/groundworkos
```

Keep this handy — it's the `DATABASE_URL` you'll use later.

---

## Step 4 — Get the code onto the server

If your code is in a Git repository:

```bash
cd ~
git clone <YOUR_REPO_URL> groundworkos
cd groundworkos
pnpm install
```

If you don't use Git, you can upload the project folder with `scp` or any SFTP
tool into `~/groundworkos`, then run `pnpm install` inside it.

> `pnpm install` downloads all the building blocks the app needs. It can take a
> few minutes the first time.

---

## Step 5 — Create your own Clerk account (login system)

On Replit, logins were handled through Replit's built-in Clerk. When self-hosting
you use your **own** Clerk account so logins belong to you.

You have two options. **Start with Option A** to get running quickly, then move
to Option B when you're ready for real users on your own domain.

### Option A — Quick start (development keys)

1. Sign up at <https://clerk.com> and create an application.
2. Go to **API Keys** and copy:
   - **Publishable key** — starts with `pk_test_...`
   - **Secret key** — starts with `sk_test_...`
3. That's it — development keys work immediately with no DNS setup. (Clerk shows
   a small "development keys" notice; that's expected and fine for testing.)

### Option B — Production (your own domain)

When you're ready to go live properly:

1. In Clerk, create a **Production** instance.
2. Clerk will give you DNS records to add (several `CNAME` entries such as
   `clerk`, `accounts`, `clkmail`, etc.).
3. Add those records at your domain registrar / DNS provider. Wait for Clerk to
   show them as **verified** (can take a little while).
4. Copy the **production** keys (`pk_live_...` and `sk_live_...`).

Either way, note your **publishable key** and **secret key** — you'll enter them
in Step 7.

---

## Step 6 — Create file storage (Oracle Object Storage)

GroundworkOS stores uploaded files (RAMS PDFs, insurance certificates, photos)
in object storage. On the server we use Oracle's built-in Object Storage, which
speaks the standard "S3" protocol.

### 6a. Create a bucket

1. Oracle Console → **Storage → Buckets → Create Bucket**.
2. Name it `groundworkos-files`. Leave it **Private**. Click **Create**.

### 6b. Find your namespace and region

- **Namespace:** Console → click your profile (top right) → **Tenancy**; the
  *Object Storage Namespace* is shown there (a short string of letters).
- **Region:** shown top-right of the console, e.g. `uk-london-1`.

Your S3 endpoint is then:

```
https://<NAMESPACE>.compat.objectstorage.<REGION>.oraclecloud.com
```

Example: `https://abcd1234.compat.objectstorage.uk-london-1.oraclecloud.com`

### 6c. Create S3-compatible credentials

1. Console → your profile → **My profile → Customer secret keys**.
2. **Generate secret key.** Oracle shows an **Access Key** and a **Secret Key**
   **once** — copy both now.

You now have everything for storage: endpoint, region, bucket name, access key,
secret key.

> **Why not upload straight from the browser?** Oracle Object Storage doesn't
> allow direct browser uploads (no CORS). GroundworkOS is already built to send
> uploads *through the app*, so this works automatically — you don't need to
> configure anything extra.

---

## Step 7 — Enter your settings (environment variables)

The app reads its settings from environment variables. Create a settings file for
the API server:

```bash
sudo mkdir -p /etc/groundworkos
sudo nano /etc/groundworkos/api.env
```

Paste the following, filling in your own values (see `.env.example` in the
project for the full reference):

```ini
NODE_ENV=production
PORT=8080

# Database (from Step 3)
DATABASE_URL=postgresql://groundworkos:CHOOSE_A_STRONG_PASSWORD@localhost:5432/groundworkos

# Your own Clerk account (from Step 5)
CLERK_STANDALONE=true
CLERK_PUBLISHABLE_KEY=pk_test_or_live_...
CLERK_SECRET_KEY=sk_test_or_live_...
APP_URL=https://app.yourdomain.com

# File storage on Oracle (from Step 6)
STORAGE_DRIVER=s3
S3_ENDPOINT=https://NAMESPACE.compat.objectstorage.uk-london-1.oraclecloud.com
S3_REGION=uk-london-1
S3_BUCKET=groundworkos-files
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_FORCE_PATH_STYLE=true
```

Save and exit (in nano: `Ctrl+O`, `Enter`, then `Ctrl+X`).

> `CLERK_STANDALONE=true` is the switch that tells the app "don't use Replit's
> login proxy — use my own Clerk account instead."

---

## Step 8 — Set up the database tables

Apply the app's database structure. From the project folder:

```bash
cd ~/groundworkos
DATABASE_URL='postgresql://groundworkos:CHOOSE_A_STRONG_PASSWORD@localhost:5432/groundworkos' \
  pnpm --filter @workspace/db run push
```

If it asks you to confirm creating tables, accept. (For a brand-new empty
database you can use `run push-force` to skip the prompts.)

---

## Step 9 — Build the app

**Build the API server:**

```bash
cd ~/groundworkos
pnpm --filter @workspace/api-server run build
```

**Build the frontend** (the part people see in their browser). The login settings
are baked in at build time, so they must be present now. Note we deliberately do
**not** set `VITE_CLERK_PROXY_URL` — leaving it unset is what makes the frontend
talk to your own Clerk account:

```bash
PORT=8080 \
BASE_PATH=/ \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_or_live_... \
  pnpm --filter @workspace/groundworkos run build
```

This produces the finished website files in
`~/groundworkos/artifacts/groundworkos/dist/public`.

---

## Step 10 — Run the API server as a service

We'll use `systemd` so the API starts automatically and restarts if the server
reboots.

```bash
sudo nano /etc/systemd/system/groundworkos-api.service
```

Paste (replace `ubuntu` if your username differs):

```ini
[Unit]
Description=GroundworkOS API
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/groundworkos/artifacts/api-server
EnvironmentFile=/etc/groundworkos/api.env
ExecStart=/usr/bin/node --enable-source-maps ./dist/index.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now groundworkos-api
sudo systemctl status groundworkos-api      # should say "active (running)"
```

Check it responds:

```bash
curl http://localhost:8080/api/healthz       # should return 200 / OK
```

---

## Step 11 — Configure Nginx (the public web server)

Nginx serves the website files to visitors and forwards `/api` requests to the
API server. Create its config:

```bash
sudo nano /etc/nginx/sites-available/groundworkos
```

Paste (replace `app.yourdomain.com`):

```nginx
server {
    listen 80;
    server_name app.yourdomain.com;

    # Allow large file uploads (RAMS, certificates, photos)
    client_max_body_size 100m;

    root /home/ubuntu/groundworkos/artifacts/groundworkos/dist/public;
    index index.html;

    # Forward API + file uploads/downloads to the API server
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Don't buffer big uploads to disk first — stream them straight through
        proxy_request_buffering off;
    }

    # Everything else is the single-page app
    location / {
        try_files $uri /index.html;
    }
}
```

Enable the site and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/groundworkos /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t          # should say "syntax is ok" / "test is successful"
sudo systemctl reload nginx
```

---

## Step 12 — Point your domain at the server

At your domain registrar / DNS provider, add an **A record**:

- **Name/Host:** `app` (for `app.yourdomain.com`)
- **Value/Points to:** your server's public IP (from Step 1), e.g. `123.45.67.89`

Wait a few minutes for it to take effect. You can check with:

```bash
ping app.yourdomain.com     # should show your server's IP
```

---

## Step 13 — Turn on HTTPS (padlock)

Certbot gets a free certificate and configures Nginx automatically:

```bash
sudo certbot --nginx -d app.yourdomain.com
```

Follow the prompts (enter an email, agree to terms, choose to redirect HTTP to
HTTPS). Certbot auto-renews the certificate going forward.

Now open **https://app.yourdomain.com** in your browser — GroundworkOS should
load with a secure padlock. 🎉

---

## Step 14 — First login and admin user

1. Click **Sign In / Get Started** and create your account through Clerk.
2. New users start with the lowest role. To make yourself an **admin**:
   - Go to your **Clerk dashboard → Users → (your user) → Metadata**.
   - Edit **Public metadata** and set:
     ```json
     { "role": "admin" }
     ```
   - Save, then sign out and back in. You'll now have full access.

---

## Step 15 — Accounting integrations (optional)

If you connect Xero, QuickBooks, Sage, or FreeAgent, you must:

1. Register an app in that provider's developer portal.
2. Set the **redirect URI** to your domain, for example:
   - Xero: `https://app.yourdomain.com/api/xero/callback`
   - QuickBooks: `https://app.yourdomain.com/api/quickbooks/callback`
   - Sage: `https://app.yourdomain.com/api/sage/callback`
   - FreeAgent: `https://app.yourdomain.com/api/freeagent/callback`
3. Add that provider's `..._CLIENT_ID`, `..._CLIENT_SECRET`, and
   `..._REDIRECT_URI` to `/etc/groundworkos/api.env`, then:
   ```bash
   sudo systemctl restart groundworkos-api
   ```

(Email sending via Resend works the same way — add `RESEND_API_KEY` and
restart.)

---

## Updating the app later

When you have new code to deploy:

```bash
cd ~/groundworkos
git pull                                            # get the latest code
pnpm install                                        # update building blocks
pnpm --filter @workspace/db run push                # apply any DB changes
pnpm --filter @workspace/api-server run build       # rebuild API
PORT=8080 BASE_PATH=/ VITE_CLERK_PUBLISHABLE_KEY=pk_... \
  pnpm --filter @workspace/groundworkos run build   # rebuild frontend
sudo systemctl restart groundworkos-api             # restart API
sudo systemctl reload nginx                          # (frontend is static — no restart needed)
```

---

## Troubleshooting

**The page won't load at all**
- Check the firewall in *both* places (Oracle Security List **and** the server's
  `iptables` from Step 2).
- `sudo nginx -t` — is the config valid? `sudo systemctl reload nginx`.
- Is your DNS A record pointing at the right IP? `ping app.yourdomain.com`.

**Page loads but says something about Clerk / login is broken**
- Double-check `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` in
  `/etc/groundworkos/api.env` and the `VITE_CLERK_PUBLISHABLE_KEY` you built the
  frontend with — they must be from the **same** Clerk instance.
- Make sure `CLERK_STANDALONE=true` is set, then
  `sudo systemctl restart groundworkos-api`.
- If using production Clerk keys (`pk_live_`), confirm your Clerk DNS records are
  verified (Step 5, Option B).

**Uploads fail**
- Check the API logs: `sudo journalctl -u groundworkos-api -n 100 --no-pager`.
- Verify the S3 settings (endpoint, bucket, keys) in the env file.
- Make sure `client_max_body_size` in Nginx is large enough for the file.

**API won't start**
- `sudo systemctl status groundworkos-api` and
  `sudo journalctl -u groundworkos-api -n 100 --no-pager` show the error.
- Most common cause: a wrong value in `/etc/groundworkos/api.env` (often
  `DATABASE_URL`).

**See the API logs live**
```bash
sudo journalctl -u groundworkos-api -f
```


---

## Why self-hosting works this way (technical notes)

These explain the reasoning behind a few choices above, for anyone maintaining the app going forward.

**Storage backend** — Set via `STORAGE_DRIVER=s3`, implemented as a facade so the whole storage layer swaps with an environment variable and no code changes. Because Oracle Cloud Object Storage doesn't support CORS, uploads can't go straight from the browser to a presigned URL the way they would with plain S3; instead every upload and download is relayed through the API server itself, so the browser only ever talks to your own domain.

**Clerk standalone mode** — Two settings have to agree or logins will silently break: `CLERK_STANDALONE=true` on the API server, and leaving `VITE_CLERK_PROXY_URL` unset when building the frontend. Both are needed to fully detach from Replit's built-in Clerk proxy; setting only one produces confusing auth failures rather than a clear error.

**Frontend environment variables are baked in at build time, not read at runtime** — Any `VITE_*` variable (including the Clerk publishable key) is compiled into the frontend when you run its build step. If you need to change one, rebuild the frontend; restarting the API server alone will not pick up the change.

**Database migrations that need a TTY** — `pnpm --filter @workspace/db run push` can fail with an "Interactive prompts require a TTY terminal" error for destructive schema changes (e.g. adding a UNIQUE constraint to a table that already has rows). If that happens, connect with `psql` and apply the change directly, using a partial unique index to avoid conflicts with existing NULL rows, for example:

```sql
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS share_token text;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_share_token_unique
  ON quotes(share_token) WHERE share_token IS NOT NULL;
```

**Running one-off scripts on the server** — The api-server package has no `tsx` binary, so a one-off TypeScript script (e.g. a database seed script under `artifacts/api-server/src/`) needs to be bundled with esbuild before running with plain `node`, rather than executed directly as TypeScript.

**Nginx specifics recap** — `client_max_body_size` must be raised to allow large document uploads, `proxy_request_buffering off` lets uploads stream through rather than buffering to disk first, and the `proxy_pass` target should not have a trailing slash so the `/api` prefix is preserved correctly.
