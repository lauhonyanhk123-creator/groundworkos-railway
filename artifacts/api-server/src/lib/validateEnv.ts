import { logger } from "./logger";

/**
 * Every env var the server cannot run without. Checked together, up front,
 * so a misconfigured environment fails once with a full list instead of
 * dying on whichever var happens to be read first (mid-import, with a
 * stack trace pointing at an unrelated module).
 */
const REQUIRED_ENV_VARS = [
  "PORT",
  "DATABASE_URL",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
] as const;

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
    errors.push(`Missing required environment variable: ${name}`);
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

if (errors.length > 0) {
  for (const error of errors) {
    logger.error(error);
  }
  process.exit(1);
}
