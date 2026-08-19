import { logger } from "./logger";
import { parseAllowedDomains } from "./signupPolicy";

/**
 * Every env var the server cannot run without. Checked together, up front,
 * so a misconfigured environment fails once with a full list instead of
 * dying on whichever var happens to be read first (mid-import, with a
 * stack trace pointing at an unrelated module).
 */
const REQUIRED_ENV_VARS = [
  "PORT",
  "DATABASE_URL",
  "APP_URL",
  "BASE_PATH",
  "STATIC_DIR",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
] as const;

/**
 * Messages for vars whose failure mode isn't self-explanatory from the name
 * alone — shown instead of the generic "Missing required environment
 * variable" message. S3_REGION and S3_ENDPOINT in particular used to be
 * optional and silently default to AWS us-east-1 (see objectStorageS3.ts),
 * which is wrong for Cloudflare R2, Backblaze B2, Oracle Cloud Object
 * Storage, MinIO, etc. and previously only failed confusingly at upload
 * time. Require them explicitly so a missing/wrong provider config fails at
 * boot instead.
 */
const REQUIRED_ENV_VAR_MESSAGES: Partial<Record<string, string>> = {
  APP_URL:
    "Missing required environment variable: APP_URL (e.g. https://your-app.example.com — used for CORS, Clerk authorized parties, and OAuth redirect URIs)",
  BASE_PATH:
    'Missing required environment variable: BASE_PATH (required at build time by the frontend\'s Vite config; use "/" unless the app is served from a sub-path)',
  STATIC_DIR:
    "Missing required environment variable: STATIC_DIR (e.g. artifacts/groundworkos/dist/public — tells the API server where to serve the built frontend from)",
  S3_REGION:
    'Missing required environment variable: S3_REGION. This does NOT default to your provider\'s region — an unset S3_REGION silently falls back to AWS "us-east-1", which is wrong for Cloudflare R2, Backblaze B2, Oracle Cloud Object Storage, MinIO, etc., and fails confusingly at upload time rather than at boot. Set it to the region value your object storage provider expects.',
  S3_ENDPOINT:
    "Missing required environment variable: S3_ENDPOINT. This does NOT default to your provider's endpoint — an unset S3_ENDPOINT silently falls back to the AWS S3 default, which is wrong for Cloudflare R2, Backblaze B2, Oracle Cloud Object Storage, MinIO, etc., and fails confusingly at upload time rather than at boot. Set it to your provider's S3-compatible endpoint URL.",
};

/**
 * A Clerk publishable key is `pk_(test|live)_` followed by the base64
 * encoding of `<frontend-api-hostname>$` (see also csp.ts, which decodes
 * this at runtime to build the CSP header). A key that's merely
 * non-empty — a secret key pasted into the wrong variable, a truncated
 * copy-paste, a stray quote character — passes the old "is it set" check
 * but makes every Clerk SDK call fail silently, taking every route down
 * (including /healthz) with nothing logged to explain why. Validate the
 * shape here so a bad key fails loudly at boot instead.
 */
const PUBLISHABLE_KEY_RE = /^pk_(test|live)_(.+)$/;
const BASE64_RE =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const HOSTNAME_RE =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
const SECRET_KEY_RE = /^sk_(test|live)_[A-Za-z0-9]+$/;

export function isValidPublishableKey(value: string): boolean {
  const match = PUBLISHABLE_KEY_RE.exec(value);
  if (!match) return false;

  const body = match[2];
  if (!BASE64_RE.test(body)) return false;

  const decoded = Buffer.from(body, "base64").toString("utf-8");
  if (!decoded.endsWith("$")) return false;

  return HOSTNAME_RE.test(decoded.slice(0, -1));
}

export function isValidSecretKey(value: string): boolean {
  return SECRET_KEY_RE.test(value);
}

const errors: string[] = [];

for (const name of REQUIRED_ENV_VARS) {
  if (!process.env[name]) {
    errors.push(
      REQUIRED_ENV_VAR_MESSAGES[name] ??
        `Missing required environment variable: ${name}`,
    );
  }
}

const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
if (publishableKey && !isValidPublishableKey(publishableKey)) {
  errors.push(
    'Invalid CLERK_PUBLISHABLE_KEY: expected "pk_test_" or "pk_live_" followed by base64 that decodes to a hostname ending in "$" (e.g. pk_test_<base64("your-app.clerk.accounts.dev$")>)',
  );
}

const secretKey = process.env.CLERK_SECRET_KEY;
if (secretKey && !isValidSecretKey(secretKey)) {
  errors.push(
    'Invalid CLERK_SECRET_KEY: expected "sk_test_" or "sk_live_" followed by the key value',
  );
}

/**
 * Optional: only relevant if the Clerk webhook (routes/clerk_webhook.ts) is
 * in use for the SIGNUP_ALLOWED_EMAIL_DOMAINS backstop. Not in
 * REQUIRED_ENV_VARS since most deployments rely on Clerk Dashboard
 * Restrictions alone and never set it.
 */
const WEBHOOK_SIGNING_SECRET_RE = /^whsec_.+$/;
const webhookSigningSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
if (
  webhookSigningSecret &&
  !WEBHOOK_SIGNING_SECRET_RE.test(webhookSigningSecret)
) {
  errors.push(
    'Invalid CLERK_WEBHOOK_SIGNING_SECRET: expected "whsec_" followed by the signing secret value',
  );
}

/**
 * If SIGNUP_ALLOWED_EMAIL_DOMAINS is set, the Clerk webhook
 * (routes/clerk_webhook.ts) can't enforce it without
 * CLERK_WEBHOOK_SIGNING_SECRET to verify incoming webhook signatures - the
 * allowlist would silently never apply. That combination used to only log a
 * warning at boot, which is easy to miss in a log stream; fail loudly
 * instead.
 */
const allowedDomains = parseAllowedDomains(
  process.env.SIGNUP_ALLOWED_EMAIL_DOMAINS,
);
if (allowedDomains.length > 0 && !process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
  errors.push(
    "SIGNUP_ALLOWED_EMAIL_DOMAINS is set but CLERK_WEBHOOK_SIGNING_SECRET is not - " +
      "incoming webhooks can't be verified, so the domain allowlist would never be enforced. " +
      "Set CLERK_WEBHOOK_SIGNING_SECRET or unset SIGNUP_ALLOWED_EMAIL_DOMAINS.",
  );
}

if (errors.length > 0) {
  for (const error of errors) {
    logger.error(error);
  }
  process.exit(1);
}
